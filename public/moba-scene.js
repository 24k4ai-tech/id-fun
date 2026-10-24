import {loadEngine} from './battle.js';
import {createWorldActor} from './world-actor.js';
import {MOBA_HEROES,FIELD,OBSTACLES,BRUSH} from './moba-rules.js';

export async function createMobaScene(canvas,overlay,onCommand,onProgress){
 const B=await loadEngine(),engine=new B.Engine(canvas,true,{antialias:true,stencil:true});engine.setHardwareScalingLevel(Math.max(1,window.devicePixelRatio/1.5));
 const scene=new B.Scene(engine);scene.clearColor=B.Color4.FromHexString('#142a30ff');scene.environmentTexture=new B.HDRCubeTexture('/textures/arena-sky.hdr',scene,128,false,true,false,true);scene.environmentIntensity=.42;
 scene.fogMode=B.Scene.FOGMODE_EXP2;scene.fogDensity=.005;scene.fogColor=B.Color3.FromHexString('#587975');
 const camera=new B.FreeCamera('tactical-camera',new B.Vector3(-18,23,19),scene);camera.fov=.82;camera.minZ=.15;scene.activeCamera=camera;
 const sun=new B.DirectionalLight('sun',new B.Vector3(-.6,-1,.45),scene);sun.position.set(-20,45,-15);sun.intensity=1.15;sun.diffuse=B.Color3.FromHexString('#ffe6b0');
 const ambient=new B.HemisphericLight('sky',new B.Vector3(0,1,0),scene);ambient.intensity=.45;ambient.groundColor=B.Color3.FromHexString('#374d46');
 const shadow=new B.ShadowGenerator(2048,sun);shadow.usePercentageCloserFiltering=true;shadow.filteringQuality=B.ShadowGenerator.QUALITY_MEDIUM;shadow.bias=.0005;
 const pipeline=new B.DefaultRenderingPipeline('finish',true,scene,[camera]);pipeline.fxaaEnabled=true;pipeline.samples=2;pipeline.bloomEnabled=true;pipeline.bloomThreshold=1.2;pipeline.bloomWeight=.2;pipeline.bloomKernel=32;
 scene.imageProcessingConfiguration.toneMappingEnabled=true;scene.imageProcessingConfiguration.toneMappingType=B.ImageProcessingConfiguration.TONEMAPPING_ACES;scene.imageProcessingConfiguration.exposure=1.05;
 const materials=new Map();
 const mat=(hex,metal=0,glow=0)=>{const key=hex+metal+glow;if(materials.has(key))return materials.get(key);const m=new B.PBRMaterial(key,scene);m.albedoColor=B.Color3.FromHexString(hex);m.metallic=metal;m.roughness=metal?.36:.88;if(glow)m.emissiveColor=m.albedoColor.scale(glow);materials.set(key,m);return m;};
 const stone=mat('#485c55'),edge=mat('#293e3c'),gold=mat('#9f7131',.65),blue=mat('#61e0c7',.4,.5),red=mat('#ff866d',.4,.5),wood=mat('#73563a'),leaf=mat('#4c7c56');
 function box(name,w,h,d,x,y,z,m){const mesh=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);mesh.position.set(x,y,z);mesh.material=m;mesh.receiveShadows=true;mesh.isPickable=false;return mesh;}
 function cylinder(name,d,h,x,y,z,m,t=24){const mesh=B.MeshBuilder.CreateCylinder(name,{diameter:d,height:h,tessellation:t},scene);mesh.position.set(x,y,z);mesh.material=m;mesh.receiveShadows=true;mesh.isPickable=false;return mesh;}
 const ground=B.MeshBuilder.CreateGround('walkable-ground',{width:60,height:38,subdivisions:1},scene);ground.receiveShadows=true;
 const turf=mat('#7c9b76');turf.albedoTexture=new B.Texture('/textures/grass_ground-diff.jpg',scene);turf.albedoTexture.uScale=12;turf.albedoTexture.vScale=8;turf.bumpTexture=new B.Texture('/textures/grass_ground-nor_gl.jpg',scene);turf.bumpTexture.uScale=12;turf.bumpTexture.vScale=8;turf.bumpTexture.level=.3;ground.material=turf;
 const perimeter=B.MeshBuilder.CreateGround('outer-gardens',{width:100,height:80},scene);perimeter.position.y=-.12;perimeter.material=turf;perimeter.receiveShadows=true;perimeter.isPickable=false;
 for(const x of [-29,29])for(let z=-18;z<=18;z+=2){const wall=box('arena-boundary',.6,.65,1.85,x,.25,z,stone);shadow.addShadowCaster(wall);}
 box('island-foundation',61,2,39,0,-1.05,0,edge);
 const paving=mat('#a4a58e');paving.albedoTexture=new B.Texture('/textures/square_floor-diff.jpg',scene);paving.albedoTexture.uScale=12;paving.albedoTexture.vScale=1;
 const lane=B.MeshBuilder.CreateGround('processional-lane',{width:55,height:5.8},scene);lane.position.y=.045;lane.material=paving;lane.receiveShadows=true;lane.isPickable=false;
 const rockTexture=new B.Texture('/textures/rock_01-diff.jpg',scene);stone.albedoTexture=rockTexture;
 for(const z of [-3.05,3.05])box('lane-trim',54,.08,.13,0,.06,z,gold);
 for(const x of [-24,24]){cylinder('fountain',7,.18,x,.1,0,stone,64);const ring=B.MeshBuilder.CreateTorus('sanctuary',{diameter:6.6,thickness:.1,tessellation:64},scene);ring.position.set(x,.22,0);ring.material=x<0?blue:red;ring.isPickable=false;}
 for(const o of OBSTACLES){box('ruin-foot',o.w+.4,.25,o.d+.4,o.x,.12,o.z,edge);
  for(let i=0;i<Math.ceil(o.w/1.4);i++){const rock=box('ruin-wall',1.25,1.6+(i%2)*.4,o.d,o.x-o.w/2+.7+i*1.3,.9,o.z,stone);shadow.addShadowCaster(rock);box('ruin-coping',1.3,.15,o.d+.05,rock.position.x,1.75+(i%2)*.2,rock.position.z,stone);}
 }
 // Grass volumes have explicit world positions shared with server vision rules.
 for(let i=0;i<26;i++){const x=-28+i*2.2;for(const z of [-18,18]){const p=cylinder('border-pier',.7,1,x,.5,z,stone,8);shadow.addShadowCaster(p);if(i%3===0)cylinder('border-lamp',.32,.22,x,1.1,z,gold,12);}}
 // Sculpted environmental assets frame the arena; they never block walkable server paths.
 for(const [file,places,size] of [['jacaranda-tree-v1.glb',[[-22,14],[22,-14],[-25,-13],[25,13],[-34,-15],[34,15],[-31,23],[31,-23],[0,-25],[0,25]],7],['market-pavilion-v1.glb',[[-36,-8]],10],['observatory-pavilion-v1.glb',[[36,8]],10],['rock_face_01.glb',[[-11,-8],[10,8],[-10,-7],[9,7],[-17,10],[17,-10]],3],['grass_medium_01.glb',BRUSH.flatMap(b=>Array.from({length:9},(_,i)=>[b.x+Math.cos(i*2.4)*Math.sqrt(i/9)*2.7,b.z+Math.sin(i*2.4)*Math.sqrt(i/9)*2.7])),1.3],['gothic_statue.glb',[[-16,0],[16,0]],3.2]]){
  B.SceneLoader.LoadAssetContainerAsync('/models/',file,scene).then(pack=>{
   if(scene.isDisposed){pack.dispose();return;}const bounds=pack.meshes.filter(m=>m.getTotalVertices?.()).reduce((b,m)=>{m.computeWorldMatrix(true);const v=m.getBoundingInfo().boundingBox;return {min:Math.min(b.min,v.minimumWorld.y),max:Math.max(b.max,v.maximumWorld.y)};},{min:Infinity,max:-Infinity});
   for(const [i,[x,z]] of places.entries()){const instance=pack.instantiateModelsToScene(n=>'environment-'+i+'-'+n,false);const root=new B.TransformNode('environment',scene);for(const n of instance.rootNodes)n.parent=root;const scale=size/(bounds.max-bounds.min||1);root.scaling.setAll(scale);root.position.set(x,-bounds.min*scale,z);for(const m of root.getChildMeshes()){m.isPickable=false;m.receiveShadows=true;shadow.addShadowCaster(m);}}
  }).catch(()=>{});
 }
 const capture=cylinder('capture-plinth',5,.16,0,.1,11,stone,48);const captureRing=B.MeshBuilder.CreateTorus('capture-ring',{diameter:4.5,thickness:.16,tessellation:64},scene);captureRing.position.set(0,.24,11);captureRing.material=gold;
 const relic=B.MeshBuilder.CreatePolyhedron('relic',{type:1,size:.65},scene);relic.position.set(0,1.7,11);relic.material=mat('#ebd484',.7,.4);relic.isPickable=false;
 const structures=new Map(),actors=new Map(),minions=new Map(),health=new Map(),fx=new Map(),effects=new Map();let snapshot=null,myId=null,disposed=false,follow=true,zoom=20,mouse={x:0,y:0},aim={x:0,z:0},selectedSlot=null,attackMove=false;
 let focus={x:-19,z:0},edgeMotion={x:0,z:0};
 const cursor=B.MeshBuilder.CreateTorus('move-marker',{diameter:1,thickness:.055,tessellation:40},scene);cursor.material=blue;cursor.position.y=.08;cursor.setEnabled(false);let cursorAt=0;
 const rangeMesh=B.MeshBuilder.CreateTorus('range',{diameter:2,thickness:.025,tessellation:80},scene);rangeMesh.material=blue;rangeMesh.position.y=.08;rangeMesh.setEnabled(false);
 function healthbar(id,hero=false){if(health.has(id))return health.get(id);const e=document.createElement('div');e.className='unit-health'+(hero?' hero-health':'');e.innerHTML='<span></span><div><i></i><b></b></div>';overlay.append(e);health.set(id,e);return e;}
 function makeStructure(u){const root=new B.TransformNode(u.id,scene),teamMat=u.team?red:blue,parts=[];
  parts.push(cylinder(u.id+'-base',u.type==='core'?4.5:3,.35,0,.2,0,stone,8));
  if(u.type==='tower'){
   parts.push(cylinder('tower-shaft',1.8,.65,0,.5,0,stone,8),cylinder('tower-cap',2,.12,0,.85,0,gold,8));
   for(let i=0;i<4;i++){const a=i*Math.PI/2;parts.push(box('tower-buttress',.3,.8,.4,Math.cos(a)*1.2,.6,Math.sin(a)*1.2,gold));}
  }else for(let i=0;i<6;i++){const a=i*Math.PI/3;parts.push(cylinder('core-pier',.4,2.5,Math.cos(a)*1.6,1.3,Math.sin(a)*1.6,gold,8));}
  const crystal=B.MeshBuilder.CreatePolyhedron('heart',{type:1,size:u.type==='core'?1:.55},scene);crystal.position.y=u.type==='core'?2:4;crystal.material=teamMat;parts.push(crystal);
  for(const m of parts){m.parent=root;m.isPickable=false;shadow.addShadowCaster(m);}root.position.set(u.x,0,u.z);structures.set(u.id,{root,crystal});return root;
 }
 async function loadActor(h){actors.set(h.id,{loading:true,x:h.x,z:h.z});onProgress?.(true);
  const actor=await createWorldActor(B,scene,h.hero,{shadow,scale:1.45,crowd:true,appearance:h.appearance});if(disposed){actor?.dispose();return;}
  if(!actor){actors.set(h.id,{failed:true});onProgress?.(false);return;}
  actor.root.position.set(h.x,0,h.z);const ring=B.MeshBuilder.CreateTorus('team-ring',{diameter:1.75,thickness:.065,tessellation:40},scene);ring.parent=actor.root;ring.position.y=.035;ring.material=h.team?red:blue;ring.isPickable=false;
  actors.set(h.id,{actor,x:h.x,z:h.z});onProgress?.([...actors.values()].some(a=>a.loading));
 }
 function makeMinion(u){const root=new B.TransformNode(u.id,scene),m=u.team?red:blue;
  const body=B.MeshBuilder.CreateCylinder('sentinel',{height:1.1,diameterBottom:.48,diameterTop:.28,tessellation:8},scene);body.position.y=.65;body.material=stone;body.parent=root;
  const head=B.MeshBuilder.CreateSphere('sentinel-head',{diameter:.48,segments:10},scene);head.position.y=1.35;head.material=m;head.parent=root;
  const spear=box('sentinel-spear',.07,1.6,.07,.38,.85,0,gold);spear.parent=root;
  const shield=B.MeshBuilder.CreateCylinder('sentinel-shield',{diameter:.5,height:.08,tessellation:8},scene);shield.rotation.z=Math.PI/2;shield.position.set(-.3,.85,0);shield.material=m;shield.parent=root;
  const visor=box('sentinel-visor',.37,.11,.1,0,1.36,.21,edge);visor.parent=root;
  for(const side of [-1,1]){const shoulder=B.MeshBuilder.CreateSphere('pauldron',{diameter:.3,segments:8},scene);shoulder.position.set(side*.27,.95,0);shoulder.material=gold;shoulder.parent=root;
   const arm=B.MeshBuilder.CreateCapsule('arm',{height:.5,radius:.075,tessellation:8,subdivisions:1},scene);arm.position.set(side*.3,.72,0);arm.material=stone;arm.parent=root;
   const leg=B.MeshBuilder.CreateCapsule('leg',{height:.42,radius:.1,tessellation:8,subdivisions:1},scene);leg.position.set(side*.14,.22,0);leg.material=edge;leg.parent=root;
   const foot=box('foot',.19,.12,.3,side*.14,.07,.05,gold);foot.parent=root;}
  const crest=B.MeshBuilder.CreateCylinder('crest',{height:.28,diameterBottom:.18,diameterTop:0,tessellation:6},scene);crest.position.y=1.68;crest.material=gold;crest.parent=root;
  for(const p of root.getChildMeshes())p.isPickable=false;root.position.set(u.x,0,u.z);root.rotation.y=u.team?-Math.PI/2:Math.PI/2;minions.set(u.id,root);return root;
 }
 function groundPoint(event){const rect=canvas.getBoundingClientRect(),px=(event.clientX-rect.left)*engine.getRenderWidth()/rect.width,py=(event.clientY-rect.top)*engine.getRenderHeight()/rect.height;
  const hit=scene.pick(px,py,m=>m===ground);return hit?.hit?{x:hit.pickedPoint.x,z:hit.pickedPoint.z}:null;}
 const pointerMove=e=>{mouse={x:e.clientX,y:e.clientY};const p=groundPoint(e);if(p)aim=p;const r=canvas.getBoundingClientRect();edgeMotion={x:e.clientX-r.left<25?-1:r.right-e.clientX<25?1:0,z:e.clientY-r.top<25?-1:r.bottom-e.clientY<25?1:0};};
 const project=(x,y,z)=>{const p=B.Vector3.Project(new B.Vector3(x,y,z),B.Matrix.Identity(),scene.getTransformMatrix(),camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight()));return {x:p.x*canvas.clientWidth/engine.getRenderWidth(),y:p.y*canvas.clientHeight/engine.getRenderHeight(),z:p.z};};
 const pointerDown=e=>{if(!snapshot)return;e.preventDefault();const p=groundPoint(e);if(!p)return;aim=p;
  if(e.button===0&&selectedSlot!==null){onCommand({kind:'skill',slot:selectedSlot,...p});selectedSlot=null;return;}
  if(e.button!==2&&e.pointerType!=='touch'&&!attackMove)return;
  if(selectedSlot!==null){selectedSlot=null;return;}
  const me=snapshot.heroes.find(h=>h.id===myId),rect=canvas.getBoundingClientRect();
  const target=[...snapshot.heroes,...snapshot.minions,...snapshot.structures].filter(u=>u.team!==me?.team&&u.hp>0).map(u=>({u,p:project(u.x,u.type?2:1.4,u.z)})).find(({p})=>Math.hypot(p.x-(e.clientX-rect.left),p.y-(e.clientY-rect.top))<24);
  onCommand(target?{kind:'attack',target:target.u.id}:{kind:attackMove?'attackMove':'move',...p});attackMove=false;cursor.position.set(p.x,.08,p.z);cursorAt=performance.now();cursor.setEnabled(true);
 };
 const key=e=>{if(e.target.closest('input,textarea,select')||!snapshot)return;
  const slot=['KeyQ','KeyW','KeyE','KeyR'].indexOf(e.code);
  if(slot>=0&&!e.repeat){e.preventDefault();onCommand({kind:'skill',slot,...aim});}
  if(e.code==='KeyA'){attackMove=true;e.preventDefault();}
  if(e.code==='KeyS')onCommand({kind:'stop'});
  if(e.code==='KeyB'&&!e.repeat)onCommand({kind:'recall'});
  if(e.code==='KeyY'&&!e.repeat)follow=!follow;
  if(e.code==='Space'){e.preventDefault();follow=true;}
  if(e.code==='Escape'){selectedSlot=null;attackMove=false;}
 };
 const wheel=e=>{e.preventDefault();zoom=Math.max(16,Math.min(29,zoom+Math.sign(e.deltaY)));};const context=e=>e.preventDefault();
 canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('contextmenu',context);canvas.addEventListener('wheel',wheel,{passive:false});document.addEventListener('keydown',key);
 function telegraph(c){const m=new B.StandardMaterial('telegraph-'+c.id,scene);m.diffuseColor=B.Color3.FromHexString(c.team===snapshot.heroes.find(h=>h.id===myId)?.team?'#66dfc2':'#ff6845');m.emissiveColor=m.diffuseColor.scale(.6);m.alpha=.27;m.disableLighting=true;
  let mesh;if(c.kind==='area'){mesh=B.MeshBuilder.CreateDisc('danger',{radius:c.radius,tessellation:60,sideOrientation:B.Mesh.DOUBLESIDE},scene);mesh.rotation.x=Math.PI/2;mesh.position.set(c.x,.1,c.z);}
  else {const d=Math.hypot(c.x-c.ox,c.z-c.oz);mesh=B.MeshBuilder.CreatePlane('danger',{width:(c.width||1)*2,height:d,sideOrientation:B.Mesh.DOUBLESIDE},scene);mesh.rotation.x=Math.PI/2;mesh.rotation.y=Math.atan2(c.x-c.ox,c.z-c.oz);mesh.position.set((c.x+c.ox)/2,.1,(c.z+c.oz)/2);}
  mesh.material=m;mesh.isPickable=false;fx.set(c.id,mesh);return mesh;}
 function effect(e){const team=e.team?red:blue;let mesh;
  if(e.kind==='attack'){mesh=B.MeshBuilder.CreateSphere('bolt',{diameter:.22,segments:8},scene);mesh.material=team;}
  else {mesh=B.MeshBuilder.CreateTorus('impact',{diameter:(e.radius||2)*2,thickness:.15,tessellation:48},scene);mesh.position.set(e.x,.3,e.z);mesh.material=team;}
  mesh.isPickable=false;effects.set(e.id,{mesh,e,started:performance.now()});}
 engine.runRenderLoop(()=>{if(disposed||document.hidden)return;const dt=Math.min(.05,engine.getDeltaTime()/1000),now=performance.now();
  if(snapshot){const me=snapshot.heroes.find(h=>h.id===myId);
   if(follow&&me){focus.x+=(me.x-focus.x)*(1-Math.exp(-7*dt));focus.z+=(me.z-focus.z)*(1-Math.exp(-7*dt));}else{focus.x=Math.max(-23,Math.min(23,focus.x+edgeMotion.x*dt*18));focus.z=Math.max(-12,Math.min(12,focus.z+edgeMotion.z*dt*18));}
   camera.position.set(focus.x,zoom,focus.z+zoom*.72);camera.setTarget(new B.Vector3(focus.x,0,focus.z-2));
   for(const h of snapshot.heroes){const entry=actors.get(h.id);if(!entry){loadActor(h);continue;}if(!entry.actor)continue;entry.actor.root.setEnabled(true);
    const dx=h.x-entry.x,dz=h.z-entry.z,moving=Math.hypot(dx,dz)>.035;entry.x+=dx*Math.min(1,dt*14);entry.z+=dz*Math.min(1,dt*14);
    entry.actor.update(dt,{x:entry.x,z:entry.z,moving,casting:h.castUntil>snapshot.now,attacking:h.attackAt-snapshot.now>450,dead:h.hp<=0,target:snapshot.casts.find(c=>c.owner===h.id)});
   }
   for(const [id,entry] of actors)if(entry.actor&&!snapshot.heroes.some(h=>h.id===id))entry.actor.root.setEnabled(false);
   for(const u of snapshot.minions){const root=minions.get(u.id)||makeMinion(u);root.position.x+=(u.x-root.position.x)*Math.min(1,dt*15);root.position.z+=(u.z-root.position.z)*Math.min(1,dt*15);}
   for(const [id,m] of minions)if(!snapshot.minions.some(u=>u.id===id)){m.dispose();minions.delete(id);}
   for(const u of snapshot.structures){if(!structures.has(u.id))makeStructure(u);const model=structures.get(u.id);model.root.scaling.y=u.hp<=0?.15:1;model.crystal.rotation.y+=dt*.6;}
   for(const c of snapshot.casts)if(!fx.has(c.id))telegraph(c);
   for(const [id,m] of fx)if(!snapshot.casts.some(c=>c.id===id)){m.material.dispose();m.dispose();fx.delete(id);}
   for(const e of snapshot.effects)if(!effects.has(e.id)&&snapshot.now-e.at<800)effect(e);
   for(const [id,{mesh,e,started}] of effects){const t=(now-started)/600;if(t>1.2){mesh.dispose();effects.delete(id);continue;}
    if(e.kind==='attack')mesh.position.set((e.ox||0)+(e.x-(e.ox||0))*Math.min(1,t*3),1.3,(e.oz||0)+(e.z-(e.oz||0))*Math.min(1,t*3));
    else{mesh.scaling.setAll(.55+t*.6);mesh.visibility=Math.max(0,1-t);}}
   for(const e of health.values())e.hidden=true;
   for(const u of [...snapshot.heroes,...snapshot.structures,...snapshot.minions]){if(u.hp<=0)continue;const p=project(u.x,u.type?4.7:u.hero?3.25:1.7,u.z),bar=healthbar(u.id,Boolean(u.hero));
    bar.hidden=p.z<0||p.z>1||p.x<0||p.x>canvas.clientWidth||p.y<0||p.y>canvas.clientHeight;bar.style.transform=`translate(${p.x}px,${p.y}px)`;bar.classList.toggle('enemy',u.team!==me?.team);
    bar.querySelector('i').style.width=(100*u.hp/u.maxHp)+'%';bar.querySelector('b').style.width=Math.min(100,100*(u.shield||0)/u.maxHp)+'%';bar.querySelector('span').textContent=u.hero?`${u.name==='BOT'?'◇':u.name} · ${u.level}`:'';
   }
   if(me&&selectedSlot!==null){const skill=MOBA_HEROES[me.hero].skills[selectedSlot];rangeMesh.setEnabled(true);rangeMesh.position.set(me.x,.1,me.z);rangeMesh.scaling.set(skill.range||skill.radius,1,skill.range||skill.radius);}else rangeMesh.setEnabled(false);
   relic.rotation.y+=dt;relic.position.y=1.7+Math.sin(now/900)*.2;relic.setEnabled(snapshot.objective.availableAt<=snapshot.now);captureRing.material=snapshot.objective.team===1?red:snapshot.objective.team===0?blue:gold;
  }
  if(now-cursorAt>800)cursor.setEnabled(false);scene.render();
 });
 const resize=()=>engine.resize();window.addEventListener('resize',resize);
 return {sync(state,id){if(!snapshot){const own=state.heroes.find(h=>h.id===id);if(own)focus={x:own.x,z:own.z};}snapshot=state;myId=id;},selectSkill(slot){selectedSlot=slot;},center(){follow=true;},fps:()=>engine.getFps(),
  dispose(){disposed=true;window.removeEventListener('resize',resize);canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('contextmenu',context);canvas.removeEventListener('wheel',wheel);document.removeEventListener('keydown',key);overlay.replaceChildren();scene.dispose();engine.dispose();}};
}
