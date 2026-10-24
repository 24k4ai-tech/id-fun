import {remoteStep} from './remote-motion.js';
import {loadEngine} from './battle.js';
import {createWorldActor} from './world-actor.js';
import {CITY_PLACES,ROOM_BOUNDS,roomWalkable} from './city-places.js';
export async function createCityInterior(canvas,building,avatar,visit,onNear,appearance=null){
 const B=await loadEngine(),p=CITY_PLACES[building],engine=new B.Engine(canvas,true,{antialias:true});engine.setHardwareScalingLevel(Math.max(1,window.devicePixelRatio/1.5));
 const scene=new B.Scene(engine);scene.clearColor=B.Color4.FromHexString('#192524ff');scene.environmentTexture=new B.HDRCubeTexture('/textures/arena-sky.hdr',scene,128,false,true,false,true);scene.environmentIntensity=.45;
 const camera=new B.FreeCamera('interior-camera',new B.Vector3(0,7,11),scene);camera.fov=.85;camera.minZ=.1;scene.activeCamera=camera;
 const hemi=new B.HemisphericLight('room-fill',new B.Vector3(0,1,0),scene);hemi.intensity=.42;hemi.diffuse=B.Color3.FromHexString('#c2d7d4');
 const sun=new B.DirectionalLight('window-light',new B.Vector3(-.4,-1,.8),scene);sun.position.set(8,14,-8);sun.intensity=1.15;sun.diffuse=B.Color3.FromHexString('#ffe0aa');
 const shadow=new B.ShadowGenerator(2048,sun);shadow.usePercentageCloserFiltering=true;shadow.bias=.0006;
 const pipe=new B.DefaultRenderingPipeline('interior-finish',true,scene,[camera]);pipe.fxaaEnabled=true;pipe.bloomEnabled=true;pipe.bloomWeight=.15;pipe.bloomThreshold=1;
 scene.imageProcessingConfiguration.toneMappingEnabled=true;scene.imageProcessingConfiguration.toneMappingType=B.ImageProcessingConfiguration.TONEMAPPING_ACES;
 const mat=(name,color,metal=0)=>{const m=new B.PBRMaterial(name,scene);m.albedoColor=B.Color3.FromHexString(color);m.metallic=metal;m.roughness=metal?.35:.83;return m;};
 const stone=mat('limestone','#a5a793'),wood=mat('walnut','#5f4530'),gold=mat('brass','#c6a45d',.65),dark=mat('iron','#2e3d3a',.3),accent=mat('glass',p.color,.3);accent.emissiveColor=B.Color3.FromHexString(p.color).scale(.4);
 const floorMat=mat('floor','#9a9f8d');floorMat.albedoTexture=new B.Texture('/textures/square_floor-diff.jpg',scene);floorMat.albedoTexture.uScale=floorMat.albedoTexture.vScale=3;floorMat.bumpTexture=new B.Texture('/textures/square_floor-nor.jpg',scene);floorMat.bumpTexture.uScale=floorMat.bumpTexture.vScale=3;floorMat.bumpTexture.level=.35;
 function box(name,w,h,d,x,y,z,m){const b=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);b.position.set(x,y,z);b.material=m;b.receiveShadows=true;b.isPickable=false;shadow.addShadowCaster(b);return b;}
 function cyl(name,d,h,x,y,z,m,t=32){const b=B.MeshBuilder.CreateCylinder(name,{diameter:d,height:h,tessellation:t},scene);b.position.set(x,y,z);b.material=m;b.receiveShadows=true;shadow.addShadowCaster(b);return b;}
 box('stone-floor',12,.25,15,0,-.15,0,floorMat);box('back-wall',12,4,.4,0,2,-7,stone);
 for(const x of [-5.7,5.7]){box('side-wall',.35,2.5,14,x,1.25,0,stone);for(const z of [-6,-2,2,6]){cyl('fluted-column',.45,4.5,x,2.25,z,dark,16);cyl('capital',.7,.18,x,4.4,z,gold,16);}}
 for(const x of [-3,0,3]){box('window-frame',1.6,2.6,.16,x,2.4,-6.7,dark);box('window-glass',1.35,2.3,.12,x,2.4,-6.59,accent);for(const dx of [-.4,0,.4])box('window-mullion',.05,2.3,.2,x+dx,2.4,-6.5,gold);}
 for(const x of [-5.2,5.2]){box('shelf-back',.1,2.4,4,x+(x<0?-.35:.35),1.2,-2,wood);for(const z of [-4,0])box('shelf-side',.75,2.4,.1,x,1.2,z,wood);for(const y of [.45,1.2,1.95]){box('shelf-board',.85,.1,4,x,y,-2,gold);for(let i=0;i<7;i++){const book=box('book',.5,.35+.06*(i%3),.23,x,y+.22,-3.6+i*.48,mat('book-'+x+y+i,['#3e6a66','#a9754e','#6b6789'][i%3]));book.rotation.x=(i%3-1)*.08;}}}
 const grain=new B.Texture('/textures/bark_brown_02-diff.jpg',scene);grain.uScale=2;grain.vScale=.3;wood.albedoTexture=grain;
 const rug=mat('woven-rug',building==='observatory'?'#20394e':building==='market'?'#734032':'#384a34');box('carpet',4.3,.018,5.5,0,.005,.4,rug);for(const x of [-2.05,2.05])box('carpet-trim',.045,.02,5.3,x,.02,.4,gold);
 for(const x of [-5.5,5.5])for(const z of [-5,-1,3]){box('wall-panel',.14,.6,3,x,.45,z,wood);box('wall-rail',.2,.08,3.1,x,.82,z,gold);}
 const faceLight=new B.PointLight('portrait-fill',new B.Vector3(0,4,4),scene);faceLight.diffuse=B.Color3.FromHexString('#ffe6c1');faceLight.intensity=1.2;faceLight.range=13;
 const table=box('working-table',3.2,.22,1.4,0,1,-3.5,wood);for(const x of [-1.3,1.3])for(const z of [-4,-3])cyl('carved-leg',.16,1,x,.5,z,gold,12);
 let mechanism;
 if(building==='observatory'){
  const globe=B.MeshBuilder.CreateSphere('celestial-globe',{diameter:1.1,segments:32},scene);globe.position.set(0,2,-3.5);globe.material=accent;mechanism=new B.TransformNode('astrolabe',scene);mechanism.position.set(0,2,-3.5);
  for(let i=0;i<3;i++){const r=B.MeshBuilder.CreateTorus('orbital-ring',{diameter:1.5+i*.25,thickness:.035,tessellation:64},scene);r.parent=mechanism;r.rotation.set(i*.6,i*.4,0);r.material=gold;}
 }else if(building==='guild'){
  box('sand-table',2.7,.1,1.1,0,1.2,-3.5,stone);for(const x of [-1,1]){cyl('mini-tower',.18,.45,x,1.45,-3.5,gold,8);const gem=B.MeshBuilder.CreatePolyhedron('mini-core',{type:1,size:.12},scene);gem.position.set(x,1.8,-3.5);gem.material=accent;}
 }else if(building==='workshop'){
  cyl('charging-base',1,.2,0,1.2,-3.5,dark);mechanism=B.MeshBuilder.CreatePolyhedron('charging-core',{type:1,size:.4},scene);mechanism.position.set(0,1.9,-3.5);mechanism.material=accent;
  for(const x of [-1.1,1.1]){box('capacitor',.35,.6,.5,x,1.4,-3.5,dark);cyl('coil',.4,.1,x,1.7,-3.5,gold);}
 }else{for(let i=0;i<5;i++){box('parcel',.55,.3,.45,(i%3-1)*.7,1.3+Math.floor(i/3)*.35,-3.5,mat('parcel-'+i,'#b99a6b'));box('parcel-band',.08,.32,.47,(i%3-1)*.7,1.3+Math.floor(i/3)*.35,-3.5,gold);}}
 for(const x of [-3.8,3.8]){cyl('pedestal',.6,.7,x,.35,1,dark,8);const lamp=B.MeshBuilder.CreateSphere('lamp',{diameter:.5,segments:20},scene);lamp.position.set(x,1,1);lamp.material=accent;const light=new B.PointLight('lamp-light',new B.Vector3(x,1.2,1),scene);light.diffuse=B.Color3.FromHexString('#ffe1a6');light.intensity=.6;light.range=6;}
 // Doorway remains open and readable from inside.
 for(const x of [-1.2,1.2])box('door-post',.25,.65,.3,x,.325,6.3,wood);box('door-threshold',2.7,.035,.3,0,.02,6.3,gold);
 const actor=await createWorldActor(B,scene,avatar,{shadow,weapon:false,scale:1.1,appearance}),npc=await createWorldActor(B,scene,p.avatar,{shadow,weapon:false,scale:1.1,crowd:true});
 if(!actor){scene.dispose();engine.dispose();throw new Error('interior_model_unavailable');}npc?.root.position.set(2.7,0,-3.8);
 let remoteTarget=null;
 let x=visit?.x??0,z=visit?.z??4,motion={x:0,z:0},disposed=false,paused=false,lastNear=undefined;
 const keys=new Set();function key(e,down){if(remoteTarget)return;if(e.target.closest('input,textarea')||document.querySelector('dialog[open]'))return;if(['KeyW','KeyA','KeyS','KeyD'].includes(e.code)){e.preventDefault();e.stopImmediatePropagation();down?keys.add(e.code):keys.delete(e.code);motion={x:Number(keys.has('KeyA'))-Number(keys.has('KeyD')),z:Number(keys.has('KeyS'))-Number(keys.has('KeyW'))};}}
 const kd=e=>key(e,true),ku=e=>key(e,false),blur=()=>{keys.clear();motion={x:0,z:0};};document.addEventListener('keydown',kd,true);document.addEventListener('keyup',ku,true);window.addEventListener('blur',blur);
 engine.runRenderLoop(()=>{if(disposed||document.hidden||paused)return;const dt=Math.min(.05,engine.getDeltaTime()/1000),length=Math.hypot(motion.x,motion.z)||1;
  const nx=Math.max(-ROOM_BOUNDS.x,Math.min(ROOM_BOUNDS.x,x+motion.x/length*dt*4.6)),nz=Math.max(-ROOM_BOUNDS.z,Math.min(ROOM_BOUNDS.z,z+motion.z/length*dt*4.6));
  const remote=remoteTarget?remoteStep(x,z,remoteTarget,dt):null;
  if(remote){x=remote.x;z=remote.z;}else if(roomWalkable(nx,nz)){x=nx;z=nz;}else if(roomWalkable(nx,z))x=nx;else if(roomWalkable(x,nz))z=nz;
  actor.update(dt,{x,z,moving:remote?remote.moving:Boolean(motion.x||motion.z)});npc?.update(dt,{});if(npc)npc.root.rotation.y=.3;
  camera.position.set(x*.4,6.8,z*.35+8);camera.setTarget(new B.Vector3(x*.6,1,z*.65-1.5));
  if(mechanism)mechanism.rotation.y+=dt*.35;
  const near=Math.hypot(x-p.object.x,z-p.object.z)<2.2?'work':z>4.7&&Math.abs(x)<1.8?'exit':null;if(near!==lastNear){lastNear=near;onNear(near);}
  scene.render();});
 const resize=()=>engine.resize();window.addEventListener('resize',resize);
 return {position:()=>({x,z}),setRemotePosition(value){remoteTarget=value?{x:value.x,z:value.z}:null;blur();},setPosition(px,pz){x=px;z=pz;},pause(value){paused=value;if(value)blur();},motion(dx,dz){if(remoteTarget)return;motion={x:-dx,z:dz};},near:()=>lastNear,
  dispose(){disposed=true;document.removeEventListener('keydown',kd,true);document.removeEventListener('keyup',ku,true);window.removeEventListener('blur',blur);window.removeEventListener('resize',resize);scene.dispose();engine.dispose();}};
}
