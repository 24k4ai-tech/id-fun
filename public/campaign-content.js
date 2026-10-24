// Authored layouts; no random timer or daily lock is used to pad the adventure.
const L=(zh,en)=>({zh,en});
const dirs=[[-1,0],[0,1],[1,0],[0,-1]];
function route(w,points){const cells=[points[0][1]*w+points[0][0]];for(let j=1;j<points.length;j++){let [x,y]=points[j-1],end=points[j];while(x!==end[0]||y!==end[1]){x+=Math.sign(end[0]-x);y+=Math.sign(end[1]-y);cells.push(y*w+x);}}return cells;}
function pipe(id,w,h,points,turns){const path=route(w,points),solution=Array(w*h).fill(0);for(let n=0;n<path.length;n++){const i=path[n];for(const j of [path[n-1],path[n+1]])if(j!==undefined){const d=dirs.findIndex(([dy,dx])=>Math.floor(j/w)-Math.floor(i/w)===dy&&j%w-i%w===dx);solution[i]|=1<<d;}}solution[path[0]]|=8;solution[path.at(-1)]|=2;return {id,type:'pipe',w,h,source:path[0],goal:path.at(-1),targets:[path[Math.floor(path.length/2)]],solution,start:solution.map((m,i)=>{for(let j=0;j<(i*3+turns)%4;j++)m=((m<<1)&15)|(m>>3);return m;})};}
function mirror(id,w,h,points){const path=route(w,points),solution=Array(w*h).fill(0);for(let k=1;k<points.length-1;k++){const [x,y]=points[k],prev=points[k-1],next=points[k+1];const incoming=dirs.findIndex(([dy,dx])=>dx===Math.sign(x-prev[0])&&dy===Math.sign(y-prev[1]));const outgoing=dirs.findIndex(([dy,dx])=>dx===Math.sign(next[0]-x)&&dy===Math.sign(next[1]-y));solution[y*w+x]=[1,0,3,2][incoming]===outgoing?1:2;}return {id,type:'mirror',w,h,source:path[0],goal:path.at(-1),direction:1,exit:1,solution,crystals:[path[Math.floor(path.length*.3)],path[Math.floor(path.length*.7)]],start:solution.map(v=>v?3-v:0),walls:[]};}
function cargo(id,rows){const w=rows[0].length,p={id,type:'cargo',w,h:rows.length,walls:[],goals:[],boxes:[],player:0};rows.join('').split('').forEach((c,i)=>{if(c==='#')p.walls.push(i);if(c==='.'||c==='*')p.goals.push(i);if(c==='$'||c==='*')p.boxes.push(i);if(c==='@')p.player=i;});return p;}
export const PUZZLES=Object.fromEntries([
  pipe('p1',4,4,[[0,0],[2,0],[2,2],[1,2],[1,3],[3,3]],1),
  pipe('p2',5,4,[[0,1],[1,1],[1,0],[4,0],[4,2],[2,2],[2,3],[4,3]],2),
  pipe('p3',5,5,[[0,0],[3,0],[3,2],[1,2],[1,4],[4,4]],3),
  pipe('p4',6,5,[[0,3],[2,3],[2,1],[0,1],[0,0],[5,0],[5,2],[4,2],[4,4],[5,4]],1),
  pipe('p5',6,6,[[0,0],[4,0],[4,2],[2,2],[2,1],[1,1],[1,4],[3,4],[3,3],[5,3],[5,5]],2),
  pipe('p6',6,6,[[0,4],[2,4],[2,2],[0,2],[0,0],[5,0],[5,3],[4,3],[4,5],[5,5]],3),
  pipe('p7',7,6,[[0,2],[1,2],[1,0],[5,0],[5,2],[3,2],[3,4],[1,4],[1,5],[6,5]],1),
  pipe('p8',7,7,[[0,0],[6,0],[6,2],[4,2],[4,1],[2,1],[2,3],[0,3],[0,6],[3,6],[3,5],[6,5]],2),
  mirror('m1',5,4,[[0,0],[3,0],[3,2],[1,2],[1,3],[4,3]]),
  mirror('m2',5,5,[[0,2],[2,2],[2,0],[4,0],[4,3],[1,3],[1,4],[4,4]]),
  mirror('m3',6,5,[[0,0],[4,0],[4,2],[1,2],[1,4],[5,4]]),
  mirror('m4',6,6,[[0,4],[2,4],[2,1],[0,1],[0,0],[5,0],[5,3],[4,3],[4,5],[5,5]]),
  mirror('m5',7,6,[[0,0],[5,0],[5,2],[2,2],[2,1],[1,1],[1,4],[4,4],[4,3],[6,3]]),
  mirror('m6',7,7,[[0,3],[3,3],[3,1],[1,1],[1,0],[6,0],[6,5],[2,5],[2,6],[6,6]]),
  mirror('m7',7,7,[[0,0],[6,0],[6,2],[4,2],[4,1],[2,1],[2,4],[0,4],[0,6],[5,6],[5,5],[6,5]]),
  mirror('m8',8,7,[[0,2],[2,2],[2,0],[6,0],[6,3],[4,3],[4,1],[3,1],[3,5],[1,5],[1,6],[7,6]]),
  cargo('c1',['#######','#     #','# .$  #','#  $ .#','#  @  #','#######']),
  cargo('c2',['#######','#  .  #','#  $  #','#.$ @ #','#  #  #','#     #','#######']),
  cargo('c3',['########','#  .   #','#  $ # #','# .$   #','#  # $ #','# @  . #','########']),
  cargo('c4',['########','# .  . #','# $  $ #','#  ##  #','# $ @  #','# .    #','########']),
  cargo('c5',['########','# . .  #','# $ $  #','#  #   #','# $ $@ #','# . .  #','########']),
  cargo('c6',['#########','# .  .  #','# $  $  #','#   #   #','# $  $  #','# . @ . #','#########']),
  ...[[[8,5,3],[8,0,0],[4,4,0]],[[10,7,3],[10,0,0],[5,5,0]],[[12,7,5],[12,0,0],[6,6,0]],[[9,5,4],[9,0,0],[2,3,4]],[[14,9,5],[14,0,0],[7,7,0]],[[11,7,4],[11,0,0],[2,5,4]]].map(([cap,start,target],i)=>({id:'w'+(i+1),type:'water',cap,start,target})),
  {id:'l1',type:'logic',tokens:['☀','☾','✧','◇'],start:[0,1,2,3],answer:[2,0,3,1],clues:L('星在最左边；月在最右边；日紧挨星的右侧。','Star is far left. Moon is far right. Sun is immediately right of Star.')},
  {id:'l2',type:'logic',tokens:['⚒','◇','☀','☾','✧'],start:[0,1,2,3,4],answer:[3,1,4,0,2],clues:L('月在首位；日落在末位；星在中间；商旅（◇）在工匠（⚒）左侧。','Moon is first. Sun is last. Star is in the middle. Merchant (◇) is left of Maker (⚒).')},
  {id:'l3',type:'logic',tokens:['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ'],start:[0,1,2,3,4],answer:[4,2,0,3,1],clues:L('Ⅰ居中；Ⅴ在Ⅲ左边且紧挨；Ⅳ在Ⅱ左边且紧挨；Ⅴ比Ⅰ靠左。','I is central. V is immediately left of III. IV is immediately left of II. V is left of I.')},
  {id:'l4',type:'logic',tokens:['☀','☾','✧','◇','⚒','◎'],start:[0,1,2,3,4,5],answer:[3,5,1,4,0,2],clues:L('◇最先，✧最后；◎紧跟◇；☀紧挨✧左侧；☾比⚒靠左。','◇ first, ✧ last. ◎ immediately follows ◇. ☀ is immediately left of ✧. ☾ is left of ⚒.')},
].map(p=>[p.id,Object.freeze(p)]));

