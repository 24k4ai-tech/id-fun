import { buildCitadel } from './arena-citadel.js';
import { buildTempleStage } from './arena-stage.js';
import { buildGarden } from './arena-garden.js';
import { styleFighter } from './fighter-identity.js';
import { attachWeapon } from './weapon-model.js';
import { orbitCamera } from './battle-controls.js';
import { followTargetYaw, targetYaw } from './combat-camera.js';
import { createAttackTelegraphs } from './attack-telegraphs.js';
import { loadCharacterAsset } from './character-assets.js';
import { createCombatVfx,HERO_COLORS } from './combat-vfx.js';

let engineLoad;
export function loadEngine() {
  if (window.BABYLON?.GLTFFileLoader) return Promise.resolve(window.BABYLON);
  if (!engineLoad) engineLoad = (async () => {
    for (const src of ['/engine/babylon.js', '/engine/babylonjs.loaders.js']) {
      if (src === '/engine/babylon.js' && window.BABYLON) continue;
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error('3D 引擎加载失败'));
        document.head.append(script);
      });
    }
    window.BABYLON.MeshoptCompression.Configuration={decoder:{url:'/vendor/meshopt-decoder.js'}};
    return window.BABYLON;
  })();
  return engineLoad;
}

export const looks = {
  ember: { sex: 'male', trim: '#ffd347', hair: '#e3a044', style: 'long', suit: '#e6bd58' },
  shadow: { sex: 'female', trim: '#a781ff', hair: '#342055', style: 'buns', suit: '#9c8dae' },
  maker: { sex: 'female', trim: '#6be7b4', hair: '#b8adcb', style: 'simpleparted', suit: '#c1b597' },
  trader: { sex: 'female', trim: '#e7a4ff', hair: '#5a365c', style: 'buzzedfemale', suit: '#c8a5ac' },
  cz: { sex: 'male', trim: '#f7cd4d', hair: '#211d1b', style: 'simpleparted', suit: '#171b20' },
  heyi: { sex: 'female', trim: '#c39aff', hair: '#1d1822', style: 'long', suit: '#51435b' },
  sbf: { sex: 'male', trim: '#9e84f7', hair: '#33251e', style: 'buzzed', suit: '#42455c' },
  musk: { sex: 'male', trim: '#80d9ff', hair: '#514035', style: 'simpleparted', suit: '#242d3d' },
  jensen: { sex: 'male', trim: '#f4d15a', hair: '#5c5854', style: 'simpleparted', suit: '#18191b' },
  vitalik: { sex: 'male', trim: '#ae9bff', hair: '#433a33', style: 'simpleparted', suit: '#252431' },
  trump: { sex: 'male', trim: '#ffce4d', hair: '#d5a84d', style: 'simpleparted', suit: '#1c2538' },
  afeng: { sex:'male',trim:'#ffac53',hair:'#171717',style:'buzzed',suit:'#eeeeee' },
};

