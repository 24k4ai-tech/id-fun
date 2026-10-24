import {loadCharacterAsset} from './character-assets.js';
import {attachWeapon} from './weapon-model.js';
export async function createWorldActor(B,scene,id,{shadow,scale=1.3,weapon=true,appearance=null,crowd=false}={}){
 const asset=await loadCharacterAsset(B,scene,id,appearance,{crowd});if(!asset)return null;
 const root=new B.TransformNode('actor-'+id,scene);root.scaling.setAll(scale);asset.meshes[0].parent=root;
 if(weapon)attachWeapon(B,scene,{avatarId:id,hand:asset.transformNodes.find(n=>n.name==='weapon_hand_r'),offhand:asset.transformNodes.find(n=>n.name==='weapon_hand_l'),root,accent:'#f5c74b'});
 for(const mesh of root.getChildMeshes()){mesh.receiveShadows=true;if(shadow&&mesh.getTotalVertices?.())shadow.addShadowCaster(mesh);if(mesh.material?.maxSimultaneousLights!==undefined)mesh.material.maxSimultaneousLights=4;}
 let current='',face=0;const clips=new Map(asset.animationGroups.map(g=>[g.name,g])),weights=new Map();const idle=weapon?'Sword_Idle':'Idle_Loop';
 function play(name,loop=true){if(current===name)return;const clip=clips.get(name)||clips.get('Sword_Idle');if(!clip)return;current=clip.name;clip.reset();clip.start(loop);clip.setWeightForAllAnimatables(0);}
 play(idle);
 return {root,asset,play,
  update(dt,{x,z,y=0,moving=false,casting=false,attacking=false,dead=false,target=null}={}){
   if(Number.isFinite(x)){const dx=x-root.position.x,dz=z-root.position.z;if(Math.hypot(dx,dz)>.03)face=Math.atan2(dx,dz);root.position.set(x,y,z);}
   if(target&&casting)face=Math.atan2(target.x-root.position.x,target.z-root.position.z);
   root.rotation.y+=Math.atan2(Math.sin(face-root.rotation.y),Math.cos(face-root.rotation.y))*Math.min(1,dt*13);
   play(dead?'Death01':casting?'Spell_Simple_Shoot':attacking?(id==='afeng'?'Punch_Jab':'Sword_Attack'):moving?'Jog_Fwd_Loop':idle,!dead&&!attacking&&!casting);
   for(const [name,clip] of clips){const w=Math.max(0,Math.min(1,(weights.get(name)||0)+(name===current?1:-1)*dt*9));weights.set(name,w);clip.setWeightForAllAnimatables(w);if(!w&&name!==current)clip.stop();}
  },dispose(){asset.dispose();root.dispose();}};
}
