import {bnb,assetAmount} from './reward-overview.js';
const tr=(zh,en)=>document.documentElement.lang==='en'?en:zh;
const selectors={dispatch:'0xe9c4a3ac',sync:'0xfff6cae9'};

// Prepares a zero-value transaction only. The visitor explicitly confirms it
// in their own wallet. The contract fixes the recipient; the caller gets no fee.
export function createFlapFunding({anchor,toast}){
 const box=document.createElement('section'),status=document.createElement('p'),button=document.createElement('button');
 box.className='reward-overview';box.hidden=true;button.className='link-button';button.disabled=true;
 box.append(status,button);anchor.after(box);
 let state=null,busy=false,reading=false,receiptLink=null;
 const read=async()=>{
  const response=await fetch('/api/treasury/funding',{cache:'no-store'});
  if(!response.ok)throw new Error(tr('暂时无法核对待入库税费。','Pending tax verification is unavailable.'));
  return response.json();
 };
 function render(){
  button.textContent=state?.action==='sync'?tr('同步到账税费 · 我付 gas','Sync received tax · I pay gas'):tr('触发税费入库 · 我付 gas','Forward tax to treasury · I pay gas');
  if(receiptLink)receiptLink.textContent=tr('查看入库交易 ↗','View forwarding transaction ↗');
  box.hidden=!state||['not_live','no_split_dispatch','nothing_pending'].includes(state.status);
  button.disabled=busy||state?.status!=='ready';
  if(state?.status==='ready')status.textContent=tr(
   `${state.action==='sync'?'金库待记账':'FLAP 待入库'} ${assetAmount(state.pendingWei,state.rewardAsset)}。确认实际到账后才参与奖励分账；本操作不领取个人奖励。`,
   `${assetAmount(state.pendingWei,state.rewardAsset)} ${state.action==='sync'?'awaits recognition':'awaits forwarding from FLAP'}. Rewards use confirmed receipts only. This does not claim a personal reward.`);
  else if(state?.status==='unavailable')status.textContent=tr('暂时无法核对待入库税费。','Pending tax verification is unavailable.');
 }
 async function refresh(){
  if(busy||reading||document.hidden)return;reading=true;
  try{state=await read();}catch{state={status:'unavailable'};}finally{reading=false;render();}
 }
 button.onclick=async()=>{
  if(busy||reading||state?.status!=='ready')return;
  if(!window.ethereum)return toast(tr('请使用支持 BSC 的钱包。','Use a BSC-compatible wallet.'));
  busy=true;render();
  try{
   const fresh=await read();
   if(fresh.status!=='ready'||fresh.chainId!==56||fresh.data!==selectors[fresh.action]||fresh.value!=='0x0'||
      fresh.action!==state.action||fresh.target?.toLowerCase()!==state.target?.toLowerCase()||
      fresh.rewardAsset?.address!==state.rewardAsset?.address||fresh.vaultAddress?.toLowerCase()!==state.vaultAddress?.toLowerCase())
    throw new Error(tr('入库状态已变化，请刷新。','Funding status changed. Please refresh.'));
   const [from]=await window.ethereum.request({method:'eth_requestAccounts'});
   if(!from||BigInt(await window.ethereum.request({method:'eth_chainId'}))!==56n)
    throw new Error(tr('请连接钱包并切换至 BSC 主网。','Connect your wallet on BSC mainnet.'));
   const tx={from,to:fresh.target,data:fresh.data,value:'0x0'};
   const gas=BigInt(await window.ethereum.request({method:'eth_estimateGas',params:[tx]}));
   const price=BigInt(await window.ethereum.request({method:'eth_gasPrice'}));
   toast(tr(`预计 gas 约 ${bnb(gas*price)} BNB，请在钱包确认。`,`Estimated gas: ${bnb(gas*price)} BNB. Confirm in your wallet.`));
   const hash=await window.ethereum.request({method:'eth_sendTransaction',params:[tx]});
   status.textContent=tr('入库交易已提交，等待确认…','Forwarding transaction submitted. Waiting for confirmation…');
   receiptLink?.remove();receiptLink=document.createElement('a');receiptLink.href='https://bscscan.com/tx/'+hash;receiptLink.target='_blank';receiptLink.rel='noopener noreferrer';receiptLink.textContent=tr('查看入库交易 ↗','View forwarding transaction ↗');box.append(receiptLink);
   for(let i=0;i<30;i++){
    await new Promise(resolve=>setTimeout(resolve,2000));
    const receipt=await window.ethereum.request({method:'eth_getTransactionReceipt',params:[hash]});
    if(!receipt)continue;
    if(BigInt(receipt.status)!==1n)throw new Error(tr('入库交易失败，请查看链上记录。','Forwarding failed. Check the transaction.'));
    toast(tr('入库交易已确认，奖励将在核对实际到账后更新。','Transaction confirmed. Rewards update after treasury receipt verification.'));
    window.dispatchEvent(new Event('reward-refresh'));return;
   }
   toast(tr('交易仍待确认，请查看交易记录。','Transaction remains pending. Check its receipt.'));
  }catch(error){toast(error.message||tr('暂时无法入库。','Forwarding is unavailable.'));}
  finally{busy=false;await refresh();}
 };
 let language=document.documentElement.lang;
 new MutationObserver(()=>{if(language!==document.documentElement.lang){language=document.documentElement.lang;render();}})
  .observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 setInterval(refresh,30000);refresh();return {refresh};
}
