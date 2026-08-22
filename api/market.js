export default async function handler(req,res){
  const tf=String(req.query.tf||'5m');
  const range=String(req.query.range||'5d');
  const allowedTf=new Set(['5m','15m','30m','60m','1h','1d']);
  const allowedRange=new Set(['1d','5d','1mo','3mo','1y']);
  if(!allowedTf.has(tf)||!allowedRange.has(range))return res.status(400).json({error:'invalid parameters'});

  const interval=tf==='60m'?'1h':tf;
  const hosts=['https://query1.finance.yahoo.com','https://query2.finance.yahoo.com'];
  const symbols=['XAUUSD=X','GC=F'];
  let lastError='upstream unavailable';

  const fetchText=async(url,accept='application/json')=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),8000);
    try{
      const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Accept':accept,'Accept-Language':'en-US,en;q=0.9'},signal:controller.signal,cache:'no-store'});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      return await r.text();
    }finally{clearTimeout(timer)}
  };

  // Primary: Yahoo OHLC candles, with two hosts and spot/futures fallback.
  for(const symbol of symbols){
    for(const host of hosts){
      try{
        const url=`${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}&includePrePost=false&events=div%2Csplits`;
        const j=JSON.parse(await fetchText(url));
        const q=j?.chart?.result?.[0], quote=q?.indicators?.quote?.[0];
        if(!q||!quote)throw new Error('invalid upstream response');
        const candles=(q.timestamp||[]).map((t,i)=>({t:t*1000,o:quote.open?.[i],h:quote.high?.[i],l:quote.low?.[i],c:quote.close?.[i],v:quote.volume?.[i]??0})).filter(x=>[x.o,x.h,x.l,x.c].every(Number.isFinite));
        if(candles.length<20)throw new Error('insufficient candles');
        res.setHeader('Cache-Control','no-store, max-age=0');
        return res.status(200).json({source:`Yahoo Finance ${symbol}`,symbol,tf,range,candles,degraded:false});
      }catch(e){lastError=`${symbol} via ${host}: ${e?.message||'request failed'}`}
    }
  }

  // Secondary: Stooq current XAUUSD quote. It prevents the terminal from becoming blank when Yahoo blocks serverless requests.
  try{
    const csv=await fetchText('https://stooq.com/q/l/?s=xauusd&f=sd2t2ohlcv&h&e=csv','text/csv');
    const lines=csv.trim().split(/\r?\n/);
    if(lines.length>=2){
      const head=lines[0].split(',');
      const row=lines[1].split(',');
      const at=name=>row[head.indexOf(name)];
      const o=Number(at('Open')),h=Number(at('High')),l=Number(at('Low')),c=Number(at('Close'));
      if([o,h,l,c].every(Number.isFinite)&&c>0){
        const now=Date.now();
        const step=tf==='1d'?86400000:tf==='1h'||tf==='60m'?3600000:tf==='30m'?1800000:tf==='15m'?900000:300000;
        const count=180;
        const candles=[];
        let prev=o||c;
        const span=Math.max(h-l,Math.max(c*0.0008,0.5));
        for(let i=0;i<count;i++){
          const z=i/(count-1), target=i===count-1?c:(o+(c-o)*z+Math.sin(i*0.73)*span*0.12);
          const open=prev, close=target;
          const wiggle=span*(0.08+((i*17)%11)/100);
          candles.push({t:now-(count-1-i)*step,o:open,h:Math.max(open,close)+wiggle,l:Math.min(open,close)-wiggle,c:close,v:0});
          prev=close;
        }
        candles[candles.length-1]={t:now,o,h,l,c,v:0};
        res.setHeader('Cache-Control','no-store, max-age=0');
        return res.status(200).json({source:'Stooq XAUUSD quote fallback',symbol:'XAUUSD',tf,range,candles,degraded:true});
      }
    }
  }catch(e){lastError=`${lastError}; Stooq: ${e?.message||'request failed'}`}

  // Final safe fallback: never leave the dashboard in a permanent error state. Marked degraded so the UI can keep retrying.
  const base=4600, now=Date.now(), step=tf==='1d'?86400000:tf==='1h'||tf==='60m'?3600000:300000;
  const candles=Array.from({length:180},(_,i)=>{const a=base+Math.sin(i*.19)*18+Math.sin(i*.047)*32,b=a+Math.sin(i*.61)*5;return{t:now-(179-i)*step,o:a,h:Math.max(a,b)+3,l:Math.min(a,b)-3,c:b,v:0}});
  res.setHeader('Cache-Control','no-store, max-age=0');
  return res.status(200).json({source:'Local continuity fallback',symbol:'XAUUSD',tf,range,candles,degraded:true,detail:lastError});
}
