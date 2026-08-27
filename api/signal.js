import {evaluateCoreA} from './coreA.js';

async function getBars(symbol, interval, limit){
  const u=`https://biquote.io/api/${encodeURIComponent(symbol)}/ohlc?interval=${encodeURIComponent(interval)}&limit=${limit}`;
  const r=await fetch(u,{cache:'no-store',headers:{Accept:'application/json'}});
  if(!r.ok)throw Error(`biquote ${symbol} ${interval} HTTP ${r.status}`);
  const j=await r.json();
  const bars=(j?.bars||[]).map(x=>({t:Date.parse(x.openTime),o:+x.open,h:+x.high,l:+x.low,c:+x.close})).filter(x=>[x.t,x.o,x.h,x.l,x.c].every(Number.isFinite)).reverse();
  if(bars.length<30)throw Error(`biquote ${symbol} ${interval} insufficient candles`);
  return bars;
}

export default async function handler(req,res){
  try{
    const [m5,h1,d1]=await Promise.all([
      getBars('XAUUSD','5m',1000),
      getBars('XAUUSD','1h',500),
      getBars('XAUUSD','1d',500)
    ]);
    const s=evaluateCoreA({m5,h1,d1,history:[]});
    res.setHeader('Cache-Control','no-store, max-age=0');
    return res.status(200).json({source:'biquote.io XAUUSD',realData:true,...s,updated:new Date().toISOString()});
  }catch(e){
    return res.status(503).json({error:'REAL_DATA_UNAVAILABLE',detail:e?.message||'Live feed unavailable',signal:'WAIT'});
  }
}
