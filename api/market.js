export default async function handler(req,res){
  try{
    const tf=String(req.query.tf||'5m');
    const range=String(req.query.range||'5d');
    const allowedTf=new Set(['5m','15m','30m','60m','1h','1d']);
    const allowedRange=new Set(['1d','5d','1mo','3mo','1y']);
    if(!allowedTf.has(tf)||!allowedRange.has(range)) return res.status(400).json({error:'invalid parameters'});
    const url=`https://query1.finance.yahoo.com/v8/finance/chart/XAUUSD=X?interval=${encodeURIComponent(tf)}&range=${encodeURIComponent(range)}`;
    const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 XAUUSD-SMC-Dashboard/1.0','Accept':'application/json'}});
    if(!r.ok) throw new Error(`upstream ${r.status}`);
    const j=await r.json();
    res.setHeader('Cache-Control','s-maxage=20, stale-while-revalidate=40');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    return res.status(200).json(j);
  }catch(e){return res.status(502).json({error:'market feed unavailable',detail:e.message});}
}