const missions=[
 ['first-light','失落的第一束光','The First Lost Light','guide','observatory','power','p1','m1','城市并未失去能源，是光路被打乱了。修好导管，再把第一束光送回信标。','The power remains, but its paths are broken. Repair the conduit and guide the first beam home.'],
 ['dry-well','不再沉默的井','The Silent Well','market','power','sun','w1','p2','花园的水不够所有人一次取走。量出相等的水，再接通南部灌溉。','The garden needs a fair share. Measure equal water before restoring the south canal.'],
 ['cargo-yard','码头里的一封信','A Letter in the Yard','gate1','market','workshop','c1','l1','一封信被压在货物深处。腾出通道，按信上的线索找出收件顺序。','A letter is buried behind cargo. Clear the yard and reconstruct its delivery order.'],
 ['missing-courier','消失的信使','The Missing Courier','home','guide','gate3','l2','m2','信使没有失踪，他在追踪城北的一道假光。读懂足迹，再重现他的路线。','The courier followed a false northern light. Read his trail and reconstruct its route.'],
 ['orchard','旱园复苏','The Garden Returns','star','sun','power','p3','w2','树根只接受稳定的水流。修复回路，量好两份养护水，让花园重新呼吸。','Roots need a steady flow. Repair the circuit and measure two portions of water.'],
 ['lens-room','棱镜回廊','The Prism Gallery','observatory','moon','workshop','m3','c2','旧观测镜被移走了。先找回光线方向，再把镜箱送到正确底座。','The old lenses were moved. Recover the beam direction and place the lens crates.'],
 ['night-watch','守夜人的约定','The Night Watch','gate2','power','observatory','w3','p4','守夜人要给两个街区公平供能。拆分储液，再连接北面的最后一段管网。','The watch must supply two districts fairly. Divide the coolant and complete the north line.'],
 ['lantern-night','万家灯火','Lantern Night','guide','workshop','home','c3','m4','物资齐了，灯还没有亮。把核心归位，让光穿过四个转折，完成第一夜。','The supplies have arrived. Place the cores and guide the light to finish the first night.'],
 ['morning-tide','潮声后的清晨','After the Morning Tide','home','market','power','w4','p5','潮水带来新的物资，也冲乱了旧管道。分出三份水，重建更长的通路。','The tide brought supplies and damaged the pipes. Divide three portions and rebuild the longer route.'],
 ['old-dock','旧港的暗门','The Old Dock','gate1','workshop','gate4','c4','m5','潮退后露出了旧港。货柜不能拉动，留好退路，再用反射光打开暗门。','The old dock is exposed. Crates cannot be pulled: keep an escape route, then reflect light onto the door.'],
 ['archive','被改写的档案','The Altered Archive','observatory','guide','moon','l3','p6','档案的顺序被人改过，能源记录却留下了真相。复原年代，再修好存档装置。','The archive was reordered, but energy records survived. Restore the chronology and its power.'],
 ['glass-canal','玻璃水道','The Glass Canal','sun','gate3','market','m6','w5','水面能反光，也会掩盖出口。照亮每一枚晶石，再把冷却水等量分开。','Water reflects light and hides exits. Illuminate every crystal, then split the coolant equally.'],
 ['returning-fleet','归航者','The Returning Fleet','gate4','market','workshop','c5','p7','船队带回四个核心。先规划卸货顺序，再让新的动力穿过整个码头。','The fleet brings four cores. Plan their unloading, then send power across the dock.'],
 ['false-star','伪造的星图','The False Star Map','moon','observatory','gate2','l4','m7','那道假光终于有了来源。排除错位的星象，让真正的星光穿透镜阵。','The false light has a source. Reorder the stars and route real starlight through the mirrors.'],
 ['last-reserve','最后的储液','The Last Reservoir','power','sun','workshop','w6','c6','终夜之前，储液和货仓必须同时就绪。每一次倾倒与推箱都要留有余地。','Before the final night, prepare the reservoir and cargo together. Leave room with every pour and push.'],
 ['constellation','属于你的星城','Your Constellation','guide','observatory','home','p8','m8','所有线索回到了这里。修复最深的回路，照亮最后的晶石，迎来城市新的晨光。','Every trail returns here. Repair the deepest circuit, illuminate the final crystals and bring the city a new dawn.'],
];
export const CAMPAIGN=Object.freeze(missions.map((m,i)=>({id:m[0],act:i<8?1:2,title:L(m[1],m[2]),story:L(m[8],m[9]),
  giver:m[3],steps:[{node:m[4],puzzle:m[6]},{node:m[5],puzzle:m[7]}],returnTo:i===15?'home':'guide',
  requires:i===0?[]:i===2?[missions[0][0]]:i===3?[missions[1][0],missions[2][0]]:[missions[i-1][0]],
  reward:4,chapter:i+1,estimate:L('探索 + 两道机关','Explore + two mechanisms')})));
