import {JOURNEY_NODES,journeyTargets,gateOpen} from './journey-rules.js';
import {campaignTargets} from './campaign-content.js';

export function createJourneyWorld(B,scene) {
  const items=new Map();let state=null,clock=0,received=performance.now();
  const material=(name,hex,glow=false)=>{
    const m=new B.StandardMaterial(name,scene);m.diffuseColor=B.Color3.FromHexString(hex);
    m.specularColor=new B.Color3(.45,.4,.3);if(glow)m.emissiveColor=m.diffuseColor.scale(.65);return m;
  };
  const growth=[];
  for(let i=0;i<16;i++) {
    const angle=i/16*Math.PI*2,root=new B.TransformNode('chapter-garden-'+i,scene);
    root.position.set(Math.sin(angle)*4,0,20+Math.cos(angle)*4);
    const post=B.MeshBuilder.CreateCylinder('chapter-lantern-base',{height:.65,diameter:.18,tessellation:12},scene);post.parent=root;post.position.y=.325;post.material=material('lantern-stone-'+i,'#58515c');
    const light=B.MeshBuilder.CreatePolyhedron('chapter-lantern',{type:1,size:.16},scene);light.parent=root;light.position.y=.9;light.material=material('lantern-light-'+i,i<8?'#f4c654':'#65e1d0',true);
    root.setEnabled(false);growth.push({root,light});
  }
  for(const [id,node] of Object.entries(JOURNEY_NODES)) {
    const root=new B.TransformNode('journey-'+id,scene);root.position.set(node.x,0,node.z);
    const color=material(id+'-light',node.color,true),stone=material(id+'-stone','#414b59');
    const base=B.MeshBuilder.CreateCylinder(id+'-pedestal',{height:.2,diameter:1.25,tessellation:24},scene);
    base.parent=root;base.position.y=.12;base.material=stone;base.receiveShadows=true;
    if(id==='home'){base.scaling.y=.25;base.position.y=.03;}
    const ring=B.MeshBuilder.CreateTorus(id+'-ring',{diameter:1.9,thickness:.045,tessellation:48},scene);
    ring.parent=root;ring.position.y=.06;ring.material=color;
    const crystal=B.MeshBuilder.CreatePolyhedron(id+'-crystal',{type:1,size:.35},scene);
    crystal.parent=root;crystal.position.y=1.35;crystal.scaling.y=1.6;crystal.material=color;
    const halo=B.MeshBuilder.CreateTorus(id+'-halo',{diameter:1.05,thickness:.035,tessellation:40},scene);
    halo.parent=root;halo.position.y=1.35;halo.rotation.x=.6;halo.material=color;
    const texture=new B.DynamicTexture(id+'-symbol',{width:128,height:128},scene,false);
    texture.hasAlpha=true;texture.drawText(node.symbol,null,90,'bold 80px sans-serif',node.color,'transparent',true,true);
    const signMaterial=material(id+'-sign','#ffffff',true);signMaterial.diffuseTexture=texture;signMaterial.emissiveTexture=texture;
    signMaterial.useAlphaFromDiffuseTexture=true;signMaterial.backFaceCulling=false;
    const label=B.MeshBuilder.CreatePlane(id+'-symbol',{size:.65},scene);
    label.parent=root;label.position.y=2.2;label.billboardMode=B.Mesh.BILLBOARDMODE_ALL;label.material=signMaterial;
    if(id==='home'||id==='guide')label.position.y=3.7;
    const upgrades=[];
    if(id==='home')for(let level=1;level<=3;level++) {
      const orbit=B.MeshBuilder.CreateTorus('beacon-tier-'+level,{diameter:1.5+level*.65,thickness:.065,tessellation:64},scene);
      orbit.parent=root;orbit.position.y=2.5+level*.45;orbit.material=material('beacon-tier-color-'+level,['','#f4cd57','#67dced','#ac99ff'][level],true);
      upgrades.push(orbit);
    }
    if(id==='guide') {
      crystal.scaling.set(.95,.95,.95);
      for(const x of [-.12,.12]) {
        const eye=B.MeshBuilder.CreateSphere('wayfinder-eye',{diameter:.09,segments:8},scene);
        eye.parent=crystal;eye.position.set(x,0,-.32);eye.material=stone;
      }
    }
    root.setEnabled(false);for(const m of root.getChildMeshes())m.isPickable=false;
    items.set(id,{root,crystal,halo,ring,color,upgrades});
  }
  return {
    sync(next) {
      state=next;clock=next.serverNow;received=performance.now();
      const visible=new Set(['guide',...(next.campaign?.active?campaignTargets(next.campaign):journeyTargets(next.run))]);
      growth.forEach((g,i)=>g.root.setEnabled((next.campaign?.completed.length||0)>i));
      if(next.profile.beacon_level)visible.add('home');
      if(next.profile.deliveries)visible.add('workshop');
      if(next.focus)visible.add(next.focus);
      for(const [id,item] of items) {
        item.root.setEnabled(visible.has(id));
        item.upgrades.forEach((mesh,i)=>mesh.setEnabled(next.profile.beacon_level>i));
      }
    },
    tick(now) {
      if(!state)return;const serverNow=clock+now-received;
      growth.forEach((g,i)=>{if(g.root.isEnabled()){g.light.rotation.y=now*.0008+i;g.light.position.y=.9+Math.sin(now*.002+i)*.06;}});
      for(const [id,item] of items) if(item.root.isEnabled()) {
        item.crystal.rotation.y=now*.0007;
        item.crystal.position.y=(id==='home'?3.1+state.profile.beacon_level*.25:id==='guide'?2.7:1.35)+Math.sin(now*.002)*.12;
        item.halo.position.y=item.crystal.position.y;
        item.halo.rotation.z=now*.0005;
        if(id.startsWith('gate')&&!state.campaign?.active) {
          const open=gateOpen(id,serverNow);const color=B.Color3.FromHexString(open?'#65edbd':'#ff6644');
          item.color.diffuseColor=color;item.color.emissiveColor=color.scale(.65);
          item.ring.scaling.setAll(open?1:1+Math.sin(now*.012)*.08);
        }
        for(const [i,orbit] of item.upgrades.entries()) {orbit.rotation.x=Math.sin(now*.0006+i)*.35;orbit.rotation.z=Math.cos(now*.0005+i)*.35;}
      }
    },
    near(x,z) {
      let best=null,distance=2.3;
      for(const [id,item] of items)if(item.root.isEnabled()) {
        const n=JOURNEY_NODES[id],gap=Math.hypot(x-n.x,z-n.z);
        if(gap<distance){distance=gap;best={kind:'journey',id,...n,name:n.zh};}
      }
      return best;
    },
    dispose(){for(const item of items.values())item.root.dispose();for(const g of growth)g.root.dispose();},
  };
}
