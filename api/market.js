export default async function handler(req,res){
  const tf=String(req.query.tf||'5m');
  const range=String(req.query.range||'5d');
  const allowedTf=new Set(['5m','15m','30m','60m','1h','1d']);
  const allowedRange=new Set(['1d','5d','1mo','3mo','1y']);
  if(!allowedTf.has(tf)||!allowedRange.has(range)){
    return res.status(400).json({error:'invalid parameters'});
  }

  const interval=tf==='60m'?'1h':tf;
  const hosts=['https://query1.finance.yahoo.com','https://query2.finance.yahoo.com'];
  const symbols=['XAUUSD=X','GC=F'];
  let lastError='upstream unavailable';

  const fetchJson=async(url)=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),9000);
    try{
      const r=await fetch(url,{
        headers:{
          'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
          'Accept':'application/json',
          'Accept-Language':'en-US,en;q=0.9'
        },
        signal:controller.signal,
        cache:'no-store'
      });
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      return await r.json();
    }finally{
      clearTimeout(timer);
    }
  };

  for(const symbol of symbols){
    for(const host of hosts){
      try{
        const url=`${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}&includePrePost=false&events=div%2Csplits`;
        const j=await fetchJson(url);
        const q=j?.chart?.result?.[0];
        const quote=q?.indicators?.quote?.[0];
        if(!q||!quote)throw new Error('invalid upstream response');

        const candles=(q.timestamp||[])
          .map((t,i)=>({
            t:t*1000,
            o:quote.open?.[i],
            h:quote.high?.[i],
            l:quote.low?.[i],
            c:quote.close?.[i],
            v:quote.volume?.[i]??0
          }))
          .filter(x=>[x.o,x.h,x.l,x.c].every(Number.isFinite));

        if(candles.length<20)throw new Error('insufficient candles');

        res.setHeader('Cache-Control','s-maxage=10, stale-while-revalidate=50');
        return res.status(200).json({
          source:`Yahoo Finance ${symbol}`,
          symbol,
          tf,
          range,
          candles
        });
      }catch(e){
        lastError=`${symbol} via ${host}: ${e?.message||'request failed'}`;
      }
    }
  }

  return res.status(502).json({
    error:'market feed unavailable',
    detail:lastError,
    retryAfterSeconds:30
  });
}
