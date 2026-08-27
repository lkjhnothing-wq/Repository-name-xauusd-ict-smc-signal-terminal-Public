import { evaluateCoreA } from './coreA.js';

export const config = { maxDuration: 60 };

const limits = { '5d': 1600, '1mo': 3000, '3mo': 6000, '1y': 10000 };

async function get(tf, limit) {
  const u = `https://biquote.io/api/XAUUSD/ohlc?interval=${encodeURIComponent(tf)}&limit=${limit}`;
  const r = await fetch(u, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!r.ok) throw Error(`biquote ${tf} HTTP ${r.status}`);
  const j = await r.json();
  const bars = (j?.bars || [])
    .map(x => ({ t: Date.parse(x.openTime), o: +x.open, h: +x.high, l: +x.low, c: +x.close }))
    .filter(x => [x.t, x.o, x.h, x.l, x.c].every(Number.isFinite))
    .reverse();
  if (bars.length < 100) throw Error(`insufficient real ${tf} history`);
  return bars;
}

export default async function handler(req, res) {
  const range = String(req.query.range || '5d');
  if (!Object.hasOwn(limits, range)) return res.status(400).json({ error: 'invalid range' });

  try {
    const [m5, d1] = await Promise.all([
      get('5m', limits[range]),
      get('1d', 1000)
    ]);

    const trades = [];
    const unresolved = [];
    const seen = new Set();

    for (let i = 80; i < m5.length - 2; i++) {
      const now = m5[i].t + 300000;
      // Core A only needs recent M5 structure plus completed daily candles.
      // Keeping the M5 window bounded prevents serverless timeouts on long ranges.
      const m5Window = m5.slice(Math.max(0, i - 220), i + 1);
      const daily = d1.filter(x => x.t <= now).slice(-10);
      const s = evaluateCoreA({ m5: m5Window, h1: [], d1: daily, now, history: [] });
      if (s.signal === 'WAIT' || seen.has(s.key)) continue;
      seen.add(s.key);

      let result = 'OPEN';
      let exit = null;
      for (let j = i + 1; j < m5.length; j++) {
        const c = m5[j];
        const hitSL = s.signal === 'BUY' ? c.l <= s.sl : c.h >= s.sl;
        const hitTP = s.signal === 'BUY' ? c.h >= s.tp1 : c.l <= s.tp1;
        if (hitSL && hitTP) { result = 'UNRESOLVED'; exit = { t: c.t }; break; }
        if (hitSL) { result = 'LOSS'; exit = { t: c.t, price: s.sl }; break; }
        if (hitTP) { result = 'WIN'; exit = { t: c.t, price: s.tp1 }; break; }
      }

      const t = { ...s, ts: s.entryTime, result, exit };
      if (result === 'UNRESOLVED') unresolved.push(t);
      else if (result !== 'OPEN') trades.push(t);
    }

    const wins = trades.filter(x => x.result === 'WIN').length;
    const losses = trades.filter(x => x.result === 'LOSS').length;
    const closed = wins + losses;
    const netR = wins - losses;
    const profitFactor = losses ? wins / losses : (wins ? Infinity : 0);
    let peak = 0, eq = 0, maxDD = 0;
    for (const t of trades) {
      eq += t.result === 'WIN' ? 1 : -1;
      peak = Math.max(peak, eq);
      maxDD = Math.min(maxDD, eq - peak);
    }

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({
      range,
      source: 'biquote.io XAUUSD',
      realData: true,
      candles: m5.length,
      signals: trades.length,
      wins,
      losses,
      unresolved: unresolved.length,
      winRate: closed ? +(wins / closed * 100).toFixed(2) : 0,
      netR,
      profitFactor: Number.isFinite(profitFactor) ? +profitFactor.toFixed(2) : 'Infinity',
      maxDrawdownR: maxDD,
      trades,
      unresolved
    });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(503).json({
      error: 'BACKTEST_REAL_DATA_UNAVAILABLE',
      detail: e?.message || 'Historical feed unavailable'
    });
  }
}
