const tr=(zh,en)=>document.documentElement.lang==='en'?en:zh;
export function createEnergyUI({api,toast,getWallet}){
 const dialog=document.createElement('dialog');dialog.className='energy-dialog';dialog.innerHTML='<button class="life-close">×</button><small>ID FUN · ENERGY</small><h2></h2><strong class="energy-balance"></strong><p class="energy-copy"></p><p class="energy-state"></p><button class="energy-charge"></button><div class="energy-receipts"></div><button class="energy-recheck"></button>';
 document.body.append(dialog);let status=null,busy=false;
 const button=dialog.querySelector('.energy-charge'),records=dialog.querySelector('.energy-receipts');
 function render(){dialog.querySelector('h2').textContent=tr('角色充能','Character energy');dialog.querySelector('.energy-balance').textContent=tr(`剩余 ${status?.balance||0} 能量`,`${status?.balance||0} energy remaining`);
  dialog.querySelector('.energy-copy').textContent=tr('黑洞实际收到 200,000 IF 后增加 100 能量。角色和外观永久保留；普通练习免费，领取已有奖励不需要能量。转入黑洞不可撤回。','100 energy is credited after 200,000 IF reaches the dead address. Your character is permanent. Practice is free and existing claims need no energy. Burns are irreversible.');
  dialog.querySelector('.energy-state').textContent=status?.live?tr('你支付 gas；充能不赠送奖励积分，也不保证收益。','You pay gas. Charging does not grant reward points or guarantee earnings.'):tr('代币与充能尚未开放，当前不会收费。','Token charging is not live. No payment is accepted.');
  const gross=status?Number(BigInt(status.grossAmount))/10**status.decimals:200000;
  button.textContent=tr(`支付 ${gross.toLocaleString('en-US',{maximumFractionDigits:6})} IF · +100 能量`,`Pay ${gross.toLocaleString('en-US',{maximumFractionDigits:6})} IF · +100 energy`);button.disabled=!status?.live||busy;
  dialog.querySelector('.energy-recheck').textContent=tr('核对待确认交易','Check pending transactions');
  records.replaceChildren();for(const o of status?.orders||[]){const row=document.createElement('p');row.textContent=(o.status==='paid'?tr('已充能','Credited'):tr('待确认','Pending'))+' · '+new Date(o.created_at).toLocaleString();if(o.tx_hash){const a=document.createElement('a');a.href='https://bscscan.com/tx/'+o.tx_hash;a.target='_blank';a.rel='noopener noreferrer';a.textContent=' ↗';row.append(a);}if(o.status==='pending'){const recover=document.createElement('button');recover.textContent=tr('补填交易哈希','Enter transaction hash');recover.onclick=async()=>{const hash=prompt(tr('粘贴这笔充能的 0x 交易哈希','Paste the 0x transaction hash for this charge'));if(!hash)return;if(!/^0x[0-9a-f]{64}$/i.test(hash.trim()))return toast(tr('交易哈希格式不正确','Invalid transaction hash'));localStorage.setItem(pendingKey(),JSON.stringify({id:o.id,hash:hash.trim()}));await check();};row.append(recover);}records.append(row);}
 }
 async function read(){status=await api('/api/energy');render();}
 const pendingKey=()=>`idfun-energy-pending:${getWallet()?.toLowerCase()||''}`;
 async function check(){const raw=localStorage.getItem(pendingKey());if(!raw)return read();const p=JSON.parse(raw);try{await api('/api/energy/confirm',{id:p.id,hash:p.hash});localStorage.removeItem(pendingKey());toast(tr('充能已到账。','Energy credited.'));}catch(e){toast(e.message);}await read();}
 button.onclick=async()=>{if(busy||!status?.live)return;busy=true;render();
  try{if(!window.ethereum)throw new Error(tr('请在支持 BSC 的钱包浏览器中打开。','Use a BSC wallet browser.'));
   if(localStorage.getItem(pendingKey())){await check();return;}
   const accounts=await window.ethereum.request({method:'eth_requestAccounts'}),wallet=getWallet();const from=accounts.find(a=>a.toLowerCase()===wallet?.toLowerCase());
   if(!from)throw new Error(tr('钱包与当前游戏账户不一致。','Wallet does not match this game account.'));
   if(BigInt(await window.ethereum.request({method:'eth_chainId'}))!==56n)throw new Error(tr('请切换到 BNB Smart Chain。','Switch to BNB Smart Chain.'));
   const key=pendingKey(),order=await api('/api/energy/order',{}),tx=order.transaction;
   if(getWallet()?.toLowerCase()!==from.toLowerCase())throw new Error(tr('账户已变化，请重试。','Account changed. Please retry.'));
   if(order.chainId!==56||tx.value!=='0x0'||!/^0x[0-9a-f]{40}$/i.test(tx.to)||!/^0xa9059cbb0{60}dead[0-9a-f]{64}$/i.test(tx.data))throw new Error(tr('充能交易校验失败。','Charge transaction verification failed.'));
   const hash=await window.ethereum.request({method:'eth_sendTransaction',params:[{from,...tx}]});
   localStorage.setItem(key,JSON.stringify({id:order.id,hash}));toast(tr('已提交，等待链上确认。可关闭窗口，之后再核对。','Submitted. You may close this panel and check again after confirmation.'));
   await read();
  }catch(e){toast(e.message);}finally{busy=false;render();}
 };
 dialog.querySelector('.life-close').onclick=()=>dialog.close();dialog.querySelector('.energy-recheck').onclick=()=>check().catch(e=>toast(e.message));
 return {async open(){dialog.showModal();try{await read();}catch(e){toast(e.message);}},refresh:read,isOpen:()=>dialog.open};
}
