export const CITY_PLACES={
 guild:{name:['竞技公会','Arena Guild'],npc:['教官 · 岚','Instructor Lan'],avatar:'cz',x:0,z:-12,color:'#e7bb50',
  line:['想试试新的战术？训练场随时开放。约上朋友，可以来一场短局推塔。','Ready for a new tactic? Train now, or invite a friend for a quick tower battle.'],
  prop:['战术沙盘','Tactical table'],object:{x:0,z:-3},action:'moba'},
 market:{name:['驿站','Courier Lodge'],npc:['驿站管事 · 澄','Postmaster Cheng'],avatar:'trader',x:-9,z:-3,color:'#df9970',
  line:['商队等着灯塔恢复。进来看看委托，每一次送达都会留下记录。','The caravan is waiting for the beacon. Come inside and pick up a commission.'],
  prop:['递送柜台','Delivery counter'],object:{x:0,z:-3},action:'courier'},
 observatory:{name:['观测塔','Observatory'],npc:['观星师 · 星禾','Astronomer Xinghe'],avatar:'heyi',x:9,z:-3,color:'#83cddd',
  line:['星轨错开了。帮我校准镜片，再到城里校准两个观测点。','The star paths have shifted. Align the lens, then align two observation points.'],
  prop:['星轨仪','Star lens'],object:{x:0,z:-3},action:'survey'},
 workshop:{name:['工坊','Workshop'],npc:['技师 · 铸石','Artisan Zhu'],avatar:'maker',x:9,z:4,color:'#b9d781',
  line:['形象和装备都在这里整理。能量补充后，你的角色还能继续参加奖励挑战。','This is where you tune your look and equipment. Charge energy here for reward challenges.'],
  prop:['充能工作台','Energy workbench'],object:{x:0,z:-3},action:'energy'},
};
export const ROOM_BOUNDS={x:5,z:6};
export function roomWalkable(x,z){return Math.abs(x)<=5&&Math.abs(z)<=6&&!(Math.abs(x)<1.85&&z> -4.45&&z< -2.55)&&!(Math.abs(x)>4.65&&z> -4.3&&z<.2);}
export const COMMISSION_KINDS={courier:{name:['灯火递送','Beacon delivery'],steps:[{place:'market',x:0,z:-3,label:['在柜台取件','Collect at the counter']},{node:'power',label:['送到能源站','Deliver to the power station']},{node:'home',label:['点亮南园星灯','Light the south beacon']},{place:'market',x:0,z:-3,label:['回驿站交付回执','Return the receipt']} ]},
 survey:{name:['星轨勘察','Star survey'],steps:[{place:'observatory',x:0,z:-3,label:['启动星轨仪','Start the lens']},{node:'sun',label:['校准日光节点','Align the sun node']},{node:'moon',label:['校准月光节点','Align the moon node']},{place:'observatory',x:0,z:-3,label:['回塔内提交星图','Submit the star chart']}]}};
