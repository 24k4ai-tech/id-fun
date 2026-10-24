export const FAST_REWARD_SECONDS=60;
export function rewardPeriod(seconds=86400){if(![60,1800,86400].includes(seconds))throw new Error('invalid_reward_period');return seconds*1000;}
export function periodStart(now,seconds=60){const ms=rewardPeriod(seconds);return Math.floor(now/ms)*ms;}
export const PERIOD_ABI=[{type:'function',name:'EPOCH_SECONDS',stateMutability:'view',inputs:[],outputs:[{type:'uint256'}]}];
export async function assertRewardPeriod(client,address,seconds){rewardPeriod(seconds);if(seconds!==86400){const actual=await client.readContract({address,abi:PERIOD_ABI,functionName:'EPOCH_SECONDS'});if(actual!==BigInt(seconds))throw new Error('reward_period_mismatch');}}
