import { weaponFor } from './weapon-config.js';

// Lightweight meshes attach to the existing animated hands, including the
// left hand for paired weapons. Combat collision stays on the server.
export function attachWeapon(B, scene, { avatarId, hand, offhand, root, accent }) {
  const spec = weaponFor(avatarId);
  const gold = material('#ddbd65');
  const steel = material('#a8b7bb');
  const dark = material('#2b3039');
  const glow = material(accent, true);
  const grip = material('#3a2d29');
  function material(hex, emissive = false) {
    const m = new B.PBRMaterial(`${avatarId}-weapon-${hex}-${emissive}`, scene);
    m.albedoColor = B.Color3.FromHexString(hex);
    m.metallic = hex === '#3a2d29' ? 0 : .8;
    m.roughness = hex === '#3a2d29' ? .8 : .3;
    if (emissive) m.emissiveColor = B.Color3.FromHexString(hex).scale(.55);
    return m;
  }
  function part(type, name, options, parent, at, mat, rotation) {
    const item = B.MeshBuilder[type](`${avatarId}-${name}`, options, scene);
    item.parent = parent;
    item.position.set(...at);
    if (rotation) item.rotation.set(...rotation);
    item.material = mat;
    item.isPickable = false;
    return item;
  }
  function mount(node, suffix, mirror = false) {
    const holder = new B.TransformNode(`${avatarId}-${suffix}`, scene);
    holder.parent = node || root;
    holder.rotation.z = mirror ? -Math.PI / 2 : Math.PI / 2;
    return holder;
  }
  function rod(parent, low, high, radius, mat, name = 'grip') {
    return part('CreateCylinder', name, { height: high - low, diameter: radius * 2, tessellation: 10 },
      parent, [0, (low + high) / 2, 0], mat);
  }
  function orb(parent, y, radius, mat, name = 'gem') {
    return part('CreateSphere', name, { diameter: radius * 2, segments: 12 }, parent, [0, y, 0], mat);
  }
  function cross(parent, y, width, mat) {
    part('CreateBox', 'guard', { width, height: .07, depth: .12 }, parent, [0, y, 0], mat);
  }
  function blade(parent, low, high, width = .16, metal = steel) {
    const positions=[],indices=[],normals=[];
    for(const [y,w] of [[low,width*.44],[low+.17,width*.58],[high-.22,width*.32],[high,0]])positions.push(-w,y,0,0,y,-.035,w,y,0,0,y,.035);
    for(let row=0;row<3;row++)for(let side=0;side<4;side++){const a=row*4+side,b=row*4+(side+1)%4;indices.push(a,b,a+4,b,b+4,a+4);}
    const mesh=new B.Mesh(avatarId+'-forged-blade',scene),data=new B.VertexData();data.positions=positions;data.indices=indices;B.VertexData.ComputeNormals(positions,indices,normals);data.normals=normals;data.applyToMesh(mesh);mesh.parent=parent;mesh.material=metal;mesh.isPickable=false;
    part('CreateBox', 'blade-inlay', { width: .012, height: high-low-.4, depth: .008 }, parent,[0,(low+high-.2)/2,-.037],glow);
  }
  const primary = mount(hand, 'weapon');
  switch (spec.kind) {
    case 'gauntlets': {
      for(const node of [primary,mount(offhand,'offhand',true)]){
        part('CreateBox','gauntlet',{width:.17,height:.24,depth:.15},node,[0,.02,0],dark);
        for(let i=0;i<4;i++)part('CreateSphere','knuckle',{diameter:.065,segments:10},node,[-.07+i*.045,.13,-.04],gold);
        part('CreateTorus','bracelet',{diameter:.21,thickness:.024,tessellation:24},node,[0,-.13,0],glow);
      }break;
    }
    case 'sword':
    case 'greatsword': {
      const big = spec.kind === 'greatsword';
      rod(primary, -.4, .16, big ? .068 : .052, grip);
      part('CreatePolyhedron','pommel',{type:1,size:.075},primary,[0,-.4,0],gold);
      for(let y=-.32;y<.14;y+=.07)part('CreateTorus','grip-wrap',{diameter:big?.145:.115,thickness:.014,tessellation:16},primary,[0,y,0],gold);
      cross(primary, .19, big ? .55 : .4, gold);
      blade(primary, .22, big ? 1.6 : 1.25, big ? .24 : .17);
      if (big) part('CreateBox', 'crown', { width: .33, height: .12, depth: .11 }, primary, [0, .39, 0], gold);
      break;
    }
    case 'daggers': {
      for (const [node, suffix, mirror] of [[primary, 'right', false], [offhand ? mount(offhand, 'offhand', true) : null, 'left', true]]) {
        if (!node) continue;
        rod(node, -.27, .12, .045, grip, `${suffix}-grip`);
        cross(node, .13, .23, gold);
        blade(node, .16, .98, .14, mirror ? glow : steel);
      }
      break;
    }
    case 'spear': {
      rod(primary, -.95, 1.12, .045, dark, 'spear-shaft');
      for (const y of [-.82, -.3, .35, .96]) rod(primary, y, y + .07, .064, gold, 'spear-band');
      part('CreateCylinder', 'spear-head', { height: .65, diameterBottom: .22, diameterTop: 0, tessellation: 4 },
        primary, [0, 1.45, 0], steel, [0, Math.PI / 4, 0]);
      orb(primary, 1.1, .09, glow);
      break;
    }
    case 'hammer':
    case 'maul': {
      const wide = spec.kind === 'maul';
      rod(primary, -.55, 1.08, .065, grip, 'hammer-handle');
      rod(primary, -.55, -.44, .085, gold, 'handle-cap');
      part('CreateBox', 'hammer-head', { width: wide ? .83 : .66, height: .36, depth: .38 },
        primary, [0, 1.12, 0], dark);
      for (const x of [wide ? -.45 : -.36, wide ? .45 : .36]) {
        part('CreateBox', 'hammer-face', { width: .1, height: .41, depth: .43 }, primary, [x, 1.12, 0], gold);
      }
      orb(primary, 1.12, .16, glow, 'core');
      break;
    }
    case 'axe': {
      rod(primary, -.65, 1.18, .058, dark, 'axe-handle');
      part('CreateBox', 'axe-spine', { width: .17, height: .55, depth: .18 }, primary, [0, 1.15, 0], gold);
      for (const side of [-1, 1]) {
        part('CreateCylinder', 'axe-edge', { height: .6, diameterBottom: .36, diameterTop: .7, tessellation: 3 },
          primary, [side * .33, 1.15, 0], steel, [0, 0, side * Math.PI / 2]);
      }
      orb(primary, 1.16, .13, glow);
      break;
    }
    case 'sickle': {
      rod(primary, -.7, 1.1, .046, grip, 'sickle-handle');
      part('CreateTorus', 'sickle-hook', { diameter: .95, thickness: .13, tessellation: 26, arc: .57 },
        primary, [.28, 1.28, 0], steel, [Math.PI / 2, 0, .4]);
      orb(primary, 1.1, .12, glow);
      break;
    }
    case 'chakram': {
      part('CreateTorus', 'chakra-ring', { diameter: 1.02, thickness: .13, tessellation: 40 },
        primary, [0, .77, 0], steel, [Math.PI / 2, 0, 0]);
      part('CreateTorus', 'chakra-light', { diameter: .7, thickness: .045, tessellation: 40 },
        primary, [0, .77, -.045], glow, [Math.PI / 2, 0, 0]);
      for (const x of [-.46, .46]) part('CreateBox', 'chakra-blade', { width: .17, height: .35, depth: .1 }, primary,
        [x, .77, 0], gold, [0, 0, x < 0 ? -.45 : .45]);
      rod(primary, -.25, .32, .05, grip);
      break;
    }
    case 'fans': {
      for (const node of [primary, offhand && mount(offhand, 'offhand', true)]) {
        if (!node) continue;
        rod(node, -.17, .32, .05, gold);
        const positions=[0,.16,0],indices=[],normals=[];
        for(let i=0;i<=24;i++){const a=-1.1+i/24*2.2;positions.push(Math.sin(a)*.8,.16+Math.cos(a)*.8,0);if(i)indices.push(0,i,i+1);}
        const silk=new B.Mesh('silk-fan',scene),data=new B.VertexData();data.positions=positions;data.indices=indices;B.VertexData.ComputeNormals(positions,indices,normals);data.normals=normals;data.applyToMesh(silk);silk.parent=node;silk.material=material(accent);silk.material.backFaceCulling=false;silk.material.metallic=.3;
        for(let i=0;i<9;i++){const a=-1.1+i/8*2.2;const rib=B.MeshBuilder.CreateTube('fan-rib',{path:[new B.Vector3(0,.16,-.012),new B.Vector3(Math.sin(a)*.81,.16+Math.cos(a)*.81,-.012)],radius:.009,tessellation:6},scene);rib.parent=node;rib.material=gold;rib.isPickable=false;}
      }
      break;
    }
    case 'scepter': {
      rod(primary, -.77, 1.12, .05, dark, 'scepter-shaft');
      for (const y of [-.6, .3, .97]) rod(primary, y, y + .08, .077, gold, 'scepter-band');
      orb(primary, 1.34, .29, glow, 'ether-core');
      part('CreateTorus', 'ether-halo', { diameter: .78, thickness: .045, tessellation: 32 },
        primary, [0, 1.34, 0], gold, [Math.PI / 2, 0, 0]);
      break;
    }
  }
  return primary;
}
