import {weaponFor} from './weapon-config.js';
export const HERO_COLORS={ember:'#ffbd4a',shadow:'#ac86ff',maker:'#5de5c3',trader:'#f49ac1',cz:'#ffd24f',heyi:'#59ddc4',sbf:'#b392f0',musk:'#60cfff',jensen:'#a5ec53',vitalik:'#9b9fff',trump:'#ffab53',afeng:'#ff8150'};
export function createCombatVfx(B,scene){
 const materials=new Map();
 function material(color){if(materials.has(color))return materials.get(color);const m=new B.StandardMaterial('spell-light-'+color,scene);m.disableLighting=true;m.emissiveColor=B.Color3.FromHexString(color).scale(1.5);m.diffuseColor=B.Color3.Black();m.specularColor=B.Color3.Black();materials.set(color,m);return m;}
 function projectile(id,color){
  const kind=weaponFor(id).kind;let core;
  if(['scepter','maul'].includes(kind)){core=B.MeshBuilder.CreatePolyhedron('crystal-projectile',{type:1,size:.19},scene);core.scaling.y=1.7;}
  else if(['spear','fans','chakram'].includes(kind)){core=B.MeshBuilder.CreateTorus('sun-disc',{diameter:.43,thickness:.06,tessellation:40},scene);core.rotation.x=Math.PI/2;const center=B.MeshBuilder.CreateSphere('sun-core',{diameter:.16,segments:12},scene);center.parent=core;center.material=material('#fff8d4');}
  else if(kind==='daggers'||kind==='sickle'){core=B.MeshBuilder.CreatePolyhedron('shadow-shard',{type:1,size:.16},scene);core.scaling.y=2.5;}
  else{core=B.MeshBuilder.CreateSphere('plasma-core',{diameter:.26,segments:20},scene);}
  core.material=material(color);core.isPickable=false;
  const shell=B.MeshBuilder.CreateTorus('orbit-ribbon',{diameter:.58,thickness:.018,tessellation:40},scene);shell.parent=core;shell.rotation.z=.7;shell.material=material(color);
  const trail=new B.TrailMesh('spell-wake',core,scene,{diameter:.11,length:12,segments:16,autoStart:true});trail.material=material(color);trail.isPickable=false;
  core.onDisposeObservable.addOnce(()=>trail.dispose());return core;
 }
 function weaponTrail(weapon,id){
  const tip=new B.TransformNode('weapon-tip',scene);tip.parent=weapon;tip.position.y=weaponFor(id).kind==='gauntlets'?.15:weaponFor(id).kind==='spear'?1.8:1.2;
  const trail=new B.TrailMesh('blade-wake',tip,scene,{diameter:.085,length:7,segments:20,autoStart:false});trail.material=material(HERO_COLORS[id]||'#f0b90b');trail.isPickable=false;trail.setEnabled(false);let until=0;
  return {swing(duration=460){until=performance.now()+duration;trail.setEnabled(true);trail.start();},update(now){if(until&&now>until){until=0;trail.stop();trail.setEnabled(false);}},dispose(){trail.dispose();tip.dispose();}};
 }
 function seal(x,z,color,radius=1.4){
  const root=new B.TransformNode('casting-seal',scene),m=material(color);root.position.set(x,.035,z);
  for(const [diameter,thickness] of [[radius*2,.025],[radius*1.6,.018]]){const ring=B.MeshBuilder.CreateTorus('seal-circle',{diameter,thickness,tessellation:72},scene);ring.parent=root;ring.material=m;}
  for(let i=0;i<8;i++){const a=i*Math.PI/4,mark=B.MeshBuilder.CreateBox('seal-mark',{width:.025,height:.016,depth:radius*.2},scene);mark.position.set(Math.sin(a)*radius*.9,0,Math.cos(a)*radius*.9);mark.rotation.y=a;mark.parent=root;mark.material=m;}
  const born=performance.now(),observer=scene.onBeforeRenderObservable.add(()=>{const age=performance.now()-born;root.rotation.y=age*.0007;root.scaling.setAll(.6+Math.min(1,age/200)*.4);for(const mesh of root.getChildMeshes())mesh.visibility=Math.max(0,1-age/850);if(age>850){scene.onBeforeRenderObservable.remove(observer);root.dispose();}});
  return root;
 }
 return {projectile,weaponTrail,seal};
}
