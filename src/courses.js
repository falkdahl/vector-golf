import { generateLevels, LEVELS, LEVEL } from "./levels.js";

export const COURSES_KEY = "golfVectorField.courses.v1";

const ADJECTIVES = ["Breezy","Gusty","Stormy","Misty","Blustery","Whispering","Howling","Calm","Sunny","Zephyr","Tempest","Windy","Gentle","Brisk","Hazy","Drafty","Airy","Chilly","Muggy","Crisp"];
const NOUNS = ["Fairway","Greens","Links","Meadow","Dunes","Valley","Hollow","Pines","Ridge","Course","Haven","Glen","Heights","Acres","Trail","Woods","Fields","Park","Gardens","Estates"];

export function randomName(rand = Math.random) {
  const a = ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(rand() * NOUNS.length)];
  return `${a} ${n}`;
}

function makeUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try { return crypto.randomUUID(); } catch {}
  }
  // fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261 >>> 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seedHash(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  return hashString(String(seed));
}

export function deriveCourseSeed(campaignSeed, holeCount) {
  const base = seedHash(campaignSeed);
  let h = (base ^ (holeCount * 2654435761) ^ 0x9e3779b9) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function generateCampaignSeed() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try { return crypto.randomUUID().slice(0, 8).toLowerCase(); } catch {}
  }
  // Fallback: generate 8 hex chars [0-9a-f]
  let hex = '';
  for (let i = 0; i < 8; i++) hex += Math.floor(Math.random() * 16).toString(16);
  return hex;
}

let campaignSeed = null;

export function getCampaignSeed() {
  return campaignSeed;
}

export function setCampaignSeed(seed) {
  campaignSeed = String(seed);
  return campaignSeed;
}

export function getOrCreateCampaignSeed() {
  if (campaignSeed !== null && campaignSeed !== undefined && String(campaignSeed).length) return campaignSeed;
  const s = generateCampaignSeed();
  campaignSeed = String(s);
  return campaignSeed;
}

function deterministicNameForCourse(campaignSeedVal, holeCount) {
  const d = deriveCourseSeed(campaignSeedVal, holeCount * 100 + 7);
  const r = mulberry32(d);
  return randomName(r);
}

function deterministicNameForCourseAtAttempt(campaignSeedVal, holeCount, attempt) {
  const base = holeCount * 100 + 7 + attempt * 1009;
  const d = deriveCourseSeed(campaignSeedVal, base);
  const r = mulberry32(d);
  return randomName(r);
}

function getUniqueNameForCourse(campaignSeedVal, holeCount, existingNames) {
  const need = existingNames instanceof Set ? existingNames : new Set(existingNames || []);
  for (let attempt = 0; attempt < 100; attempt++) {
    const cand = deterministicNameForCourseAtAttempt(campaignSeedVal, holeCount, attempt);
    if (!need.has(cand)) return cand;
  }
  // Fallback: append suffix deterministically
  let base = deterministicNameForCourse(campaignSeedVal, holeCount);
  let i = 2;
  while (need.has(base + ' ' + i)) i++;
  return base + ' ' + i;
}

function ensureUniqueCourseNames(courses, campaignSeedVal) {
  const seen = new Set();
  let fixed = false;
  for (const c of courses) {
    if (!c || typeof c.name !== 'string') continue;
    if (seen.has(c.name)) {
      const holeCount = c.holeCount || 3;
      const unique = getUniqueNameForCourse(campaignSeedVal, holeCount, seen);
      if (unique !== c.name) {
        c.name = unique;
        fixed = true;
      }
    }
    seen.add(c.name);
  }
  return fixed;
}

