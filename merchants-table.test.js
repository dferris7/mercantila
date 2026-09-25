#!/usr/bin/env node
/* The Merchant's Table v2 — headless engine test harness.
 * Usage:  node tests/merchants-table.test.js   (from the repo root; finds index.html)
 * Extracts the <script> from the HTML, imports the DOM-free engine, and asserts the
 * invariants: no infinite betting loops, integer money, florin conservation (pots,
 * boast escrow, pledges), correct side pots, rank order, trade limits, prices in band.
 */
const fs=require('fs'),os=require('os'),path=require('path');
const cand=[path.join(__dirname,'..','index.html'),path.join(__dirname,'index.html'),path.join(__dirname,'the-merchants-table.html')];
const file=cand.find(f=>fs.existsSync(f));if(!file){console.error('Game HTML not found');process.exit(1);}
const html=fs.readFileSync(file,'utf8');
const m=html.match(/<script>([\s\S]*?)<\/script>/);
if(!m){console.error('No <script> found');process.exit(1);}
const tmp=path.join(os.tmpdir(),'mt-engine.'+Date.now()+'.js');fs.writeFileSync(tmp,m[1]);
const M=require(tmp);
const {S,newGame,startHand,postAntes,apply,legal,evalHand,cmp,doShowdown,doPledge,canPledge,liveIdx,activeIdx,advanceStreet,
  abilityReady,doAbility,evolveMarket,buildPots,settlePots,CKEYS,EVENTS,drawEvent,applyEvent,resolveEventChoice,wealth,
  applyFinalReprice,HAND_TIERS,RK,RANK_NAMES,doTrade,tradeQuote,challengeTerms,endHandByFold,gameOverReason,autoTarget}=M;

let fails=0;const ok=(c,msg)=>{if(!c){console.log('  FAIL:',msg);fails++;}};
const rng=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const mkP=(o)=>Object.assign({name:'P',fl:100,escrow:0,port:{wheat:5,wood:5,brick:5,ore:5,silver:5,gold:5},priv:[1,1],powerUsed:{},usedThisHand:false,
  folded:false,allin:false,out:false,committed:0,acted:false,totalIn:0,boast:null,boastStake:0,traded:false},o||{});

console.log('Hand evaluation (best five of seven, v2 rank order):');
[[6,6,6,6,6,1,2,'Five of a Kind'],[1,1,1,1,2,3,4,'Four of a Kind'],[2,2,2,5,5,1,3,'Full House'],
 [3,3,3,4,4,4,1,'Full House'],[2,3,4,5,6,6,1,'Straight'],[1,2,3,4,5,5,5,'Straight'],
 [3,3,3,1,2,4,6,'Three of a Kind'],[2,2,4,4,1,3,6,'Two Pair'],[5,5,1,1,2,4,6,'Two Pair'],[1,2,3,4,6,7,8,'High Die']]
 .forEach(t=>{const exp=t.pop();const g=evalHand(t).name;ok(g===exp,`${t} => ${g} (exp ${exp})`);});
ok(RANK_NAMES.indexOf('Straight')>RANK_NAMES.indexOf('Full House'),'Straight ranks above Full House (rarer with d8)');
ok(cmp(evalHand([1,2,3,4,5,8,8]),evalHand([7,7,7,6,6,1,2]))<0,'a straight beats a full house');
ok(cmp(evalHand([6,6,6,5,4,2,1]),evalHand([6,6,6,5,4,3,1]))===0,'extra two dice do not affect tiebreak');
ok(cmp(evalHand([4,4,4,2,2,1,1]),evalHand([3,3,3,6,6,1,1]))<0,'full house ranks by trips first');
ok(evalHand([4,5,6,7,8,1,2]).detail==='4–8 run','high straight 4-8 (d8)');
ok(evalHand([8,8,8,7,7,1,2]).detail==='8s over 7s','full house 8s over 7s');
ok(evalHand([7,7,3,2,1]).detail==='pair of 7s','pair of 7s');
ok(evalHand([6,6,6,6,2,1,3]).detail.startsWith('four 6s'),'quads detail');
ok(JSON.stringify(evalHand([5,5,5,3,3,1,2]).best)===JSON.stringify([5,5,5,3,3]),'full-house best five');
ok(evalHand([3,3,3,1,2,4,6]).best.length===5&&evalHand([2,2,4,4,1,3,6]).best.length===5,'best five is always five dice');
ok(evalHand([6,6]).best.length===2&&evalHand([6,6]).name==='One Pair','two-dice peek evaluates safely');
// rank probabilities match the documented order: each tier rarer than the one below (for tiers 3..7)
{const N=120000,c=new Array(8).fill(0);for(let i=0;i<N;i++){const d=[];for(let j=0;j<7;j++)d.push(rng(1,8));c[evalHand(d).rank]++;}
 let cum=0;const al=[];for(let r=7;r>=0;r--){cum+=c[r];al[r]=cum/N;}
 HAND_TIERS.forEach(t=>ok(Math.abs(al[t.t]*100-t.pct)<3,`boast tier "${t.n}" shows ${t.pct}% (measured ${(al[t.t]*100).toFixed(1)}%)`));}

