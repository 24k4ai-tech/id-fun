import test from 'node:test';
import assert from 'node:assert/strict';
import {CAMPAIGN,PUZZLES} from '../public/campaign-content.js';
import {initialPuzzle,puzzleSolved,puzzleStep} from '../public/puzzle-rules.js';
import {openDatabase} from '../server/db.mjs';
import {createResident} from '../server/game.mjs';
import {journeyState,journeyCommand} from '../server/journey.mjs';
import {JOURNEY_NODES} from '../public/journey-rules.js';

export function solve(p){
 let s=initialPuzzle(p);const actions=[];
 if(p.type==='pipe'||p.type==='mirror'){
  for(let i=0;i<p.solution.length;i++)while(s.cells[i]!==p.solution[i]){const a={cell:i};s=puzzleStep(p,s,a);actions.push(a);}
  assert.equal(puzzleSolved(p,s),true,p.id);return actions;
 }
 if(p.type==='logic'){for(let i=0;i<p.answer.length;i++)if(s.order[i]!==p.answer[i]){const a={from:i,to:s.order.indexOf(p.answer[i])};s=puzzleStep(p,s,a);actions.push(a);}return actions;}
 const key=s=>p.type==='cargo'?s.player+':'+[...s.boxes].sort((a,b)=>a-b).join(','):s.amounts.join(',');
 const queue=[{s,prev:-1,action:null}],seen=new Set([key(s)]);let found=-1;
 for(let i=0;i<queue.length&&i<300000;i++){
  const current=queue[i];if(puzzleSolved(p,current.s)){found=i;break;}
  const candidates=p.type==='cargo'?[0,1,2,3].map(direction=>({direction})):p.cap.flatMap((_,from)=>p.cap.map((_,to)=>({from,to})).filter(a=>a.from!==a.to));
  for(const a of candidates){const next=puzzleStep(p,current.s,a),k=key(next);if(seen.has(k))continue;seen.add(k);queue.push({s:next,prev:i,action:a});}
 }
 assert.ok(found>=0,'Unsolvable or over-complex layout '+p.id);
 while(queue[found].prev!==-1){actions.unshift(queue[found].action);found=queue[found].prev;}return actions;
}
test('all 32 authored puzzles have a solution and distinct initial layouts',()=>{
 const fingerprints=new Set();for(const p of Object.values(PUZZLES)){
  const key=JSON.stringify({...p,id:undefined});assert.ok(!fingerprints.has(key),p.id);fingerprints.add(key);
  assert.equal(puzzleSolved(p,initialPuzzle(p)),false,p.id);const actions=solve(p);assert.ok(actions.length>0,p.id);
 }
 assert.equal(fingerprints.size,32);assert.equal(new Set(CAMPAIGN.flatMap(m=>m.steps.map(s=>s.puzzle))).size,32);
});
test('all chapters complete through authoritative commands; save, gating, rewards and replays remain consistent',()=>{
 const db=openDatabase(':memory:');createResident(db,{wallet:'a',handle:'test.ai'},10000);let now=20000;
 const state=()=>journeyState(db,'a',now),cmd=(action,input={})=>journeyCommand(db,'a','campaign:'+action,input,++now);
 // Test fixture placement isolates the puzzle/quest state machine from separately tested movement.
 const place=node=>{const p=JOURNEY_NODES[node];db.prepare('UPDATE journey_profiles SET x=?,z=? WHERE wallet=?').run(p.x,p.z,'a');};
 state();assert.throws(()=>cmd('start',{mission:CAMPAIGN[15].id}),/journey_locked/);
 let moves=0;
 for(const m of CAMPAIGN){cmd('start',{mission:m.id});assert.throws(()=>journeyCommand(db,'a','start',{kind:'signal'},++now),/journey_in_progress/);
  for(const [stage,step] of m.steps.entries()){
   place(step.node);let result=cmd('interact',{id:step.node});const puzzle=PUZZLES[step.puzzle];
   assert.equal(result.campaign.active.stage,stage);
   for(const a of solve(puzzle)){
    const before=state().campaign.active;result=cmd('move',{...a,revision:before.revision});moves++;
    if(result.campaign.active.stage!==stage)break;
   }
   assert.equal(result.campaign.active.stage,stage+1,m.id);
  }
  place(m.returnTo);assert.equal(cmd('interact',{id:m.returnTo}).notice,'campaign_complete');
 }
 assert.equal(state().campaign.completed.length,16);assert.equal(state().material,66);assert.ok(moves>200);
 assert.equal(db.prepare('SELECT count(*) n FROM pvp_scores').get().n,0);
 cmd('start',{mission:CAMPAIGN[0].id});cmd('abandon');assert.equal(state().material,66);assert.equal(state().campaign.completed.length,16);db.close();
});
test('puzzles reject remote commands, stale replays, invalid cells and preserve undo',()=>{
 const db=openDatabase(':memory:');createResident(db,{wallet:'a',handle:'a'},100);journeyState(db,'a',1000);
 const cmd=(c,i,t)=>journeyCommand(db,'a','campaign:'+c,i,t);
 cmd('start',{mission:'first-light'},1001);assert.throws(()=>cmd('interact',{id:'observatory'},1002),/journey_too_far/);
 db.prepare('UPDATE journey_profiles SET x=9,z=-3 WHERE wallet=?').run('a');
 let s=cmd('interact',{id:'observatory'},1003);const before=s.campaign.active;
 s=cmd('move',{cell:0,revision:before.revision},1004);assert.equal(s.campaign.active.puzzle.moves,1);
 assert.throws(()=>cmd('move',{cell:0,revision:before.revision},1005),/campaign_stale/);
 assert.throws(()=>cmd('move',{cell:999,revision:s.campaign.active.revision},1006),/campaign_invalid_move/);
 s=cmd('undo',{revision:s.campaign.active.revision},1007);assert.deepEqual(s.campaign.active.puzzle,before.puzzle);
 assert.equal(journeyState(db,'a',1008).campaign.active.stage,0);db.close();
});
