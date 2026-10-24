// Score source is supplied by authenticated server routes, never by request JSON.
// One sample per second of accepted input; human input wins a mixed second.
export function initPlayScore(db){
  db.exec(`CREATE TABLE IF NOT EXISTS play_scores(
    scope TEXT NOT NULL,wallet TEXT NOT NULL,human INTEGER NOT NULL DEFAULT 0,
    agent INTEGER NOT NULL DEFAULT 0,last_second INTEGER NOT NULL DEFAULT -1,
    last_source TEXT,final_bps INTEGER,PRIMARY KEY(scope,wallet))`);
}
export function beginPlayScore(db,scope,wallet){
  wallet=wallet.toLowerCase();
  db.prepare(`INSERT INTO play_scores(scope,wallet) VALUES(?,?) ON CONFLICT(scope,wallet)
    DO UPDATE SET human=0,agent=0,last_second=-1,last_source=NULL,final_bps=NULL`).run(scope,wallet);
}
export function recordPlayInput(db,scope,wallet,source,now=Date.now()){
  wallet=wallet.toLowerCase();
  const row=db.prepare('SELECT * FROM play_scores WHERE scope=? AND wallet=?').get(scope,wallet);
  if(!row||row.final_bps!==null)return;
  const second=Math.floor(now/1000),kind=source==='agent'?'agent':'human';
  if(second<row.last_second)return;
  if(second===row.last_second){
    if(kind==='human'&&row.last_source==='agent')db.prepare("UPDATE play_scores SET agent=agent-1,human=human+1,last_source='human' WHERE scope=? AND wallet=?").run(scope,wallet);
  }else db.prepare(`UPDATE play_scores SET ${kind}=${kind}+1,last_second=?,last_source=? WHERE scope=? AND wallet=?`).run(second,kind,scope,wallet);
}
export function playScoreBps(db,scope,wallet,finalize=false){
  wallet=wallet.toLowerCase();
  const r=db.prepare('SELECT * FROM play_scores WHERE scope=? AND wallet=?').get(scope,wallet);
  // Pre-upgrade, already earned scores keep their original terms.
  if(!r)return 10000;
  const bps=r.final_bps??(r.human+r.agent?5000+Math.floor(5000*r.agent/(r.human+r.agent)):5000);
  if(finalize&&r.final_bps===null)db.prepare('UPDATE play_scores SET final_bps=? WHERE scope=? AND wallet=? AND final_bps IS NULL').run(bps,scope,wallet);
  return bps;
}
export const scaledPoints=(points,bps)=>Math.floor(Math.round(points*100)*bps/10000)/100;
export function earnedPoints(db,scope,wallet,base){return scaledPoints(base,playScoreBps(db,scope,wallet,true));}
export const directPoints=(points,source)=>source==='agent'?points:points/2;