console.log('Side pots:');
S.players=[mkP({totalIn:10,fl:0}),mkP({totalIn:20,fl:0}),mkP({totalIn:20,fl:0})];
let pts=buildPots();ok(pts.length===2&&pts[0].amount===30&&pts[1].amount===20&&pts[1].eligible.join()==='1,2','layered side pots correct');
S.players=[mkP({totalIn:20}),mkP({totalIn:20}),mkP({totalIn:20,folded:true})];
ok(buildPots().length===1&&buildPots()[0].amount===60,'identical layers merge into one pot');

console.log('Trade (one per market phase, fees only on multi-kind sales):');
{S.prices={wheat:10,wood:10,brick:10,ore:10,silver:10,gold:10};S.phase='market';
 const p=mkP();S.players=[p];
 ok(tradeQuote(p,{mode:'sell',k:'wheat',q:4}).net===40,'single-kind sale is free');
 ok(tradeQuote(p,{mode:'multi',sel:{wheat:4}}).fee===0,'multi mode with one kind charges no fee (v1 bug)');
 ok(tradeQuote(p,{mode:'multi',sel:{wheat:4,wood:3}}).net===66,'multi-kind 70 fl at 5% -> 66');
 const broke=mkP({fl:0});ok(tradeQuote(broke,{mode:'multi',sel:{wheat:4,wood:3}}).net===63,'broke seller pays 10% -> 63');
 ok(doTrade(p,{mode:'buy',k:'gold',q:2}).ok&&p.fl===80&&p.port.gold===7,'buy executes');
 ok(!doTrade(p,{mode:'buy',k:'gold',q:1}).ok&&p.fl===80,'second trade in same market phase refused (v1 allowed unlimited)');
 const q=mkP({fl:5});S.players=[q];ok(!doTrade(q,{mode:'buy',k:'gold',q:1}).ok,'cannot buy beyond florins');
 ok(!doTrade(mkP(),{mode:'sell',k:'gold',q:9}).ok,'cannot sell more than held');
 S.phase='betting';ok(!doTrade(mkP(),{mode:'buy',k:'gold',q:1}).ok,'no trading mid-hand');}


