import { CHARACTERS } from './character-manifest.js';

export async function loadCharacterAsset(B, scene, id, appearance=null,options={}) {
  const custom=appearance?.character;
  const spec=custom&&/^\/creations\/[a-f0-9-]{36}\/model\.glb$/.test(custom.file)?custom:CHARACTERS[id];
  if(!spec)return null;
  let container,timer,expired=false;
  try {
    const crowd=options.crowd&&spec!==custom&&['cz','heyi','jensen','vitalik','musk','afeng','maker','trader'].includes(id);
    const loading=B.SceneLoader.LoadAssetContainerAsync(spec===custom?'':'/models/',(crowd?spec.file.replace('.glb','-lod.glb'):spec.file)+(spec.revision?'?v='+spec.revision+(crowd?'-lod3':''):''),scene,undefined,'.glb');
    loading.then(asset=>{if(expired)asset.dispose();},()=>{});
    container=await Promise.race([loading,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new Error('Character loading timeout'));},40000);})]);
    clearTimeout(timer);
    if(scene.isDisposed){container.dispose();return null;}
    const names=new Set(container.animationGroups.map(a=>a.name));
    if(!['Sword_Idle','Jog_Fwd_Loop','Sword_Attack','Spell_Simple_Shoot','Roll','Hit_Chest','Death01'].every(n=>names.has(n)))throw new Error('Incomplete animation set');
    if(!['weapon_hand_r','weapon_hand_l'].every(name=>container.transformNodes.some(n=>n.name===name)))throw new Error('Missing weapon sockets');
    for(const group of container.animationGroups){group.stop();group.reset();}
    const normalized=new B.TransformNode(id+'-model-normalized',scene);
    normalized.scaling.setAll(spec.scale);normalized.position.y=spec.lift;
    container.addAllToScene();
    for(const node of container.rootNodes)node.parent=normalized;
    for(const mesh of container.meshes){mesh.isPickable=false;mesh.receiveShadows=true;}
    applyCharacterAppearance(B,normalized,container,appearance);
    return {meshes:[normalized,...container.meshes],transformNodes:container.transformNodes,animationGroups:container.animationGroups,generated:true,dispose(){container.dispose();normalized.dispose();}};
  }catch(error){clearTimeout(timer);container?.dispose();if(options.crowd&&!scene.isDisposed)return loadCharacterAsset(B,scene,id,appearance,{crowd:false});console.warn('Character asset unavailable:',id);return null;}
}

export function applyCharacterAppearance(B,root,asset,appearance) {
  if(!appearance)return;
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||1));
  root.scaling.x*=clamp(appearance.build,.85,1.15);root.scaling.z*=clamp(appearance.build,.85,1.15);
  const h=clamp(appearance.height,.9,1.1);root.scaling.y*=h;root.position.y*=h;
  const head=asset.transformNodes.find(n=>n.name==='head'||n.name==='Head');
  if(head)head.scaling.scaleInPlace(clamp(appearance.head,.92,1.08));
  const tint={warm:'#fff0df',cool:'#dfefff',jade:'#e4ffe9'}[appearance.tint];
  if(tint)for(const mesh of asset.meshes)if(mesh.material?.albedoColor){mesh.material=mesh.material.clone(mesh.material.name+'-custom');mesh.material.albedoColor=B.Color3.FromHexString(tint);}
}
