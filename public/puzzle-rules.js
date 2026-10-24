// Deterministic puzzle rules shared by renderer and authoritative server.
const DELTA=[[-1,0],[0,1],[1,0],[0,-1]];
export const rotateMask=m=>((m<<1)&15)|(m>>3);
export function initialPuzzle(p) {
  if(p.type==='pipe'||p.type==='mirror')return {cells:[...p.start],moves:0};
  if(p.type==='cargo')return {player:p.player,boxes:[...p.boxes],moves:0};
  if(p.type==='water')return {amounts:[...p.start],moves:0};
  return {order:[...p.start],moves:0};
}
export function beamTrace(p,s) {
  let i=p.source,d=p.direction;const path=[i],seen=new Set();
  for(let n=0;n<p.w*p.h*4;n++) {
    const key=i+':'+d;if(seen.has(key))break;seen.add(key);
    if(s.cells[i])d=s.cells[i]===1?[1,0,3,2][d]:[3,2,1,0][d];
    const [dy,dx]=DELTA[d],x=i%p.w+dx,y=Math.floor(i/p.w)+dy;
    if(x<0||x>=p.w||y<0||y>=p.h)return {path,direction:d,solved:i===p.goal&&d===p.exit&&(p.crystals||[]).every(v=>path.includes(v))};
    i=y*p.w+x;if((p.walls||[]).includes(i))break;path.push(i);
  }
  return {path,direction:d,solved:false};
}
export function pipeTrace(p,s) {
  const seen=new Set(),queue=[p.source];let leak=false,exit=false;
  if(!(s.cells[p.source]&8))return {path:[],solved:false};
  while(queue.length) {
    const i=queue.shift();if(seen.has(i))continue;seen.add(i);
    for(let d=0;d<4;d++)if(s.cells[i]&(1<<d)) {
      const [dy,dx]=DELTA[d],x=i%p.w+dx,y=Math.floor(i/p.w)+dy;
      if(x<0||x>=p.w||y<0||y>=p.h){if(i===p.source&&d===3)continue;if(i===p.goal&&d===1){exit=true;continue;}leak=true;continue;}
      const j=y*p.w+x;if(!(s.cells[j]&(1<<((d+2)%4))))leak=true;else queue.push(j);
    }
  }
  return {path:[...seen],solved:exit&&!leak&&(p.targets||[]).every(v=>seen.has(v)),leak};
}
export function puzzleSolved(p,s) {
  if(p.type==='pipe')return pipeTrace(p,s).solved;
  if(p.type==='mirror')return beamTrace(p,s).solved;
  if(p.type==='cargo')return p.goals.every(v=>s.boxes.includes(v));
  if(p.type==='water')return p.target.every((v,i)=>v===null||s.amounts[i]===v);
  return p.answer.every((v,i)=>s.order[i]===v);
}
export function puzzleStep(p,s,input) {
  const next=structuredClone(s);let changed=false;
  if(p.type==='pipe'||p.type==='mirror') {
    const i=input.cell;if(!Number.isInteger(i)||i<0||i>=p.w*p.h||!next.cells[i])throw new Error('campaign_invalid_move');
    next.cells[i]=p.type==='pipe'?rotateMask(next.cells[i]):3-next.cells[i];changed=true;
  } else if(p.type==='cargo') {
    const d=input.direction;if(!Number.isInteger(d)||d<0||d>3)throw new Error('campaign_invalid_move');
    const adjacent=(i)=>{const [dy,dx]=DELTA[d],x=i%p.w+dx,y=Math.floor(i/p.w)+dy;return x<0||x>=p.w||y<0||y>=p.h?-1:y*p.w+x;};
    const target=adjacent(next.player);if(target<0||p.walls.includes(target))return s;
    const box=next.boxes.indexOf(target);
    if(box>=0){const dest=adjacent(target);if(dest<0||p.walls.includes(dest)||next.boxes.includes(dest))return s;next.boxes[box]=dest;}
    next.player=target;changed=true;
  } else if(p.type==='water') {
    const {from,to}=input;if(!Number.isInteger(from)||!Number.isInteger(to)||from===to||from<0||to<0||from>=p.cap.length||to>=p.cap.length)throw new Error('campaign_invalid_move');
    const amount=Math.min(next.amounts[from],p.cap[to]-next.amounts[to]);
    if(!amount)return s;next.amounts[from]-=amount;next.amounts[to]+=amount;changed=true;
  } else {
    const {from,to}=input;if(!Number.isInteger(from)||!Number.isInteger(to)||from===to||from<0||to<0||from>=next.order.length||to>=next.order.length)throw new Error('campaign_invalid_move');
    [next.order[from],next.order[to]]=[next.order[to],next.order[from]];changed=true;
  }
  if(changed)next.moves++;return next;
}