console.log('Mixed buy + sell orders (one trade per hand):');
{const {tradeHints}=M;S.prices={wheat:10,wood:6,brick:8,ore:12,silver:5,gold:15};S.phase='market';S.history={};CKEYS.forEach(k=>S.history[k]=[S.prices[k]]);S.handNo=2;S.totalHands=10;
 const p=mkP({fl:10});S.players=[p];
 let q=tradeQuote(p,{mode:'order',sell:{ore:3},buy:{gold:3}});
 ok(q.ok&&q.net===36-45&&q.fee===0,'sale proceeds fund purchases in the same trade (sell 3 ore, buy 3 gold)');
 ok(!tradeQuote(mkP({fl:10}),{mode:'order',buy:{gold:2}}).ok,'cannot buy more than florins + sale proceeds');
 ok(!tradeQuote(p,{mode:'order',sell:{gold:1},buy:{gold:1}}).ok,'cannot buy and sell the same commodity in one order');
 ok(!tradeQuote(p,{mode:'order',sell:{gold:9}}).ok,'cannot sell more than held');
 ok(!tradeQuote(p,{mode:'order'}).ok,'an empty order is refused');
 ok(!tradeQuote(p,{mode:'order',buy:{diamonds:1}}).ok,'unknown commodities are refused');
 q=tradeQuote(mkP({fl:50}),{mode:'order',sell:{wheat:2,wood:2},buy:{silver:2}});ok(q.fee===Math.round(32*0.05)&&q.net===32-2-10,'selling 2 kinds pays 5% on sales only; buys are free');
 q=tradeQuote(mkP({fl:0}),{mode:'order',sell:{wheat:2,wood:2},buy:{silver:2}});ok(q.fee===Math.round(32*0.10),'10% when starting with no florins');
 ok(tradeQuote(mkP({fl:0}),{mode:'order',sell:{ore:1},buy:{silver:2}}).fee===0,'selling one kind is free even while buying');
 const r=doTrade(p,{mode:'order',sell:{ore:3},buy:{gold:3}});ok(r.ok&&p.fl===1&&p.port.ore===2&&p.port.gold===8,'order executes atomically');
 ok(!doTrade(p,{mode:'order',buy:{silver:0},sell:{wheat:1}}).ok&&p.port.wheat===5,'a second trade in the same market is refused');
 // hints
 const broke=mkP({fl:2});S.players=[broke];let hs=tradeHints(broke);ok(hs.length>=1&&hs.length<=2&&/ante/.test(hs[0]),'short of the ante: the first tip mentions selling to get dealt in');
 const flush=mkP({fl:250});S.prices.wheat=5;hs=tradeHints(flush);ok(hs.some(h=>/spare/.test(h)),'plenty of florins: a tip mentions a cheap commodity');
 let allOk=true;for(let i=0;i<300;i++){CKEYS.forEach(k=>{S.prices[k]=rng(5,15);S.history[k]=[rng(5,15),rng(5,15),S.prices[k]];});const x=mkP({fl:rng(0,300),port:{wheat:rng(0,9),wood:rng(0,9),brick:rng(0,9),ore:rng(0,9),silver:rng(0,9),gold:rng(0,9)}});S.players=[x];const h=tradeHints(x);if(!(h.length>=1&&h.length<=2&&h.every(s=>typeof s==='string'&&s.length>10&&!/must|should/i.test(s))))allOk=false;}
 ok(allOk,'tips always give 1-2 suggestions and never say "must" or "should"');}

console.log('Pledge (50% fire-sale when short of a call):');
{S.prices={wheat:10,wood:10,brick:10,ore:10,silver:10,gold:10};
 const p=mkP({fl:0,port:{wheat:0,wood:0,brick:2,ore:3,silver:0,gold:1}});S.players=[p];S._injected=0;
 ok(doPledge(p,{brick:2,ore:3,gold:1})===30&&p.fl===30&&S._injected===30,'pledge 60 fl of goods -> 30 fl, tracked');
 ok(doPledge(mkP({port:{brick:1}}),{brick:5})===0,'cannot pledge more than held');
 S.prices.silver=5;ok(doPledge(mkP({fl:0,port:{silver:1}}),{silver:1})===3,'pledge rounds half up (2.5 -> 3)');
 ok(canPledge(mkP({fl:0}),0)&&canPledge(mkP({fl:4}),10)&&!canPledge(mkP({fl:50}),10)&&!canPledge(mkP({fl:0,port:{}}),0),'pledge offered when broke or short of the call');}

console.log('Market engine (band 5-15, regime trends):');
{S.players=[mkP()];S.totalHands=8;newGame();
 ok(CKEYS.every(k=>S.prices[k]>=5&&S.prices[k]<=8&&S.history[k].length===1),'opening prices in 5..8, history seeded');
 let inband=true,maxStep=0;for(let t=0;t<200;t++){const pre={};CKEYS.forEach(k=>pre[k]=S.prices[k]);evolveMarket();
   CKEYS.forEach(k=>{if(S.prices[k]<5||S.prices[k]>15)inband=false;maxStep=Math.max(maxStep,Math.abs(S.prices[k]-pre[k]));});}
 ok(inband&&maxStep<=3,'prices stay in 5..15 with bounded steps');
 ok(CKEYS.every(k=>S.history[k].length===201),'history grows each turn');
 newGame();let same=0,tot=0;for(let t=0;t<4000;t++){const b={};CKEYS.forEach(k=>b[k]=S.trend[k]);evolveMarket();CKEYS.forEach(k=>{tot++;if(S.trend[k]===b[k])same++;});}
 ok(same/tot>0.45&&same/tot<0.85,'trend persistence in a sane band');}

