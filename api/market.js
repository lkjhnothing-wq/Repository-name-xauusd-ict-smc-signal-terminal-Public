const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function parseYahoo(j){
  const q=j?.chart?.result?.[0];
  const v=q?.indicators?.quote?.[0];
  return (q?.timestamp||[]).map((t,i)=>({
    t:t*1000,o:v?.open?.[i],h:v?.high?.[i],l:v?.low?.[i],c:v?.close?.[i],v:v?.volume?.[i]??0
  })).filter(x=>[x.t,x.o,x.h,x.l,x.c].every(Number.isFinite));
}

async function fetchYahoo(host,tf,range){
  const url=`https://${host}/v8/finance/chart/XAUUSD%3DX?interval=${encodeURIComponent(tf)}&range=${encodeURIComponent(range)}&includePrePost=false&events=div%2Csplits`;
  const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; XAUUSD-Signal-Terminal/1.0)','Accept':'application/json,text/plain,*/*'},cache:'no-store'});
  if(!r.ok) throw Error(`${host}: HTTP ${r.status}`);
  const candles=parseYahoo(await r.json());
  if(candles.length<20) throw Error(`${host}: insufficient real candles`);
  return {candles,source:`Yahoo Finance ${host}`};
}

export default async function handler(req,res){
  const tf=String(req.query.tf||'5m');
  const range=String(req.query.range||'5d');
  const allowedTf=new Set(['5m','15m','30m','1h','1d']);
  const allowedRange=new Set(['1d','5d','1mo','3mo','1y']);
  if(!allowedTf.has(tf)||!allowedRange.has(range)) return res.status(400).json({error:'INVALID_PARAMETERS'});

  // Yahoo intraday data has limited retention. Reject impossible requests clearly instead of pretending data exists.
  if(['5m','15m','30m'].includes(tf)&&range==='1y'){
    return res.status(422).json({error:'HISTORICAL_RANGE_UNAVAILABLE',detail:'This public provider cannot supply one year of real intraday XAUUSD candles. Connect a dedicated historical data provider for 1-year M5 backtesting.',tf,range,candles:[],realData:false});
  }

  const errors=[];
  const hosts=['query1.finance.yahoo.com','query2.finance.yahoo.com'];
  for(const host of hosts){
    for(let attempt=0;attempt<2;attempt++){
      try{
        const data=await fetchYahoo(host,tf,range);
        res.setHeader('Cache-Control','no-store, max-age=0');
        return res.status(200).json({source:data.source,symbol:'XAUUSD=X',tf,range,candles:data.candles,degraded:false,realData:true,providerCheck:'PASS',attempt:attempt+1});
      }catch(e){
        errors.push(e.message);
        if(attempt===0) await sleep(250);
      }
    }
  }

  res.setHeader('Cache-Control','no-store, max-age=0');
  return res.status(503).json({error:'REAL_DATA_UNAVAILABLE',detail:'All real-data endpoints failed. No synthetic candles were generated.',providerCheck:'FAIL',attempts:errors,tf,range,candles:[],degraded:false,realData:false});
}
