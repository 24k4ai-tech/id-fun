// CC0 vegetation; shared geometry keeps the meadow and tree line inexpensive.
export async function buildVegetation(B,scene,shadows,{hill,random,hub=false}){
 const v=(x,y,z)=>new B.Vector3(x,y,z);
 const trees=await B.SceneLoader.ImportMeshAsync(null,'/models/','jacaranda-tree-v1.glb',scene);
 const treeMeshes=trees.meshes.filter(m=>m.getTotalVertices()>0);
 for(const m of treeMeshes)m.computeWorldMatrix(true);
 let minY=Infinity,maxY=-Infinity;for(const m of treeMeshes){const b=m.getBoundingInfo().boundingBox;minY=Math.min(minY,b.minimumWorld.y);maxY=Math.max(maxY,b.maximumWorld.y);}
 const matrices=[];
 for(let i=0;i<30;i++){const a=(i/30)*Math.PI*2+random()*.12,r=33+random()*45,x=Math.sin(a)*r,z=Math.cos(a)*r;if(Math.abs(x)<10&&z>0)continue;const s=(10+random()*9)/(maxY-minY);const matrix=B.Matrix.Compose(v(s,s,s),B.Quaternion.RotationYawPitchRoll(random()*6.28,0,0),v(x,hill(x,z)-minY*s,z));matrices.push(...matrix.m);}
 for(const mesh of treeMeshes){mesh.bakeTransformIntoVertices(mesh.computeWorldMatrix(true));mesh.parent=null;mesh.position.setAll(0);mesh.rotationQuaternion=null;mesh.rotation.setAll(0);mesh.scaling.setAll(1);mesh.thinInstanceSetBuffer('matrix',new Float32Array(matrices),16,true);mesh.isPickable=false;mesh.receiveShadows=true;shadows.addShadowCaster(mesh);if(mesh.material){mesh.material.metallic=0;mesh.material.roughness=.94;mesh.material.twoSidedLighting=true;if(mesh.material.name.includes('leaves')){mesh.material.emissiveTexture=mesh.material.albedoTexture;mesh.material.albedoColor=new B.Color3(1.8,1.3,.38);mesh.material.emissiveColor=new B.Color3(.25,.17,.04);}}}
 const grass=await B.SceneLoader.ImportMeshAsync(null,'/models/','grass_medium_01.glb',scene);
 for(const mesh of grass.meshes){if(!mesh.getTotalVertices?.())continue;if(!/tiny_[abcdef]/.test(mesh.name)){mesh.dispose();continue;}mesh.parent=null;mesh.position.setAll(0);mesh.rotationQuaternion=null;mesh.rotation.setAll(0);mesh.scaling.setAll(1);
  const placements=[];for(let i=0;i<5000;i++){const x=(random()-.5)*105,z=(random()-.5)*105,r=Math.hypot(x,z);if(r<(hub?29:7.4)||Math.abs(x)<2.8&&z>7&&z<34)continue;const s=4+random()*4;placements.push(...B.Matrix.Compose(v(s,s,s),B.Quaternion.RotationYawPitchRoll(random()*6.28,0,0),v(x,hill(x,z)-.04,z)).m);}
  mesh.thinInstanceSetBuffer('matrix',new Float32Array(placements),16,true);mesh.isPickable=false;mesh.receiveShadows=true;if(mesh.material){mesh.material.metallic=0;mesh.material.roughness=1;mesh.material.twoSidedLighting=true;mesh.material.emissiveTexture=mesh.material.albedoTexture;mesh.material.emissiveColor=new B.Color3(.25,.25,.25);mesh.material.backFaceCulling=false;}}

 // Clusters of geometric flowers provide readable color without alpha-card noise.
 for(const [index,color] of ['#f6cc52','#e8dfea','#a48bc2','#db8d9f'].entries()){
 const mat=new B.StandardMaterial('meadow-flower-'+index,scene);mat.diffuseColor=B.Color3.FromHexString(color);mat.emissiveColor=mat.diffuseColor.scale(.16);mat.specularColor=B.Color3.Black();const parts=[];
 for(let i=0;i<5;i++){const a=i*Math.PI*2/5,p=B.MeshBuilder.CreateSphere('petal',{diameter:.09,segments:6},scene);p.scaling.y=.32;p.position.set(Math.sin(a)*.055,.34,Math.cos(a)*.055);parts.push(p);}
 const flower=B.Mesh.MergeMeshes(parts,true,true);flower.material=mat;flower.isPickable=false;const matrices=[];
 for(let i=0;i<800;i++){const x=(random()-.5)*72,z=(random()-.5)*72,r=Math.hypot(x,z);if(r<(hub?29:7.5)||Math.abs(x)<3&&z>0)continue;const s=.7+random()*.7;matrices.push(...B.Matrix.Compose(v(s,s,s),B.Quaternion.RotationYawPitchRoll(random()*6.28,0,0),v(x,hill(x,z),z)).m);}flower.thinInstanceSetBuffer('matrix',new Float32Array(matrices),16,true);
 }
}