console.log('Powers:');
{S.phase='betting';S.prices={wheat:5,wood:5,brick:5,ore:5,silver:5,gold:5};S.board=[1,2,3,4,8];S.reveal=3;
 const p=mkP({port:{wheat:9,wood:9,brick:9,ore:9,silver:9,gold:9}});S.players=[p];
 ok(abilityReady(p,'brick'),'brick ready first time');doAbility(p,'brick',{idx:0});
 ok(!abilityReady(p,'brick')&&!abilityReady(p,'ore'),'per-game and per-hand caps');
 p.usedThisHand=false;ok(abilityReady(p,'ore')&&!abilityReady(p,'brick'),'next hand: new power ok, used power locked');
 p.priv=[8,3];ok(!doAbility(p,'ore',{idx:0,sign:1})&&p.port.ore===9,'nudging an 8 upward is refused and costs nothing');
 ok(doAbility(p,'ore',{idx:0,sign:-1})&&p.priv[0]===7&&p.port.ore===7,'nudge 8 down -> 7 (no wrap to 1)');
 p.usedThisHand=false;ok(!doAbility(p,'wheat',{idx:4}),'cannot re-roll an unrevealed community die');
 ok(doAbility(p,'silver',{})&&p.preview&&p.preview.v===S.board[3]&&p.preview.idx===3,'silver previews the next community die');
 let saw7=false,saw8=false;for(let i=0;i<600;i++){p.powerUsed={};p.usedThisHand=false;p.port.brick=9;doAbility(p,'brick',{idx:0});if(p.priv[0]===7)saw7=true;if(p.priv[0]===8)saw8=true;}
 ok(saw7&&saw8,'re-rolls span 1..8');
 p.powerUsed={};p.usedThisHand=false;p.priv=[1,1];ok(doAbility(p,'gold',{})&&p.priv.length===3,'gold adds a third die');}

console.log('Events:');
{const setup=f=>{S.players=f.map((x,i)=>mkP({name:'P'+i}));S.totalHands=8;newGame();S.players.forEach((p,i)=>p.fl=f[i]);};
 const portOK=()=>S.players.every(p=>CKEYS.every(k=>Number.isInteger(p.port[k])&&p.port[k]>=0));
 const priceOK=()=>CKEYS.every(k=>Number.isInteger(S.prices[k])&&S.prices[k]>=5&&S.prices[k]<=15);
 let clean=true;for(const card of EVENTS){setup([100,40,8,0]);const fl0=S.players.map(p=>p.fl).join();applyEvent(card);
   if(S.pendingChoice){if(S.pendingChoice.decree)resolveEventChoice(CKEYS[rng(0,5)]);else resolveEventChoice(S.pendingChoice.chooser===0?1:0);}
   if(!priceOK()||!portOK()||S.players.map(p=>p.fl).join()!==fl0||S.players.length!==4)clean=false;}
 ok(clean,'every card keeps prices in band, goods integer >=0, never touches florins, never removes a player');
 setup([100]);let band=true;for(let t=0;t<300;t++){applyEvent(drawEvent());if(!priceOK())band=false;}ok(band,'300 cards never breach the band');
 setup([100,50]);CKEYS.forEach(k=>{S.prices[k]=10;S.history[k]=[10];});applyEvent(EVENTS.find(c=>c.k==='decree'&&c.dir>0));
 ok(S.pendingChoice&&S.pendingChoice.decree,'decree raises a choice');const amt=S.pendingChoice.amt;resolveEventChoice('gold');
 ok(S.prices.gold===10+amt&&S.history.gold[S.history.gold.length-1]===S.prices.gold&&!S.pendingChoice,'decree applied + history synced');
 setup([200,10]);applyEvent(EVENTS.find(c=>c.k==='resGive'&&!c.take));const res=S.pendingChoice.res;const tot=S.players[0].port[res]+S.players[1].port[res];
 ok(!resolveEventChoice(S.pendingChoice.chooser),'resGive refuses the chooser as their own target');
 resolveEventChoice(S.pendingChoice.chooser===0?1:0);ok(S.players[0].port[res]+S.players[1].port[res]===tot,'resGive conserves units');
 let leaked=0;for(let i=0;i<600;i++){setup([100,100,100,100]);S.handNo=1;if({resRole:1,resGive:1,decree:1}[drawEvent().k])leaked++;}
 ok(leaked===0,'hand 1 never draws a targeting card');
 const hits=[0,0,0,0];for(let i=0;i<800;i++){setup([100,100,100,100]);hits[M.richestIdx()]++;}
 ok(hits.every(h=>h>100),'ties for richest are broken at random (seat 0 is not always picked)');
 ok(!EVENTS.some(c=>['flAll','flRole','give','pass','rule','freeze','peek'].includes(c.k)),'no florin or rule-bender cards');}