function deterministicIdForCourse(campaignSeedVal, holeCount) {
  const d = deriveCourseSeed(campaignSeedVal, holeCount * 100 + 13);
  const r = mulberry32(d);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const vRand = r() * 16 | 0;
    const v = c === 'x' ? vRand : (vRand & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function generateCampaignCourse(holeCount = 18, campaignSeedVal = getOrCreateCampaignSeed(), options = {}) {
  if (![3,6,9,18].includes(holeCount)) throw new Error("holeCount must be 3, 6, 9 or 18");
  // Allow overload: generateCampaignCourse(3, {difficulty:'easy'})
  if (typeof campaignSeedVal === 'object' && campaignSeedVal !== null && !Array.isArray(campaignSeedVal)) {
    options = campaignSeedVal;
    campaignSeedVal = getOrCreateCampaignSeed();
  }
  const derived = deriveCourseSeed(campaignSeedVal, holeCount);
  let difficulty = null;
  if (options && typeof options === 'object' && options.difficulty && ['easy','medium','hard'].includes(options.difficulty)) {
    difficulty = options.difficulty;
  } else if (typeof options === 'string' && ['easy','medium','hard'].includes(options)) {
    difficulty = options;
  }
  let name;
  if (options && typeof options === 'object' && options.existingNames) {
    const set = options.existingNames instanceof Set ? options.existingNames : new Set(options.existingNames);
    name = getUniqueNameForCourse(campaignSeedVal, holeCount, set);
  } else if (options && typeof options === 'object' && Array.isArray(options.existingCourses)) {
    const set = new Set(options.existingCourses.map(c => c && c.name).filter(Boolean));
    name = getUniqueNameForCourse(campaignSeedVal, holeCount, set);
  } else {
    name = deterministicNameForCourse(campaignSeedVal, holeCount);
  }
  const id = deterministicIdForCourse(campaignSeedVal, holeCount);
  let prevLevelsCopy = null;
  let prevLevelCopy = null;
  try {
    prevLevelsCopy = JSON.parse(JSON.stringify(LEVELS));
    prevLevelCopy = JSON.parse(JSON.stringify(LEVEL));
  } catch {}
  const holes = (holeCount === 3 && difficulty) ? generateLevels(derived, holeCount, { difficulty }) : generateLevels(derived, holeCount);
  const holesCopy = JSON.parse(JSON.stringify(holes));
  try {
    if (prevLevelsCopy) {
      LEVELS.length = 0;
      for (const h of prevLevelsCopy) LEVELS.push(h);
    }
    if (prevLevelCopy) {
      for (const k of Object.keys(LEVEL)) delete LEVEL[k];
      Object.assign(LEVEL, prevLevelCopy);
    }
  } catch {}
  return {
    id,
    name,
    holes: holesCopy,
    holeCount,
    seed: derived,
    campaignSeed: String(campaignSeedVal),
    createdAt: Date.now(),
    bestTotal: null
  };
}

export function generateCourse(holeCount = 18, seed = Date.now(), options = {}) {
  // Allow overload: generateCourse(3, {difficulty:'hard'}) or generateCourse(3, seed, {difficulty})
  if (typeof seed === 'object' && seed !== null && !Array.isArray(seed) && holeCount !== undefined) {
    // generateCourse(3, {difficulty:'hard'})
    options = seed;
    seed = Date.now();
  }
  if (typeof holeCount === 'object' && holeCount !== null) {
    options = holeCount;
    holeCount = 18;
    seed = Date.now();
  }
  if (![3,6,9,18].includes(holeCount)) throw new Error("holeCount must be 3, 6, 9 or 18");
  // If campaignSeed is provided in options, use deterministic path
  if (options && typeof options === 'object' && options.campaignSeed !== undefined && options.campaignSeed !== null) {
    const cs = String(options.campaignSeed);
    return generateCampaignCourse(holeCount, cs, options);
  }
  const id = makeUUID();
  const name = randomName();
  let difficulty = null;
  if (options && typeof options === 'object' && options.difficulty && ['easy','medium','hard'].includes(options.difficulty)) {
    difficulty = options.difficulty;
  } else if (typeof options === 'string' && ['easy','medium','hard'].includes(options)) {
    difficulty = options;
  }
  // Preserve global LEVELS / LEVEL which generateLevels mutates; generateCourse must not affect active game
  let prevLevelsCopy = null;
  let prevLevelCopy = null;
  try {
    prevLevelsCopy = JSON.parse(JSON.stringify(LEVELS));
    prevLevelCopy = JSON.parse(JSON.stringify(LEVEL));
  } catch {}
  const holes = (holeCount === 3 && difficulty) ? generateLevels(seed, holeCount, { difficulty }) : generateLevels(seed, holeCount);
  // Deep clone holes to avoid reference sharing with global LEVELS
  const holesCopy = JSON.parse(JSON.stringify(holes));
  // Restore global LEVELS / LEVEL to not pollute active course (prevents 3-hole win from becoming 6-hole LEVELS)
  try {
    if (prevLevelsCopy) {
      LEVELS.length = 0;
      for (const h of prevLevelsCopy) LEVELS.push(h);
    }
    if (prevLevelCopy) {
      for (const k of Object.keys(LEVEL)) delete LEVEL[k];
      Object.assign(LEVEL, prevLevelCopy);
    }
  } catch {}
  return {
    id,
    name,
    holes: holesCopy,
    holeCount,
    seed,
    createdAt: Date.now(),
    bestTotal: null
  };
}

export function validateCourse(c) {
  if (!c || typeof c !== 'object') throw new Error("Invalid course data");
  if (typeof c.id !== 'string' || c.id.length < 8) throw new Error("Invalid course data");
  if (typeof c.name !== 'string' || !c.name.trim()) throw new Error("Invalid course data");
  if (!Array.isArray(c.holes) || ![3,6,9,18].includes(c.holes.length)) throw new Error("Invalid course data");
  for (const h of c.holes) {
    if (!h || typeof h.tee !== 'object' || typeof h.hole !== 'object' || !Array.isArray(h.obstacles) || typeof h.field !== 'object') {
      throw new Error("Invalid course data");
    }
  }
  return true;
}

export const STAGES = [3, 6, 9, 18];

export function isStageUnlocked(courses, holeCount) {
  if (holeCount === 3) return true;
  const idx = STAGES.indexOf(holeCount);
  if (idx <= 0) return false;
  const prevHoleCount = STAGES[idx - 1];
  const prev = courses.find(c => c.holeCount === prevHoleCount);
  return !!prev && prev.bestTotal !== null;
}

export function getUnlockedStages(courses) {
  const unlocked = [];
  for (const hc of STAGES) {
    if (isStageUnlocked(courses, hc)) unlocked.push(hc);
    else break;
  }
  return unlocked;
}

export function ensureStagedCourses(courses, campaignSeedParam) {
  const cs = campaignSeedParam !== undefined && campaignSeedParam !== null ? String(campaignSeedParam) : (campaignSeed !== null ? String(campaignSeed) : null);
  // Normalize to staged model: keep first course per holeCount in STAGES order, fill missing unlocked stages using deterministic seeds
  const byHoleCount = new Map();
  for (const c of courses) {
    if (!STAGES.includes(c.holeCount)) continue;
    if (!byHoleCount.has(c.holeCount)) byHoleCount.set(c.holeCount, c);
  }
  const staged = [];
  for (const hc of STAGES) {
    if (byHoleCount.has(hc)) {
      staged.push(byHoleCount.get(hc));
    } else if (isStageUnlocked(staged, hc)) {
      // auto-generate missing unlocked stage deterministically if campaignSeed available
      let gen;
      if (cs) {
        const existingNames = new Set(staged.map(c => c.name));
        if (hc === 3) gen = generateCampaignCourse(3, cs, { difficulty: 'easy', existingNames });
        else gen = generateCampaignCourse(hc, cs, { existingNames });
      } else {
        gen = hc === 3 ? generateCourse(3, Date.now(), { difficulty: 'easy' }) : generateCourse(hc, Date.now());
      }
      staged.push(gen);
    } else {
      break;
    }
  }
  // If no courses (fresh), create 3-easy with campaignSeed
  if (staged.length === 0) {
    let def;
    if (cs) {
      def = generateCampaignCourse(3, cs, { difficulty: 'easy' });
    } else {
      const newCs = generateCampaignSeed();
      campaignSeed = String(newCs);
      def = generateCampaignCourse(3, campaignSeed, { difficulty: 'easy' });
    }
    staged.push(def);
  }
  // Ensure uniqueness within campaign — if two courses have same name, pick next deterministically
  try { ensureUniqueCourseNames(staged, cs); } catch {}
  return staged;
}

// In-memory cache: generate once, then read from cache/localStorage without re-generating on menu entry
let _coursesCache = null;
let _coursesCacheRaw = null;

export function loadCourses() {
  try {
    const raw = localStorage.getItem(COURSES_KEY);
    // Serve from in-memory cache if storage unchanged (avoids re-parse + re-generation lag on every menu open)
    if (_coursesCache && raw && raw === _coursesCacheRaw) {
      return _coursesCache;
    }
    if (!raw) throw new Error("no courses");
    const d = JSON.parse(raw);
    if (d.version !== 1 || !Array.isArray(d.courses)) throw new Error("bad version");
    // Extract campaignSeed
    let cs = d.campaignSeed;
    if (cs === undefined || cs === null) {
      // Legacy save without campaignSeed: keep existing courses, generate random seed for future determinism but don't regenerate now
      cs = generateCampaignSeed();
      // Persist with new seed on next save, but set global now
    }
    campaignSeed = String(cs);
    const valid = [];
    for (const c of d.courses) {
      try {
        validateCourse(c);
        // Ensure bestTotal is either null or number
        if (c.bestTotal !== null && typeof c.bestTotal !== 'number') c.bestTotal = null;
        if (typeof c.bestTotal === 'number') c.bestTotal = Math.max(0, Math.floor(c.bestTotal));
        // Ensure holeCount and stage
        if (!STAGES.includes(c.holeCount)) c.holeCount = c.holes.length;
        valid.push(c);
      } catch (e) {
        console.warn("Discarding invalid course", c, e);
      }
    }
    // Fix legacy bug where collected treasure was persisted in course definition — always reset for stored courses
    try { normalizeCourseTreasures(valid); } catch {}
    // Normalize to staged unlocking model — only generates if a previously-unlocked stage is missing (once per unlock)
    const staged = ensureStagedCourses(valid, campaignSeed);
    // Detect name fixes for duplicates
    const namesChanged = staged.some((c,i) => valid[i] && c.name !== valid[i].name);
    // If staged differs (e.g. old save had 18 only, or missing 3), or names were fixed for uniqueness, persist normalized with campaignSeed
    if (staged.length !== valid.length || staged.some((c,i) => c.id !== valid[i]?.id) || namesChanged || d.campaignSeed === undefined) {
      try { saveCourses(staged, campaignSeed); } catch {}
      _coursesCache = staged;
      _coursesCacheRaw = localStorage.getItem(COURSES_KEY);
      return staged;
    }
    _coursesCache = staged;
    _coursesCacheRaw = raw;
    return staged;
  } catch (e) {
    const newCs = generateCampaignSeed();
    campaignSeed = String(newCs);
    const def = generateCampaignCourse(3, campaignSeed, { difficulty: 'easy' });
    try { saveCourses([def], campaignSeed); } catch {}
    _coursesCache = [def];
    try { _coursesCacheRaw = localStorage.getItem(COURSES_KEY); } catch {}
    return [def];
  }
}

export function ensureNextStageUnlocked(courses) {
  const cs = campaignSeed !== null ? String(campaignSeed) : null;
  // Called after a stage is cleared (bestTotal set). If next stage locked, generate it deterministically.
  for (let i = 0; i < STAGES.length - 1; i++) {
    const currHC = STAGES[i];
    const nextHC = STAGES[i+1];
    const curr = courses.find(c => c.holeCount === currHC);
    const next = courses.find(c => c.holeCount === nextHC);
    if (curr && curr.bestTotal !== null && !next) {
      let gen;
      if (cs) {
        const existingNames = new Set(courses.map(c => c.name));
        gen = generateCampaignCourse(nextHC, cs, { existingNames });
        // Ensure still unique after generation (in case deterministic still collided due to stale set)
        if (existingNames.has(gen.name)) {
          gen.name = getUniqueNameForCourse(cs, nextHC, existingNames);
        }
      } else gen = generateCourse(nextHC, Date.now());
      courses.push(gen);
      // Keep staged order
      courses.sort((a,b) => STAGES.indexOf(a.holeCount) - STAGES.indexOf(b.holeCount));
      // Final ensure uniqueness across all
      try { ensureUniqueCourseNames(courses, cs); } catch {}
      saveCourses(courses, cs);
      return gen;
    }
  }
  return null;
}

function normalizeCourseTreasures(courseList) {
  if (!Array.isArray(courseList)) return;
  for (const c of courseList) {
    if (!c || !Array.isArray(c.holes)) continue;
    for (const h of c.holes) {
      if (h && h.treasure && typeof h.treasure.isCollected === 'boolean') {
        h.treasure.isCollected = false;
      }
    }
  }
}

export function resetCourseTreasures(course) {
  if (!course || !Array.isArray(course.holes)) return;
  for (const h of course.holes) {
    if (h && h.treasure) h.treasure.isCollected = false;
  }
}

export function saveCourses(courses, campaignSeedOverride) {
  const cs = campaignSeedOverride !== undefined && campaignSeedOverride !== null ? String(campaignSeedOverride) : (campaignSeed !== null ? String(campaignSeed) : generateCampaignSeed());
  campaignSeed = String(cs);
  // Never persist collected treasure - courses are definitions, run state lives in STORAGE_KEY
  try { normalizeCourseTreasures(courses); } catch {}
  // Ensure course names within campaign are unique
  try { ensureUniqueCourseNames(courses, cs); } catch {}
  localStorage.setItem(COURSES_KEY, JSON.stringify({ version: 1, campaignSeed: cs, courses }));
  _coursesCache = courses;
  try { _coursesCacheRaw = localStorage.getItem(COURSES_KEY); } catch {}
}

export function regenerateCampaign(newSeed) {
  const cs = String(newSeed !== undefined && newSeed !== null && String(newSeed).trim() !== '' ? String(newSeed).trim() : generateCampaignSeed());
  campaignSeed = cs;
  const coursesNew = [generateCampaignCourse(3, cs, { difficulty: 'easy' })];
  // Only 3 unlocked initially per requirement
  saveCourses(coursesNew, cs);
  _coursesCache = coursesNew;
  try { _coursesCacheRaw = localStorage.getItem(COURSES_KEY); } catch {}
  return { campaignSeed: cs, courses: coursesNew };
}

export function applyManualSeed(seedStr) {
  const trimmed = String(seedStr || '').trim();
  if (!trimmed) throw new Error("Seed cannot be empty");
  return regenerateCampaign(trimmed);
}

// Invalidate in-memory cache (e.g. after external clear)
export function invalidateCoursesCache() {
  _coursesCache = null;
  _coursesCacheRaw = null;
}

export function exportCourse(course) {
  validateCourse(course);
  return btoa(JSON.stringify(course));
}

export function importCourse(b64) {
  const trimmed = String(b64 || "").trim();
  if (!trimmed) throw new Error("Invalid course data");
  let json;
  try {
    json = atob(trimmed);
  } catch {
    throw new Error("Invalid course data");
  }
  let c;
  try {
    c = JSON.parse(json);
  } catch {
    throw new Error("Invalid course data");
  }
  validateCourse(c);
  // Ensure cloned to avoid mutation of input
  return JSON.parse(JSON.stringify(c));
}

export { ADJECTIVES, NOUNS, deterministicNameForCourse, deterministicNameForCourseAtAttempt, getUniqueNameForCourse, ensureUniqueCourseNames };
