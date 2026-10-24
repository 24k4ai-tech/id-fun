import { randomUUID } from 'node:crypto';
import { transaction } from './db.mjs';

export const STUDIO_PRICE = 1_000_000;
export const STUDIO_STATES = ['awaiting_payment','queued','image_submitting','image_pending','mesh_submitting','mesh_pending','rig_submitting','rig_pending','processing','ready','failed','needs_review','refund_requested','refunded'];
export {initStudio} from './studio-schema.mjs';

export function sanitizeAppearance(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('studio_invalid_appearance');
  const out = {};
  for (const [key,min,max] of [['height',.9,1.1],['build',.85,1.15],['head',.92,1.08]]) {
    const n = value[key] ?? 1;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new Error('studio_invalid_appearance');
    out[key] = Math.round(n*100)/100;
  }
  if (!['natural','warm','cool','jade'].includes(value.tint ?? 'natural')) throw new Error('studio_invalid_appearance');
  out.tint=value.tint ?? 'natural'; return out;
}
export function publicAppearance(db,wallet) {
  const row=db.prepare('SELECT * FROM studio_profiles WHERE wallet=?').get(wallet);
  if(!row)return null;
  const out={...JSON.parse(row.appearance),updatedAt:row.updated_at};
  if(row.portrait_id)out.portrait=`/creations/portraits/${row.portrait_id}.jpg`;
  for(const [field,key] of [['character_id','character'],['place_id','place']]) {
    const asset=row[field]&&db.prepare("SELECT id,asset_data FROM studio_jobs WHERE id=? AND wallet=? AND state='ready'").get(row[field],wallet);
    if(asset?.asset_data)out[key]={...JSON.parse(asset.asset_data),file:`/creations/${asset.id}/model.glb`};
  }
  return out;
}
export function saveAppearance(db,wallet,input,now=Date.now()) {
  const appearance=sanitizeAppearance(input);
  db.prepare(`INSERT INTO studio_profiles(wallet,appearance,updated_at) VALUES(?,?,?) ON CONFLICT(wallet) DO UPDATE SET appearance=excluded.appearance,updated_at=excluded.updated_at`).run(wallet,JSON.stringify(appearance),now);
  return publicAppearance(db,wallet);
}
export function presentJob(row) {
  return {id:row.id,kind:row.kind,prompt:row.prompt,baseAvatar:row.base_avatar,state:row.state,createdAt:row.created_at,
    expiresAt:row.expires_at,paymentHash:row.payment_hash,refundHash:row.refund_hash,retries:row.retries,errorCode:row.error_code,
    asset:row.asset_data?{...JSON.parse(row.asset_data),file:`/creations/${row.id}/model.glb`}:null,
    ...(row.state==='awaiting_payment'?{payment:{chainId:56,token:row.token_address,recipient:row.recipient,rawAmount:row.raw_amount,amount:STUDIO_PRICE}}:{})};
}
export function ownerJob(db,wallet,id) {
  const row=db.prepare('SELECT * FROM studio_jobs WHERE id=? AND wallet=?').get(id,wallet);
  if(!row)throw new Error('studio_not_found');return row;
}
export function createInvoice(db,wallet,input,config,now=Date.now()) {
  if(!config.enabled)throw new Error('studio_not_live');
  const resident=db.prepare('SELECT is_demo,avatar_id FROM residents WHERE wallet=?').get(wallet);
  if(!resident||resident.is_demo)throw new Error('studio_wallet_required');
  const prompt=typeof input.prompt==='string'?input.prompt.trim():'';
  if(!['character','place'].includes(input.kind)||prompt.length<8||prompt.length>600||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(prompt))throw new Error('studio_invalid_prompt');
  const reference=input.referenceId||null;
  if(reference&&!db.prepare('SELECT 1 FROM studio_uploads WHERE id=? AND wallet=?').get(reference,wallet))throw new Error('studio_not_found');
  return transaction(db,()=>{
    const pending=db.prepare("SELECT * FROM studio_jobs WHERE wallet=? AND ((state='awaiting_payment' AND expires_at>?) OR state IN ('queued','image_submitting','image_pending','mesh_submitting','mesh_pending','rig_submitting','rig_pending','processing','needs_review')) LIMIT 1").get(wallet,now);
    if(pending)throw new Error('studio_job_pending');
    const id=randomUUID(),amount=String(BigInt(STUDIO_PRICE)*10n**BigInt(config.decimals));
    db.prepare(`INSERT INTO studio_jobs(id,wallet,kind,prompt,reference_id,base_avatar,state,created_at,updated_at,expires_at,token_address,recipient,raw_amount)
      VALUES(?,?,?,?,?,?,'awaiting_payment',?,?,?,?,?,?)`).run(id,wallet,input.kind,prompt,reference,resident.avatar_id,now,now,now+30*60_000,config.token,config.recipient,amount);
    return presentJob(ownerJob(db,wallet,id));
  });
}
export function recordPayment(db,wallet,id,payment,now=Date.now()) {
  return transaction(db,()=>{
    const row=ownerJob(db,wallet,id);
    if(row.payment_hash===payment.hash)return presentJob(row);
    if(row.state!=='awaiting_payment'||row.payment_hash)throw new Error('studio_already_paid');
    if(db.prepare('SELECT 1 FROM studio_jobs WHERE payment_hash=?').get(payment.hash))throw new Error('studio_payment_used');
    db.prepare("UPDATE studio_jobs SET payment_hash=?,payment_block=?,received=?,state='queued',updated_at=? WHERE id=?").run(payment.hash,payment.block,payment.received,now,id);
    return presentJob(ownerJob(db,wallet,id));
  });
}