console.log('Boasts (escrowed, odds-based, settled even on fold-outs):');
{const tableOf=(n)=>{S.players=[];for(let i=0;i<n;i++)S.players.push(mkP({name:'P'+i}));S.totalHands=10;newGame();};
 // deterministic hand: P0 boasts Straight, P1 challenges
 tableOf(2);startHand();postAntes();const t0=S.turn;const b=S.players[t0],c=S.players[1-t0];
 b.priv=[1,2];c.priv=[8,8];S.board=[3,4,5,7,7];
 apply({type:'boast',tier:RK.STRAIGHT,stake:10});ok(b.boast===RK.STRAIGHT&&b.boastStake===10,'boast recorded');
 ok(!legal().boastTargets.length,'cannot challenge your own boast');
 apply({type:'check'});const L=legal();ok(L.boastTargets.includes(t0),'rival may challenge');
 const terms=challengeTerms(b,c);ok(terms.cRisk===40&&terms.bRisk===10,'straight pays 4:1 (40 vs 10)');
 const before=S.players.reduce((a,p)=>a+p.fl+p.escrow,0)+S.pot;
 apply({type:'challenge',target:t0});ok(b.escrow===10&&c.escrow===40,'both stakes escrowed');
 ok(S.players.reduce((a,p)=>a+p.fl+p.escrow,0)+S.pot===before,'escrow conserves florins');
 let guard=0;while(S.phase!=='result'&&guard++<50){const LL=legal();apply(LL.canCheck?{type:'check'}:{type:'call'});}
 ok(S.phase==='result','hand completes');const br=S._show.boasts.find(x=>x.bi===t0);
 ok(br&&br.made&&b.escrow===0&&c.escrow===0,'straight boast made, escrow released');
 ok(S.players.reduce((a,p)=>a+p.fl,0)===200,'florins conserved through boast settlement');
 // fold-out: boaster folds -> boast fails, challenger collects
 tableOf(3);startHand();postAntes();const bi=S.turn;apply({type:'boast',tier:RK.TRIPS,stake:8});apply({type:'check'});
 const ci=S.turn;apply({type:'challenge',target:bi});apply({type:'bet'});
 guard=0;while(S.turn!==bi&&S.phase==='betting'&&guard++<10)apply({type:'check'});
 if(S.phase==='betting'&&S.turn===bi){apply({type:'raise',amount:10});guard=0;while(S.phase==='betting'&&S.turn!==bi&&guard++<10){const LL=legal();apply(LL.canCall?{type:'call'}:{type:'check'});}
   if(S.phase==='betting')apply({type:'fold'});}
 guard=0;while(S.phase==='betting'&&guard++<60){const LL=legal();apply(LL.canCheck?{type:'check'}:(Math.random()<.5?{type:'call'}:{type:'fold'}));}
 const fb=S._show.boasts.find(x=>x.bi===bi);ok(fb&&(!S.players[bi].folded||fb.made===false),'a boaster who folded loses the boast');
 ok(S.players.reduce((a,p)=>a+p.fl+p.escrow,0)===300&&S.players.every(p=>p.escrow===0),'fold-out settles escrow and conserves florins');
 // boasts close after the final die
 tableOf(2);startHand();postAntes();S.street=3;S.reveal=5;ok(!legal().canBoast,'no boasts once all dice are out');
 // an all-in boaster cannot dodge: challenge requires the boaster to cover the stake
 tableOf(2);startHand();postAntes();const bb=S.players[S.turn];apply({type:'boast',tier:RK.TRIPS,stake:5});bb.fl=3;apply({type:'check'});
 ok(!legal().boastTargets.length,'cannot challenge a boast the boaster can no longer cover');}

console.log('Flow edge cases:');
{S.players=[mkP({name:'A'}),mkP({name:'B'}),mkP({name:'C'})];S.totalHands=10;newGame();startHand();S.players[1].fl=0;S.players[2].fl=0;postAntes();
 ok(liveIdx().length===1,'only one merchant dealt in');const r=endHandByFold();ok(r==='result'&&S.players[0].fl===100,'lone merchant simply takes back the ante');
 S.players=[mkP({name:'A'}),mkP({name:'B'})];newGame();startHand();postAntes();const a=S.turn;apply({type:'raise',amount:95});
 ok(S.players[a].allin,'all-in raise');apply({type:'call'});ok(S.phase==='betting'||S.phase==='result','call all-in');
 let adv=0;while(S.phase!=='result'&&adv++<10){advanceStreet();}ok(S.phase==='result'&&S.players.reduce((x,p)=>x+p.fl,0)===200,'all-in runout conserves');
 ok(autoTarget(2)<autoTarget(6),'auto target scales with player count');
 S.target=100;ok(gameOverReason()==='target','target ending detected');}


