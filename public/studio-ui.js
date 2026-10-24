import {createCharacterPreview} from './character-preview.js';
import {t,applyLocale} from './locale.js';

const $=id=>document.getElementById(id);
const stateLabels={awaiting_payment:'等待支付',queued:'等待制作',image_submitting:'绘制形象',image_pending:'绘制形象',mesh_submitting:'制作模型',mesh_pending:'制作模型',rig_submitting:'绑定动作',rig_pending:'绑定动作',processing:'打磨模型',ready:'制作完成',failed:'制作失败 · 可重试',needs_review:'正在核查任务',refund_requested:'退款申请已记录',refunded:'退款已确认'};
export function createStudioUI({api,toast,getWorld,getAvatar,onSaved}) {
  let preview=null,previewPromise=null,selection=0,appearance={},referenceId=null,info=null,poll=null,paying=false,clearCustom=false;
  const stage=document.createElement('section');stage.className='wardrobe-stage';
  stage.innerHTML=`<canvas id="wardrobe-canvas" aria-label="角色实时 3D 预览"></canvas><span id="wardrobe-loading">载入角色…</span><div class="wardrobe-tools"><button id="preview-face">看脸部</button><button id="preview-full">看全身</button><select id="preview-motion" aria-label="预览动作"><option value="Idle_Loop">待机</option><option value="Jog_Fwd_Loop">跑动</option><option value="Sword_Attack">攻击</option><option value="Spell_Simple_Shoot">施法</option><option value="Roll">翻滚</option></select></div><small>拖动旋转 · 滚轮缩放</small></section>`;
  const dialog=document.querySelector('.avatar-dialog'),roster=document.querySelector('.avatar-choice-grid');
  const body=document.createElement('div');body.className='wardrobe-body';roster.before(body);body.append(stage,roster);
  const settings=document.createElement('details');settings.className='appearance-controls';settings.innerHTML=`<summary>自由塑形 · 免费</summary><div><label>身高<input id="shape-height" type="range" min="0.9" max="1.1" step="0.01" value="1"></label><label>体型<input id="shape-build" type="range" min="0.85" max="1.15" step="0.01" value="1"></label><label>头身比<input id="shape-head" type="range" min="0.92" max="1.08" step="0.01" value="1"></label><label>色调<select id="shape-tint"><option value="natural">原色</option><option value="warm">暖金</option><option value="cool">霜蓝</option><option value="jade">青玉</option></select></label></div><small>只改变外观，不改变伤害、速度与命中范围。</small></details>`;body.after(settings);
  const open=document.createElement('button');open.id='studio-open';open.className='secondary-button studio-open';open.textContent='我的创作工坊 ↗';const actions=document.createElement('div');actions.className='wardrobe-actions';$('save-avatar-btn').before(actions);actions.append(open,$('save-avatar-btn'));
  const modal=document.createElement('div');modal.id='studio-modal';modal.className='studio-modal';modal.hidden=true;modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','我的创作工坊');
  modal.innerHTML=`<div class="studio-dialog"><header><div><span class="kicker">ID FUN / CREATOR STUDIO</span><h2>你的形象，你的领地</h2></div><button id="studio-close" class="close-avatar" aria-label="关闭">×</button></header><div class="studio-layout"><section class="studio-compose"><label class="studio-upload"><img id="studio-photo" alt="上传的头像" hidden><span>上传你的头像</span><small>JPG / PNG / WebP · 最大 5 MB</small><input id="studio-upload" type="file" accept="image/png,image/jpeg,image/webp"></label><button id="studio-use-photo" class="link-button" disabled>用作个人头像 · 免费</button><label>想创造什么？<select id="studio-kind"><option value="character">专属游戏角色</option><option value="place">我的私人领地</option></select></label><textarea id="studio-prompt" maxlength="600" rows="4" placeholder="描述服装、风格、颜色，或你想居住的地方…"></textarea><div class="studio-price"><strong>1,000,000 <em>IF</em></strong><span>每件作品 · 永久保存</span></div><small class="studio-terms">AI 制作由项目承担费用。制作时，参考图会交给图像与 3D 服务处理。作品属于游戏内收藏，不是 NFT；失败可免费重试或申请退款处理。</small><button id="studio-create" class="main-button">创建作品订单</button><p id="studio-availability" role="status"></p></section><section class="studio-library"><h3>我的作品</h3><div id="studio-jobs"></div></section></div></div>`;
  document.body.append(modal);modal.querySelector('header').after($('studio-availability'));
  function readAppearance(){return {...appearance,height:Number($('shape-height').value),build:Number($('shape-build').value),head:Number($('shape-head').value),tint:$('shape-tint').value};}
  async function showPreview(){const ticket=++selection;$('wardrobe-loading').hidden=false;
    try{previewPromise ||= createCharacterPreview($('wardrobe-canvas'));preview=await previewPromise;if(ticket!==selection)return;await preview.show(getAvatar(),readAppearance());if(ticket===selection)$('wardrobe-loading').hidden=true;}
    catch(error){$('wardrobe-loading').textContent=t(error.message);}
  }
  let changeTimer;for(const input of settings.querySelectorAll('input,select'))input.addEventListener('input',()=>{clearTimeout(changeTimer);changeTimer=setTimeout(showPreview,180);});
  $('preview-face').onclick=()=>preview?.face();$('preview-full').onclick=()=>preview?.full();$('preview-motion').onchange=e=>preview?.pose(e.target.value);
  async function load(){info=await api('/api/studio');renderJobs();$('studio-create').disabled=!info.enabled||Boolean(getWorld()?.me?.is_demo);$('studio-availability').textContent=t(info.enabled?'确认订单后，在钱包支付 100 万 IF 和网络 gas。':'AI 铸造将在 IF 发行并配置后开放，当前不会收费');applyLocale();}
  async function openStudio(){modal.hidden=false;try{await load();}catch(e){toast(e.message);}clearInterval(poll);poll=setInterval(()=>load().catch(()=>{}),8000);}
  function closeStudio(){modal.hidden=true;clearInterval(poll);}
  open.onclick=openStudio;$('studio-close').onclick=closeStudio;modal.onclick=e=>{if(e.target===modal)closeStudio();};document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden){e.stopImmediatePropagation();closeStudio();}},true);
  $('studio-upload').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>5*1024*1024){toast(t('请上传 5 MB 以内的 JPG、PNG 或 WebP 图片'));return;}
    try{const r=await fetch('/api/studio/upload',{method:'POST',headers:{'Content-Type':file.type},body:file,credentials:'same-origin'});const j=await r.json();if(!r.ok)throw new Error(j.message);referenceId=j.id;$('studio-photo').src=j.url;$('studio-photo').hidden=false;$('studio-use-photo').disabled=false;}catch(e){toast(e.message);}e.target.value='';};
  $('studio-use-photo').onclick=async()=>{try{await api('/api/studio/equip',{type:'portrait',id:referenceId});await onSaved();toast(t('头像已保存'));}catch(e){toast(e.message);}};
  $('studio-create').onclick=async()=>{const button=$('studio-create');button.disabled=true;try{await api('/api/studio/invoice',{kind:$('studio-kind').value,prompt:$('studio-prompt').value,referenceId});await load();}catch(e){toast(e.message);button.disabled=!info?.enabled;}};
  function button(text,fn){const b=document.createElement('button');b.className='secondary-button';b.textContent=t(text);b.onclick=async()=>{b.disabled=true;try{await fn();await load();}catch(e){toast(e.message);}finally{b.disabled=false;}};return b;}
  function renderJobs(){const list=$('studio-jobs');list.replaceChildren();
    for(const [type,label] of [['portrait','恢复默认头像'],['character','恢复预设角色'],['place','收起私人领地']])if(info.appearance?.[type])list.append(button(label,async()=>{appearance=await api('/api/studio/equip',{type,id:null});await onSaved();if(!document.querySelector('#avatar-modal')?.hidden)showPreview();}));
    if(!info.jobs.length){const p=document.createElement('p');p.className='studio-empty';p.textContent=t('这里会保存你的角色与私人领地。');list.append(p);}
    for(const job of info.jobs){const item=document.createElement('article');item.className='studio-job';const heading=document.createElement('strong');heading.textContent=t(stateLabels[job.state]||job.state);const desc=document.createElement('p');desc.textContent=job.prompt;item.append(heading,desc);
      if(job.asset){const img=document.createElement('img');img.src=job.asset.preview;img.alt=t('作品预览');item.prepend(img);item.append(button('装备作品',async()=>{appearance=await api('/api/studio/equip',{type:job.kind,id:job.id});await onSaved();showPreview();}));}
      if(job.state==='awaiting_payment'){
        const details=document.createElement('details'),title=document.createElement('summary'),addresses=document.createElement('p');title.textContent=t('付款地址与网络');addresses.className='studio-addresses';addresses.textContent=`BSC (56) · 1,000,000 IF\n${t('代币合约')}\n${job.payment.token}\n${t('收款地址')}\n${job.payment.recipient}`;details.append(title,addresses);item.append(details);
        const expired=Date.now()>job.expiresAt;const pay=button(expired?'订单已过期':'支付 1,000,000 IF',()=>payInvoice(job));pay.disabled=expired||paying;item.append(pay);
        const tx=document.createElement('input');tx.placeholder=t('已支付？粘贴交易哈希继续验证');tx.maxLength=66;
        let saved;try{saved=localStorage.getItem('idfun-studio-tx-'+job.id);}catch{}if(saved)tx.value=saved;
        item.append(tx,button('验证已支付交易',async()=>{await api('/api/studio/payment',{id:job.id,hash:tx.value.trim()});}));
      }
      if(job.state==='failed'&&job.retries<2)item.append(button('免费重试',()=>api('/api/studio/retry',{id:job.id})));
      if(['failed','needs_review','queued'].includes(job.state))item.append(button('申请退款处理',()=>api('/api/studio/refund',{id:job.id})));
      if(job.state==='refund_requested'){const note=document.createElement('small');note.textContent=t('已记录申请，等待项目方核实并处理；尚未发生退款转账。');item.append(note);}
      if(job.refundHash){const link=document.createElement('a');link.href='https://bscscan.com/tx/'+job.refundHash;link.textContent=t('查看退款交易');link.target='_blank';link.rel='noopener noreferrer';item.append(link);}
      if(job.errorCode==='waiting_for_ai_budget'){const note=document.createElement('small');note.textContent=t('正在等待 AI 制作额度，你的订单已保留。');item.append(note);}
      list.append(item);
    }
  }
  async function payInvoice(job){if(paying)return;if(!window.ethereum)throw new Error(t('请在支持 EVM 钱包的浏览器中打开。'));paying=true;
    try{const [from]=await window.ethereum.request({method:'eth_requestAccounts'});if(from?.toLowerCase()!==getWorld()?.me?.wallet?.toLowerCase())throw new Error(t('请使用当前登录的钱包支付'));
      if(BigInt(await window.ethereum.request({method:'eth_chainId'}))!==56n)throw new Error(t('请先将钱包切换至 BSC 主网'));
      if(Date.now()>job.expiresAt)throw new Error(t('订单已过期'));
      const p=job.payment,data='0xa9059cbb'+p.recipient.slice(2).toLowerCase().padStart(64,'0')+BigInt(p.rawAmount).toString(16).padStart(64,'0');
      const hash=await window.ethereum.request({method:'eth_sendTransaction',params:[{from,to:p.token,data,value:'0x0'}]});
      try{localStorage.setItem('idfun-studio-tx-'+job.id,hash);}catch{}toast(t('交易已提交，确认后点击验证；不要重复支付。'));
    }finally{paying=false;}
  }
  return {openPreview(){clearCustom=false;appearance=getWorld()?.me?.appearance||{};for(const key of ['height','build','head'])$('shape-'+key).value=appearance[key]||1;$('shape-tint').value=appearance.tint||'natural';showPreview();},select(){clearCustom=true;appearance={...appearance,character:undefined};showPreview();},
    closePreview(){selection++;if(preview)preview.dispose();else previewPromise?.then(p=>p.dispose()).catch(()=>{});preview=null;previewPromise=null;},
    async save(){if(clearCustom){await api('/api/studio/equip',{type:'character',id:null});clearCustom=false;}appearance=await api('/api/studio/appearance',readAppearance());},open:openStudio};
}
