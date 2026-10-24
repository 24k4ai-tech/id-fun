import {createRewardOverview,bnb,assetAmount} from './reward-overview.js';
import {createFlapFunding} from './flap-funding.js';
const tr=(zh,en)=>document.documentElement.lang==='en'?en:zh;
const BNB = 10n ** 18n;
const formatBnb = wei => bnb(wei)+' BNB';
const short = address => `${address.slice(0, 6)}…${address.slice(-4)}`;

export function createRewardsUI({ toast,getPlayer=()=>null }) {
  const overview=createRewardOverview({getPlayer});
  const status = document.getElementById('reward-status');
  const funding=createFlapFunding({anchor:status,toast});
  const refresh = document.getElementById('reward-refresh');
  const send = document.getElementById('reward-send');
  const receiptBox=document.createElement('p');receiptBox.className='reward-receipt';status.after(receiptBox);
  let next = null;
  let busy = false;
  let mine=true;
  const scope=document.createElement('button');scope.className='link-button';scope.textContent=tr('查看全社区待发放','View community payouts');refresh.before(scope);
  scope.onclick=()=>{mine=!mine;scope.textContent=mine?tr('查看全社区待发放','View community payouts'):tr('查看我的待领取','View my rewards');load();};
  const endpoint=()=>'/api/rewards/next'+(mine&&getPlayer()?'?mine=1':'');

  async function load() {
    if (busy) return;
    next = null;
    send.disabled = true;
    status.textContent = tr('核对链上奖励…','Checking on-chain rewards…');
    try {
      const response = await fetch(endpoint(), { cache: 'no-store' });
      if (!response.ok) throw new Error(tr('奖励状态暂时无法读取','Reward status is temporarily unavailable.'));
      const result = await response.json();
      if (result.status === 'ready') {
        next = result;
        status.textContent = tr(`本次可领取：${assetAmount(result.amountWei,result.rewardAsset)}${result.batchCount?'（'+result.batchCount+' 批）':''} → ${short(result.wallet)}。触发者支付 gas。`,`Claim now: ${assetAmount(result.amountWei,result.rewardAsset)}${result.batchCount?' ('+result.batchCount+' batches)':''} → ${short(result.wallet)}. The sender pays gas.`);
        send.disabled = false;
      } else if (result.status === 'locked') {
        status.textContent = tr('名单已发布，等待期结束：','Published; unlocks at: ')+new Date(Number(result.unlockAt)*1000).toLocaleString();
      } else if (result.status === 'complete') {
        status.textContent = tr('本期奖励已全部发放。','This batch has been fully paid.');
      } else if (result.status === 'expired') {
        status.textContent = tr('本期领取期已结束。','The claim window has ended.');
      } else if (result.status === 'closed') {
        status.textContent = tr('本期领取已关闭。','This batch is closed.');
      } else if(result.status==='none_for_wallet'){
        status.textContent=tr('当前 ID 暂无待领奖励。新分账入账后会显示在这里。','No pending claim for this ID. New credits will appear here.');
      } else if(result.status==='waiting'){
        status.textContent=tr('暂无已入账奖励，正在等待合格对局与已确认税收。','No credits yet. Waiting for eligible matches and confirmed revenue.');
      } else {
        status.textContent = tr('代币尚未发行，暂无可发放奖励。','Token not launched. Real rewards are not active.');
      }
    } catch (error) { status.textContent = error.message; }
  }

  async function trigger() {
    if (busy || !next) return;
    if (!window.ethereum) { toast('需要安装支持 BSC 的钱包。'); return; }
    busy = true;
    send.disabled = true;
    try {
      const response = await fetch(endpoint(), { cache: 'no-store' });
      if (!response.ok) throw new Error('无法重新核对奖励');
      const fresh = await response.json();
      if (fresh.status !== 'ready' || fresh.data !== next.data ||
          fresh.treasuryAddress?.toLowerCase()!==next.treasuryAddress?.toLowerCase() ||
          fresh.wallet?.toLowerCase()!==next.wallet?.toLowerCase() || fresh.amountWei!==next.amountWei ||
          fresh.rewardAsset?.address!==next.rewardAsset?.address) throw new Error('奖励状态已变化，请刷新后再试');
      const [from] = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!from) throw new Error('未连接钱包');
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (BigInt(chainId) !== 56n) throw new Error('请先将钱包切换至 BSC 主网');
      const tx = { from, to: fresh.treasuryAddress, data: fresh.data, value: '0x0' };
      const gas = BigInt(await window.ethereum.request({ method: 'eth_estimateGas', params: [tx] }));
      const gasPrice = BigInt(await window.ethereum.request({ method: 'eth_gasPrice' }));
      toast(`预计 gas 上限约 ${formatBnb(gas * gasPrice)}，请在钱包确认。`);
      const hash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [tx] });
      status.textContent = `交易已提交：${short(hash)}。等待链上确认…`;
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const receipt = await window.ethereum.request({ method: 'eth_getTransactionReceipt', params: [hash] });
        if (!receipt) continue;
        if (BigInt(receipt.status) !== 1n) throw new Error('链上交易失败，可能已产生 gas 费用');
        toast(tr('奖励已发到名单绑定的钱包。','Reward sent to the bound wallet.'));
        const link=document.createElement('a');link.href='https://bscscan.com/tx/'+hash;link.target='_blank';link.rel='noopener noreferrer';link.textContent=tr('查看到账交易 ↗','View confirmed transaction ↗');receiptBox.replaceChildren(link);status.textContent=tr('奖励已到账。','Reward received.');
        window.dispatchEvent(new Event('reward-refresh'));
        return;
      }
      toast('交易仍待确认，请用交易哈希在 BscScan 查看。');
    } catch (error) { toast(error?.message || '触发发放失败'); }
    finally { busy = false;send.disabled=true;next=null;overview.refresh(); }
  }

  refresh.addEventListener('click', ()=>{load();overview.refresh();funding.refresh();});
  send.addEventListener('click', trigger);
  load();
  let language=document.documentElement.lang;
  new MutationObserver(()=>{const current=document.documentElement.lang;if(current===language)return;language=current;
    scope.textContent=mine?tr('查看全社区待发放','View community payouts'):tr('查看我的待领取','View my rewards');load();
  }).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  setInterval(()=>{if(!document.hidden&&!busy)load();},20000);
  return {refresh:()=>{load();overview.refresh();funding.refresh();}};
}
