import {buildVegetation} from './vegetation.js';
// A broad, readable fighting clearing inside a layered autumn landscape.
// All decoration inside the server bounds is low grass: no invisible obstacles.
export async function buildGarden(B,scene,shadows,{hub=false}={}) {
  const C=hex=>B.Color3.FromHexString(hex),v=(x,y,z)=>new B.Vector3(x,y,z);
  let seed=73431;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const mat=(name,hex,metal=0,rough=.9)=>{const m=new B.PBRMaterial(name,scene);m.albedoColor=C(hex);m.metallic=metal;m.roughness=rough;return m;};
  const stone=mat('garden-stone','#b5bcac'),gold=mat('garden-gold','#e5b83a',.75,.32),bark=mat('garden-bark','#57432d');
  const hill=(x,z)=>{const edge=Math.max(0,Math.hypot(x/1.05,z)-34);return Math.min(1,edge/22)*(1+Math.sin(x*.06)*Math.cos(z*.05)*1.3)+Math.max(0,edge-55)*.07;};
  const terrain=B.MeshBuilder.CreateGround('garden-terrain',{width:260,height:260,subdivisions:120,updatable:true},scene);
  const positions=terrain.getVerticesData(B.VertexBuffer.PositionKind),normals=terrain.getVerticesData(B.VertexBuffer.NormalKind),colors=[];
  for(let i=0;i<positions.length;i+=3){const x=positions[i],z=positions[i+2];positions[i+1]=hill(x,z)-.055;const n=.5+.2*Math.sin(x*.31)*Math.cos(z*.24)+random()*.15;const c=B.Color3.Lerp(C('#9eac87'),C('#c8cba1'),n);colors.push(c.r,c.g,c.b,1);}
  B.VertexData.ComputeNormals(positions,terrain.getIndices(),normals);terrain.updateVerticesData(B.VertexBuffer.PositionKind,positions);terrain.updateVerticesData(B.VertexBuffer.NormalKind,normals);terrain.setVerticesData(B.VertexBuffer.ColorKind,colors);
  const earth=new B.StandardMaterial('garden-earth',scene);earth.diffuseColor=C('#b9c4ad');earth.diffuseTexture=new B.Texture('/textures/grass_ground-diff.jpg',scene);earth.diffuseTexture.uScale=earth.diffuseTexture.vScale=42;earth.specularColor=B.Color3.Black();earth.emissiveColor=C('#324927').scale(.15);earth.bumpTexture=new B.Texture('/textures/grass_ground-nor_gl.jpg',scene);earth.bumpTexture.uScale=earth.bumpTexture.vScale=42;earth.bumpTexture.level=.12;terrain.material=earth;terrain.receiveShadows=true;
  const sky=scene.createDefaultSkybox(scene.environmentTexture,true,900,0);sky.isPickable=false;sky.applyFog=false;
  if(!hub){
  const court=B.MeshBuilder.CreateDisc('garden-sun-court',{radius:7.3,tessellation:96,sideOrientation:B.Mesh.DOUBLESIDE},scene);court.rotation.x=Math.PI/2;court.position.y=.005;court.material=stone;court.receiveShadows=true;
  stone.albedoTexture=new B.Texture('/textures/square_floor-diff.jpg',scene);stone.albedoTexture.uScale=stone.albedoTexture.vScale=3;
  stone.bumpTexture=new B.Texture('/textures/square_floor-nor.jpg',scene);stone.bumpTexture.uScale=stone.bumpTexture.vScale=3;stone.bumpTexture.level=.45;
  for(const radius of [6.4,7.1]){const ring=B.MeshBuilder.CreateTorus('garden-seal',{diameter:radius*2,thickness:.035,tessellation:100},scene);ring.position.y=.025;ring.material=gold;ring.isPickable=false;}
  }
  await buildVegetation(B,scene,shadows,{hill,random,hub});
  async function prop(file,height,x,z,rotation=0){const asset=await B.SceneLoader.LoadAssetContainerAsync('/models/',file,scene);asset.addAllToScene();const root=new B.TransformNode(file,scene);for(const n of asset.rootNodes)n.parent=root;root.computeWorldMatrix(true);const b=root.getHierarchyBoundingVectors(true),s=height/(b.max.y-b.min.y);root.scaling.setAll(s);root.position.set(x,hill(x,z)-b.min.y*s,z);root.rotation.y=rotation;for(const m of root.getChildMeshes()){m.isPickable=false;m.receiveShadows=true;shadows.addShadowCaster(m);}return root;}
  await Promise.allSettled([prop('garden-gate-v1.glb',hub?8:12,0,hub?-16:34,Math.PI),prop('rock_face_01.glb',10,-34,12,1.8),prop('rock_face_01.glb',8,32,-16,.5)]);
  return {ground:terrain,gold,material:mat,sky};
}
