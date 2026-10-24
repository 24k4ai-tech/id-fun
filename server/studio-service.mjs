import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import sharp from 'sharp';
import {isAddress} from 'viem';
import {initStudio,publicAppearance,saveAppearance,ownerJob,presentJob,createInvoice,recordPayment,STUDIO_PRICE} from './studio-store.mjs';
import {verifyStudioPayment} from './studio-payment.mjs';

export function studioConfig(config) {
  const s=config.studio||{};
  const decimals=Number(s.decimals??18),taxBps=Number(s.taxBps??0),dailyUsd=Number(s.dailyUsd??3);
  if(!Number.isInteger(decimals)||decimals<0||decimals>24||!Number.isInteger(taxBps)||taxBps<0||taxBps>1000||!Number.isFinite(dailyUsd)||dailyUsd<0||dailyUsd>20)throw new Error('studio_invalid_config');
  return {...s,decimals,taxBps,dailyUsd,token:config.gameTokenAddress,dir:resolve(s.dir||resolve(dirname(config.dbPath===':memory:'?'./data/city.sqlite':config.dbPath),'studio')),
    enabled:Boolean(s.enabled&&isAddress(config.gameTokenAddress||'')&&isAddress(s.recipient||'')&&s.piapiKey&&s.higgsKey)};
}
export function createStudioService(db,config,client) {
  initStudio(db);const settings=studioConfig(config);
  function requirePlayer(wallet){const resident=wallet&&db.prepare('SELECT is_demo FROM residents WHERE wallet=?').get(wallet);if(!resident)throw new Error('unauthorized');return resident;}
  function requireNotPlaying(wallet){if(db.prepare("SELECT 1 FROM battles WHERE wallet=? AND status='active' AND expires_at>?").get(wallet,Date.now())||db.prepare("SELECT 1 FROM pvp_matches WHERE (a_wallet=? OR b_wallet=?) AND status='active' AND expires_at>?").get(wallet,wallet,Date.now()))throw new Error('studio_in_battle');}
  return {
    settings,
    status(wallet){return {enabled:settings.enabled,price:STUDIO_PRICE,transferTaxBps:settings.taxBps,appearance:wallet?publicAppearance(db,wallet):null,
      jobs:wallet?db.prepare('SELECT * FROM studio_jobs WHERE wallet=? ORDER BY created_at DESC LIMIT 30').all(wallet).map(presentJob):[]};},
    save(wallet,input){requirePlayer(wallet);requireNotPlaying(wallet);return saveAppearance(db,wallet,input);},
    async upload(wallet,req){
      const resident=requirePlayer(wallet);if(resident.is_demo)throw new Error('studio_wallet_required');
      if(!['image/png','image/jpeg','image/webp'].includes(req.headers['content-type']?.split(';')[0]))throw new Error('studio_invalid_image');
      if(db.prepare('SELECT count(*) AS n FROM studio_uploads WHERE wallet=?').get(wallet).n>=20)throw new Error('studio_upload_limit');
      let size=0;const parts=[];for await(const part of req){size+=part.length;if(size>5*1024*1024)throw new Error('body_too_large');parts.push(part);}
      let bytes;try{bytes=await sharp(Buffer.concat(parts),{limitInputPixels:16_000_000,animated:false}).rotate().resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).jpeg({quality:90}).toBuffer();}catch{throw new Error('studio_invalid_image');}
      const id=randomUUID();await mkdir(resolve(settings.dir,'uploads'),{recursive:true});
      await writeFile(resolve(settings.dir,'uploads',id+'.jpg'),bytes,{flag:'wx'});
      // Recheck after asynchronous decoding/writing; synchronous DB operations
      // cannot interleave with another upload in this single server process.
      if(db.prepare('SELECT count(*) AS n FROM studio_uploads WHERE wallet=?').get(wallet).n>=20){await unlink(resolve(settings.dir,'uploads',id+'.jpg'));throw new Error('studio_upload_limit');}
      db.prepare('INSERT INTO studio_uploads(id,wallet,created_at,bytes) VALUES(?,?,?,?)').run(id,wallet,Date.now(),bytes.length);
      return {id,url:`/api/studio/reference/${id}`};
    },
    async reference(wallet,id){requirePlayer(wallet);if(!db.prepare('SELECT 1 FROM studio_uploads WHERE id=? AND wallet=?').get(id,wallet))throw new Error('studio_not_found');return readFile(resolve(settings.dir,'uploads',id+'.jpg'));},
    async publicFile(path){
      const portrait=path.match(/^\/creations\/portraits\/([a-f0-9-]{36})\.jpg$/);
      if(portrait){if(!db.prepare('SELECT 1 FROM studio_profiles WHERE portrait_id=?').get(portrait[1]))throw new Error('not_found');return {bytes:await readFile(resolve(settings.dir,'uploads',portrait[1]+'.jpg')),mime:'image/jpeg'};}
      const match=path.match(/^\/creations\/([a-f0-9-]{36})\/(model\.glb|preview\.jpg)$/);
      if(!match||!db.prepare("SELECT 1 FROM studio_jobs WHERE id=? AND state='ready'").get(match[1]))throw new Error('not_found');
      return {bytes:await readFile(resolve(settings.dir,'jobs',match[1],match[2])),mime:match[2]==='model.glb'?'model/gltf-binary':'image/jpeg'};
    },
    equip(wallet,input){requirePlayer(wallet);requireNotPlaying(wallet);saveAppearance(db,wallet,publicAppearance(db,wallet)||{});
      if(input.type==='portrait'){
        if(input.id&&!db.prepare('SELECT 1 FROM studio_uploads WHERE id=? AND wallet=?').get(input.id,wallet))throw new Error('studio_not_found');
        db.prepare('UPDATE studio_profiles SET portrait_id=?,updated_at=? WHERE wallet=?').run(input.id||null,Date.now(),wallet);
      }else{
        if(!['character','place'].includes(input.type))throw new Error('studio_not_found');
        if(input.id){const job=ownerJob(db,wallet,input.id);if(job.state!=='ready'||job.kind!==input.type)throw new Error('studio_not_ready');}
        const column=input.type==='character'?'character_id':'place_id';
        db.prepare(`UPDATE studio_profiles SET ${column}=?,updated_at=? WHERE wallet=?`).run(input.id||null,Date.now(),wallet);
      }
      return publicAppearance(db,wallet);
    },
    invoice(wallet,input){requirePlayer(wallet);return createInvoice(db,wallet,input,settings);},
    async pay(wallet,input){requirePlayer(wallet);const job=ownerJob(db,wallet,input.id);
      if(job.payment_hash===input.hash?.toLowerCase())return presentJob(job);
      if(!settings.enabled||!client)throw new Error('studio_not_live');
      let payment;try{payment=await verifyStudioPayment(client,job,input.hash,6,settings.taxBps);}catch(error){if(/^studio_[a-z_]+$/.test(error.message))throw error;throw new Error('studio_payment_unavailable');}
      return recordPayment(db,wallet,job.id,payment);
    },
    retry(wallet,id){const job=ownerJob(db,wallet,id);if(job.state!=='failed'||!job.payment_hash||job.retries>=2)throw new Error('studio_retry_unavailable');
      db.prepare("UPDATE studio_jobs SET state='queued',provider_data='{}',retries=retries+1,error_code=NULL,budget_day=NULL,reserved_usd=0,updated_at=?,next_check_at=0 WHERE id=?").run(Date.now(),id);return presentJob(ownerJob(db,wallet,id));},
    requestRefund(wallet,id){const job=ownerJob(db,wallet,id);if(!job.payment_hash||!['failed','needs_review','queued'].includes(job.state))throw new Error('studio_refund_unavailable');
      db.prepare("UPDATE studio_jobs SET state='refund_requested',updated_at=? WHERE id=?").run(Date.now(),id);return presentJob(ownerJob(db,wallet,id));},
  };
}
