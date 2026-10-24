import {beginPlayScore,recordPlayInput,earnedPoints,playScoreBps} from './play-score.mjs';
import {CAMPAIGN,PUZZLES,campaignMission} from '../public/campaign-content.js';
import {initialPuzzle,puzzleStep,puzzleSolved} from '../public/puzzle-rules.js';
import {JOURNEY_NODES} from '../public/journey-rules.js';

export function initCampaign(db){db.exec(`CREATE TABLE IF NOT EXISTS campaign_saves(
 wallet TEXT PRIMARY KEY REFERENCES residents(wallet),mission TEXT,stage INTEGER NOT NULL DEFAULT 0,
 puzzle_json TEXT,history_json TEXT NOT NULL DEFAULT '[]',hints INTEGER NOT NULL DEFAULT 0,
 resets INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS campaign_completions(wallet TEXT NOT NULL REFERENCES residents(wallet),mission TEXT NOT NULL,
 stars INTEGER NOT NULL,choice TEXT NOT NULL DEFAULT 'gold',completed_at INTEGER NOT NULL,PRIMARY KEY(wallet,mission));`);}
export function campaignState(db,wallet){
 const save=db.prepare('SELECT * FROM campaign_saves WHERE wallet=?').get(wallet);
 const completed=db.prepare('SELECT mission,stars,choice,completed_at FROM campaign_completions WHERE wallet=? ORDER BY completed_at').all(wallet);
 return {completed,active:save?.mission?{mission:save.mission,stage:save.stage,puzzle:save.puzzle_json?JSON.parse(save.puzzle_json):null,
  hints:save.hints,resets:save.resets,canUndo:JSON.parse(save.history_json).length>0,revision:save.updated_at}:null};
}
// Called inside the journey transaction; position and identity come from the server.
export function campaignCommand(db,p,command,input,now,source='human'){
 db.prepare('INSERT OR IGNORE INTO campaign_saves(wallet) VALUES(?)').run(p.wallet);
 const state=campaignState(db,p.wallet),save=db.prepare('SELECT * FROM campaign_saves WHERE wallet=?').get(p.wallet);
 const update=(stage,puzzle,history=[])=>db.prepare('UPDATE campaign_saves SET stage=?,puzzle_json=?,history_json=?,updated_at=? WHERE wallet=?')
  .run(stage,puzzle?JSON.stringify(puzzle):null,JSON.stringify(history),Math.max(now,save.updated_at+1),p.wallet);
 if(command==='start'){
  const m=campaignMission(input.mission);if(!m)throw new Error('campaign_invalid_move');
  if(state.active)throw new Error('journey_in_progress');
  if(!m.requires.every(id=>state.completed.some(c=>c.mission===id)))throw new Error('journey_locked');
  db.prepare('UPDATE campaign_saves SET mission=?,stage=0,puzzle_json=NULL,history_json=\'[]\',hints=0,resets=0,updated_at=? WHERE wallet=?').run(m.id,now,p.wallet);
  beginPlayScore(db,'campaign:'+m.id,p.wallet);
  return 'campaign_started';
 }
 if(!state.active)throw new Error('journey_no_active');
 if(command==='abandon'){db.prepare('UPDATE campaign_saves SET mission=NULL,puzzle_json=NULL,history_json=\'[]\',updated_at=? WHERE wallet=?').run(now,p.wallet);return 'campaign_abandoned';}
 const m=campaignMission(save.mission),step=m.steps[save.stage],node=JOURNEY_NODES[step?.node||m.returnTo];
 if(Math.hypot(p.x-node.x,p.z-node.z)>2.3)throw new Error('journey_too_far');
 recordPlayInput(db,'campaign:'+m.id,p.wallet,source,now);
 if(command==='interact'){
  if(input.id!==(step?.node||m.returnTo))throw new Error('journey_wrong_target');
  if(step){if(!state.active.puzzle)update(save.stage,initialPuzzle(PUZZLES[step.puzzle]));return 'campaign_puzzle';}
  const choice=['gold','teal','violet'].includes(input.choice)?input.choice:'gold',stars=Math.max(1,3-Math.min(2,save.hints+save.resets));
  const first=!state.completed.some(c=>c.mission===m.id);
  db.prepare(`INSERT INTO campaign_completions(wallet,mission,stars,choice,completed_at) VALUES(?,?,?,?,?)
   ON CONFLICT(wallet,mission) DO UPDATE SET stars=max(stars,excluded.stars),choice=excluded.choice`).run(p.wallet,m.id,stars,choice,now);
  const points=earnedPoints(db,'campaign:'+m.id,p.wallet,3);
  if(first){db.prepare('UPDATE residents SET material=material+?,score=score+? WHERE wallet=?').run(m.reward,points,p.wallet);
   db.prepare('UPDATE city SET stability=min(100,stability+1) WHERE id=1').run();}
  db.prepare('UPDATE campaign_saves SET mission=NULL,puzzle_json=NULL,history_json=\'[]\',updated_at=? WHERE wallet=?').run(now,p.wallet);
  return first?'campaign_complete':'campaign_replay';
 }
 if(!step||!state.active.puzzle)throw new Error('campaign_invalid_move');
 if(input.revision!==save.updated_at)throw new Error('campaign_stale');
 const puzzle=PUZZLES[step.puzzle],current=state.active.puzzle,history=JSON.parse(save.history_json);
 if(command==='hint'){db.prepare('UPDATE campaign_saves SET hints=hints+1,updated_at=? WHERE wallet=?').run(Math.max(now,save.updated_at+1),p.wallet);return 'campaign_hint';}
 if(command==='reset'){db.prepare('UPDATE campaign_saves SET resets=resets+1 WHERE wallet=?').run(p.wallet);update(save.stage,initialPuzzle(puzzle));return 'campaign_reset';}
 if(command==='undo'){if(!history.length)throw new Error('campaign_invalid_move');update(save.stage,history.pop(),history);return 'campaign_step';}
 if(command!=='move')throw new Error('campaign_invalid_move');
 const next=puzzleStep(puzzle,current,input);if(next===current)return 'campaign_blocked';
 if(puzzleSolved(puzzle,next)){update(save.stage+1,null);return 'campaign_solved';}
 history.push(current);update(save.stage,next,history.slice(-120));return 'campaign_step';
}