export const campaignMission=id=>CAMPAIGN.find(m=>m.id===id);
export function campaignTargets(c){const m=campaignMission(c?.active?.mission);if(!m)return [];return [c.active.stage<m.steps.length?m.steps[c.active.stage].node:m.returnTo];}
export const PUZZLE_TEXT={
 pipe:L('点击管道旋转，连接金色入口和出口，并经过蓝色节点。亮起的水路不能漏水。','Rotate pipes to join the gold inlet and outlet through the blue node, without leaks.'),
 mirror:L('点击镜片切换方向。让光束经过每一枚蓝色晶石，最后从金色出口射出。','Flip mirrors. Send the beam through every blue crystal and out of the gold exit.'),
 cargo:L('方向键或下方箭头移动。把所有箱子推到发光底座。只能推，不能拉；可撤销。','Use arrow keys or the buttons. Push every crate onto a glowing base. You cannot pull; undo is available.'),
 water:L('先选倒出的水罐，再选接水的水罐；会一直倒到空或满。达到各罐下方的目标水量。','Choose a source jug, then a destination. Pour until empty or full. Match each target shown below.'),
 logic:L('选两个符号交换位置，按线索恢复从左到右的正确顺序。','Select two symbols to swap. Use the clues to restore their left-to-right order.'),
};