console.log('Multiplayer host (views never leak hidden dice):');
{const {makeView,hostHandle,hostJoin,hostInitLobby}=M;let leaks=0,stuck=0,games=0,errs=0,acts=0,rejoinOK=true;
 const setS=o=>{for(const k of Object.keys(S))delete S[k];Object.assign(S,o);};
 const check=()=>{S.players.forEach((_,seat)=>{const v=makeView(S,seat);
   if(v.eventOrder||v.trend)leaks++;
   const showdown=v.phase==='result'&&v._show&&!v._show.byFold&&!v._show.nobody;
   v.players.forEach((p,i)=>{if(i===seat)return;if(!(showdown&&!S.players[i].folded)&&v.phase!=='over'&&p.priv.some(d=>d!==0))leaks++;if(p.preview)leaks++;});
   const vis=(showdown||(v.phase==='result'&&S.rollout))?5:S.reveal;v.board.forEach((d,j)=>{if(j>=vis&&d!==0)leaks++;});
   if(!v.players[seat].priv.every((d,j)=>d===S.players[seat].priv[j]))leaks++;});};
 for(let g=0;g<150;g++){const n=rng(2,6);setS({players:[],totalHands:rng(3,8),target:525,targetAuto:true,numerals:'arabic'});hostInitLobby('Host',0,0);
   const tokens=[null];for(let i=1;i<n;i++){const r=hostJoin({name:'G'+i,pi:i,hi:i});tokens.push(r.token);}
   if(g===0){S.conn[1]=false;const r=hostJoin({token:tokens[1]});rejoinOK=r.seat===1&&S.conn[1]===true;}
   if(hostHandle(1,{type:'start'}).ok)errs++;          // only the host may start
   hostHandle(0,{type:'start'});if(g===0&&!hostJoin({name:'late'}).err)errs++;let guard=0;
   while(S.phase!=='over'&&guard++<20000){check();acts++;
     if(S.phase==='market'){if(S.pendingChoice){const pc=S.pendingChoice;hostHandle(pc.chooser,{type:'choose',v:pc.decree?CKEYS[rng(0,5)]:S.players.map((_,i)=>i).filter(i=>i!==pc.chooser)[0]});continue;}
       for(let s=0;s<n&&S.phase==='market';s++){if(Math.random()<.3)hostHandle(s,{type:'trade',t:{mode:'order',buy:{[CKEYS[rng(0,5)]]:1},sell:{[CKEYS[rng(0,5)]]:0}}});if(!S.ready[s])hostHandle(s,{type:'ready'});}continue;}
     if(S.phase==='result'){S.players.forEach((_,i)=>{if(!S.ready[i])hostHandle(i,{type:'ready'});});continue;}
     if(S.phase==='betting'){
       if(S.window){const w=S.window;w.pend.forEach(i=>hostHandle(i,Math.random()<.5?{type:'pass'}:{type:'power',k:CKEYS.find(k=>abilityReady(S.players[i],k))||'gold',idx:0,sign:1}));
         if(S.window===w)hostHandle(0,{type:'force'});continue;}
       const seat=S.turn;const other=(seat+1)%n;
       if(Math.random()<.05&&hostHandle(other,{type:'check'}).ok)errs++;  // acting out of turn must fail
       const L=legal();const r=Math.random();let a;
       if(L.canBoast&&r<.08)a={type:'boast',tier:HAND_TIERS[rng(0,3)].t,stake:1};
       else if(L.boastTargets.length&&r<.15)a={type:'challenge',target:L.boastTargets[0]};
       else if(L.canAbility&&r<.25){const k=CKEYS.find(k=>abilityReady(S.players[seat],k));a={type:'power',k,idx:0,sign:-1};}
       else if(L.canCall)a=r<.85?{type:'call'}:{type:'fold'};else if(L.canRaise&&r<.45)a={type:'raise',amount:L.minRaise};else a={type:'check'};
       const res=hostHandle(seat,a);if(res.err&&a.type!=='power'){const L2=legal();hostHandle(seat,L2.canCheck?{type:'check'}:{type:'fold'});}
       continue;}
     stuck++;break;}
   if(S.phase!=='over')stuck++;else{games++;check();}
   if(g===1){hostHandle(0,{type:'rematch'});if(S.phase!=='lobby')stuck++;}
 }
 ok(leaks===0,`no view ever shows another merchant's hidden dice, unrevealed board dice, deck order or trends (${leaks} leaks)`);
 ok(stuck===0,`150 hosted games run to completion (${games} finished, ${stuck} stuck)`);
 ok(errs===0,'out-of-turn, non-host and late-join attempts are refused');
 ok(rejoinOK,'a dropped merchant rejoins their own seat with their token');
 console.log(`  ${games} hosted games · ${acts} host actions checked`);}


