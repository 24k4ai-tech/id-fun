// Uses the server's frozen footprint, not the current target position.
export function createAttackTelegraphs(B, scene, glow) {
  const active = new Map();
  function build(attack, friendly) {
    const color = B.Color3.FromHexString(friendly ? '#55d7ff' : '#ff743e');
    let points = [], x = attack.originX, z = attack.originZ, yaw = Math.atan2(attack.dx, attack.dz);
    if (attack.shape === 'circle') {
      x = attack.x; z = attack.z; yaw = 0;
      points = Array.from({ length: 64 }, (_, i) => {
        const a = i / 64 * Math.PI * 2;
        return new B.Vector3(Math.sin(a) * attack.radius, 0, Math.cos(a) * attack.radius);
      });
    } else if (attack.shape === 'lane') {
      const w = attack.width / 2;
      points = [[-w,0],[w,0],[w,attack.length],[-w,attack.length]].map(([a,b]) => new B.Vector3(a,0,b));
    } else {
      points = [B.Vector3.Zero(), ...Array.from({ length: 33 }, (_, i) => {
        const a = -attack.halfAngle + i / 32 * attack.halfAngle * 2;
        return new B.Vector3(Math.sin(a) * attack.radius, 0, Math.cos(a) * attack.radius);
      })];
    }
    const root = new B.TransformNode('attack-footprint', scene);
    root.position.set(x, .065, z); root.rotation.y = yaw;
    const center = points.reduce((v,p) => v.add(p), B.Vector3.Zero()).scale(1 / points.length);
    const data = new B.VertexData();
    data.positions = [center.x,0,center.z,...points.flatMap(p => [p.x,0,p.z])];
    data.indices = points.flatMap((_, i) => [0,i+1,(i+1)%points.length+1]);
    data.normals = Array.from({length: points.length+1}, () => [0,1,0]).flat();
    const fill = new B.Mesh('attack-danger-fill', scene); data.applyToMesh(fill);
    fill.parent = root; fill.isPickable = false;
    const material = new B.StandardMaterial('attack-danger-color', scene);
    material.disableLighting = true; material.emissiveColor = color;
    material.diffuseColor = B.Color3.Black(); material.specularColor = B.Color3.Black();
    material.backFaceCulling = false; material.alpha = .23;
    material.disableDepthWrite = true; fill.material = material;
    const border = B.MeshBuilder.CreateLines('attack-danger-border', { points: [...points,points[0]] }, scene);
    border.parent = root; border.color = color; border.isPickable = false;
    const progress = fill.clone('attack-danger-progress', root);
    progress.material = material.clone('attack-progress-color'); progress.material.alpha = .4;
    progress.position.y = .008;
    for (const mesh of [fill,progress,border]) glow.addExcludedMesh(mesh);
    return { attack, root, material, progress, border,
      dispose() { const pm=progress.material;root.dispose();material.dispose();pm.dispose(); } };
  }
  return {
    update(enemyCast, playerCast, now) {
      const expected = new Set();
      for (const [attack,friendly] of [[enemyCast,false],[playerCast,true]]) {
        if (!attack || now >= attack.impactAt) continue;
        const key = `${friendly}:${attack.id}`; expected.add(key);
        if (!active.has(key)) active.set(key, build(attack,friendly));
        const item = active.get(key);
        const progress = Math.max(0, Math.min(1, (now-attack.castAt)/(attack.impactAt-attack.castAt)));
        item.progress.scaling.set( .08 + progress*.92,1,.08 + progress*.92);
        item.material.alpha = .17 + progress*.13;
        item.border.alpha = .8 + Math.sin(progress * 24)*.2;
      }
      for (const [key,item] of active) if (!expected.has(key)) { item.dispose(); active.delete(key); }
    },
    dispose() { for (const item of active.values()) item.dispose(); active.clear(); },
  };
}
