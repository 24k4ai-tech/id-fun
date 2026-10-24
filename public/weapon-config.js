// Public combat rules are also imported by the authoritative Node server.
// Damage changes stay modest; range and silhouette define each weapon's feel.
export const WEAPONS = Object.freeze({
  ember:   { kind: 'sword',      zh: '金焰长剑',   en: 'Sunblade',       reach: 2.3, strike: 10, heavy: 18 },
  shadow:  { kind: 'daggers',    zh: '暗影双刃',   en: 'Shadow Daggers', reach: 1.9, strike: 11, heavy: 16 },
  maker:   { kind: 'hammer',     zh: '星轨战锤',   en: 'Star Hammer',   reach: 2.0, strike: 8,  heavy: 24 },
  trader:  { kind: 'chakram',    zh: '流光轮刃',   en: 'Light Chakram', reach: 2.2, strike: 9,  heavy: 20 },
  cz:      { kind: 'spear',      zh: '黄金长枪',   en: 'Golden Spear', reach: 2.8, strike: 8,  heavy: 18 },
  heyi:    { kind: 'fans',       zh: '紫电双扇',   en: 'Violet Fans',  reach: 2.0, strike: 11, heavy: 16 },
  sbf:     { kind: 'sickle',     zh: '混沌镰刀',   en: 'Chaos Sickle', reach: 2.5, strike: 9,  heavy: 20 },
  musk:    { kind: 'axe',        zh: '电弧战斧',   en: 'Arc Axe',      reach: 2.2, strike: 9,  heavy: 22 },
  jensen:  { kind: 'maul',       zh: '晶核重锤',   en: 'Core Maul',    reach: 2.0, strike: 8,  heavy: 24 },
  vitalik: { kind: 'scepter',    zh: '以太权杖',   en: 'Ether Scepter',reach: 2.4, strike: 9,  heavy: 19 },
  trump:   { kind: 'greatsword', zh: '王冠巨剑',   en: 'Crown Blade',  reach: 2.6, strike: 8,  heavy: 22 },
  afeng:   { kind: 'gauntlets', zh:'烈焰拳套', en:'Blaze Gauntlets',reach:1.9,strike:12,heavy:20 },
});

export function weaponFor(avatarId) {
  return WEAPONS[avatarId] || WEAPONS.ember;
}
