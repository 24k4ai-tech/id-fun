const unit=10n**18n;
export const bnb=wei=>{const n=BigInt(wei||0);return n>0n&&n<1000000000000n?'<0.000001':`${n/unit}.${String(n%unit).padStart(18,'0').slice(0,6)}`;};
export function assetAmount(value,asset={symbol:'BNB',decimals:18}){
 const n=BigInt(value||0),d=asset.decimals;
 if(!Number.isInteger(d)||d<0||d>36||n<0n)throw new Error('Invalid reward amount');
 const base=10n**BigInt(d),digits=Math.min(d,6),fraction=String(n%base).padStart(d,'0').slice(0,digits);
 const tiny=d>6&&n>0n&&n<10n**BigInt(d-6);
 return (tiny?'<0.000001':String(n/base)+(digits?'.'+fraction:''))+' '+asset.symbol;
}
const tr=(zh,en)=>document.documentElement.lang==='en'?en:zh;
export function createRewardOverview({getPlayer}){
 const box=document.createElement('section');box.className='reward-overview';document.getElementById('reward-status').before(box);
 let data=null,busy=false;
 function render(){if(!data)return;
  box.replaceChildren();const h=document.createElement('h3');h.textContent=tr('我的奖励进度','My reward progress');box.append(h);
  const info=document.createElement('p');box.append(info);
  if(data.status==='not_live'){info.textContent=tr('代币尚未上线。游戏可试玩，真实奖励暂未开启。','Token is not live. Play is available; real rewards are not active.');return;}
  if(data.status==='unavailable'){info.textContent=tr('暂时无法核对金库，已暂停显示预估。稍后自动重试。','Treasury verification is unavailable. Estimates are hidden until it recovers.');return;}
  const me=data.rows.find(r=>r.wallet.toLowerCase()===getPlayer()?.wallet?.toLowerCase());
  const grid=document.createElement('div');grid.className='reward-metrics';
  for(const [label,value] of [[tr('金库现有余额','Treasury balance'),assetAmount(data.balanceWei,data.rewardAsset)],[tr('本批新增玩家池','Current revenue batch'),assetAmount(data.currentPoolWei,data.rewardAsset)],[tr('我的有效积分 / 权重','My points / weight'),me?`${me.combatPoints} / ${me.weightedPoints.toFixed(2)}`:'0 / 0'],[tr('我的本批预估','My batch estimate'),me?'≈ '+assetAmount(me.estimatedWei,data.rewardAsset):assetAmount(0,data.rewardAsset)]]){
   const cell=document.createElement('div'),small=document.createElement('small'),strong=document.createElement('strong');small.textContent=label;strong.textContent=value;cell.append(small,strong);grid.append(cell);
  }box.append(grid);
  info.textContent=tr('已确认税费持续分账；分账金额固定，能否领取以当前链上状态为准，常规领取期为两天。新积分影响后续分账。','Confirmed revenue is allocated continuously. Allocations stay fixed; claim availability depends on the current on-chain state, with a standard two-day window. New points affect future allocations.');
  if(data.status==='test_phase')info.textContent=tr('第一阶段：尚未开启玩家奖励记账。','Phase one: player reward accounting has not started.');
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=tr('查看各 ID 的当前预估','View estimates by ID');details.append(summary);
  const table=document.createElement('table'),head=document.createElement('tr');for(const t of ['ID',tr('有效积分','Points'),tr('持币均重','Avg. boost'),tr('预估 '+data.rewardAsset.symbol,'Est. '+data.rewardAsset.symbol)]){const th=document.createElement('th');th.textContent=t;head.append(th);}table.append(head);
  for(const row of data.rows){const line=document.createElement('tr');for(const value of [row.agentId,String(row.combatPoints),row.multiplier.toFixed(2)+'×',row.reason?tr('资格待核对','Ineligible'):assetAmount(row.estimatedWei,data.rewardAsset)]){const td=document.createElement('td');td.textContent=value;line.append(td);}table.append(line);}details.append(table);box.append(details);
  const foot=document.createElement('small');foot.textContent=tr(`至少 2 个合格 ID；每 ID 每批上限 5%。不足分配的余额不重复分发。预估随新税费和积分变化，不等于已到账。更新：${new Date(data.checkedAt).toLocaleTimeString()}`,
   `At least 2 eligible IDs; 5% maximum per ID per revenue batch. Unallocated balances are not recycled into repeat payouts. Estimates change with revenue and points. Updated ${new Date(data.checkedAt).toLocaleTimeString()}`);box.append(foot);
  if(data.holdReason){const held=document.createElement('p');held.textContent=tr('本批尚未满足发放条件，资金留在金库。','This batch is not yet eligible for distribution. Funds remain in the treasury.');box.append(held);}
 }
 async function refresh(){if(busy||document.hidden)return;busy=true;try{const r=await fetch('/api/rewards/estimate',{cache:'no-store'});if(!r.ok)throw new Error();data=await r.json();}catch{data={status:'unavailable'};}finally{busy=false;render();}}
 let language=document.documentElement.lang;
 setInterval(refresh,15000);new MutationObserver(()=>{const next=document.documentElement.lang;if(next!==language){language=next;render();}}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 window.addEventListener('reward-refresh',refresh);refresh();return {refresh};
}