console.log('Private messages (host relays; only the two people involved can see them):');
{const {hostDM,makeView,hostJoin,hostInitLobby,hostHandle,HOST}=M;
 for(const k of Object.keys(S))delete S[k];Object.assign(S,{players:[],totalHands:5,target:525,targetAuto:true});hostInitLobby('Host',0,0);
 hostJoin({name:'A',pi:1,hi:1});hostJoin({name:'B',pi:2,hi:2});
 ok(hostHandle(1,{type:'dm',to:2,text:'secret plan'}).ok,'a guest can message another guest');
 ok(hostHandle(0,{type:'dm',to:1,text:'hi A'}).ok,'the host can message a guest');
 const v0=makeView(S,0),v1=makeView(S,1),v2=makeView(S,2);
 ok(v1.dms.length===2&&v2.dms.length===1&&v0.dms.length===1,'each view holds only its own conversations');
 ok(!v0.dms.some(m=>m.x==='secret plan'),'the host view never contains a message between two guests');
 ok(v2.dms[0].f===1&&v2.dms[0].to===2,'sender is stamped by the host, not the client');
 ok(hostHandle(1,{type:'dm',to:1,text:'me'}).err&&hostHandle(1,{type:'dm',to:9,text:'x'}).err&&hostHandle(1,{type:'dm',to:'2',text:'x'}).err,'self, unknown or malformed recipients are refused');
 ok(hostHandle(1,{type:'dm',to:2,text:'   '}).err,'empty messages are refused');
 hostHandle(2,{type:'dm',to:1,text:'x'.repeat(1000)});ok(S.dms[S.dms.length-1].x.length===M.DM_MAX,'long messages are capped at '+M.DM_MAX+' characters');
 let blocked=0;for(let i=0;i<12;i++)if(hostHandle(0,{type:'dm',to:2,text:'spam '+i}).err)blocked++;ok(blocked>=4,'rapid-fire messages are rate limited');
 hostHandle(0,{type:'start'});ok(hostHandle(2,{type:'dm',to:0,text:'mid-game'}).ok&&S.phase==='market','messages work during a game without touching game state');
 ok(new Set(S.dms.map(m=>m.id)).size===S.dms.length,'message ids are unique');}

