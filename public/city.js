import {remoteStep} from './remote-motion.js';
import { loadEngine, looks } from './battle.js';
import { styleFighter } from './fighter-identity.js';
import { attachWeapon } from './weapon-model.js';
import { cityDirection, cityOrbit,cityWalkable } from './city-controls.js';
import { loadCharacterAsset } from './character-assets.js';
import { buildGarden } from './arena-garden.js';
import { buildCityBuildings } from './city-buildings.js';
import { createJourneyWorld } from './journey-world.js';
import {createCityPeople} from './city-people.js';

export const CITY_SITES = Object.freeze([
  { kind: 'gather', x: -9, z: -7, name: '资源集市', en: 'Market' },
  { kind: 'scout', x: 9, z: -7, name: '观测塔', en: 'Observatory' },
  { kind: 'repair', x: -9, z: 8, name: '能源站', en: 'Power Station' },
  { kind: 'build', x: 9, z: 8, name: '建造区', en: 'Workshop' },
  { kind: 'arena', x: 0, z: -16, name: '竞技场', en: 'Arena' },
]);

export async function createCity(canvas, avatarId, aura, onNearChange,appearance=null) {
  const B = await loadEngine();
  const engine = new B.Engine(canvas, true, { antialias: true, premultipliedAlpha: false });
  engine.setHardwareScalingLevel(window.devicePixelRatio > 1.5 ? 1.5 : 1);
  const scene = new B.Scene(engine);
  scene.clearColor = B.Color4.FromHexString('#708fa7ff');
  scene.environmentTexture=new B.HDRCubeTexture('/textures/arena-sky.hdr',scene,128,false,true,false,true);
  scene.environmentIntensity=1.05;
  scene.fogMode = B.Scene.FOGMODE_EXP2;
  scene.fogDensity = .0035;
  scene.fogColor = B.Color3.FromHexString('#b5cbd6');
  const camera = new B.FreeCamera('city-camera', new B.Vector3(0, 4.7, 9), scene);
  camera.fov = .88;
  camera.minZ = .08;
  scene.activeCamera = camera;
  const ambient = new B.HemisphericLight('city-ambient', new B.Vector3(0, 1, 0), scene);
  ambient.intensity = .86;
  ambient.diffuse = B.Color3.FromHexString('#cbd8db');
  const sun = new B.DirectionalLight('city-sun', new B.Vector3(-.5, -1, .3), scene);
  sun.position = new B.Vector3(-10, 16, -6);
  sun.intensity = 1.6;
  sun.diffuse = B.Color3.FromHexString('#fff1d0');
  const shadows = new B.ShadowGenerator(2048, sun);
  shadows.usePercentageCloserFiltering = true;
  const bloom = new B.GlowLayer('city-neon', scene, { blurKernelSize: 24 });
  bloom.intensity = .27;
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure = 1.18;
  scene.imageProcessingConfiguration.contrast = 1.08;
  const finish = new B.DefaultRenderingPipeline('city-finish', true, scene, [camera]);
  finish.fxaaEnabled = true; finish.sharpenEnabled = true;
  finish.sharpen.edgeAmount = .18; finish.sharpen.colorAmount = 1;
  const materials = new Map();
  function mat(hex, glow = false) {
    const key = `${hex}-${glow}`;
    if (materials.has(key)) return materials.get(key);
    const result = new B.StandardMaterial(key, scene);
    result.diffuseColor = B.Color3.FromHexString(hex);
    result.specularColor = B.Color3.FromHexString('#7d7869');
    if (glow) result.emissiveColor = B.Color3.FromHexString(hex).scale(.75);
    materials.set(key, result);
    return result;
  }
  const stone = mat('#a9a69a'), wall = mat('#515a56'), dark = mat('#24272a');
  const brass = mat('#bb974b'), gold = mat('#e6af12', true), glass = mat('#4f7776');
  const roofDark = mat('#383737'), roofWarm = mat('#665244');
  const ground = B.MeshBuilder.CreateGround('city-ground', { width: 58, height: 68 }, scene);
  ground.position.z = 3;
  const paving = new B.PBRMaterial('city-paving', scene);
  paving.albedoColor = B.Color3.FromHexString('#929589'); paving.roughness = .93; paving.metallic = 0;
  ground.material = paving;
  ground.receiveShadows = true;
  const floorTexture = new B.Texture('/textures/square_floor-diff.jpg', scene);
  floorTexture.uScale = floorTexture.vScale = 7;
  paving.albedoTexture = floorTexture;
  paving.bumpTexture = new B.Texture('/textures/square_floor-nor.jpg', scene);
  paving.bumpTexture.uScale = paving.bumpTexture.vScale = 7; paving.bumpTexture.level = .35;
  const skyTexture = new B.DynamicTexture('city-sky-texture', { width: 512, height: 256 }, scene, false);
  const skyContext = skyTexture.getContext();
  const skyGradient = skyContext.createLinearGradient(0, 0, 0, 256);
  skyGradient.addColorStop(0, '#142c4f'); skyGradient.addColorStop(.55, '#698fac'); skyGradient.addColorStop(1, '#f4d3a0');
  skyContext.fillStyle = skyGradient; skyContext.fillRect(0, 0, 512, 256); skyTexture.update();
  const skyMaterial = new B.StandardMaterial('city-sky', scene);
  skyMaterial.disableLighting = true; skyMaterial.emissiveTexture = skyTexture;
  skyMaterial.backFaceCulling = false;
  const sky = B.MeshBuilder.CreateSphere('city-sky', { diameter: 180, segments: 20, sideOrientation: B.Mesh.BACKSIDE }, scene);
  sky.material = skyMaterial; sky.infiniteDistance = true; sky.isPickable = false; sky.applyFog = false;
  sky.isVisible = true;
  const box = (name, width, height, depth, x, y, z, material) => {
    const m = B.MeshBuilder.CreateBox(name, { width, height, depth }, scene);
    m.position.set(x, y, z); m.material = material; m.receiveShadows = true;
    return m;
  };
  const cylinder = (name, diameter, height, x, y, z, material, tessellation = 16) => {
    const m = B.MeshBuilder.CreateCylinder(name, { diameter, height, tessellation }, scene);
    m.position.set(x, y, z); m.material = material;
    return m;
  };
  // Broad walkable lanes make each station a destination, with the arena as a landmark.
  box('main-boulevard', 5.2, .018, 36, 0, .014, -2, dark);
  box('cross-boulevard', 25, .018, 4.4, 0, .016, 0, dark);
  for (const x of [-2.5, 2.5]) box('road-line', .06, .02, 35, x, .028, -2, brass);
  for (const z of [-2.2, 2.2]) box('road-line', 25, .02, .06, 0, .028, z, brass);
  cylinder('central-plaza', 7.5, .09, 0, .045, 0, paving, 64);
  const plazaRing = B.MeshBuilder.CreateTorus('plaza-ring', { diameter: 6.8, thickness: .08, tessellation: 64 }, scene);
  plazaRing.position.y = .1; plazaRing.material = gold;
  const sign = (text, x, y, z) => {
    const texture = new B.DynamicTexture(`sign-${text}`, { width: 512, height: 128 }, scene, false);
    texture.hasAlpha = true;
    const ctx = texture.getContext();
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = '#e9d495'; ctx.font = 'bold 58px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(text, 256, 83); texture.update();
    const material = new B.StandardMaterial(`sign-${text}`, scene);
    material.diffuseTexture = texture; material.opacityTexture = texture;
    material.emissiveColor = B.Color3.FromHexString('#f0b90b'); material.backFaceCulling = false;
    const plane = B.MeshBuilder.CreatePlane(`sign-${text}`, { width: 3.8, height: .95 }, scene);
    plane.position.set(x, y, z); plane.rotation.y = Math.PI; plane.material = material;
  };
  function pavilion(site, height, accent) {
    cylinder(`${site.kind}-platform`, 6.7, .35, site.x, .18, site.z, wall, 8);
    for (const dx of [-2.15, 2.15]) for (const dz of [-2.15, 2.15]) {
      cylinder(`${site.kind}-column`, .36, height, site.x + dx, height / 2 + .35, site.z + dz, brass, 12);
      cylinder(`${site.kind}-lamp`, .36, .28, site.x + dx, height + .48, site.z + dz, gold);
    }
    box(`${site.kind}-roof`, 6.15, .26, 6.15, site.x, height + .52, site.z, roofDark);
    const roof = B.MeshBuilder.CreateCylinder(`${site.kind}-crown`, { diameterTop: 1.2, diameterBottom: 6.4, height: .94, tessellation: 4 }, scene);
    roof.rotation.y = Math.PI / 4; roof.position.set(site.x, height + 1.12, site.z); roof.material = roofWarm;
    box(`${site.kind}-roof-ridge`, 1.8, .12, 1.8, site.x, height + 1.65, site.z, brass);
    for (const edge of [-2.95, 2.95]) {
      box(`${site.kind}-eave`, 6.25, .06, .08, site.x, height + .42, site.z + edge, brass);
      box(`${site.kind}-eave`, .08, .06, 6.25, site.x + edge, height + .42, site.z, brass);
    }
    for (const dx of [-2.65, 2.65]) for (const dz of [-2.65, 2.65]) {
      cylinder(`${site.kind}-lantern`, .3, .42, site.x + dx, height + .2, site.z + dz, gold, 8);
    }
    sign(site.en.toUpperCase(), site.x, height + .12, site.z + 3.05);
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      const pillar = cylinder(`${site.kind}-core`, .26, 1.5, site.x + Math.sin(angle) * 1.3, 1.1, site.z + Math.cos(angle) * 1.3, glass, 12);
      shadows.addShadowCaster(pillar);
    }
    const beacon = B.MeshBuilder.CreateSphere(`${site.kind}-beacon`, { diameter: 1.1, segments: 16 }, scene);
    beacon.position.set(site.x, 1.9, site.z); beacon.material = accent;
    const surround = B.MeshBuilder.CreateTorus(`${site.kind}-beacon-orbit`, { diameter: 2, thickness: .04, tessellation: 32 }, scene);
    surround.position.set(site.x, 1.9, site.z); surround.rotation.x = .35; surround.material = gold;
  }
  try {
    await buildCityBuildings(B, scene, shadows, CITY_SITES);
    for (const site of CITY_SITES.slice(0, 4)) sign(site.en.toUpperCase(), site.x, 1.25, site.z + (site.z > 0 ? -3.2 : 3.2));
  } catch {
    console.warn('Detailed city buildings unavailable; using the playable fallback');
    for (const site of CITY_SITES.slice(0, 4)) pavilion(site, 3.4, gold);
  }
  const portal = CITY_SITES[4];
  for (const dx of [-2.4, 2.4]) cylinder('arena-gate-pillar', .6, 6.5, portal.x + dx, 3.25, portal.z, brass);
  box('arena-gate-beam', 6, .7, .8, 0, 6.5, portal.z, dark);
  sign('ID FUN ARENA', 0, 6.65, portal.z + .5);
  const gate = B.MeshBuilder.CreateTorus('arena-portal', { diameter: 4, thickness: .18, tessellation: 56 }, scene);
  gate.position.set(0, 3, portal.z); gate.rotation.x=Math.PI/2;gate.material = gold;
  box('arena-door', 3.8, 5.1, .15, 0, 2.55, portal.z - .4, glass);
  for (const x of [-14, -5, 5, 14]) for (const z of [-13, -2, 8, 16]) {
    cylinder('streetlamp', .12, 3.1, x, 1.55, z, brass, 8);
    cylinder('streetlamp-lantern', .28, .44, x, 3.1, z, mat('#dcb979', true), 12);
    for (const y of [2.88, 3.32]) cylinder('streetlamp-cap', .38, .07, x, y, z, dark, 12);
  }
  sky.dispose();await buildGarden(B,scene,shadows,{hub:true});
  for(const part of [...scene.meshes])if(['arena-gate-pillar','arena-gate-beam','arena-door'].includes(part.name))part.dispose();
  const sites=[...CITY_SITES];
  if(appearance?.place&&/^\/creations\/[a-f0-9-]{36}\/model\.glb$/.test(appearance.place.file)){
    try{
      const pack=await B.SceneLoader.LoadAssetContainerAsync('',appearance.place.file,scene,undefined,'.glb');pack.addAllToScene();
      const home=new B.TransformNode('personal-home',scene);for(const node of pack.rootNodes)node.parent=home;
      const bounds=home.getHierarchyBoundingVectors(true),scale=Math.min(8/(bounds.max.y-bounds.min.y),10/(bounds.max.x-bounds.min.x));home.scaling.setAll(scale);home.position.set(0,-bounds.min.y*scale,27);
      for(const part of home.getChildMeshes()){part.receiveShadows=true;shadows.addShadowCaster(part);part.isPickable=false;}
      sites.push({kind:'home',x:0,z:27,name:'私人领地',en:'Your Place'});sign('YOUR PLACE',0,3,22.5);
    }catch{console.warn('Personal place unavailable');}
  }
  // Reuse the combat character and animation rig so the selected avatar appears in the city.
  const look = looks[avatarId] || looks.ember;
  const load = file => B.SceneLoader.ImportMeshAsync(null, '/models/', `${file}.glb`, scene);
  const detailed=await loadCharacterAsset(B,scene,avatarId,appearance);
  const empty=()=>({meshes:[],animationGroups:[]});
  const [body, outfit, tunic, hair] = detailed?[detailed,empty(),empty(),empty()]:await Promise.all([
    load(`fighter-${look.sex}`), load(`outfit-${look.sex}`),
    load(`tunic-${look.sex}`), load(`hair-${look.style}`),
  ]);
  const actor = new B.TransformNode('city-agent', scene);
  actor.scaling.setAll(1.18);
  for (const pack of [body, outfit, tunic]) if(pack.meshes[0])pack.meshes[0].parent = actor;
  const head = body.transformNodes.find(node => node.name === 'Head');
  if(hair.meshes[0])hair.meshes[0].setParent(head || actor);
  for (const part of body.meshes) if (part.name?.includes('Sphere.005_Retopology')) part.isVisible = false;
  for (const part of outfit.meshes) {
    if (part.name?.includes('Head_Hood') || part.name?.endsWith('_Ranger_Body')) part.isVisible = false;
    if (part.material?.name?.includes('Ranger')) {
      const fabric = part.material.clone('city-agent-fabric');
      fabric.albedoColor = B.Color3.FromHexString(look.suit); part.material = fabric;
    }
  }
  for (const part of tunic.meshes) part.isVisible = Boolean(part.name?.endsWith('_Peasant_Body'));
  for (const part of hair.meshes) if (part.material?.name?.includes('Hair')) {
    const hairMat = part.material.clone('city-agent-hair');
    hairMat.albedoColor = B.Color3.FromHexString(look.hair); part.material = hairMat;
  }
  if(!detailed)styleFighter(B, scene, { id: avatarId, root: actor, head, mat });
  attachWeapon(B, scene, { avatarId, hand: body.transformNodes.find(node => node.name === (detailed?'weapon_hand_r':'hand_r')),
    offhand: body.transformNodes.find(node => node.name === (detailed?'weapon_hand_l':'hand_l')), root: actor, accent: look.trim });
  const auraColor = { gold: '#f0b90b', violet: '#a983ed', blue: '#66c4e1', rose: '#e694bd' }[aura] || '#f0b90b';
  const auraRing = B.MeshBuilder.CreateTorus('city-agent-aura', { diameter: 1.45, thickness: .03, tessellation: 40 }, scene);
  auraRing.parent = actor; auraRing.position.y = .04; auraRing.material = mat(auraColor, true);
  for (const part of [...body.meshes, ...outfit.meshes, ...tunic.meshes]) if (part.getTotalVertices?.() && part.isVisible) shadows.addShadowCaster(part);
  const groups = new Map();
  for (const group of [...body.animationGroups, ...outfit.animationGroups, ...tunic.animationGroups]) {
    group.stop(); if (!groups.has(group.name)) groups.set(group.name, []); groups.get(group.name).push(group);
  }
  let playing = '';const blendWeights=new Map();
  function play(name) {
    if (playing === name) return;
    for (const clip of groups.get(name) || []) {clip.start(true);clip.setWeightForAllAnimatables(0);}
    playing = name;
  }
  let x = 0, z = 7, near = null, paused = false, disposed = false,nearLanguage='';
  let yaw = 0, pitch = .38, lastMouse = null, cameraDrag = null;
  let cameraDistance=6.3;
  const followAnchor=new B.Vector3(x,1.4,z);
  const wheel=event=>{if(paused||disposed)return;event.preventDefault();cameraDistance=Math.max(3.2,Math.min(12,cameraDistance+Math.sign(event.deltaY)*.6));};
  const stopCameraDrag = () => {
    cameraDrag = null;
    lastMouse = null;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  };
  const pointerDown = event => {
    if (disposed || paused || (event.pointerType === 'mouse' ? event.button !== 2 : event.pointerType !== 'touch')) return;
    event.preventDefault();
    cameraDrag = event.pointerType;
    lastMouse = { x: event.clientX, y: event.clientY };
    if (event.pointerType === 'mouse') Promise.resolve(canvas.requestPointerLock?.()).catch(() => {});
    else canvas.setPointerCapture?.(event.pointerId);
  };
  const pointerLook = event => {
    if (disposed || paused || document.hidden || event.pointerType !== cameraDrag) return;
    const locked = document.pointerLockElement === canvas;
    const dx = locked ? event.movementX : lastMouse ? event.clientX - lastMouse.x : 0;
    const dy = locked ? event.movementY : lastMouse ? event.clientY - lastMouse.y : 0;
    ({ yaw, pitch } = cityOrbit(yaw, pitch, dx, dy));
    lastMouse = { x: event.clientX, y: event.clientY };
  };
  const pointerUp = event => {
    if (event.pointerType === cameraDrag && (cameraDrag !== 'mouse' || event.button === 2)) stopCameraDrag();
  };
  const pointerLockChange = () => {
    if (document.pointerLockElement === canvas && cameraDrag !== 'mouse') document.exitPointerLock();
  };
  const preventContextMenu = event => event.preventDefault();
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('wheel',wheel,{passive:false});
  canvas.addEventListener('contextmenu', preventContextMenu);
  document.addEventListener('pointermove', pointerLook);
  document.addEventListener('pointerup', pointerUp);
  document.addEventListener('pointercancel', stopCameraDrag);
  document.addEventListener('pointerlockchange', pointerLockChange);
  window.addEventListener('blur', stopCameraDrag);
  actor.position.set(x, 0, z);
  const journeyWorld=createJourneyWorld(B,scene);
  const people=createCityPeople(B,scene,shadows);
  let journeyState=null,commissionTarget=null;
  play('Idle_Loop');
  engine.runRenderLoop(() => {
    if (disposed || paused || document.hidden) return;
    const dt = Math.min(.05, engine.getDeltaTime() / 1000);
    const direction = cityDirection(motionX, motionZ, yaw);
    const length = Math.hypot(direction.x, direction.z);
    if(remoteTarget){
      const next=remoteStep(x,z,remoteTarget,dt);x=next.x;z=next.z;
      if(next.moving)actor.rotation.y+=Math.atan2(Math.sin(next.heading-actor.rotation.y),Math.cos(next.heading-actor.rotation.y))*Math.min(1,dt*12);
      play(next.moving?'Jog_Fwd_Loop':'Idle_Loop');
    } else if (length > .1) {
      const nextX = Math.max(-28, Math.min(28, x + direction.x * dt * 5.4));
      const nextZ = Math.max(-28, Math.min(33, z + direction.z * dt * 5.4));
      const clear = (px,pz) => cityWalkable(px,pz)&&sites.every(site=>site.kind!=='home'||Math.hypot(px-site.x,pz-site.z)>4);
      if (clear(nextX, nextZ)) { x = nextX; z = nextZ; }
      else if (clear(nextX, z)) x = nextX;
      else if (clear(x, nextZ)) z = nextZ;
      const facing=Math.atan2(direction.x,direction.z);actor.rotation.y+=Math.atan2(Math.sin(facing-actor.rotation.y),Math.cos(facing-actor.rotation.y))*Math.min(1,dt*12);
      play('Jog_Fwd_Loop');
    } else play('Idle_Loop');
    for(const [name,clips] of groups){const prev=blendWeights.get(name)||0,w=name===playing?Math.min(1,prev+dt*8):Math.max(0,prev-dt*8);blendWeights.set(name,w);for(const clip of clips){clip.setWeightForAllAnimatables(w);if(w===0&&name!==playing)clip.stop();}}
    actor.position.set(x, 0, z);
    auraRing.rotation.y += dt;
    journeyWorld.tick(performance.now());
    people.tick(dt,{x,z});
    const nearest = sites.reduce((best, site) => {
      const distance = Math.hypot(x - site.x, z - site.z);
      return distance < best.distance ? { site, distance } : best;
    }, { site: null, distance: Infinity });
    const next = people.near(x,z) || journeyWorld.near(x,z) || (nearest.distance < 4.3 ? nearest.site : null);
    if (near?.kind !== next?.kind || near?.id !== next?.id || nearLanguage!==document.documentElement.lang) {
      near = next;nearLanguage=document.documentElement.lang;onNearChange(near);
    }
    const horizontal = Math.cos(pitch) * cameraDistance;
    followAnchor.x+=(x-followAnchor.x)*(1-Math.exp(-14*dt));followAnchor.z+=(z-followAnchor.z)*(1-Math.exp(-14*dt));
    camera.position.set(followAnchor.x-direction.forwardX*horizontal,
      Math.max(.4,1.4+Math.sin(pitch)*cameraDistance),followAnchor.z-direction.forwardZ*horizontal);
    camera.setTarget(followAnchor.add(new B.Vector3(direction.forwardX*.7,0,direction.forwardZ*.7)));
    scene.render();
  });
  let motionX = 0, motionZ = 0,remoteTarget=null;
  const resize = () => engine.resize();
  window.addEventListener('resize', resize);
  return {
    position() { return {x,z}; },
    heading() { return yaw; },
    setRemotePosition(value){remoteTarget=value?{x:value.x,z:value.z}:null;motionX=motionZ=0;},
    setPosition(px,pz) { x=px;z=pz;actor.position.set(x,0,z);followAnchor.set(x,1.4,z); },
    setJourney(state) { journeyState=state;journeyWorld.sync(commissionTarget?{...state,focus:commissionTarget}:state); },
    setCommissionTarget(id){commissionTarget=id;if(journeyState)journeyWorld.sync(id?{...journeyState,focus:id}:journeyState);},
    setMotion(dx, dz) { motionX = dx; motionZ = dz; },
    near() { return near; },
    pause(value) { paused = Boolean(value); if (paused) stopCameraDrag(); else engine.resize(); },
    dispose() { disposed = true; stopCameraDrag(); window.removeEventListener('resize', resize);
      window.removeEventListener('blur', stopCameraDrag); canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('contextmenu', preventContextMenu);
      canvas.removeEventListener('wheel',wheel);
      document.removeEventListener('pointermove', pointerLook); document.removeEventListener('pointerup', pointerUp);
      document.removeEventListener('pointercancel', stopCameraDrag); document.removeEventListener('pointerlockchange', pointerLockChange);
      people.dispose();journeyWorld.dispose();scene.dispose(); engine.dispose(); },
  };
}
