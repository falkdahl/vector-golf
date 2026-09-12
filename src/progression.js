export const PROGRESSION_KEY = "golfVectorField.progression.v1";
export const COINS_PER_HOLE = 10;
export const COURSE_COMPLETE_BONUS = 50;
export const SHOP_PRICE_SPATIAL = 50;
export const SHOP_PRICE_PASSIVE = 100;
export const MAX_LOADOUT_SLOTS = 4;

const DEFAULT_PERSONAL_SUPPLY = {
  magnifier: 0,
  liquifier: 1,
  deflector: 0,
  rotator: 0,
  fieldExtender: 0,
  powerCell: 0,
  freeShot: 0
};

function normalizeType(t) {
  if (t === 'amplify') return 'magnifier';
  if (t === 'nullify') return 'liquifier';
  if (t === 'flip') return 'deflector';
  if (t === 'rotate') return 'rotator';
  if (t === 'areaUp') return 'fieldExtender';
  if (t === 'areaUpgrade') return 'fieldExtender';
  return t;
}

export function costFor(type) {
  const t = normalizeType(type);
  if (['magnifier','liquifier','deflector','rotator'].includes(t)) return SHOP_PRICE_SPATIAL;
  if (['fieldExtender','powerCell','freeShot'].includes(t)) return SHOP_PRICE_PASSIVE;
  return 9999;
}

let progression = {
  version: 1,
  coins: 0,
  personalSupply: { ...DEFAULT_PERSONAL_SUPPLY },
  savedAt: Date.now()
};

export function getProgression() {
  return {
    version: progression.version,
    coins: progression.coins,
    personalSupply: { ...progression.personalSupply },
    savedAt: progression.savedAt
  };
}

export function getCoins() { return progression.coins; }
export function getPersonalSupply() { return { ...progression.personalSupply }; }
export function getPersonalSupplyCount(type) {
  const t = normalizeType(type);
  return progression.personalSupply[t] ?? 0;
}

export function setCoins(v) {
  progression.coins = Math.max(0, Math.floor(v));
  saveProgression();
}

export function addCoins(n) {
  progression.coins = Math.max(0, progression.coins + Math.floor(n));
  saveProgression();
  return progression.coins;
}

export function canAfford(type) {
  return progression.coins >= costFor(type);
}

export function purchase(type) {
  const t = normalizeType(type);
  const cost = costFor(t);
  if (!(t in progression.personalSupply)) return false;
  if (progression.coins < cost) return false;
  if ((progression.personalSupply[t] ?? 0) >= MAX_LOADOUT_SLOTS) return false; // cannot buy more than max slots
  progression.coins -= cost;
  progression.personalSupply[t] = Math.max(0, (progression.personalSupply[t] ?? 0) + 1);
  saveProgression();
  return true;
}

export function setPersonalSupply(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const k of Object.keys(DEFAULT_PERSONAL_SUPPLY)) {
    if (k in obj) progression.personalSupply[k] = Math.max(0, Math.floor(obj[k] || 0));
  }
  // legacy aliases
  if ('amplify' in obj && !('magnifier' in obj)) progression.personalSupply.magnifier = Math.max(0, Math.floor(obj.amplify||0));
  if ('nullify' in obj && !('liquifier' in obj)) progression.personalSupply.liquifier = Math.max(0, Math.floor(obj.nullify||0));
  if ('flip' in obj && !('deflector' in obj)) progression.personalSupply.deflector = Math.max(0, Math.floor(obj.flip||0));
  if ('rotate' in obj && !('rotator' in obj)) progression.personalSupply.rotator = Math.max(0, Math.floor(obj.rotate||0));
  if ('areaUp' in obj && !('fieldExtender' in obj)) progression.personalSupply.fieldExtender = Math.max(0, Math.floor(obj.areaUp||0));
  saveProgression();
}

export function saveProgression() {
  try {
    progression.savedAt = Date.now();
    localStorage.setItem(PROGRESSION_KEY, JSON.stringify(progression));
  } catch {}
}

export function loadProgression() {
  try {
    const raw = localStorage.getItem(PROGRESSION_KEY);
    if (!raw) throw new Error("no progression");
    const d = JSON.parse(raw);
    if (!d || d.version !== 1) throw new Error("bad version");
    progression.coins = Math.max(0, Math.floor(d.coins ?? 0));
    const ps = d.personalSupply || {};
    progression.personalSupply = {
      magnifier: Math.max(0, Math.floor(ps.magnifier ?? ps.amplify ?? DEFAULT_PERSONAL_SUPPLY.magnifier)),
      liquifier: Math.max(0, Math.floor(ps.liquifier ?? ps.nullify ?? DEFAULT_PERSONAL_SUPPLY.liquifier)),
      deflector: Math.max(0, Math.floor(ps.deflector ?? ps.flip ?? DEFAULT_PERSONAL_SUPPLY.deflector)),
      rotator: Math.max(0, Math.floor(ps.rotator ?? ps.rotate ?? DEFAULT_PERSONAL_SUPPLY.rotator)),
      fieldExtender: Math.max(0, Math.floor(ps.fieldExtender ?? ps.areaUp ?? ps.areaUpgrade ?? DEFAULT_PERSONAL_SUPPLY.fieldExtender)),
      powerCell: Math.max(0, Math.floor(ps.powerCell ?? DEFAULT_PERSONAL_SUPPLY.powerCell)),
      freeShot: Math.max(0, Math.floor(ps.freeShot ?? DEFAULT_PERSONAL_SUPPLY.freeShot)),
    };
    // Ensure at least default one of each spatial if all zero (fresh but corrupted) — new spec: one of each spatial
    if (Object.values(progression.personalSupply).every(v=>v===0)) {
      progression.personalSupply = { ...DEFAULT_PERSONAL_SUPPLY };
    }
    progression.savedAt = d.savedAt || Date.now();
    return getProgression();
  } catch {
    progression = {
      version: 1,
      coins: 0,
      personalSupply: { ...DEFAULT_PERSONAL_SUPPLY },
      savedAt: Date.now()
    };
    try { saveProgression(); } catch {}
    return getProgression();
  }
}

export function clearProgression() {
  try { localStorage.removeItem(PROGRESSION_KEY); } catch {}
  progression = {
    version: 1,
    coins: 0,
    personalSupply: { ...DEFAULT_PERSONAL_SUPPLY },
    savedAt: Date.now()
  };
}

export function resetProgressionToDefault() { clearProgression(); saveProgression(); }

if (typeof window !== 'undefined') {
  window.__PROGRESSION_KEY = PROGRESSION_KEY;
}
