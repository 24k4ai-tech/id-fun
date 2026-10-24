// Provider joint names are unreliable. Infer this upright, symmetric humanoid
// topology from bind-pose positions and validate before changing any names.
export function mapHumanoid(skin) {
  const joints=skin.listJoints(), set=new Set(joints), children=n=>n.listChildren().filter(c=>set.has(c));
  const p=n=>n.getWorldTranslation();
  const roots=joints.filter(n=>!set.has(n.getParentNode()));
  if(roots.length!==1||joints.length<40||joints.length>52)throw new Error('Expected one humanoid rig with 40–52 joints');
  const mapped=new Map(), old=new Map(joints.map(n=>[n,n.getName()]));
  const put=(n,name)=>{if(!n||mapped.has(n))throw new Error('Ambiguous anatomy: '+name);mapped.set(n,name);return n;};
  const one=n=>{const c=children(n);if(c.length!==1)throw new Error('Expected single bone chain at '+old.get(n));return c[0];};
  const hip=put(roots[0],'pelvis'), branches=children(hip);
  if(branches.length!==3)throw new Error('Expected spine and two legs');
  const up=branches.filter(n=>p(n)[1]>p(hip)[1]);
  if(up.length!==1)throw new Error('Spine orientation ambiguous');
  const s1=put(up[0],'spine_01'),s2=put(one(s1),'spine_02'),chest=put(one(s2),'spine_03');
  const upper=children(chest).sort((a,b)=>Math.abs(p(a)[0]-p(hip)[0])-Math.abs(p(b)[0]-p(hip)[0]));
  if(upper.length!==3)throw new Error('Expected neck and two shoulders');
  const neck=put(upper[0],'neck_01'),head=put(one(neck),'Head');
  if(children(head).length||p(head)[1]<=p(neck)[1])throw new Error('Head must be above neck');
  for(const shoulder of upper.slice(1)) {
    const side=p(shoulder)[0]>p(hip)[0]?'l':'r';
    put(shoulder,'clavicle_'+side);const arm=put(one(shoulder),'upperarm_'+side),elbow=put(one(arm),'lowerarm_'+side),hand=put(one(elbow),'hand_'+side);
    const fingers=children(hand);
    if(fingers.length<4||fingers.length>5||Math.abs(p(hand)[0]-p(hip)[0])<.15)throw new Error('Invalid hand');
    // Thumb starts much closer to the wrist than the four knuckles.
    fingers.sort((a,b)=>Math.hypot(...p(a).map((v,i)=>v-p(hand)[i]))-Math.hypot(...p(b).map((v,i)=>v-p(hand)[i])));
    const thumb=fingers.shift();
    const axis=p(thumb).map((v,i)=>v-p(hand)[i]);
    // Finger order follows the transverse direction from the little finger to
    // the thumb; in the frontal A-pose this is the model's forward Z axis.
    const sign=Math.sign(axis[2])||1;
    fingers.sort((a,b)=>sign*(p(b)[2]-p(a)[2]));
    for(const [index,base] of [thumb,...fingers].entries()) {
      let n=base;const name=['thumb','index','middle','ring','pinky'][index];
      for(let i=1;i<=3;i++){put(n,`${name}_0${i}_${side}`);if(i<3)n=one(n);else if(children(n).length)throw new Error('Finger length mismatch');}
    }
  }
  for(const leg of branches.filter(n=>n!==up[0])) {
    const side=p(leg)[0]>p(hip)[0]?'l':'r';
    put(leg,'thigh_'+side);const knee=put(one(leg),'calf_'+side),foot=put(one(knee),'foot_'+side);
    if(children(foot).length){const toe=put(one(foot),'ball_'+side);if(children(toe).length)throw new Error('Invalid toe');}
    if(p(foot)[1]>=p(knee)[1]||p(knee)[1]>=p(leg)[1])throw new Error('Invalid leg chain');
  }
  if(mapped.size!==joints.length||new Set(mapped.values()).size!==joints.length)throw new Error('Incomplete anatomy');
  for(const [n,name] of mapped)n.setName(name);
  return Object.fromEntries([...mapped].map(([n,name])=>[old.get(n),name]));
}
