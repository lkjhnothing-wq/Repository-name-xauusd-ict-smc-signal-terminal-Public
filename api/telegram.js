const esc=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'POST only'});
  const token=process.env.TELEGRAM_BOT_TOKEN;
  const chatId=process.env.TELEGRAM_CHAT_ID;
  if(!token||!chatId) return res.status(500).json({error:'Telegram environment variables are missing'});
  try{
    const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    const type=b.type||'signal';
    const signal=String(b.signal||'').toUpperCase();
    if(!['BUY','SELL'].includes(signal)) return res.status(400).json({error:'Invalid signal'});
    const num=x=>Number.isFinite(Number(x))?Number(x).toFixed(2):'—';
    const side=signal==='BUY'?'🟢':'🔴';
    let text='';
    if(type==='signal'){
      text=`${side} <b>XAUUSD ${signal} SIGNAL</b>\n\n<b>Entry:</b> ${num(b.entry)}\n<b>Stop Loss:</b> ${num(b.sl)}\n<b>TP1:</b> ${num(b.tp1)}\n<b>TP2:</b> ${num(b.tp2)}\n<b>TP3:</b> ${num(b.tp3)}\n<b>Risk/Reward:</b> 1:${esc(b.rr)}\n\n<b>ICT/SMC:</b> ${esc(b.structure)} • ${esc(b.mss)} • ${esc(b.liq)} • ${esc(b.fvg)} • ${esc(b.ob)}\n<b>Premium/Discount:</b> ${esc(b.pd)}\n<b>Time:</b> ${esc(b.time||new Date().toISOString())}`;
    }else{
      text=`${side} <b>XAUUSD ${signal} UPDATE</b>\n\n<b>Status:</b> ${esc(b.status||type)}\n<b>Price:</b> ${num(b.price)}\n<b>Entry:</b> ${num(b.entry)}\n<b>Time:</b> ${esc(b.time||new Date().toISOString())}`;
    }
    const r=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text,parse_mode:'HTML',disable_web_page_preview:true})});
    const j=await r.json();
    if(!r.ok||!j.ok) return res.status(502).json({error:'Telegram rejected the request',detail:j.description||'unknown error'});
    return res.status(200).json({ok:true});
  }catch(e){return res.status(500).json({error:'Telegram alert failed',detail:e.message||'unknown error'})}
}
