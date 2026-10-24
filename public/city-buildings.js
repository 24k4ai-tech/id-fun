// Shared detailed pavilion geometry; station positions match the city collision map.
export async function buildCityBuildings(B, scene, shadows, sites) {
  const files = ['market-pavilion-v1.glb', 'observatory-pavilion-v1.glb'];
  const loaded = await Promise.allSettled(files.map(file => B.SceneLoader.LoadAssetContainerAsync('/models/', file, scene)));
  const packs = loaded.filter(item => item.status === 'fulfilled').map(item => item.value);
  if (packs.length !== files.length || scene.isDisposed) {
    for (const pack of packs) pack.dispose();
    throw new Error('City assets unavailable');
  }
  const place = (type, name, x, z, size, yaw = 0) => {
    const instance = packs[type].instantiateModelsToScene(n => `${name}-${n}`, false);
    const root = new B.TransformNode(name, scene);
    const offset = new B.TransformNode(`${name}-origin`, scene);
    offset.parent = root;
    for (const node of instance.rootNodes) node.parent = offset;
    root.computeWorldMatrix(true);
    const bounds = root.getHierarchyBoundingVectors(true);
    const scale = Math.min(size / (bounds.max.x - bounds.min.x), size / (bounds.max.z - bounds.min.z), 6.5 / (bounds.max.y - bounds.min.y));
    offset.position.set(-(bounds.min.x + bounds.max.x) / 2, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2);
    root.scaling.setAll(scale); root.position.set(x, .03, z); root.rotation.y = yaw;
    for (const mesh of root.getChildMeshes()) {
      mesh.receiveShadows = true; mesh.isPickable = false;
      shadows.addShadowCaster(mesh);
    }
    return root;
  };
  for (const [i, site] of sites.slice(0, 4).entries()) place(i === 1 || i === 2 ? 1 : 0, `station-${site.kind}`, site.x, site.z, 5.8, site.z > 0 ? Math.PI : 0);
  for (const x of [-18, 18]) for (let i = 0; i < 4; i++) place(i % 2, `courtyard-${x}-${i}`, x, -17 + i * 11, 4.1, x > 0 ? -Math.PI / 2 : Math.PI / 2);
  scene.onDisposeObservable.addOnce(() => { for (const pack of packs) pack.dispose(); });
}
