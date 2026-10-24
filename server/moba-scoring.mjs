// Match state is advanced only by the server. A filled slot alone is not participation.
export function mobaParticipation(hero){
 return Boolean(hero.wallet&&!hero.bot&&hero.activeMs>=60000&&
   (hero.damage>=200||hero.objective>=150||hero.healing>=200));
}

export function mobaScore(state,hero,teamSize,ranked){
 if(!ranked)return {points:0,reason:'practice'};
 if(hero.forfeited||state.forfeited)return {points:0,reason:'forfeited'};
 if(!mobaParticipation(hero))return {points:0,reason:'inactive'};
 // A human who leaves after genuinely playing remains a valid opponent, but
 // receives no points and is never replaced by a reward-earning computer.
 if(!state.heroes.some(other=>other.team!==hero.team&&mobaParticipation(other)))return {points:0,reason:'no_active_opponent'};
 const base=teamSize===1?(state.winner===null?3:state.winner===hero.team?10:2):
   (state.winner===null?6:state.winner===hero.team?20:4);
 const contribution=teamSize===1?0:Math.min(10,Math.floor(hero.objective/160)+Math.floor(hero.healing/180)+Math.min(3,hero.assists));
 return {points:base+contribution,reason:'counted'};
}
