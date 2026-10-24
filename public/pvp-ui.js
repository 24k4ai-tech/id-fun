const $ = id => document.getElementById(id);
const tr = (zh,en) => document.documentElement.lang==='en'?en:zh;

export function createPvpUI({ api, toast, onMatch, currentMatch }) {
  let latest = null;
  let loading = false;
  let announcedInvite = null;
  let lastOpenedMatch = null;
  let poll = null;
  let generation = 0;
  let sending = false;
  const receipts = new Set();

  function row(label, detail, action = null) {
    const element = document.createElement('div');
    element.className = 'pvp-row';
    const body = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = label;
    const small = document.createElement('small');
    small.textContent = detail;
    body.append(title, small);
    element.append(body);
    for (const item of action ? (Array.isArray(action)?action:[action]) : []) {
      const button = document.createElement('button');
      button.textContent = item.label;
      button.addEventListener('click', item.run);
      element.append(button);
    }
    return element;
  }

  function empty(label) {
    const node = document.createElement('div');
    node.className = 'pvp-empty';
    node.textContent = label;
    return node;
  }

  function render(data) {
    latest = data;
    const remaining=invite=>Math.max(0,Math.ceil((invite.expires_at-(data.serverNow||Date.now()))/1000));
    $('pvp-send').textContent=data.energyRequired?tr('约战 · 每人 4 能量','Challenge · 4 energy each'):tr('发起约战','Challenge');
    $('pvp-open').textContent=tr('联机约战 ⚔','Online Duel ⚔')+(data.invitations.length?` (${data.invitations.length})`:'');
    $('pvp-incoming').replaceChildren(...(data.invitations.length
      ? data.invitations.map(invite => row(invite.handle, tr(`等待你接战 · 剩余 ${remaining(invite)} 秒`,`Accept within ${remaining(invite)} seconds`), [{
        label: data.energyRequired?tr('接战 · 4 能量','Accept · 4 energy'):tr('接战','Accept'),
        run: async () => {
          try {
            const result = await api('/api/pvp/challenge/respond', { id: invite.id, decision: 'accept' });
            lastOpenedMatch = result.match.id;
            close();
            onMatch(result.match);
          } catch (error) { toast(error.message); }
        },
      },{label:tr('拒绝','Decline'),run:async()=>{
        try{await api('/api/pvp/challenge/respond',{id:invite.id,decision:'decline'});await refresh();}catch(error){toast(error.message);}
      }}])) : [empty(tr('暂无约战。把你的 Agent 名称发给朋友，让他来挑战。','No invitations. Share your Agent name with a friend.'))]));
    $('pvp-outgoing').replaceChildren(...(data.outgoing.length
      ? data.outgoing.map(invite => row(invite.handle,
        invite.status==='accepted'?tr('对方已接受 · 已建立对局','Accepted · Match created'):
        invite.status==='declined'?tr('对方已拒绝','Declined'):
        invite.status==='expired'?tr('邀请已失效，可重新约战','Invitation expired. You can invite again.'):
        (invite.received_at?tr('对方游戏端已收到，等待接战','Received by their game client. Awaiting acceptance.'):
          tr('等待对方游戏端接收','Waiting for their game client to receive it'))+
          tr(` · 剩余 ${remaining(invite)} 秒`,` · ${remaining(invite)}s left`))) : [empty(tr('还没有发起约战。','No outgoing invitations.'))]));
    $('pvp-leaders').replaceChildren(...(data.leaders.length
      ? data.leaders.map((leader, index) => {
        const entry = row(leader.handle, `${leader.wins} 胜 · ${leader.matches} 场 · ${leader.points} 分`);
        const rank = document.createElement('span');
        rank.className = 'pvp-rank';
        rank.textContent = String(index + 1).padStart(2, '0');
        entry.prepend(rank);
        return entry;
      }) : [empty('本轮尚无联机对战。')]));
    $('pvp-my-score').textContent = `我的本轮练习分 ${data.mine.points} · ${data.mine.wins} 胜`;
    const seconds = Math.max(0, Math.ceil((data.epochEndsAt - Date.now()) / 1000));
    $('pvp-countdown').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    const next = data.invitations[0]?.id || null;
    if (next && next !== announcedInvite && $('pvp-modal').hidden) toast(tr('收到一场联机约战，打开「联机约战」接战。','New duel invitation. Open Online Duel to accept.'));
    announcedInvite = next;
    // A receipt means this authenticated game client parsed the invitation,
    // not that a human read it or the Binance App received a push message.
    for(const invite of data.invitations)if(!invite.received_at&&!receipts.has(invite.id)){
      receipts.add(invite.id);
      api('/api/pvp/challenge/received',{id:invite.id}).catch(()=>{}).finally(()=>receipts.delete(invite.id));
    }
    if (data.match?.status === 'active' && data.match.id !== currentMatch() && data.match.id !== lastOpenedMatch) {
      lastOpenedMatch = data.match.id;
      close();
      onMatch(data.match);
    }
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    const expected=generation;
    try { const data=await api('/api/pvp/lobby');if(expected===generation)render(data); }
    catch (error) { if (!$('pvp-modal').hidden) toast(error.message); }
    finally { loading = false; }
  }
  async function send() {
    if(sending)return;
    const target = $('pvp-target').value.trim();
    if (!target) return toast(tr('输入对方已绑定的 xxxx.ai 或钱包地址。','Enter their linked xxxx.ai name or wallet address.'));
    sending=true;$('pvp-send').disabled=true;
    try {
      const result = await api('/api/pvp/challenge', { target });
      $('pvp-target').value = '';
      toast(tr(`已创建给 ${result.challenge.targetHandle} 的邀请，等待对方游戏端接收。`,`Invitation created for ${result.challenge.targetHandle}. Waiting for their game client.`));
      await refresh();
    } catch (error) { toast(error.message); }
    finally{sending=false;$('pvp-send').disabled=false;}
  }
  function open() {
    $('pvp-modal').hidden = false;
    document.body.classList.add('modal-open');
    refresh();
    $('pvp-target').focus();
  }
  function close() {
    $('pvp-modal').hidden = true;
    if ($('avatar-modal').hidden && $('battle-screen').hidden) document.body.classList.remove('modal-open');
  }
  $('pvp-open').addEventListener('click', open);
  $('pvp-close').addEventListener('click', close);
  $('pvp-modal').addEventListener('click', event => { if (event.target === $('pvp-modal')) close(); });
  $('pvp-send').addEventListener('click', send);
  $('pvp-target').addEventListener('keydown', event => { if (event.key === 'Enter') send(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('pvp-modal').hidden) close(); });
  let language=document.documentElement.lang;
  new MutationObserver(()=>{const next=document.documentElement.lang;if(next!==language){language=next;if(latest)render(latest);}})
    .observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  return { open, close, refresh, start() { if (!poll) { generation++;refresh(); poll = setInterval(refresh, 2500); } },
    stop() { generation++;clearInterval(poll);poll=null;latest=null;announcedInvite=null;lastOpenedMatch=null;receipts.clear(); } };
}
