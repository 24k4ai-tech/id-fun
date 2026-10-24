// Open floor follows server combat bounds. All architecture is outside the camera buffer.
// Scanned props: Poly Haven CC0; see models/ARENA-ASSETS-LICENSE.txt.
export async function buildCitadel(B, scene, shadows) {
  const color=hex=>B.Color3.FromHexString(hex), batches=new Map();
  const material=(name,hex,metallic=0,roughness=.7)=>{
    const m=new B.PBRMaterial(name,scene);m.albedoColor=color(hex);m.metallic=metallic;m.roughness=roughness;return m;
  };
  const stone=material('citadel-basalt','#737b80',.04,.68),trim=material('citadel-limestone','#b2a795',.02,.73);
  const gold=material('aged-bronze','#c9993c',.82,.3),goldLight=material('gold-inlay','#e5bc58',.65,.24);
  const cloth=material('violet-banners','#3e285d',0,.94),light=material('arcane-fire','#ffbf39',.15,.3);
  light.emissiveColor=color('#ffb92b').scale(2);
  for(const m of [stone,trim]) {
    m.albedoTexture=new B.Texture('/textures/rock_01-diff.jpg',scene);
    m.bumpTexture=new B.Texture('/textures/rock_01-nor.jpg',scene);m.bumpTexture.level=.55;
  }
  const floorMat=material('court-stone','#b3b3aa',.08,.42);
  floorMat.albedoTexture=new B.Texture('/textures/square_floor-diff.jpg',scene);
  floorMat.bumpTexture=new B.Texture('/textures/square_floor-nor.jpg',scene);floorMat.bumpTexture.level=.8;
  for(const texture of [floorMat.albedoTexture,floorMat.bumpTexture]) {texture.uScale=texture.vScale=5;texture.anisotropicFilteringLevel=8;}
  const add=(mesh,x,y,z,mat,cast=true)=>{
    mesh.position.set(x,y,z);mesh.material=mat;mesh.isPickable=false;mesh.receiveShadows=true;
    const key=`${mat.name}:${cast}`;
    if(!batches.has(key)) batches.set(key,{mat,cast,meshes:[]});batches.get(key).meshes.push(mesh);return mesh;
  };
  const box=(w,h,d,x,y,z,mat,rot=0)=>{
    const m=add(B.MeshBuilder.CreateBox('masonry',{width:w,height:h,depth:d},scene),x,y,z,mat);m.rotation.y=rot;return m;
  };
  const cylinder=(diameter,height,x,y,z,mat,top=diameter)=>add(B.MeshBuilder.CreateCylinder('column',{diameterBottom:diameter,diameterTop:top,height,tessellation:32},scene),x,y,z,mat);
  const ring=(diameter,thickness,x,y,z,mat)=>add(B.MeshBuilder.CreateTorus('inlay',{diameter,thickness,tessellation:96},scene),x,y,z,mat,false);
  const ground=B.MeshBuilder.CreateGround('combat-floor',{width:82,height:82},scene);ground.material=floorMat;ground.receiveShadows=true;
  for(const diameter of [15,16.3,33,34.2,52]) ring(diameter,.045,0,.012,0,goldLight);
  for(let i=0;i<16;i++) {
    const a=i*Math.PI/8;box(.14,.028,1,Math.sin(a)*16.8,.018,Math.cos(a)*16.8,gold,a);
    box(.5,.025,.5,Math.sin(a)*8,.02,Math.cos(a)*8,goldLight,a+Math.PI/4);
  }
  function pillar(x,z,height=11) {
    box(2.7,.45,2.7,x,.22,z,stone);box(2.25,.24,2.25,x,.56,z,trim);
    cylinder(1.55,.4,x,.85,z,gold,1.3);cylinder(1.18,height-2,x,height/2,z,trim,1.02);
    for(let i=0;i<12;i++) {const a=i*Math.PI/6;cylinder(.09,height-2.25,x+Math.sin(a)*.54,height/2,z+Math.cos(a)*.54,stone);}
    for(const y of [1.22,height-1.1,height-.7]) ring(1.3,.11,x,y,z,gold);
    cylinder(1.6,.42,x,height-.45,z,gold,2);box(2.35,.5,2.35,x,height-.05,z,trim);
  }
  function arch(cx,cz,width,height,angle) {
    const radius=width/2,spring=height-radius,positions=[],indices=[],uvs=[];
    for(let i=0;i<=24;i++) {
      const a=i*Math.PI/24;
      for(const depth of [-.5,.5]) for(const r of [radius,radius+.65]) {
        const lx=Math.cos(a)*r;
        positions.push(cx+lx*Math.cos(angle)-depth*Math.sin(angle),spring+Math.sin(a)*r,cz+lx*Math.sin(angle)+depth*Math.cos(angle));uvs.push(i/8,r===radius?0:1);
      }
      if(i<24) {const q=i*4;for(const [a,b] of [[0,1],[1,3],[3,2],[2,0]]) indices.push(q+a,q+b,q+4+b,q+a,q+4+b,q+4+a);}
    }
    const data=new B.VertexData();data.positions=positions;data.indices=indices;data.uvs=uvs;data.normals=[];
    B.VertexData.ComputeNormals(positions,indices,data.normals);const mesh=new B.Mesh('stone-arch',scene);data.applyToMesh(mesh);add(mesh,0,0,0,trim);
    for(const side of [-1,1]) pillar(cx+side*radius*Math.cos(angle),cz+side*radius*Math.sin(angle),spring+.4);
    box(width+2,.45,1.5,cx,height+1,cz,gold,angle);
  }
  for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]) {
    const cx=Math.sin(angle)*38,cz=Math.cos(angle)*38;arch(cx,cz,13,15,-angle);
    for(const side of [-1,1]) {
      const x=cx+Math.cos(angle)*side*10,z=cz-Math.sin(angle)*side*10;pillar(x,z,18);
      const bx=x-Math.sin(angle)*.8,bz=z-Math.cos(angle)*.8;
      box(2.7,9,.09,bx,11,bz,cloth,-angle);box(2.85,.12,.18,bx,15.5,bz,gold,-angle);
      for(const edge of [-1,1]) box(.08,8.5,.13,bx+Math.cos(angle)*1.2*edge,11,bz-Math.sin(angle)*1.2*edge,gold,-angle);
    }
    // Connecting terraces and a low balustrade anchor the pillars to a continuous building.
    for(const side of [-1,1]) {
      const x=cx+Math.cos(angle)*side*17,z=cz-Math.sin(angle)*side*17;
      box(17,1.1,4,x,.45,z,stone,-angle);
      box(17,.18,4.3,x,1.07,z,gold,-angle);
      box(17,.22,1.2,x,3.5,z,trim,-angle);
      for(let j=-4;j<=4;j++) cylinder(.32,2.3,x+Math.cos(angle)*j*1.8,2.3,z-Math.sin(angle)*j*1.8,trim,.23);
      box(17,.5,3,x,18.5,z,trim,-angle);
      box(17,.12,3.2,x,18.83,z,gold,-angle);
    }
  }
  const statuePositions=[[-29,-29],[29,-29],[-29,29],[29,29]];
  for(const [x,z] of statuePositions) for(let i=0;i<3;i++) box(4.4-i*.5,.45,4.4-i*.5,x,.2+i*.45,z,i===1?gold:stone);
  for(let i=0;i<7;i++) box(15-i*.3,.22,1.2,0,.1+i*.2,30+i*.9,trim);
  cylinder(5.8,1.4,0,2.1,38,stone);add(B.MeshBuilder.CreateSphere('celestial-core',{diameter:2.1,segments:32},scene),0,7.2,38,gold);
  for(const tilt of [0,.8,-.8]) {const r=ring(5,.12,0,7.2,38,goldLight);r.rotation.x=Math.PI/2;r.rotation.z=tilt;}
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4+Math.PI/8,x=Math.sin(a)*34,z=Math.cos(a)*34;
    cylinder(1.5,1.1,x,.55,z,stone,1.05);cylinder(2.2,.45,x,1.25,z,gold,1.6);
    const flame=add(B.MeshBuilder.CreateSphere('brazier-core',{diameter:.55,segments:12},scene),x,1.6,z,light,false);flame.scaling.y=1.7;
  }
  for(const {mat,cast,meshes} of batches.values()) {
    meshes.forEach(m=>m.computeWorldMatrix(true));const merged=B.Mesh.MergeMeshes(meshes,true,true,undefined,false,false);
    if(merged) {merged.material=mat;merged.receiveShadows=true;merged.isPickable=false;if(cast) shadows.addShadowCaster(merged);}
  }
  async function loadProp(file,placements,height) {
    const container=await B.SceneLoader.LoadAssetContainerAsync('/models/',file,scene);
    for(const [i,p] of placements.entries()) {
      const entries=container.instantiateModelsToScene(name=>`${name}-${i}`,false,{doNotInstantiate:false});
      const root=new B.TransformNode(`${file}-${i}`,scene);for(const node of entries.rootNodes) node.parent=root;
      root.computeWorldMatrix(true);const bounds=root.getHierarchyBoundingVectors(true),scale=height/(bounds.max.y-bounds.min.y);
      root.scaling.setAll(scale);root.rotation.y=p[2]||0;root.position.set(p[0],-bounds.min.y*scale+(p[3]||0),p[1]);
      for(const mesh of root.getChildMeshes()) {if(mesh.sourceMesh) mesh.sourceMesh.receiveShadows=true;else mesh.receiveShadows=true;mesh.isPickable=false;shadows.addShadowCaster(mesh);}
    }
  }
  const results=await Promise.allSettled([
    loadProp('gothic_statue.glb',statuePositions.map(([x,z])=>[x,z,Math.atan2(-x,-z),1.35]),6),
    loadProp('rock_face_01.glb',Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return [Math.sin(a)*68,Math.cos(a)*68,a+Math.PI,-8];}),27),
  ]);
  for(const result of results) if(result.status==='rejected') console.warn('Arena prop unavailable',result.reason);
  return {ground,gold,material};
}