export async function createArena(canvas, avatarId, opponentId, aura,playerAppearance=null,opponentAppearance=null) {
  const B = await loadEngine();
  const engine = new B.Engine(canvas, true, { antialias: true, stencil: true });
  engine.setHardwareScalingLevel(window.devicePixelRatio > 1.5 ? 1.15 : 1);
  const scene = new B.Scene(engine);
  const vfx=createCombatVfx(B,scene);
  scene.clearColor = B.Color4.FromHexString('#a9bbc9ff');
  scene.fogMode = B.Scene.FOGMODE_EXP2;
  scene.fogDensity = .0035;
  scene.fogColor = B.Color3.FromHexString('#b5cbd6');
  const environment = new B.HDRCubeTexture('/textures/arena-sky.hdr', scene, 128, false, true, false, true);
  scene.environmentTexture = environment;
  scene.environmentIntensity = 1.05;
  const citadelPreview = new URLSearchParams(window.location.search).get('arena') === 'citadel';
  if (citadelPreview) scene.createDefaultSkybox(environment, true, 800, .18);
  const camera = new B.FreeCamera('combat-camera', new B.Vector3(-7.6, 2.45, -2.2), scene);
  camera.fov = .82;
  camera.minZ = .05;
  camera.setTarget(new B.Vector3(0, 1.1, 0));
  scene.activeCamera = camera;
  const ambient = new B.HemisphericLight('ambient', new B.Vector3(0, 1, 0), scene);
  ambient.intensity = .65;
  ambient.diffuse = B.Color3.FromHexString('#d9e3ee');
  const key = new B.DirectionalLight('gold-key', new B.Vector3(-.5, -1, .35), scene);
  key.position = new B.Vector3(-9, 18, -10);
  key.intensity = 2.2;
  key.diffuse = B.Color3.FromHexString('#fff1d0');
  key.shadowFrustumSize = 86;
  key.shadowMinZ = .1;
  key.shadowMaxZ = 160;
  const rim = new B.PointLight('gold-rim', new B.Vector3(2, 4, 5), scene);
  rim.diffuse = B.Color3.FromHexString('#f0b90b');
  rim.intensity = 1.1;
  const cameraFill = new B.PointLight('fighter-fill', new B.Vector3(-4, 4, -3), scene);
  cameraFill.diffuse = B.Color3.FromHexString('#fff0cf');
  cameraFill.intensity = .7;
  cameraFill.range = 14;
  const shadows = new B.ShadowGenerator(2048, key);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = B.ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias = .0005;
  shadows.normalBias = .025;
  const mats = new Map();
  const mat = (color, emissive = false) => {
    const key = color + emissive;
    if (mats.has(key)) return mats.get(key);
    const material = new B.StandardMaterial(key, scene);
    material.diffuseColor = B.Color3.FromHexString(color);
    material.specularColor = B.Color3.FromHexString('#8573b3');
    if (emissive) material.emissiveColor = B.Color3.FromHexString(color).scale(.68);
    mats.set(key, material);
    return material;
  };
  const mesh = (kind, name, options, parent, position, material) => {
    const item = B.MeshBuilder[kind](name, options, scene);
    item.parent = parent;
    item.position.set(...position);
    item.material = material;
    return item;
  };
  if (citadelPreview) await buildCitadel(B, scene, shadows);
  else if(new URLSearchParams(location.search).get('arena')!=='temple') await buildGarden(B,scene,shadows);
  else {
    const stage = buildTempleStage(B, scene);
    for (const part of scene.meshes) {
      if (part === stage.ground || part.infiniteDistance) continue;
      part.receiveShadows = true;
      shadows.addShadowCaster(part);
    }
  }
  const glow = new B.GlowLayer('neon', scene, { blurKernelSize: 24 });
  glow.intensity = .22;
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure = 1.25;
  scene.imageProcessingConfiguration.contrast = 1.04;
  if (window.innerWidth > 800 && B.DefaultRenderingPipeline) {
    const finish = new B.DefaultRenderingPipeline('arena-finish', true, scene, [camera]);
    finish.fxaaEnabled = true;
    finish.sharpenEnabled = true;
    finish.sharpen.edgeAmount = .22;
    finish.bloomEnabled = true;
    finish.bloomThreshold = .9;
    finish.bloomWeight = .12;
    finish.bloomKernel = 32;
    finish.samples = engine.webGLVersion > 1 ? 4 : 1;

  }

  async function fighter(id, isEnemy) {
    const look = looks[id] || looks.ember;
    const loadModel = file => B.SceneLoader.ImportMeshAsync(null, '/models/', `${file}?v=20261022`, scene, undefined, '.glb');
    const detailed = await loadCharacterAsset(B, scene, id,isEnemy?opponentAppearance:playerAppearance);
    const empty = () => ({meshes:[],animationGroups:[]});
    const [imported, outfit, tunic, hairstyle] = detailed ? [detailed,empty(),empty(),empty()] : await Promise.all([
      loadModel(`fighter-${look.sex}.glb`),
      loadModel(`outfit-${look.sex}.glb`),
      loadModel(`tunic-${look.sex}.glb`),
      B.SceneLoader.ImportMeshAsync(null, '/models/', `hair-${look.style}.glb`, scene),
    ]);
    const root = new B.TransformNode(`fighter-${id}-${isEnemy ? 'enemy' : 'player'}`, scene);
    root.scaling.setAll(1.12);
    imported.meshes[0].parent = root;
    if(outfit.meshes[0])outfit.meshes[0].parent = root;
    if(tunic.meshes[0])tunic.meshes[0].parent = root;
    if(hairstyle.meshes[0])hairstyle.meshes[0].parent = root;
    const head = imported.transformNodes.find(node => node.name === 'Head');
    if (head && hairstyle.meshes[0]) hairstyle.meshes[0].setParent(head);
    for (const part of outfit.meshes) {
      if (part.name?.includes('Head_Hood')) part.isVisible = false;
      if (part.getTotalVertices?.() && part.material?.name?.includes('Ranger')) {
        const material = part.material.clone(`${id}-${part.name}-outfit`);
        const dark = /Legs|Feet/.test(part.name) ? '#202127' : look.suit;
        material.albedoColor = B.Color3.FromHexString(dark);
        material.metallic = .12;
        material.roughness = .78;
        part.material = material;
      }
    }
    for (const part of tunic.meshes) {
      if (!part.getTotalVertices?.()) continue;
      part.isVisible = id === 'sbf' && part.name?.endsWith('_Peasant_Body') || false;
      if (part.isVisible && part.material) {
        const fabric = part.material.clone(`${id}-fabric`);
        fabric.albedoColor = B.Color3.Lerp(B.Color3.FromHexString(look.suit), B.Color3.White(), .38);
        part.material = fabric;
      }
    }
    for (const part of imported.meshes) {
      if (part.name?.includes('Sphere.005_Retopology')) part.isVisible = false;
    }
    for (const part of [...imported.meshes, ...outfit.meshes, ...tunic.meshes]) {
      if (part.getTotalVertices?.() && part.isVisible) shadows.addShadowCaster(part);
    }
    root.position.set(isEnemy ? 1.1 : -1.1, 0, 0);
    const groups = new Map();
    for (const group of [...imported.animationGroups, ...outfit.animationGroups, ...tunic.animationGroups]) {
      group.stop();
      if (!groups.has(group.name)) groups.set(group.name, []);
      groups.get(group.name).push(group);
    }
    for (const part of hairstyle.meshes) {
      if (!part.material?.name?.includes('Hair')) continue;
      const clone = part.material.clone(`${id}-hair`);
      clone.albedoColor = B.Color3.FromHexString(look.hair);
      part.material = clone;
    }
    if(!detailed)styleFighter(B, scene, { id, root, head, mat });
    const auraColor = isEnemy ? look.trim : ({ gold: '#ffd447', violet: '#ad7aff', blue: '#5bd6ff', rose: '#f491c7' }[aura] || '#ffd447');
    const ring = mesh('CreateTorus', `${id}-aura`, { diameter: 1.4, thickness: .019, tessellation: 50 }, root, [0, .022, 0], mat(auraColor, true));
    ring.visibility = .55;
    const hand = imported.transformNodes.find(node => node.name === (detailed ? 'weapon_hand_r' : 'hand_r'));
    const offhand = imported.transformNodes.find(node => node.name === (detailed ? 'weapon_hand_l' : 'hand_l'));
    const weapon = attachWeapon(B, scene, { avatarId: id, hand, offhand, root, accent: look.trim });
    let current = null;
    let lockedUntil = 0;
    const weights = new Map();
    function play(name, duration = 0) {
      const clips = groups.get(name);
      if (!clips || (current === name && duration === 0)) return;
      for (const clip of clips) {const fps=clip.targetedAnimations[0]?.animation.framePerSecond||60;const speed=duration?Math.max(.6,Math.min(3.6,(clip.to-clip.from)/fps/(duration/1000))):1;clip.start(duration === 0,speed,clip.from,clip.to,false);clip.setWeightForAllAnimatables(weights.get(name) || 0);}
      current = name;
      lockedUntil = duration ? performance.now() + duration : 0;
    }
    function blend(dt) {
      for (const [name, clips] of groups) {
        const previous = weights.get(name) || 0;
        const weight = current === name ? Math.min(1, previous + dt * 9) : Math.max(0, previous - dt * 9);
        if (weight === previous) continue;
        weights.set(name, weight);
        for (const clip of clips) { clip.setWeightForAllAnimatables(weight); if (weight === 0) clip.stop(); }
      }
    }
    play('Sword_Idle');
    return { id,root, ring, weapon, play, blend,trail:vfx.weaponTrail(weapon,id),dead:false,get lockedUntil() { return lockedUntil; }, x: root.position.x, z: 0, targetX: root.position.x, targetZ: 0,
      rollFacing: 0, rollFacingUntil: 0 };
  }

  const [player, enemy] = await Promise.all([fighter(avatarId, false), fighter(opponentId, true)]);
  function healthBar(name, color) {
    const flat = (label,hex) => {const m=new B.StandardMaterial(label,scene);m.disableLighting=true;m.emissiveColor=B.Color3.FromHexString(hex);m.diffuseColor=B.Color3.Black();m.specularColor=B.Color3.Black();return m;};
    const back = mesh('CreatePlane', `${name}-health-back`, { width: 1.3, height: .11 }, null,
      [0, 2.4, 0], flat(name+'-hp-frame','#10161a'));
    back.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
    const fill = mesh('CreatePlane', `${name}-health-fill`, { width: 1.23, height: .065 }, back,
      [0, 0, -.012], flat(name+'-hp-color',color));
    glow.addExcludedMesh(back);glow.addExcludedMesh(fill);
    back.isVisible = fill.isVisible = name !== 'player';
    back.isPickable = false; fill.isPickable = false;
    return {
      move(fighter) { back.position.set(fighter.x, 2.4, fighter.z); },
      set(ratio) {
        const remaining = Math.max(.001, Math.min(1, ratio));
        fill.scaling.x = remaining;
        fill.position.x = -(1 - remaining) * .615;
      },
    };
  }
  const playerBar = healthBar('player', '#68cf84');
  const enemyBar = healthBar('enemy', '#f0bd66');
  const chargeRing = mesh('CreateTorus', 'weapon-charge', { diameter: 1.45, thickness: .055, tessellation: 50 }, player.root,
    [0, 1.0, 0], mat('#f5ca57', true));
  chargeRing.rotation.x = Math.PI / 2;
  chargeRing.isVisible = false;
  const telegraphs = createAttackTelegraphs(B, scene, glow);
  const lockMarker = mesh('CreateTorus','enemy-lock-marker',{diameter:.25,thickness:.035,tessellation:32},null,
    [enemy.x,2.66,enemy.z],mat('#fff0b0',true));
  lockMarker.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
  lockMarker.rotation.x = Math.PI / 2;
  lockMarker.isPickable = false;
  let cameraYaw = targetYaw(player, enemy);
  let cameraPitch = .32;
  let cameraDistance = 6.8;
  let targetLocked = true, manualUntil = 0, aimUntil = 0;
  let serverClock = 0, clockReceivedAt = performance.now();
  const timedProjectiles = [];
  const followAnchor = new B.Vector3(player.x,1.02,player.z);
  let lastPointer = null;
  let cameraDrag = null;
  const stopCameraDrag = () => {
    if (cameraDrag) manualUntil = performance.now() + 900;
    cameraDrag = null;
    lastPointer = null;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  };
  const pointerDown = event => {
    if (event.pointerType === 'mouse' && event.button === 1) { event.preventDefault(); toggleLock(); return; }
    if (event.pointerType === 'mouse' ? event.button !== 2 : event.pointerType !== 'touch') return;
    event.preventDefault();
    cameraDrag = event.pointerType;
    lastPointer = { x: event.clientX, y: event.clientY };
    if (event.pointerType === 'mouse') Promise.resolve(canvas.requestPointerLock?.()).catch(() => {});
    else canvas.setPointerCapture?.(event.pointerId);
  };
  const pointerMove = event => {
    if (event.pointerType !== cameraDrag) return;
    const locked = document.pointerLockElement === canvas;
    const dx = locked ? event.movementX : lastPointer ? event.clientX - lastPointer.x : 0;
    const dy = locked ? event.movementY : lastPointer ? event.clientY - lastPointer.y : 0;
    ({ yaw: cameraYaw, pitch: cameraPitch } = orbitCamera(cameraYaw, cameraPitch, dx, dy));
    lastPointer = { x: event.clientX, y: event.clientY };
  };
  const pointerUp = event => {
    if (event.pointerType === cameraDrag && (cameraDrag !== 'mouse' || event.button === 2)) stopCameraDrag();
  };
  const pointerLockChange = () => {
    if (document.pointerLockElement === canvas && cameraDrag !== 'mouse') document.exitPointerLock();
  };
  const wheel = event => {
    event.preventDefault();
    cameraDistance = Math.max(3.2, Math.min(14, cameraDistance + Math.sign(event.deltaY) * .6));
  };
  canvas.addEventListener('pointerdown', pointerDown);
  document.addEventListener('pointermove', pointerMove);
  document.addEventListener('pointerup', pointerUp);
  document.addEventListener('pointercancel', stopCameraDrag);
  document.addEventListener('pointerlockchange', pointerLockChange);
  window.addEventListener('blur', stopCameraDrag);
  canvas.addEventListener('wheel', wheel, { passive: false });
  let charging = false;
  let battle = null;
  let particles = [];
  let shake = 0;
  let disposed = false;
  function toggleLock() {
    targetLocked = !targetLocked;
    manualUntil = 0;
    return targetLocked;
  }
  function showCast(attack, fighter) {
    if (!attack) return;
    const remaining = Math.max(0, attack.impactAt-serverClock);
    if (!remaining) return;
    fighter.root.rotation.y = Math.atan2(attack.dx,attack.dz);
    fighter.aimUntil = performance.now() + remaining;
    fighter.aimYaw = fighter.root.rotation.y;
    const melee = attack.shape === 'cone';
    fighter.play(melee ? (fighter.id==='afeng'?'Punch_Cross':'Sword_Attack') : 'Spell_Simple_Shoot',remaining);
    if (melee) { fighter.trail.swing(remaining); return; }
    const color = HERO_COLORS[fighter.id] || '#f0b90b';
    vfx.seal(attack.originX,attack.originZ,color);
    const orb = vfx.projectile(fighter.id,color);
    timedProjectiles.push({ orb,attack });
  }
  function showImpact(attack, fighterId) {
    if (!attack) return;
    const x = attack.shape === 'circle' ? attack.x : attack.originX + attack.dx*(attack.length || attack.radius*.65);
    const z = attack.shape === 'circle' ? attack.z : attack.originZ + attack.dz*(attack.length || attack.radius*.65);
    burst(x,z,HERO_COLORS[fighterId] || '#ffd376');
  }
  function burst(x, z, color) {
    for (let i = 0; i < 15; i++) {
      const item = mesh('CreateSphere', `hit-${i}-${Math.random()}`, { diameter: .05 + Math.random() * .08, segments: 5 }, null, [x, 1.2 + Math.random() * .5, z], mat(color, true));
      particles.push({ item, born: performance.now(), vx: (Math.random() - .5) * .012, vy: (Math.random() - .1) * .012, vz: (Math.random() - .5) * .012 });
    }
    const slash = mesh('CreateTorus', `weapon-trail-${Math.random()}`, { diameter: 2.3, thickness: .065, tessellation: 48, arc: .43 }, null,
      [x, 1.35, z], mat(color, true));
    slash.rotation.x = Math.PI / 2;
    slash.rotation.z = (Math.random() - .5) * .7;
    particles.push({ item: slash, born: performance.now(), vx: 0, vy: .0007, vz: 0, ttl: 340 });
  }
  function castEffect(command) {
    const color=HERO_COLORS[avatarId]||'#f0b90b';
    vfx.seal(player.x,player.z,color,command==='ultimate'?2.3:1);
    if (command === 'spell') launchSpell(player, enemy, color);
    if (command === 'arc') launchArc(player, enemy, color);
    if (command === 'meteor') launchMeteor(enemy, color);
    if (command === 'skill1') {
      const bolt = mesh('CreateSphere', 'golden-dash', { diameter: .3, segments: 12 }, null,
        [player.x, 1.18, player.z], mat('#f9d36b', true));
      particles.push({ item: bolt, born: performance.now(), vx: (enemy.x - player.x) / 260,
        vy: .0004, vz: (enemy.z - player.z) / 260, ttl: 260 });
    }
    if (command === 'skill2') {
      for (let i = 0; i < 3; i++) {
        const arc = mesh('CreateTorus', 'sweeping-weapon-trail', { diameter: 2.1 + i * .25, thickness: .048, tessellation: 48, arc: .54 }, null,
          [enemy.x, 1.25, enemy.z], mat('#ffdb75', true));
        arc.rotation.x = Math.PI / 2;
        arc.rotation.z = i * .42;
        particles.push({ item: arc, born: performance.now() + i * 40, vx: 0, vy: .0005, vz: 0, ttl: 420 });
      }
    }
    if (command === 'ultimate') {
      const wave = mesh('CreateTorus', 'golden-shockwave', { diameter: 1.2, thickness: .075, tessellation: 72 }, null,
        [enemy.x, .08, enemy.z], mat('#fff0ac', true));
      particles.push({ item: wave, born: performance.now(), vx: 0, vy: 0, vz: 0, ttl: 650, effect: 'wave' });
      burst(enemy.x, enemy.z, '#fff3b0');
    }
  }
  function launchSpell(from, to, color) {
    const duration = Math.min(780, 340 + Math.hypot(to.x - from.x, to.z - from.z) * 20);
    const dx = to.x - from.x, dz = to.z - from.z;
    const bolt = vfx.projectile(from.id||avatarId,color);bolt.position.set(from.x,1.35,from.z);
    const halo = mesh('CreateTorus', 'arcane-bolt-halo', { diameter: .68, thickness: .05, tessellation: 32 }, bolt,
      [0, 0, 0], mat(color, true));
    halo.rotation.x = Math.PI / 2;
    particles.push({ item: bolt, born: performance.now(), vx: dx / duration, vy: 0,
      vz: dz / duration, ttl: duration, effect: 'projectile' });
    const impact={x:to.x,z:to.z};setTimeout(() => { if (!disposed) burst(impact.x, impact.z, color); }, duration);
  }
  function launchArc(from, to, color) {
    for (const offset of [-.45, 0, .45])
      launchSpell({ id:from.id,x: from.x, z: from.z + offset }, { x: to.x, z: to.z + offset * .3 }, color);
    const ring = mesh('CreateTorus', 'arc-impact', { diameter: 2.6, thickness: .085, tessellation: 48 }, null,
      [to.x, .08, to.z], mat(color, true));
    particles.push({ item: ring, born: performance.now(), vx: 0, vy: 0, vz: 0, ttl: 640, effect: 'wave' });
  }
  function launchMeteor(to, color) {
    const orb = mesh('CreateSphere', 'meteor-orb', { diameter: 1.05, segments: 16 }, null,
      [to.x, 8.5, to.z], mat(color, true));
    particles.push({ item: orb, born: performance.now(), vx: 0, vy: -7 / 520, vz: 0, ttl: 520, effect: 'meteor' });
    const ring = mesh('CreateTorus', 'meteor-target', { diameter: 2.4, thickness: .08, tessellation: 48 }, null,
      [to.x, .05, to.z], mat('#ffefb0', true));
    particles.push({ item: ring, born: performance.now(), vx: 0, vy: 0, vz: 0, ttl: 700, effect: 'wave' });
    setTimeout(() => { if (!disposed) burst(to.x, to.z, color); }, 520);
  }
  function updateFighter(f, other, now, dt, isPlayer) {
    const dx = f.targetX - f.x, dz = f.targetZ - f.z;
    const gap = Math.hypot(dx, dz);
    const step = Math.min(gap, dt * 7.2);
    if (gap > .001) { f.x += dx / gap * step; f.z += dz / gap * step; }
    f.root.position.set(f.x, 0, f.z);
    const yaw = now < f.rollFacingUntil ? f.rollFacing : now < (f.aimUntil || 0) ? f.aimYaw
      : gap > .035 ? Math.atan2(dx, dz)
      : isPlayer && !targetLocked ? f.root.rotation.y : Math.atan2(other.x - f.x, other.z - f.z);
    f.root.rotation.y += Math.atan2(Math.sin(yaw - f.root.rotation.y), Math.cos(yaw - f.root.rotation.y)) * Math.min(1, dt * 12);
    if (!f.dead&&now > f.lockedUntil) f.play(gap > .055 ? 'Jog_Fwd_Loop' : 'Sword_Idle');
    f.blend(dt);
    f.trail.update(now);
    f.ring.rotation.y += dt * 1.3;
  }
  engine.runRenderLoop(() => {
    if (disposed) return;
    const now = performance.now();
    const dt = Math.min(.05, engine.getDeltaTime() / 1000);
    updateFighter(player, enemy, now, dt, true);
    updateFighter(enemy, player, now, dt, false);
    playerBar.move(player); enemyBar.move(enemy);
    chargeRing.isVisible = charging;
    const serverNow = serverClock + now - clockReceivedAt;
    telegraphs.update(battle?.status === 'active' ? battle.enemyCast : null,
      battle?.status === 'active' ? battle.playerCast : null, serverNow);
    for (let i=timedProjectiles.length-1;i>=0;i--) {
      const {orb,attack} = timedProjectiles[i];
      if (serverNow >= attack.impactAt || battle?.status !== 'active') {orb.dispose();timedProjectiles.splice(i,1);continue;}
      const t = Math.max(0, Math.min(1,(serverNow-attack.castAt)/(attack.impactAt-attack.castAt)));
      const travel = Math.max(0,(t-.3)/.7);
      const tx = attack.shape==='circle'?attack.x:attack.originX+attack.dx*attack.length;
      const tz = attack.shape==='circle'?attack.z:attack.originZ+attack.dz*attack.length;
      if (attack.kind==='meteor') orb.position.set(tx,1+(1-travel)*7,tz);
      else orb.position.set(attack.originX+(tx-attack.originX)*travel,1.1+Math.sin(travel*Math.PI)*.45,
        attack.originZ+(tz-attack.originZ)*travel);
    }
    if ((targetLocked || now < aimUntil) && !cameraDrag && now > manualUntil && battle?.status === 'active')
      cameraYaw = followTargetYaw(cameraYaw,player,enemy,dt);
    lockMarker.isVisible = targetLocked && battle?.status === 'active';
    lockMarker.position.set(enemy.x,2.68,enemy.z);
    if (charging) {
      chargeRing.rotation.z += dt * 4;
      chargeRing.scaling.setAll(1 + Math.sin(now * .014) * .1);
    }
    const forwardX = Math.sin(cameraYaw), forwardZ = Math.cos(cameraYaw);
    const horizontal = Math.cos(cameraPitch) * cameraDistance;
    // Smooth only the follow pivot. Interpolating the camera's orbit position
    // while moving its target immediately made mouse turns drift sideways.
    followAnchor.x += (player.x-followAnchor.x)*(1-Math.exp(-14*dt));
    followAnchor.z += (player.z-followAnchor.z)*(1-Math.exp(-14*dt));
    const pivot = followAnchor;
    const target = pivot.add(new B.Vector3(forwardX*.7,0,forwardZ*.7));
    camera.position.set(pivot.x-forwardX*horizontal,
      Math.max(.4,pivot.y+Math.sin(cameraPitch)*cameraDistance),pivot.z-forwardZ*horizontal);
    cameraFill.position.copyFrom(camera.position);
    if (shake > .002) {
      camera.position.x += (Math.random() - .5) * shake;
      camera.position.y += (Math.random() - .5) * shake * .4;
      shake *= Math.max(0, 1 - dt * 8);
    }
    camera.setTarget(target);
    particles = particles.filter(part => {
      const age = now - part.born;
      const ttl = part.ttl || 500;
      if (age > ttl) { part.item.dispose(); return false; }
      part.item.position.x += part.vx * engine.getDeltaTime();
      part.item.position.y += part.vy * engine.getDeltaTime();
      part.item.position.z += part.vz * engine.getDeltaTime();
      if (part.effect === 'wave') {
        part.item.scaling.setAll(1 + age / ttl * 3.2);
        part.item.visibility = Math.max(0, 1 - age / ttl);
      } else if (part.effect === 'projectile') {
        part.item.position.y = 1.35 + Math.sin(age / ttl * Math.PI) * .65;
        part.item.scaling.setAll(.65 + Math.sin(age * .06) * .13);
      } else if (part.effect === 'meteor') {
        part.item.scaling.setAll(1 + Math.sin(age * .025) * .14);
      } else part.item.scaling.setAll(Math.max(.05, 1 - age / ttl));
      return true;
    });
    scene.render();
  });
  const onResize = () => engine.resize();
  window.addEventListener('resize', onResize);
  return {
    cameraYaw() { return cameraYaw; },
    movementYaw() {
      return targetLocked && !cameraDrag && performance.now() > manualUntil
        ? targetYaw({x:player.targetX,z:player.targetZ},{x:enemy.targetX,z:enemy.targetZ},cameraYaw) : cameraYaw;
    },
    toggleLock,
    isTargetLocked() { return targetLocked; },
    serverNow() { return serverClock + performance.now() - clockReceivedAt; },
    aimMelee() {
      aimUntil = performance.now()+650;
      player.aimUntil = aimUntil;
      player.aimYaw = targetYaw(player,enemy,cameraYaw);
      player.root.rotation.y = player.aimYaw;
    },
    targetBearing() {
      const angle = Math.atan2(Math.sin(Math.atan2(enemy.x - player.x, enemy.z - player.z) - cameraYaw),
        Math.cos(Math.atan2(enemy.x - player.x, enemy.z - player.z) - cameraYaw));
      return { distance: Math.hypot(enemy.x - player.x, enemy.z - player.z),
        arrow: Math.abs(angle) < .55 ? '↑' : Math.abs(angle) > 2.65 ? '↓' : angle > 0 ? '→' : '←' };
    },
    setCharging(value) { charging = Boolean(value); },
    sync(next, command = null) {
      const action=next.playerCommand;
      if(action?.at){
        const fresh=action.at!==battle?.playerCommand?.at&&next.serverNow-action.at<2000;
        if(!fresh)command=null;
        else if(!command&&(next.mode!=='pvp'||['dodge','heal','charge'].includes(action.kind)))command=action.kind;
      }
      if(Number.isFinite(next.chargeStartedAt))charging=next.status==='active'&&next.chargeStartedAt>0;
      serverClock = next.serverNow || Date.now(); clockReceivedAt = performance.now();
      if (!battle) {
        player.x=player.targetX=next.playerX;player.z=player.targetZ=next.playerZ;
        enemy.x=enemy.targetX=next.enemyX;enemy.z=enemy.targetZ=next.enemyZ;
        cameraYaw=targetYaw(player,enemy,cameraYaw);
        followAnchor.set(player.x,1.02,player.z);
      }
      playerBar.set(next.playerHp / 100);
      enemyBar.set(next.enemyHp / (next.enemyMaxHp || 100));
      if (next.enemyCast?.id && next.enemyCast.id !== battle?.enemyCast?.id) showCast(next.enemyCast,enemy);
      if (next.playerCast?.id && next.playerCast.id !== battle?.playerCast?.id) showCast(next.playerCast,player);
      if (next.enemyAction?.at && next.enemyAction.at !== battle?.enemyAction?.at) showImpact(next.enemyAction,opponentId);
      if (next.playerAction?.at && next.playerAction.at !== battle?.playerAction?.at) showImpact(next.playerAction,avatarId);
      if (battle && next.playerHp < battle.playerHp) {
        player.play('Hit_Chest', 520);
        if (!['spell', 'arc'].includes(next.enemyAction?.kind)) burst(player.x, player.z, '#ffda6a');
        shake = .18;
      }
      if (battle && next.enemyHp < battle.enemyHp) { enemy.play('Hit_Chest', 520); burst(enemy.x, enemy.z, command === 'ultimate' ? '#fff3af' : (looks[avatarId] || looks.ember).trim); }
      if (['strike', 'heavy', 'spell', 'arc', 'meteor', 'skill1', 'skill2', 'ultimate'].includes(command))
        { player.aimYaw = Math.atan2(enemy.x - player.x, enemy.z - player.z);player.aimUntil=performance.now()+480;player.root.rotation.y=player.aimYaw; }
      if (command === 'strike') {player.play(avatarId==='afeng'?'Punch_Jab':'Sword_Attack',480);player.trail.swing(480);}
      if (command === 'heavy') { player.play(avatarId==='afeng'?'Punch_Cross':'Sword_Attack',780);player.trail.swing(780);shake = .2; }
      if (['spell', 'arc', 'meteor', 'skill1', 'skill2', 'ultimate', 'special'].includes(command)) {
        player.play(command === 'skill2' ? 'Sword_Attack' : 'Spell_Simple_Shoot', 850);
        if (next.mode !== 'pvp') castEffect(command);
        if (!['spell', 'arc', 'meteor'].includes(command)) burst(enemy.x, enemy.z, command === 'ultimate' ? '#fff3a2' : '#e5bf59');
        shake = command === 'ultimate' ? .38 : .23;
      }
      if (command === 'heal') burst(player.x, player.z, '#9fe8ad');
      if (command === 'dodge') {
        const moveX = next.playerX - (battle?.playerX ?? player.targetX);
        const moveZ = next.playerZ - (battle?.playerZ ?? player.targetZ);
        if (Math.hypot(moveX, moveZ) > .05) {
          player.rollFacing = Math.atan2(moveX, moveZ);
          player.rollFacingUntil = performance.now() + 650;
        }
        player.play('Roll', 740);
      }
      if (Number.isFinite(next.playerX)) player.targetX = next.playerX;
      if (Number.isFinite(next.playerZ)) player.targetZ = next.playerZ;
      if (Number.isFinite(next.enemyX)) enemy.targetX = next.enemyX;
      if (Number.isFinite(next.enemyZ)) enemy.targetZ = next.enemyZ;
      if (battle?.status === 'active' && next.status !== 'active') {const loser=next.status==='won'?enemy:player;loser.dead=true;loser.play('Death01',1400);}
      battle = next;
    },
    dispose() {
      disposed = true;
      stopCameraDrag();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('blur', stopCameraDrag);
      canvas.removeEventListener('pointerdown', pointerDown);
      document.removeEventListener('pointermove', pointerMove);
      document.removeEventListener('pointerup', pointerUp);
      document.removeEventListener('pointercancel', stopCameraDrag);
      document.removeEventListener('pointerlockchange', pointerLockChange);
      canvas.removeEventListener('wheel', wheel);
      telegraphs.dispose();
      scene.dispose(); engine.dispose();
    },
  };
}
