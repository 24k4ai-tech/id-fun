import {loadEngine,looks} from './battle.js';
import {loadCharacterAsset} from './character-assets.js';
import {attachWeapon} from './weapon-model.js';

export async function createCharacterPreview(canvas) {
  const B=await loadEngine(),engine=new B.Engine(canvas,true,{stencil:true,preserveDrawingBuffer:false});
  engine.setHardwareScalingLevel(Math.max(1,window.devicePixelRatio/1.5));
  const scene=new B.Scene(engine);scene.clearColor=new B.Color4(.035,.048,.065,1);
  scene.environmentTexture=new B.HDRCubeTexture('/textures/arena-sky.hdr',scene,128,false,true,false,true);scene.environmentIntensity=.65;
  const camera=new B.ArcRotateCamera('wardrobe-camera',Math.PI/2,1.42,2.8,new B.Vector3(0,1,0),scene);
  camera.lowerRadiusLimit=.5;camera.upperRadiusLimit=5;camera.lowerBetaLimit=.35;camera.upperBetaLimit=1.7;camera.minZ=.025;camera.panningSensibility=0;camera.wheelPrecision=90;camera.attachControl(canvas,true);
  const ambient=new B.HemisphericLight('wardrobe-fill',new B.Vector3(0,1,0),scene);ambient.intensity=.8;
  const sun=new B.DirectionalLight('wardrobe-key',new B.Vector3(-.5,-1,-.7),scene);sun.position.set(3,6,4);sun.intensity=2;
  const rim=new B.PointLight('wardrobe-rim',new B.Vector3(-2,2,-2),scene);rim.diffuse=B.Color3.FromHexString('#f0b90b');rim.intensity=8;rim.range=6;
  const shadow=new B.ShadowGenerator(1024,sun);shadow.useBlurExponentialShadowMap=true;shadow.blurKernel=24;shadow.normalBias=.02;
  const floor=B.MeshBuilder.CreateCylinder('wardrobe-plinth',{diameter:2.3,height:.12,tessellation:96},scene);floor.position.y=-.08;floor.receiveShadows=true;
  const material=new B.PBRMaterial('wardrobe-stone',scene);material.albedoColor=B.Color3.FromHexString('#17232a');material.metallic=.45;material.roughness=.45;floor.material=material;
  const ring=B.MeshBuilder.CreateTorus('wardrobe-gold',{diameter:2.25,thickness:.018,tessellation:96},scene);ring.position.y=-.01;
  const gold=new B.StandardMaterial('wardrobe-gold',scene);gold.emissiveColor=B.Color3.FromHexString('#e7b83d');ring.material=gold;
  const pipeline=new B.DefaultRenderingPipeline('wardrobe-render',true,scene,[camera]);pipeline.fxaaEnabled=true;pipeline.samples=2;
  scene.imageProcessingConfiguration.toneMappingEnabled=true;scene.imageProcessingConfiguration.toneMappingType=B.ImageProcessingConfiguration.TONEMAPPING_ACES;scene.imageProcessingConfiguration.exposure=1.1;
  let generation=0,current=null,currentRoot=null,disposed=false,framing='full',weaponHolders=[];
  function centerFace(){
    const head=current?.transformNodes.find(n=>n.name.toLowerCase()==='head');
    if(head){head.computeWorldMatrix(true);camera.target.copyFrom(head.getAbsolutePosition());camera.target.y-=.02;}
    else camera.target.set(0,1.6,0);
  }
  async function show(id,appearance=null){
    const ticket=++generation,asset=await loadCharacterAsset(B,scene,id,appearance);
    if(!asset)throw new Error('角色模型暂时不可用');
    if(disposed||ticket!==generation){asset.dispose();return;}
    current?.dispose();currentRoot?.dispose();current=asset;
    const root=new B.TransformNode('wardrobe-hero',scene);asset.meshes[0].parent=root;currentRoot=root;
    const hands=asset.transformNodes;
    attachWeapon(B,scene,{avatarId:id,hand:hands.find(n=>n.name==='weapon_hand_r'),offhand:hands.find(n=>n.name==='weapon_hand_l'),root,accent:(looks[id]||looks.ember).trim});
    weaponHolders=[scene.getTransformNodeByName(id+'-weapon'),scene.getTransformNodeByName(id+'-offhand')].filter(Boolean);
    for(const holder of weaponHolders)holder.setEnabled(framing!=='face');
    for(const m of asset.meshes)if(m.getTotalVertices?.())shadow.addShadowCaster(m);
    pose('Idle_Loop');engine.resize();
  }
  function pose(name){if(!current)return;for(const a of current.animationGroups){a.stop();a.reset();}const clip=current.animationGroups.find(a=>a.name===name);clip?.start(true);}
  const resize=new ResizeObserver(()=>engine.resize());resize.observe(canvas);
  engine.runRenderLoop(()=>{if(!disposed&&!document.hidden&&canvas.getClientRects().length){if(framing==='face')centerFace();scene.render();}});
  return {show,pose,face(){framing='face';for(const holder of weaponHolders)holder.setEnabled(false);centerFace();camera.radius=.8;camera.alpha=Math.PI/2;camera.beta=1.53;},full(){framing='full';for(const holder of weaponHolders)holder.setEnabled(true);camera.target.set(0,1,0);camera.radius=2.8;camera.alpha=Math.PI/2;camera.beta=1.42;},dispose(){disposed=true;generation++;resize.disconnect();scene.dispose();engine.dispose();}};
}
