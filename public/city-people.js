import {createWorldActor} from './world-actor.js';
import {CITY_PLACES} from './city-places.js';
export function createCityPeople(B,scene,shadow){
 const actors=new Map();let disposed=false;
 for(const [id,p] of Object.entries(CITY_PLACES)){
  createWorldActor(B,scene,p.avatar,{shadow,weapon:false,scale:1.1,crowd:true}).then(actor=>{
   if(disposed){actor?.dispose();return;}if(!actor)return;actor.root.position.set(p.x,0,p.z);actors.set(id,actor);
  });
  const root=new B.TransformNode('npc-sign-'+id,scene);root.position.set(p.x,2.65,p.z);
  const texture=new B.DynamicTexture('npc-label-'+id,{width:512,height:128},scene,false);texture.hasAlpha=true;const ctx=texture.getContext();
  const draw=()=>{ctx.clearRect(0,0,512,128);ctx.fillStyle='#13221de6';ctx.fillRect(14,10,484,100);ctx.strokeStyle=p.color;ctx.strokeRect(14,10,484,100);ctx.fillStyle='#f3e5bb';ctx.textAlign='center';ctx.font='bold 31px sans-serif';ctx.fillText(p.npc[document.documentElement.lang==='en'?1:0],256,56);ctx.font='23px sans-serif';ctx.fillStyle='#b4d0bd';ctx.fillText(document.documentElement.lang==='en'?'E · Talk / Enter':'E · 交谈 / 进入',256,90);texture.update();};draw();
  const material=new B.StandardMaterial('npc-label',scene);material.diffuseTexture=texture;material.opacityTexture=texture;material.emissiveColor=B.Color3.White();material.disableLighting=true;material.backFaceCulling=false;
  const plane=B.MeshBuilder.CreatePlane('npc-name',{width:2.8,height:.7},scene);plane.parent=root;plane.material=material;plane.billboardMode=B.Mesh.BILLBOARDMODE_ALL;plane.isPickable=false;
  const observer=new MutationObserver(draw);observer.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});root.onDisposeObservable.add(()=>observer.disconnect());
 }
 return {near(x,z){const found=Object.entries(CITY_PLACES).find(([,p])=>Math.hypot(x-p.x,z-p.z)<2.4);return found?{kind:'npc',id:found[0],name:found[1].npc[0],en:found[1].npc[1]}:null;},
  tick(dt,player){for(const [id,a] of actors){const p=CITY_PLACES[id];a.update(dt,{});if(Math.hypot(player.x-p.x,player.z-p.z)<5){const angle=Math.atan2(player.x-p.x,player.z-p.z);a.root.rotation.y+=Math.atan2(Math.sin(angle-a.root.rotation.y),Math.cos(angle-a.root.rotation.y))*Math.min(1,dt*4);}}},
  dispose(){disposed=true;for(const a of actors.values())a.dispose();}};
}
