export const PROGRESSION_KEY = "golfVectorField.progression.v1";
export const LOADOUT_KEY = "golfVectorField.loadout.v1";
export const COINS_PER_HOLE = 10;
export const COURSE_COMPLETE_BONUS = 50;
export const SHOP_PRICE_SPATIAL = 50;
export const SHOP_PRICE_PASSIVE = 150;
export const MAX_LOADOUT_SLOTS = 4;
export const GOLFBAG_SLOTS = 4;
export const SHOP_INITIAL_STOCK = {
  magnifier: 0,
  liquifier: 0,
  deflector: 0,
  rotator: 0,
  fieldExtender: 0,
  powerCell: 0,
  freeShot: 0
};

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
  shopStock: { ...SHOP_INITIAL_STOCK },
  savedAt: Date.now()
};

export function getProgression() {
  return {
    version: progression.version,
    coins: progression.coins,
    personalSupply: { ...progression.personalSupply },
    shopStock: { ...progression.shopStock },
    savedAt: progression.savedAt
  };
}

export function getCoins() { return progression.coins; }
export function getPersonalSupply() { return { ...progression.personalSupply }; }
export function getPersonalSupplyCount(type) {
  const t = normalizeType(type);
  return progression.personalSupply[t] ?? 0;
}
export function getShopStock() { return { ...progression.shopStock }; }
export function getShopStockCount(type) {
  const t = normalizeType(type);
  return progression.shopStock[t] ?? 0;
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
  if ((progression.shopStock[t] ?? 0) <= 0) return false; // out of stock
  progression.coins -= cost;
  progression.personalSupply[t] = Math.max(0, (progression.personalSupply[t] ?? 0) + 1);
  progression.shopStock[t] = Math.max(0, (progression.shopStock[t] ?? 0) - 1);
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

// Course-clear milestones (10-progression.md §1.6): add stock to the shop.
// Never called on replays — callers only invoke on first clear.
export function addShopStock(type, n = 1) {
  const t = normalizeType(type);
  if (!(t in progression.shopStock)) return false;
  const add = Math.max(0, Math.floor(n ?? 0));
  if (add <= 0) return false;
  progression.shopStock[t] = Math.max(0, (progression.shopStock[t] ?? 0) + add);
  saveProgression();
  return true;
}

export function saveProgression() {
  try {
    progression.savedAt = Date.now();
    // Ensure shopStock exists
    if (!progression.shopStock) progression.shopStock = { ...SHOP_INITIAL_STOCK };
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
    // Load shop stock — if missing (legacy), reset to initial stock
    const ss = d.shopStock || null;
    if (ss && typeof ss === 'object') {
      progression.shopStock = {
        magnifier: Math.max(0, Math.floor(ss.magnifier ?? SHOP_INITIAL_STOCK.magnifier)),
        liquifier: Math.max(0, Math.floor(ss.liquifier ?? SHOP_INITIAL_STOCK.liquifier)),
        deflector: Math.max(0, Math.floor(ss.deflector ?? SHOP_INITIAL_STOCK.deflector)),
        rotator: Math.max(0, Math.floor(ss.rotator ?? SHOP_INITIAL_STOCK.rotator)),
        fieldExtender: Math.max(0, Math.floor(ss.fieldExtender ?? SHOP_INITIAL_STOCK.fieldExtender)),
        powerCell: Math.max(0, Math.floor(ss.powerCell ?? SHOP_INITIAL_STOCK.powerCell)),
        freeShot: Math.max(0, Math.floor(ss.freeShot ?? SHOP_INITIAL_STOCK.freeShot)),
      };
    } else {
      progression.shopStock = { ...SHOP_INITIAL_STOCK };
    }
    progression.savedAt = d.savedAt || Date.now();
    return getProgression();
  } catch {
    progression = {
      version: 1,
      coins: 0,
      personalSupply: { ...DEFAULT_PERSONAL_SUPPLY },
      shopStock: { ...SHOP_INITIAL_STOCK },
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
    shopStock: { ...SHOP_INITIAL_STOCK },
    savedAt: Date.now()
  };
}

export function resetProgressionToDefault() { clearProgression(); saveProgression(); }

// --- Last Loadout Persistence (10-progression.md §2.5) ---
// Persisted as separate key LOADOUT_KEY so it survives clearProgress and does not pollute PROGRESSION_KEY.
// If no loadout saved, caller shall pick random owned items for each unlocked slot.
const VALID_LOADOUT_TYPES = ['magnifier','liquifier','deflector','rotator','fieldExtender','powerCell','freeShot'];

function normalizeLoadoutType(t) {
  if (!t || typeof t !== 'string') return null;
  const n = normalizeType(t);
  if (n === 'areaUp' || n === 'areaUpgrade') return 'fieldExtender';
  return VALID_LOADOUT_TYPES.includes(n) ? n : null;
}

export function getLastLoadout() {
  try {
    const raw = localStorage.getItem(LOADOUT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.version !== 1) return null;
    const slots = d.slots;
    if (!Array.isArray(slots) || (slots.length !== 4 && slots.length !== 5)) return null;
    // Normalize to 4 slots: legacy 5-slot saves truncated to first 4
    const sized = slots.length === 5 ? slots.slice(0, 4) : slots;
    const cleaned = sized.map(v => {
      if (v === null || v === undefined) return null;
      return normalizeLoadoutType(String(v));
    });
    // Return even if all-null — caller can distinguish no-key (null) vs saved-empty (all-null)
    return cleaned;
  } catch { return null; }
}

export function setLastLoadout(slots) {
  try {
    if (!Array.isArray(slots) || (slots.length !== 4 && slots.length !== 5)) return false;
    const sized = slots.length === 5 ? slots.slice(0, 4) : slots;
    const cleaned = sized.map(v => {
      if (v === null || v === undefined) return null;
      return normalizeLoadoutType(String(v));
    });
    const payload = { version: 1, slots: cleaned, savedAt: Date.now() };
    localStorage.setItem(LOADOUT_KEY, JSON.stringify(payload));
    return true;
  } catch { return false; }
}

export function clearLastLoadout() {
  try { localStorage.removeItem(LOADOUT_KEY); } catch {}
}

export function hasLastLoadout() {
  try { return localStorage.getItem(LOADOUT_KEY) !== null; } catch { return false; }
}

if (typeof window !== 'undefined') {
  window.__PROGRESSION_KEY = PROGRESSION_KEY;
  window.__LOADOUT_KEY = LOADOUT_KEY;
  window.__getLastLoadout = getLastLoadout;
  window.__setLastLoadout = setLastLoadout;
  window.__SHOP_INITIAL_STOCK = SHOP_INITIAL_STOCK;
  window.__getShopStock = getShopStock;
  window.__getShopStockCount = getShopStockCount;
  window.__addShopStock = addShopStock;
  window.__costFor = costFor;
}
