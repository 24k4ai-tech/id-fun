import {randomUUID} from 'node:crypto';
import {encodeFunctionData,erc20Abi,isAddress} from 'viem';
import {transaction} from './db.mjs';
import {verifyStudioPayment} from './studio-payment.mjs';

export const DEAD='0x000000000000000000000000000000000000dEaD';
export const ENERGY_PRICE=200_000;
export const ENERGY_COST={duel:4,moba:12,city:4};
export function energyBalance(db,wallet){return db.prepare('SELECT balance FROM energy_accounts WHERE wallet=?').get(wallet.toLowerCase())?.balance||0;}
export function changeEnergy(db,wallet,delta,reference,now=Date.now()){
  wallet=wallet.toLowerCase();
  if(!Number.isSafeInteger(delta)||!delta)throw new Error('energy_invalid');
  if(db.prepare('SELECT 1 FROM energy_entries WHERE reference=?').get(reference))return false;
  db.prepare('INSERT OR IGNORE INTO energy_accounts(wallet) VALUES(?)').run(wallet);
  if(!db.prepare('UPDATE energy_accounts SET balance=balance+? WHERE wallet=? AND balance+?>=0').run(delta,wallet,delta).changes)throw new Error('energy_insufficient');
  db.prepare('INSERT INTO energy_entries(wallet,reference,delta,created_at) VALUES(?,?,?,?)').run(wallet,reference,delta,now);
  return true;
}
export function createEnergyService(db,config,client){
  const settings=config.energy||{},decimals=settings.decimals??18,tax=settings.taxBps??0;
  const live=Boolean(settings.enabled&&client&&isAddress(config.gameTokenAddress));
  if(!Number.isInteger(decimals)||decimals<0||decimals>36||!Number.isInteger(tax)||tax<0||tax>1000)throw new Error('energy_invalid_config');
  if(live){const token=config.gameTokenAddress.toLowerCase(),domain=db.prepare('SELECT token FROM economy_domain WHERE id=1').get();
    if(domain&&domain.token!==token)throw new Error('energy_domain_mismatch');
    db.prepare('INSERT OR IGNORE INTO economy_domain(id,token) VALUES(1,?)').run(token);
  }
  const net=BigInt(ENERGY_PRICE)*10n**BigInt(decimals),gross=(net*10000n+BigInt(10000-tax)-1n)/BigInt(10000-tax);
  function status(wallet){return {live,balance:wallet?energyBalance(db,wallet):0,price:ENERGY_PRICE,grossAmount:gross.toString(),decimals,
    energyPerCharge:100,costs:ENERGY_COST,orders:wallet?db.prepare('SELECT id,status,tx_hash,created_at,expires_at FROM energy_orders WHERE lower(wallet)=? ORDER BY created_at DESC LIMIT 10').all(wallet.toLowerCase()):[]};}
  function order(wallet,now=Date.now()){
    if(!live)throw new Error('energy_not_live');
    if(!isAddress(wallet))throw new Error('energy_wallet_required');
    const existing=db.prepare("SELECT * FROM energy_orders WHERE wallet=? AND status='pending' AND expires_at>? ORDER BY created_at DESC LIMIT 1").get(wallet,now);
    const o=existing||{id:randomUUID(),wallet,token_address:config.gameTokenAddress,recipient:DEAD,raw_amount:gross.toString(),net_amount:net.toString(),created_at:now,expires_at:now+900000};
    if(!existing)db.prepare('INSERT INTO energy_orders(id,wallet,token_address,recipient,raw_amount,net_amount,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').run(o.id,wallet,o.token_address,DEAD,o.raw_amount,o.net_amount,now,o.expires_at);
    return {id:o.id,expiresAt:o.expires_at,chainId:56,energy:100,transaction:{to:o.token_address,value:'0x0',data:encodeFunctionData({abi:erc20Abi,functionName:'transfer',args:[DEAD,BigInt(o.raw_amount)]})},grossAmount:o.raw_amount,decimals};
  }
  async function confirm(wallet,id,hash){
    if(!live)throw new Error('energy_not_live');
    const o=db.prepare('SELECT * FROM energy_orders WHERE id=? AND wallet=?').get(id,wallet);
    if(!o)throw new Error('energy_invalid');
    if(o.status==='paid'){if(o.tx_hash!==hash?.toLowerCase())throw new Error('energy_invalid');return status(wallet);}
    const evidence=await verifyStudioPayment(client,o,hash,12,tax);
    if(BigInt(evidence.received)<BigInt(o.net_amount))throw new Error('energy_burn_short');
    return transaction(db,()=>{
      const current=db.prepare('SELECT * FROM energy_orders WHERE id=?').get(id);
      if(current.status==='paid'){if(current.tx_hash!==evidence.hash)throw new Error('energy_invalid');return status(wallet);}
      if(db.prepare('SELECT 1 FROM energy_orders WHERE tx_hash=?').get(evidence.hash))throw new Error('energy_payment_used');
      db.prepare("UPDATE energy_orders SET status='paid',tx_hash=?,received=? WHERE id=?").run(evidence.hash,evidence.received,id);
      changeEnergy(db,wallet,100,'charge:'+id);return status(wallet);
    });
  }
  return {live,status,order,confirm};
}
