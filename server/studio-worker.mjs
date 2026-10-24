import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {createStudioProvider,validateGlb} from './studio-provider.mjs';
import {transaction} from './db.mjs';
const exec=promisify(execFile),root=resolve(import.meta.dirname,'..');

export function startStudioWorker(db,settings,{provider=createStudioProvider(settings),runTool=defaultRunTool,now=Date.now}={}) {
  if(!settings.enabled)return ()=>{};
  let busy=false,stopped=false;
  // A process lost after a POST must never repeat an uncertain paid submission.
  db.prepare("UPDATE studio_jobs SET state='needs_review',error_code='submission_interrupted' WHERE state IN ('image_submitting','mesh_submitting','rig_submitting')").run();
  async function tick(){
    if(busy||stopped)return;busy=true;let job;
    const patch=(state,data={},error=null,delay=5000)=>db.prepare('UPDATE studio_jobs SET state=?,provider_data=?,error_code=?,updated_at=?,next_check_at=? WHERE id=?').run(state,JSON.stringify(data),error,now(),now()+delay,job.id);
    try{
      job=db.prepare("SELECT * FROM studio_jobs WHERE payment_hash IS NOT NULL AND state IN ('queued','image_pending','mesh_pending','rig_pending','processing') AND next_check_at<=? ORDER BY created_at LIMIT 1").get(now());
      if(!job)return;
      const work=resolve(settings.dir,'jobs',job.id);await mkdir(work,{recursive:true});
      const file=name=>resolve(work,name),data=JSON.parse(job.provider_data);
      if(job.state==='queued'){
        const day=new Date(now()).toISOString().slice(0,10),cost=job.kind==='character'?.6:.25;
        const spent=db.prepare('SELECT COALESCE(sum(amount),0) AS n FROM studio_spend WHERE day=?').get(day).n;
        const funded=spent+cost<=settings.dailyUsd&&await provider.hasBalance(job.kind==='character'?.4:.1);
        // The owner may request a refund while the balance check is in flight.
        if(db.prepare('SELECT state FROM studio_jobs WHERE id=?').get(job.id)?.state!=='queued')return;
        if(!funded){patch('queued',data,'waiting_for_ai_budget',60000);return;}
        transaction(db,()=>{db.prepare('INSERT INTO studio_spend(job_id,day,amount) VALUES(?,?,?)').run(job.id,day,cost);db.prepare('UPDATE studio_jobs SET budget_day=?,reserved_usd=reserved_usd+? WHERE id=?').run(day,cost,job.id);patch('image_submitting',data);});
        data.image=await provider.image(job,job.reference_id?resolve(settings.dir,'uploads',job.reference_id+'.jpg'):null);patch('image_pending',data);return;
      }
      if(job.state==='image_pending'){
        const result=await provider.imageStatus(data.image);if(['failed','error','canceled','cancelled'].includes(result.state)){patch('failed',data,'image_generation_failed');return;}
        if(result.state!=='completed'){patch(job.state,data);return;}
        await provider.saveImage(result.url,file('reference.png'));await sharp(file('reference.png')).resize({width:768}).jpeg({quality:90}).toFile(file('preview.jpg'));
        patch('mesh_submitting',data);data.mesh=await provider.mesh(file('reference.png'));patch('mesh_pending',data);return;
      }
      if(job.state==='mesh_pending'){
        const result=await provider.taskStatus(data.mesh);if(['failed','error','canceled','cancelled'].includes(result.state)){patch('failed',data,'model_generation_failed');return;}
        if(result.state!=='completed'){patch(job.state,data);return;}
        await provider.saveModel(result.url,file('original.glb'));
        if(job.kind==='place'){patch('processing',data);return;}
        try {
          await runTool('simplify.mjs',[file('original.glb'),file('coarse.glb'),'78000','0.012']);
          await runTool('textures.mjs',[file('coarse.glb'),file('rig-input.glb'),'1024']);validateGlb(await readFile(file('rig-input.glb')),80000);
        }catch{patch('failed',data,'asset_validation_failed');return;}
        patch('rig_submitting',data);data.rig=await provider.rig(file('rig-input.glb'));patch('rig_pending',data);return;
      }
      if(job.state==='rig_pending'){
        const result=await provider.taskStatus(data.rig);if(['failed','error','canceled','cancelled'].includes(result.state)){patch('failed',data,'rig_generation_failed');return;}
        if(result.state!=='completed'){patch(job.state,data);return;}
        await provider.saveModel(result.url,file('rig.glb'));patch('processing',data);return;
      }
      if(job.state==='processing'){
        let asset;
        if(job.kind==='place'){
          await runTool('prepare-prop.mjs',[file('original.glb'),file('model.tmp.glb')]);asset={kind:'place',preview:`/creations/${job.id}/preview.jpg`};
        }else{
          const sex=['shadow','maker','trader','heyi'].includes(job.base_avatar)?'female':'male';
          await runTool('retarget.mjs',[job.id,file('rig.glb'),file('coarse.glb'),file('rig-input.glb'),sex,work]);
          await runTool('quality-mesh.mjs',[file('original.glb'),file(job.id+'-animated-v1.glb'),file('quality.glb')]);
          await runTool('textures.mjs',[file('quality.glb'),file('model.tmp.glb'),'2048']);
          const report=JSON.parse(await readFile(file(job.id+'-animation-report.json'),'utf8'));asset={kind:'character',scale:report.scale,lift:report.lift,preview:`/creations/${job.id}/preview.jpg`};
        }
        validateGlb(await readFile(file('model.tmp.glb')),800000,job.kind==='character');await rename(file('model.tmp.glb'),file('model.glb'));
        db.prepare("UPDATE studio_jobs SET state='ready',asset_data=?,error_code=NULL,updated_at=? WHERE id=?").run(JSON.stringify(asset),now(),job.id);return;
      }
    }catch(error){
      if(job){const current=db.prepare('SELECT state,provider_data FROM studio_jobs WHERE id=?').get(job.id);
        const uncertain=current.state.endsWith('_submitting'),local=current.state==='processing'||/invalid_model/.test(error.message);
        patch(uncertain?'needs_review':local?'failed':current.state,JSON.parse(current.provider_data),uncertain?'submission_uncertain':local?'asset_validation_failed':'provider_temporarily_unavailable',60000);
      }
      // Only fixed error codes leave this worker; provider payloads may contain credentials.
    }finally{busy=false;}
  }
  const timer=setInterval(tick,5000);timer.unref();queueMicrotask(tick);
  const stop=()=>{stopped=true;clearInterval(timer);};stop.tick=tick;return stop;
}
async function defaultRunTool(name,args){
  if(!['simplify.mjs','textures.mjs','retarget.mjs','quality-mesh.mjs','prepare-prop.mjs'].includes(name))throw new Error('studio_invalid_tool');
  await exec(process.execPath,[resolve(root,'tools/character-pipeline',name),...args],{cwd:root,windowsHide:true,timeout:180000,maxBuffer:512*1024,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,HOME:process.env.HOME}});
}
