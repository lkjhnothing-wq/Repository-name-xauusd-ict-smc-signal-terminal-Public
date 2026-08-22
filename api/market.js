export default async function handler(req,res){
  const tf=String(req.query.tf||'5m');
  const range=String(req.query.range||'5d');
  const allowedTf=new Set(['5m','15m','30m','60m','1h','1d']);
  const allowedRange=new Set(['1d','5d','1mo','3mo','1y']);
  if(!allowedTf.has(tf)||!allowedRange.has(range)) return res.status(400).json({error:'invalid parameters'});
  const interval=tf==='60m'?'1h':tf;
  const hosts=['https://query1.finance.yahoo.com','https://query2.finance.yahoo.com'];
  let lastError='upstream unavailable';
  for(const host of hosts){
    try{
      const url=`${host}/v8/finance/chart/XAUUSD=X?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}&includePrePost=false&events=div%2Csplits`;
      const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json','Accept-Language':'en-US,en;q=0.9'},cache:'no-store'});
      if(!r.ok){lastError=`${host} ${r.status}`;continue}
      const j=await r.json();
      const q=j?.chart?.result?.[0];
      const quote=q?.indicators?.quote?.[0];
      if(!q||!quote) throw new Error('invalid upstream response');
      const candles=(q.timestamp||[]).map((t,i)=>({t:t*1000,o:quote.open?.[i],h:quote.high?.[i],l:quote.low?.[i],c:quote.close?.[i],v:quote.volume?.[i]||0})).filter(x=>[x.o,x.h,x.l,x.c].every(Number.isFinite));
      if(candles.length<20) throw new Error('insufficient candles');
      res.setHeader('Cache-Control','s-maxage=15, stale-while-revalidate=45');
      return res.status(200).json({source:'Yahoo Finance XAUUSD=X',tf,range,candles});
    }catch(e){lastError=e?.message||lastError}
  }
  return res.status(502).json({error:'market feed unavailable',detail:lastError});
}
