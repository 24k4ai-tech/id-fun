import {directPoints} from './play-score.mjs';
import { transaction } from './db.mjs';

const WINDOW_MS = 45_000;
const MISSIONS = [
  (seed, target) => {
    const values = [62 + seed % 13, 78 + seed % 17, 93 + seed % 19];
    values[target] = 20 + seed % 21;
    return { title: '补给截线', clue: `三条路线延迟：东线 ${values[0]}ms，西线 ${values[1]}ms，北线 ${values[2]}ms。补给走最快的一条。`,
      options: ['东线', '西线', '北线'], answer: target };
  },
  (seed, target) => {
    const input = 5 + seed % 5;
    const output = [input, input, input];
    output[target] -= 2 + seed % 2;
    return { title: '能量泄漏', clue: `通道输入和输出：甲 ${input}→${output[0]}，乙 ${input}→${output[1]}，丙 ${input}→${output[2]}。找出漏能通道。`,
      options: ['甲通道', '乙通道', '丙通道'], answer: target };
  },
  (seed, target) => {
    const colors = ['黄色', '紫色', '蓝色'];
    const first = colors[target], second = colors[(target + 1 + seed % 2) % 3];
    return { title: '信号续接', clue: `观测塔收到${first}、${second}、${first}、${second}四束信号。按规律接下一束。`,
      options: colors, answer: target };
  },
  (seed, target) => {
    const values = [12 + seed % 9, 32 + seed % 11, 44 + seed % 8];
    values[target] = 75 + seed % 15;
    return { title: '无人机调度', clue: `远线需要续航最长的无人机。当前剩余电量：甲 ${values[0]}%，乙 ${values[1]}%，丙 ${values[2]}%。`,
      options: ['甲机', '乙机', '丙机'], answer: target };
  },
  (seed, target) => {
    const normal = (2 + seed % 4).toFixed(1);
    const values = [normal, normal, normal];
    values[target] = (6 + seed % 3).toFixed(1);
    return { title: '异常追踪', clue: `三处防线的脉冲频率依次为 ${values.join('、')}。哪一处出现异常？`,
      options: ['第一处', '第二处', '第三处'], answer: target };
  },
  (_seed, target) => {
    const doors = ['左门', '右门', '中央门'];
    return { title: '入口切换', clue: `${doors.filter((_, i) => i !== target).join('与')}均显示锁定，${doors[target]}显示开放。选择可通行的入口。`,
      options: doors, answer: target };
  },
];

function current(now) {
  const roundId = Math.floor(now / WINDOW_MS);
  const variant = Math.floor(roundId / MISSIONS.length);
  const seed = (variant * 37 + roundId % MISSIONS.length * 11) % 997;
  const mission = MISSIONS[roundId % MISSIONS.length](seed, seed % 3);
  const rotation = variant % 3;
  const options = mission.options.map((_, index) => ({ id: String.fromCharCode(65 + index), text: mission.options[(index + rotation) % 3] }));
  return { roundId, endsAt: (roundId + 1) * WINDOW_MS, title: mission.title, clue: mission.clue,
    options, correct: String.fromCharCode(65 + (mission.answer - rotation + 3) % 3) };
}

function state(db, wallet, now) {
  const { correct, ...mission } = current(now);
  const attempt = db.prepare('SELECT choice,correct,points,created_at FROM arena_signals WHERE wallet=? AND round_id=?').get(wallet, mission.roundId) || null;
  const stats = db.prepare('SELECT count(*) AS played,coalesce(sum(correct),0) AS solved FROM arena_signals WHERE wallet=?').get(wallet);
  const recent = db.prepare('SELECT round_id,correct FROM arena_signals WHERE wallet=? ORDER BY round_id DESC LIMIT 20').all(wallet);
  let streak = 0;
  for (const [index, row] of recent.entries()) {
    if (!row.correct || (index && recent[index - 1].round_id !== row.round_id + 1)) break;
    streak++;
  }
  const leaders = db.prepare(`SELECT r.handle,count(*) AS solved FROM arena_signals s
    JOIN residents r ON r.wallet=s.wallet WHERE s.correct=1 AND r.is_demo=0
    GROUP BY s.wallet ORDER BY solved DESC,min(s.created_at) ASC LIMIT 5`).all();
  return { ...mission, attempt, stats: { ...stats, streak }, leaders, reward: 'game_score_only' };
}

export function arenaSignalState(db, wallet, now = Date.now()) {
  return state(db, wallet, now);
}

export function answerArenaSignal(db, wallet, roundId, choice, source = 'human', now = Date.now()) {
  const mission = current(now);
  if (!Number.isSafeInteger(roundId) || roundId !== mission.roundId ||
      typeof choice !== 'string' || !mission.options.some(option => option.id === choice)) throw new Error('signal_expired');
  return transaction(db, () => {
    const player = db.prepare('SELECT handle FROM residents WHERE wallet=?').get(wallet);
    if (!player) throw new Error('unauthorized');
    if (db.prepare('SELECT 1 FROM arena_signals WHERE wallet=? AND round_id=?').get(wallet, roundId)) throw new Error('signal_already_answered');
    const correct = Number(choice === mission.correct);
    const points=correct?directPoints(2,source):0;
    db.prepare('INSERT INTO arena_signals(wallet,round_id,choice,correct,source,created_at,points) VALUES(?,?,?,?,?,?,?)')
      .run(wallet, roundId, choice, correct, source, now,points);
    if (correct) db.prepare('UPDATE residents SET score=score+? WHERE wallet=?').run(points,wallet);
    const message = `${player.handle} ${correct ? '破译' : '尝试'}了「${mission.title}」${correct ? `，贡献 +${points}` : ''}。`;
    db.prepare('INSERT INTO actions(wallet,handle,kind,source,message,score_delta,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(wallet, player.handle, 'signal', source, message, points, now);
    return { correct: Boolean(correct), correctChoice: mission.correct, ...state(db, wallet, now) };
  });
}