console.log('Simulation:');
const allInts=()=>S.players.every(p=>Number.isInteger(p.fl)&&p.fl>=0&&Number.isInteger(p.escrow)&&p.escrow>=0&&CKEYS.every(k=>Number.isInteger(p.port[k])&&p.port[k]>=0))&&Number.isInteger(S.pot);
let loops=0,nonint=0,leak=0,hands=0,sitouts=0,pledges=0,boasts=0,chals=0,abil=0,trades=0,maxSteps=0,elim=0,tgt=0,cap=0;const byN={};
for(let g=0;g<800;g++){
  const n=rng(2,6);S.players=[];for(let i=0;i<n;i++)S.players.push({name:'P'+i,pi:i,hi:i%4});
  S.totalHands=10;S.targetAuto=true;newGame();byN[n]=byN[n]||{g:0,t:0};byN[n].g++;let ended='cap';
  for(let h=0;h<S.totalHands;h++){
    startHand();
    if(S.pendingChoice){if(S.pendingChoice.decree)resolveEventChoice(CKEYS[rng(0,5)]);else{const t=S.players.map((_,i)=>i).filter(i=>i!==S.pendingChoice.chooser);resolveEventChoice(t[rng(0,t.length-1)]);}}
    S.players.forEach(p=>{if(Math.random()<.3){const k=CKEYS[rng(0,5)];const r=doTrade(p,Math.random()<.5?{mode:'buy',k,q:rng(1,3)}:{mode:'multi',sel:{[k]:rng(0,2),[CKEYS[rng(0,5)]]:1}});if(r.ok)trades++;}});
    if(g%2===0)S.players.forEach((p,i)=>{if(i%3===0)p.fl=rng(0,8);});
    if(!allInts())nonint++;if(S.players.length!==n)elim++;
    postAntes();hands++;S._injected=0;S.players.forEach(p=>{if(p.out)sitouts++;});
    const before=S.players.reduce((a,p)=>a+p.fl+p.escrow,0)+S.pot;
    if(liveIdx().length<=1){if(liveIdx().length===1)endHandByFold();}
    let steps=0;
    while(S.phase==='betting'){if(++steps>4000){loops++;break;}
      const L=legal();
      if(L.fl===undefined){S.players.forEach(p=>{if(p.allin&&!p.folded&&Math.random()<.4){const r=CKEYS.filter(k=>abilityReady(p,k));if(r.length){const k=r[rng(0,r.length-1)];if(doAbility(p,k,{idx:rng(0,Math.max(0,(k==='wheat'||k==='wood')?S.reveal-1:p.priv.length-1)),sign:Math.random()<.5?1:-1}))abil++;}}});
        if(M.streetDone())advanceStreet();else{loops++;break;}continue;}
      const p=S.players[S.turn];
      if(L.canPledge&&Math.random()<.5){const k=CKEYS[rng(0,5)];if(p.port[k]>0){doPledge(p,{[k]:rng(1,p.port[k])});pledges++;}}
      if(L.canAbility&&Math.random()<.25){const r=CKEYS.filter(k=>abilityReady(p,k));const k=r[rng(0,r.length-1)];
        if(doAbility(p,k,{idx:rng(0,Math.max(0,(k==='wheat'||k==='wood')?S.reveal-1:p.priv.length-1)),sign:Math.random()<.5?1:-1}))abil++;}
      if(L.canBoast&&Math.random()<.1){apply({type:'boast',tier:HAND_TIERS[rng(0,3)].t,stake:rng(1,L.boastCap)});if(p.boast)boasts++;}
      const L2=legal();if(L2.boastTargets&&L2.boastTargets.length&&Math.random()<.3){apply({type:'challenge',target:L2.boastTargets[0]});chals++;if(S.phase!=='betting')break;}
      const L3=legal();if(L3.fl===undefined)continue;let a;
      if(L3.canCall&&Math.random()<.8)a={type:'call'};else if(L3.canCheck)a={type:'check'};
      else if(L3.canRaise&&Math.random()<.5)a={type:'raise',amount:Math.min(L3.maxRaise,L3.minRaise+rng(0,10))};
      else if(L3.canFold)a={type:'fold'};else a={type:'check'};
      apply(a);
    }
    maxSteps=Math.max(maxSteps,steps);
    if(!allInts())nonint++;
    const after=S.players.reduce((a,p)=>a+p.fl+p.escrow,0)+S.pot;
    if(after!==before+S._injected||S.pot!==0||S.players.some(p=>p.escrow))leak++;
    if(gameOverReason()==='target'){ended='target';break;}
  }
  if(ended==='target'){tgt++;byN[n].t++;}else{cap++;applyFinalReprice();if(!CKEYS.every(k=>S.prices[k]>=5&&S.prices[k]<=15))nonint++;}
}
console.log(`  ${hands} hands · ${trades} trades · ${sitouts} sit-outs · ${pledges} pledges · ${boasts} boasts · ${chals} challenges · ${abil} powers · max ${maxSteps} steps/hand`);
console.log(`  loops ${loops} · non-integer/neg ${nonint} · conservation breaks ${leak} · eliminations ${elim}`);
console.log(`  WIN CONDITION (auto target / 10 hands): ${tgt} hit target, ${cap} ran to cap`);
console.log('  target-reached rate: '+[2,3,4,5,6].map(n=>`${n}p ${byN[n]?Math.round(byN[n].t/byN[n].g*100):0}%`).join(' · '));
try{fs.unlinkSync(tmp);}catch(e){}
if(fails||loops||nonint||leak||elim){console.log(`\n❌ ${fails} unit failure(s) + sim issues. Do not ship.`);process.exit(1);}
else console.log('\n✅ ALL CLEAN — engine integrity verified.');
