import {verifyStudioPayment} from './studio-payment.mjs';
import {transaction} from './db.mjs';
// Records an independently confirmed refund. This module never signs or sends.
export async function recordStudioRefund(db,client,id,hash,taxBps=0,now=Date.now()){
 const job=db.prepare('SELECT * FROM studio_jobs WHERE id=?').get(id);if(!job)throw new Error('studio_not_found');
 if(job.refund_hash===hash?.toLowerCase())return {state:job.state,hash:job.refund_hash};
 if(job.state!=='refund_requested'||!job.payment_hash)throw new Error('studio_refund_unavailable');
 const payment=await verifyStudioPayment(client,{...job,wallet:job.recipient,recipient:job.wallet,expires_at:now},hash,6,taxBps);
 return transaction(db,()=>{if(db.prepare('SELECT 1 FROM studio_jobs WHERE refund_hash=? OR payment_hash=?').get(payment.hash,payment.hash))throw new Error('studio_payment_used');
 const changed=db.prepare("UPDATE studio_jobs SET state='refunded',refund_hash=?,refund_received=?,updated_at=? WHERE id=? AND state='refund_requested'").run(payment.hash,payment.received,now,id);if(changed.changes!==1)throw new Error('studio_refund_unavailable');return {state:'refunded',hash:payment.hash};});
}
