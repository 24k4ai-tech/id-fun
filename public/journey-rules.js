// Shared world coordinates keep the visible objects and server checks aligned.
export const JOURNEY_NODES = Object.freeze({
  guide:{x:0,z:4,zh:'引路灵',en:'Wayfinder',symbol:'✦',color:'#f4c654'},
  observatory:{x:9,z:-3,zh:'观测台',en:'Signal lens',symbol:'◎',color:'#65d3ff'},
  sun:{x:-4,z:-2,zh:'日曜符文',en:'Sun rune',symbol:'☀',color:'#ffd568'},
  moon:{x:4,z:-2,zh:'月影符文',en:'Moon rune',symbol:'☾',color:'#ae91ff'},
  star:{x:0,z:13,zh:'星辉符文',en:'Star rune',symbol:'✧',color:'#62e5ca'},
  power:{x:-9,z:4,zh:'信标能源座',en:'Power pedestal',symbol:'ϟ',color:'#ffd568'},
  market:{x:-9,z:-3,zh:'信使驿站',en:'Courier post',symbol:'◇',color:'#75d6ed'},
  gate1:{x:-12,z:12,zh:'南侧风门',en:'South gate',symbol:'Ⅰ',color:'#64dcc3'},
  gate2:{x:-12,z:-2,zh:'西侧风门',en:'West gate',symbol:'Ⅱ',color:'#64dcc3'},
  gate3:{x:6,z:-12,zh:'北侧风门',en:'North gate',symbol:'Ⅲ',color:'#64dcc3'},
  gate4:{x:12,z:3,zh:'东侧风门',en:'East gate',symbol:'Ⅳ',color:'#64dcc3'},
  home:{x:0,z:20,zh:'星灯信标',en:'Starlight beacon',symbol:'✦',color:'#f7cf69'},
  workshop:{x:9,z:4,zh:'星灯工坊',en:'Beacon workshop',symbol:'⚒',color:'#f4be6c'},
});
export const RUNE_IDS = Object.freeze(['sun','moon','star']);
export const COURIER_ROUTE = Object.freeze(['market','gate1','gate2','gate3','gate4','home']);
export const BEACON_COSTS = Object.freeze([6,12,18]);
export const gateOpen = (id, now) => ((now + Number(id.slice(-1))*700) % 5000) >= 2400;
export function journeyTargets(run) {
  if (!run || run.status !== 'active') return [];
  if (run.kind === 'courier') return [COURIER_ROUTE[run.stage]];
  return run.stage === 0 ? ['observatory'] : run.stage <= 3 ? RUNE_IDS.filter(id=>!run.order.slice(0,run.stage-1).includes(id)) : ['power'];
}
