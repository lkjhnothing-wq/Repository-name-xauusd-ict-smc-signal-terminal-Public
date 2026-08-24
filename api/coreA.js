function swings(c,n=3){const hi=[],lo=[];for(let i=n;i<c.length-n;i++){let H=true,L=true;for(let j=1;j<=n;j++){if(c[i].h<=c[i-j].h||c[i].h<=c[i+j].h)H=false;if(c[i].l>=c[i-j].l||c[i].l>=c[i+j].l)L=false}if(H)hi.push(i);if(L)lo.push(i)}return{hi,lo}}
function session(t){const h=new Date(t).getUTCHours();return(h>=7&&h<=16)}
function dailyBias(d){if(d.length<3)return'NEUTRAL';const a=d.at(-2),b=d.at(-3);if(a.c>a.o&&b.c>b.o)return'BULLISH';if(a.c<a.o&&b.c<b.o)return'BEARISH';return'NEUTRAL'}
function rr(entry,sl,tp){return Math.abs(tp-entry)/Math.abs(entry-sl)}
export function evaluateCoreA({m5,h1,d1,now=Date.now(),history=[]}){const c=m5.filter(x=>x.t+300000<=now);if(c.length<30)return{signal:'WAIT',reason:'WAITING FOR MARKET DATA'};const price=c.at(-1).c,bias=dailyBias(d1.filter(x=>x.t+86400000<=now));const {hi,lo}=swings(c,3);const lookback=80;
// Find the most recent liquidity sweep, then confirm market structure shift and retracement.
for(let s=c.length-2;s>=Math.max(10,c.length-lookback);s--){const beforeHi=hi.filter(i=>i<s).at(-1),beforeLo=lo.filter(i=>i<s).at(-1);if(beforeHi===undefined||beforeLo===undefined)continue;const x=c[s];
 // Bullish: sweep sell-side liquidity, close back above swept low, then break prior swing high.
 if(x.l<c[beforeLo].l&&x.c>c[beforeLo].l&&bias!=='BEARISH'){
   let mss=-1;for(let i=s+1;i<c.length;i++)if(c[i].c>c[beforeHi].h){mss=i;break}if(mss<0)continue;
   const entry=(x.l+c[mss].h)/2,sl=x.l-0.5,risk=entry-sl,tp1=entry+risk*2,tp2=entry+risk*3;
   const touched=c.slice(mss+1).some(z=>z.l<=entry&&z.h>=entry);const key=`BUY:${x.t}:${c[mss].t}`;
   if(touched&&c.at(-1).t-c[mss].t<21600000&&!history.some(z=>z.key===key))return{signal:'BUY',reason:'LIQUIDITY SWEEP + BULLISH MSS + 50% RETRACEMENT',bias,price,entry,sl,tp1,tp2,rr:2,risk,profit1:tp1-entry,profit2:tp2-entry,sweepTime:x.t,mssTime:c[mss].t,entryTime:c.at(-1).t,key,session:session(c.at(-1).t)?'LONDON/NY':'OFF SESSION'};
   continue;
 }
 // Bearish: sweep buy-side liquidity, close back below swept high, then break prior swing low.
 if(x.h>c[beforeHi].h&&x.c<c[beforeHi].h&&bias!=='BULLISH'){
   let mss=-1;for(let i=s+1;i<c.length;i++)if(c[i].c<c[beforeLo].l){mss=i;break}if(mss<0)continue;
   const entry=(x.h+c[mss].l)/2,sl=x.h+0.5,risk=sl-entry,tp1=entry-risk*2,tp2=entry-risk*3;
   const touched=c.slice(mss+1).some(z=>z.l<=entry&&z.h>=entry);const key=`SELL:${x.t}:${c[mss].t}`;
   if(touched&&c.at(-1).t-c[mss].t<21600000&&!history.some(z=>z.key===key))return{signal:'SELL',reason:'LIQUIDITY SWEEP + BEARISH MSS + 50% RETRACEMENT',bias,price,entry,sl,tp1,tp2,rr:2,risk,profit1:entry-tp1,profit2:entry-tp2,sweepTime:x.t,mssTime:c[mss].t,entryTime:c.at(-1).t,key,session:session(c.at(-1).t)?'LONDON/NY':'OFF SESSION'};
 }
}
return{signal:'WAIT',reason:'WAITING FOR LIQUIDITY SWEEP → MSS → RETRACEMENT',bias,price,rr:2}}
