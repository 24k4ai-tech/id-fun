// Small meshes follow the animated head bone. The shared base models and
// combat skeleton stay intact while each fighter gets a distinct silhouette.
export function styleFighter(B, scene, { id, root, head, mat }) {
  if (!head) return;
  const specs = {
    cz: { width: 1.05, height: 1, depth: 1 },
    heyi: { width: .94, height: 1.03, depth: .96 },
    sbf: { width: 1.06, height: .97, depth: 1.02 },
    musk: { width: 1.02, height: 1, depth: 1 },
    jensen: { width: 1.02, height: .99, depth: 1 },
    vitalik: { width: .87, height: 1.07, depth: .94 },
    trump: { width: 1.08, height: .97, depth: 1.03 },
  };
  const shape = specs[id];
  if (shape) head.scaling.set(shape.width, shape.height, shape.depth);
  const coats = {
    cz: '#181b22', heyi: '#292139', sbf: '#45455d', musk: '#222b3b',
    jensen: '#191a1e', vitalik: '#252431', trump: '#1b2740',
  };
  if (coats[id]) {
    const torso = B.MeshBuilder.CreateCylinder(`${id}-tailored-torso`,
      { height: .55, diameterTop: .48, diameterBottom: .4, tessellation: 16 }, scene);
    torso.parent = root;
    torso.position.set(0, .84, .015);
    torso.material = mat(coats[id]);
    torso.isPickable = false;
  }
  const box = (name, parent, width, height, depth, position, color) => {
    const item = B.MeshBuilder.CreateBox(`${id}-${name}`, { width, height, depth }, scene);
    item.parent = parent;
    item.position.set(position[0], position[1] - (parent === root ? .47 : 0),
      position[2] - (parent === root ? .1 : 0));
    item.material = mat(color);
    return item;
  };
  const jacket = (color, trim, { wide = false, open = true } = {}) => {
    const spread = wide ? .28 : .22;
    for (const side of [-1, 1]) {
      const collar = box(`collar-${side}`, root, .12, .24, .10, [side * spread, 1.57, .29], color);
      collar.rotation.z = -side * .28;
      const lapel = box(`lapel-${side}`, root, .105, .38, .065, [side * (open ? .17 : .12), 1.37, .36], trim);
      lapel.rotation.z = side * .17;
    }
  };
  const chest = (name, width, height, position, color) => box(name, root, width, height, .045, position, color);
  const sphere = (name, position, diameter, color) => {
    const item = B.MeshBuilder.CreateSphere(`${id}-${name}`, { diameter, segments: 10 }, scene);
    item.parent = head;
    item.position.set(...position);
    item.material = mat(color);
    item.material.specularColor = B.Color3.Black();
    return item;
  };
  const glasses = (color, width = .17) => {
    const h = .105, y = .155, z = .235, center = .105;
    for (const side of [-1, 1]) {
      const x = side * center;
      box('glasses-top', head, width, .014, .015, [x, y + h / 2, z], color);
      box('glasses-bottom', head, width, .014, .015, [x, y - h / 2, z], color);
      box('glasses-outer', head, .014, h, .015, [x + side * width / 2, y, z], color);
      box('glasses-inner', head, .014, h, .015, [x - side * width / 2, y, z], color);
    }
    box('glasses-bridge', head, .052, .014, .017, [0, y + .015, z], color);
  };

  if (id === 'cz') {
    glasses('#393738');
    jacket('#1b1b1d', '#c69529');
    chest('gold-shirt', .18, .34, [0, 1.33, .37], '#111316');
    chest('jacket-zip', .025, .39, [.09, 1.32, .408], '#e3b334');
  }
  if (id === 'jensen') {
    glasses('#595957', .16);
    jacket('#17191d', '#53565b', { wide: true });
    chest('leather-zip', .018, .43, [.025, 1.3, .405], '#b7ae9c');
    for (const side of [-1, 1]) chest(`leather-pocket-${side}`, .14, .027, [side * .24, 1.16, .345], '#817e78');
  }
  if (id === 'heyi') {
    jacket('#27212f', '#b394db', { wide: true });
    chest('violet-panel', .18, .37, [0, 1.33, .405], '#31233e');
    for (const side of [-1, 1]) {
      sphere('gold-earring', [side * .235, .015, .035], .045, '#d9aa51');
    }
  }
  if (id === 'sbf') {
    jacket('#3f4158', '#686b83', { wide: true, open: false });
    chest('hoodie-shirt', .23, .42, [0, 1.31, .408], '#8e8b8e');
    const curls = [[-.18,.23,.1],[-.12,.29,.13],[-.05,.32,.16],[.03,.30,.16],[.12,.28,.12],[.19,.23,.07],[-.17,.19,.18],[-.08,.23,.24],[.02,.24,.24],[.11,.21,.22],[.2,.15,.15]];
    curls.forEach((point, index) => sphere(`curl-${index}`, point, index % 3 ? .09 : .11, index % 2 ? '#33241f' : '#49352a'));
  }
  if (id === 'musk') {
    jacket('#242b36', '#667f8e', { wide: true });
    chest('armor-shirt', .26, .37, [0, 1.34, .39], '#141a24');
    const core = B.MeshBuilder.CreateTorus(`${id}-blue-core`, { diameter: .23, thickness: .035, tessellation: 24 }, scene);
    core.parent = root;
    core.position.set(0, .96, .34);
    core.rotation.x = Math.PI / 2;
    core.material = mat('#75c9e8', true);
    const fringe = sphere('side-fringe', [.16, .225, .16], .17, '#514035');
    fringe.scaling.set(1.2, .45, .7);
  }
  if (id === 'vitalik') {
    jacket('#22212c', '#5d4c79', { open: false });
    chest('dark-shirt', .18, .4, [0, 1.32, .4], '#1c1b24');
    const fringe = sphere('loose-fringe', [-.12, .26, .19], .16, '#433a33');
    fringe.scaling.set(.8, .6, .65);
  }
  if (id === 'trump') {
    jacket('#1a2337', '#b4ad9c', { wide: true });
    chest('white-shirt', .16, .41, [0, 1.32, .4], '#ece7d8');
    box('red-tie-knot', root, .11, .07, .035, [0, 1.31, .4], '#ac3030');
    const tie = B.MeshBuilder.CreateCylinder(`${id}-red-tie`, { height: .3, diameterTop: .08, diameterBottom: .025, tessellation: 5 }, scene);
    tie.parent = root;
    tie.position.set(0, .66, .3);
    tie.material = mat('#aa2b2a');
    const wave = sphere('blond-wave', [.12, .27, .19], .22, '#e6bd65');
    wave.scaling.set(1.3, .43, .7);
  }
}
