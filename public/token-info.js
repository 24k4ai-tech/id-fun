// The server supplies the verified launch address. Never render a predicted CA.
export function showTokenInfo(config,toast=()=>{}) {
 if(!config.tokenLive||config.chainId!==56||!/^0x[a-fA-F0-9]{40}$/.test(config.tokenAddress||''))return;
 const address=config.tokenAddress,strip=document.createElement('section');strip.className='token-strip';strip.setAttribute('aria-label','ID FUN token');
 strip.innerHTML='<strong>ID FUN <b>$IF</b></strong><code></code><button type="button"></button><a class="token-trade" target="_blank" rel="noopener noreferrer"></a><a class="token-scan" target="_blank" rel="noopener noreferrer">BscScan ↗</a>';
 strip.querySelector('code').textContent=address;
 strip.querySelector('.token-trade').href='https://flap.sh/bnb/'+address;
 strip.querySelector('.token-scan').href='https://bscscan.com/token/'+address;
 document.querySelector('main').prepend(strip);
 const en=()=>document.documentElement.lang==='en',tr=(zh,english)=>en()?english:zh;
 strip.querySelector('button').onclick=async()=>{try{await navigator.clipboard.writeText(address);toast(tr('CA 已复制','CA copied'));}catch{toast(tr('请选中地址复制','Select and copy the address'));}};
 let renderedLanguage=null;
 function render(){
  const language=document.documentElement.lang;if(renderedLanguage===language)return;renderedLanguage=language;
  strip.querySelector('button').textContent=tr('复制 CA','Copy CA');strip.querySelector('.token-trade').textContent=tr('在 Flap 查看 ↗','View on Flap ↗');
  const phase=document.querySelector('.phase');if(phase)phase.textContent=tr('IF 已发行 · 第一阶段','IF LIVE · PHASE ONE');
  const footer=document.querySelector('[data-token-footer]');if(footer)footer.textContent=tr('第一阶段 · 奖励以到账税费与合约规则为准','Phase one · Rewards depend on received tax and contract rules');
  const rules=document.querySelector('[data-token-rules]');if(rules)rules.textContent=tr('IF 已发行，U 底池，买入税 2%、卖出税 2%。玩家奖励预算以外部金库已确认的记录为准。持币大于 0 才能参与正式积分奖励，持币权重最高 2 倍，不影响战斗伤害。积分用于奖励分配权重，没有固定兑换价格；可领取金额以已到账税费及合约规则为准。','IF is live with a U quote pool and 2% buy / 2% sell tax. Player budgets come from confirmed external vault records. A positive IF balance is required for reward eligibility. Holding boosts are capped at 2× and do not affect combat damage. Points determine reward weight, not a fixed exchange value. Claims depend on received revenue and contract rules.');
  const pvp=document.querySelector('[data-token-pvp]');if(pvp)pvp.textContent=tr('双方各造成至少 10 点伤害才计分，基础分：胜利 10、落败 2、平局 3。手动操作按 50% 结算，Agent 操作按 100%；持币加成另计。同一对手每 15 分钟最多计 3 场，每人最多计 12 场。演示访客不计奖励分；可领取金额以实际税费和合约规则为准。','Both fighters must deal at least 10 damage. Base points: win 10, loss 2, draw 3. Manual play earns 50%, Agent play 100%; holding boosts apply separately. Up to 3 scored games per opponent and 12 per player every 15 minutes. Demo guests do not earn rewards. Claims depend on actual revenue and contract rules.');
 }
 render();new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
}
