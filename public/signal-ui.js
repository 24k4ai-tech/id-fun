const $ = id => document.getElementById(id);

export function createSignalUI({ api, toast, onSolved }) {
  let timer = null;
  let current = null;
  let inFlight = false;

  function render(data) {
    const previous = current;
    current = data;
    $('signal-title').textContent = data.title;
    $('signal-clue').textContent = data.clue;
    $('signal-count').textContent = `${data.stats.solved} 次破译 · 连续 ${data.stats.streak}`;
    $('signal-answer').textContent = data.attempt
      ? data.attempt.correct ? (document.documentElement.lang==='en'?`Signal solved · +${data.attempt.points} contribution`:`信号已破译 · 贡献 +${data.attempt.points}`) : '本轮判断未命中 · 等待下一轮信号'
      : '选择正确路线，立即完成这轮任务';
    $('signal-answer').classList.toggle('success', Boolean(data.attempt?.correct));
    const choices = $('signal-options');
    if (previous?.roundId !== data.roundId || previous?.attempt?.choice !== data.attempt?.choice) {
      choices.replaceChildren();
      for (const option of data.options) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'signal-option';
        if (data.attempt?.choice === option.id) button.classList.add(data.attempt.correct ? 'is-correct' : 'is-wrong');
        const mark = document.createElement('b'); mark.textContent = option.id;
        const label = document.createElement('span'); label.textContent = option.text;
        button.append(mark, label);
        button.addEventListener('click', () => submit(option.id));
        choices.append(button);
      }
    }
    for (const button of choices.children) button.disabled = Boolean(data.attempt) || inFlight;
    const board = $('signal-leaders');
    board.replaceChildren();
    if (!data.leaders.length) board.textContent = '还没有 Agent 破译信号';
    else for (const [index, leader] of data.leaders.entries()) {
      const row = document.createElement('span');
      row.textContent = `${index + 1}. ${leader.handle} · ${leader.solved}`;
      board.append(row);
    }
    tick();
  }

  function tick() {
    if (!current) return;
    const left = Math.max(0, current.endsAt - Date.now());
    $('signal-clock').textContent = `${Math.ceil(left / 1000)}s`;
    $('signal-progress').style.width = `${Math.max(0, Math.min(100, left / 45_000 * 100))}%`;
    if (left === 0) refresh();
  }

  async function refresh() {
    try { render(await api('/api/arena-signal')); }
    catch { /* next poll retries */ }
  }

  async function submit(choice) {
    if (!current || current.attempt || inFlight) return;
    inFlight = true;
    const roundId = current.roundId;
    for (const button of $('signal-options').children) button.disabled = true;
    try {
      const result = await api('/api/arena-signal', { roundId, choice });
      render(result);
      toast(result.correct ? '赛场信号破译成功！' : '这轮信号没有命中，下一轮再试。');
      if (result.correct) onSolved();
    } catch (error) { inFlight = false; toast(error.message); await refresh(); }
    finally { inFlight = false; }
  }

  function start() {
    if (timer) return;
    $('signal-board').hidden = false;
    refresh();
    timer = setInterval(() => { refresh(); tick(); }, 5000);
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    current = null;
    $('signal-board').hidden = true;
  }
  return { start, stop, refresh };
}
