// The arena is real geometry. Poly Haven CC0 stone maps supply the surface detail.
export function buildTempleStage(B, scene) {
  const materials = new Map();
  const color = hex => B.Color3.FromHexString(hex);
  const skyTexture = new B.DynamicTexture('dusk-sky-gradient', { width: 512, height: 256 }, scene, false);
  const skyContext = skyTexture.getContext();
  const dusk = skyContext.createLinearGradient(0, 0, 0, 256);
  dusk.addColorStop(0, '#20242b');
  dusk.addColorStop(.44, '#56453c');
  dusk.addColorStop(.8, '#ac784e');
  dusk.addColorStop(1, '#dfae67');
  skyContext.fillStyle = dusk;
  skyContext.fillRect(0, 0, 512, 256);
  skyTexture.update();
  const skyMaterial = new B.StandardMaterial('dusk-sky', scene);
  skyMaterial.disableLighting = true;
  skyMaterial.emissiveTexture = skyTexture;
  skyMaterial.backFaceCulling = false;
  const sky = B.MeshBuilder.CreateSphere('dusk-sky', { diameter: 250, segments: 24, sideOrientation: B.Mesh.BACKSIDE }, scene);
  sky.material = skyMaterial;
  sky.infiniteDistance = true;
  sky.isPickable = false;
  sky.applyFog = false;
  const material = (name, hex, metallic = 0, roughness = .82, glow = false) => {
    if (materials.has(name)) return materials.get(name);
    const m = new B.PBRMaterial(name, scene);
    m.albedoColor = color(hex);
    m.metallic = metallic;
    m.roughness = roughness;
    if (glow) m.emissiveColor = color(hex).scale(.75);
    materials.set(name, m);
    return m;
  };
  const stone = material('weathered-stone', '#ddd4bf');
  stone.albedoTexture = new B.Texture('/textures/square_floor-diff.jpg', scene);
  stone.bumpTexture = new B.Texture('/textures/square_floor-nor.jpg', scene);
  stone.bumpTexture.level = .7;
  stone.albedoTexture.uScale = stone.albedoTexture.vScale = 5.5;
  stone.bumpTexture.uScale = stone.bumpTexture.vScale = 5.5;
  const rock = material('rock', '#c4bfb1');
  rock.albedoTexture = new B.Texture('/textures/rock_01-diff.jpg', scene);
  rock.bumpTexture = new B.Texture('/textures/rock_01-nor.jpg', scene);
  rock.bumpTexture.level = .45;
  rock.emissiveColor = color('#5a5e59').scale(.13);
  const darkRock = material('dark-rock', '#4a4136');
  const doorway = material('inner-doorway', '#111b1d');
  const timber = material('temple-timber', '#312b25', .05, .85);
  const bark = material('weathered-bark', '#554b3a');
  const roof = material('temple-roof', '#302b25', .05, .8);
  const leaf = material('deep-olive-leaves', '#465038');
  const leafLight = material('sunlit-leaves', '#827c49');
  const leafGold = material('amber-leaves', '#b08a46');
  const gold = material('brass', '#cda74b', .7, .3);
  const lanternGlow = material('lantern-light', '#ffe5a4', 0, .35, true);
  const templeAnchor = new B.TransformNode('temple-anchor', scene);
  templeAnchor.position.x = 16;
  let templeAssembly = false;
  const create = (type, name, options, x, y, z, mat, rotationY = 0) => {
    const mesh = B.MeshBuilder[type](name, options, scene);
    if (templeAssembly) mesh.parent = templeAnchor;
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotationY;
    mesh.material = mat;
    return mesh;
  };
  const box = (name, w, h, d, x, y, z, mat, rotationY = 0) => create('CreateBox', name, { width: w, height: h, depth: d }, x, y, z, mat, rotationY);
  const ground = create('CreateGround', 'stone-courtyard', { width: 100, height: 100, subdivisions: 1 }, 0, -.035, 0, stone);
  ground.receiveShadows = true;
  // Two recessed gold seams make the fighting area readable without a neon disc.
  for (const z of [-22.5, 22.5]) box('gold-inlay', 47, .015, .025, 0, -.009, z, gold);
  for (const x of [-23.5, 23.5]) box('gold-inlay', .025, .015, 45, x, -.009, 0, gold);
  for (const x of [-16, 0, 16]) for (const z of [-14, 0, 14]) {
    const seal = create('CreateTorus', 'court-rune', { diameter: .54, thickness: .024, tessellation: 24 }, x, .002, z, gold);
  }
  // Stone stairs and a layered temple gate sit behind the opponent.
  templeAssembly = true;
  for (let i = 0; i < 5; i++) box('temple-step', 1.1, .19 + i * .08, 8.4, 11.8 + i * .85, .05 + i * .045, 0, rock);
  for (const z of [-4.05, 4.05]) {
    box('gate-post', .55, 5.2, .55, 16.4, 2.7, z, timber);
    box('gate-post-foot', .9, .35, .9, 16.4, .18, z, rock);
    for (const y of [1.15, 3.8]) box('gate-post-brass-collar', .68, .08, .68, 16.4, y, z, gold);
    box('gate-post-relief', .08, 2.4, .32, 16.07, 2.55, z, darkRock);
  }
  box('gate-crossbeam', 1.05, .44, 10.3, 16.4, 4.9, 0, timber);
  box('gate-frieze', .22, .82, 8.7, 16.8, 4.15, 0, roof);
  for (const z of [-3.3, -2.2, 2.2, 3.3]) box('gate-carved-panel', .06, .4, .12, 16.92, 4.17, z, gold);
  box('gate-rafter', 2.6, .11, 9.5, 16.4, 5.12, 0, timber);
  for (let tier = 0; tier < 3; tier++) {
    const beam = box('tiled-roof', 1.95 - tier * .25, .17, 11.4 - tier * .3, 16.35, 5.42 + tier * .18, 0, roof);
    beam.rotation.z = -.05;
    box('roof-gold-edge', 1.96 - tier * .25, .036, 11.45 - tier * .3, 16.35, 5.33 + tier * .18, 0, gold);
  }
  for (let i = -11; i <= 11; i++) {
    const z = i * .48;
    const lift = Math.pow(Math.abs(i) / 11, 3) * .34;
    const tile = create('CreateCylinder', 'curved-roof-tile', { diameter: .19, height: 2.3, tessellation: 8 }, 16.35, 5.72 + lift, z, i % 3 === 0 ? darkRock : roof);
    tile.rotation.z = Math.PI / 2;
  }
  box('ledger-frame', .12, 1.47, 5.4, 15.77, 4.07, 0, gold);
  const ledger = create('CreatePlane', 'arena-ledger', { width: 5.25, height: 1.33, sideOrientation: B.Mesh.DOUBLESIDE }, 15.68, 4.07, 0, null);
  ledger.rotation.y = Math.PI / 2;
  const ledgerTexture = new B.DynamicTexture('arena-ledger-graphic', { width: 1024, height: 260 }, scene, false);
  const ctx = ledgerTexture.getContext();
  ctx.fillStyle = '#132021'; ctx.fillRect(0, 0, 1024, 260);
  ctx.strokeStyle = '#405048'; ctx.lineWidth = 2;
  for (let x = 375; x < 1024; x += 55) { ctx.beginPath(); ctx.moveTo(x, 25); ctx.lineTo(x, 235); ctx.stroke(); }
  for (let y = 35; y < 250; y += 42) { ctx.beginPath(); ctx.moveTo(365, y); ctx.lineTo(1000, y); ctx.stroke(); }
  ctx.fillStyle = '#e6c976'; ctx.font = '700 61px Georgia, serif'; ctx.fillText('◈', 53, 105);
  ctx.font = '700 36px sans-serif'; ctx.fillText('ID FUN ARENA', 47, 163);
  ctx.font = '18px sans-serif'; ctx.fillStyle = '#a8b6a7'; ctx.fillText('LIVE · FIGHT / EARN WEIGHT', 48, 207);
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) {
    const x = 390 + i * 12.8;
    const y = 207 - i * 2.8 - Math.sin(i * .58) * 19 - Math.sin(i * 1.91) * 7;
    if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#f0b90b'; ctx.lineWidth = 5; ctx.stroke();
  ledgerTexture.update();
  const ledgerMaterial = new B.StandardMaterial('ledger-light', scene);
  ledgerMaterial.diffuseTexture = ledgerTexture;
  ledgerMaterial.emissiveTexture = ledgerTexture;
  ledgerMaterial.emissiveColor = color('#797969');
  ledgerMaterial.backFaceCulling = false;
  ledger.material = ledgerMaterial;
  for (const z of [-7.4, 7.4]) {
    box('court-wall', 1.25, 2.65, 5.6, 15.1, 1.31, z, rock);
    box('wall-cap', 1.55, .2, 5.9, 15.1, 2.75, z, roof);
    box('wall-foundation', 1.45, .25, 5.9, 15.1, .13, z, darkRock);
  }
  // A second roof and closed hall give the entrance real depth instead of a fog void.
  box('inner-hall-wall', .5, 3.4, 9.5, 23.7, 1.7, 0, rock);
  box('inner-hall-shadow', .08, 3.1, 3.3, 21.5, 1.55, 0, doorway);
  for (const z of [-4.3, 4.3]) box('inner-hall-pillar', .54, 3.8, .54, 22.9, 2, z, timber);
  for (let tier = 0; tier < 3; tier++) box('inner-hall-roof', 2.8 - tier * .24, .18, 12 - tier * .32,
    23.1, 4.15 + tier * .17, 0, roof);
  for (const z of [-5.1, 5.1]) box('inner-hall-roof-tip', 2.4, .16, .18, 23.1, 4.8, z, gold);
  for (const z of [-8.6, 8.6]) {
    const coin = create('CreateCylinder', 'arena-token-marker', { diameter: 1.0, height: .13, tessellation: 48 }, 11.2, 1.8, z, gold);
    coin.rotation.z = Math.PI / 2;
    const mark = box('token-diamond', .05, .27, .27, 11.08, 1.8, z, timber, Math.PI / 4);
    mark.rotation.x = Math.PI / 4;
  }
  templeAssembly = false;
  // Lantern silhouettes, old rocks and irregular trees frame the court.
  for (const x of [-7.5, 6.4, 15.4]) for (const z of [-8.3, 8.3]) {
    create('CreateCylinder', 'lantern-foot', { diameterTop: .65, diameterBottom: .9, height: .9, tessellation: 7 }, x, .44, z, rock);
    box('lantern-head', .8, .7, .8, x, 1.25, z, timber);
    for (const side of [-1, 1]) box('lantern-window', .035, .38, .38, x + side * .42, 1.25, z, lanternGlow);
    box('lantern-roof', 1.12, .17, 1.12, x, 1.72, z, roof);
  }
  const treePositions = [[-10,-11],[-13,10],[-3,-13],[0,14],[12,-13],[17,12]];
  const noise = n => {
    const value = Math.sin(n * 127.1 + 78.233) * 43758.5453;
    return value - Math.floor(value);
  };
  for (let i = 0; i < treePositions.length; i++) {
    const [x,z] = treePositions[i];
    const bend = .45 + noise(i + 10) * .7;
    const trunk = B.MeshBuilder.CreateTube('old-tree-trunk', { path: [
      new B.Vector3(x, 0, z), new B.Vector3(x + bend * .3, 2.2, z - .13),
      new B.Vector3(x + bend, 4.6, z + .2), new B.Vector3(x + bend * 1.3, 6.6, z + .5),
    ], radiusFunction: p => .39 - p * .08, tessellation: 8, cap: B.Mesh.CAP_ALL }, scene);
    trunk.material = bark;
    const leafMeshes = [[], [], []];
    for (let j = 0; j < 7; j++) {
      const theta = j * Math.PI * 2 / 7 + i * .71;
      const reach = 1.8 + noise(i * 31 + j * 5) * 1.3;
      const bx = x + bend + Math.cos(theta) * reach, bz = z + Math.sin(theta) * reach;
      const by = 6.25 + noise(i * 23 + j * 7) * 1.25;
      const branch = B.MeshBuilder.CreateTube('old-tree-branch', { path: [
        new B.Vector3(x + bend * .5, 4.25, z),
        new B.Vector3(x + bend + Math.cos(theta) * reach * .48, 5.45, z + Math.sin(theta) * reach * .48),
        new B.Vector3(bx, by, bz),
      ], radius: .11, tessellation: 6, cap: B.Mesh.CAP_ALL }, scene);
      branch.material = bark;
      for (let k = 0; k < 20; k++) {
        const seed = i * 307 + j * 29 + k * 11;
        const angle = k * 2.39996 + noise(seed) * .6;
        const radius = Math.sqrt((k + .3) / 20) * (1.25 + noise(seed + 1) * .4);
        const foliage = B.MeshBuilder.CreateSphere('foliage-detail', { diameter: .39 + noise(seed + 2) * .29, segments: 6 }, scene);
        foliage.position.set(bx + Math.cos(angle) * radius, by + (noise(seed + 3) - .5) * 1.2, bz + Math.sin(angle) * radius);
        foliage.rotation.set(noise(seed + 4) * 2, noise(seed + 5) * 6, noise(seed + 6));
        foliage.scaling.set(1.25, .66 + noise(seed + 7) * .25, 1);
        const shade = (k + j) % 7 === 0 ? 2 : (k + j) % 3 === 0 ? 1 : 0;
        foliage.material = [leaf, leafLight, leafGold][shade];
        foliage.computeWorldMatrix(true);
        leafMeshes[shade].push(foliage);
      }
    }
    leafMeshes.forEach((meshes, shade) => {
      const canopy = B.Mesh.MergeMeshes(meshes, true, true, undefined, false, false);
      if (canopy) canopy.material = [leaf, leafLight, leafGold][shade];
    });
  }
  for (let i = 0; i < 18; i++) {
    const x = 16 + Math.sin(i * 27) * 12, z = Math.cos(i * 13) * 20;
    if (Math.abs(z) < 11 || x < 13) continue;
    const height = 1.4 + i % 3;
    const boulder = create('CreateIcoSphere', 'mossy-boulder', { radius: 1.1 + i % 3 * .3, subdivisions: 1 }, x, height * .32, z, i % 3 ? rock : darkRock);
    boulder.scaling.set(1.2, height * .5, .85);
  }
  for (let i = 0; i < 11; i++) {
    const hill = create('CreateIcoSphere', 'far-ridge', { radius: 7 + i % 4, subdivisions: 2 }, 48 + i % 3 * 4, -3, -52 + i * 10.4, darkRock);
    hill.scaling.set(1, .95 + i % 3 * .3, 1.4);
  }
  return { ground, gold, material };
}
