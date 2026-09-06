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

export function ensureStagedCourses(courses) {
  // Normalize to staged model: keep first course per holeCount in STAGES order, fill missing unlocked stages
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
      // auto-generate missing unlocked stage
      const gen = hc === 3 ? generateCourse(3, Date.now(), { difficulty: 'easy' }) : generateCourse(hc, Date.now());
      staged.push(gen);
    } else {
      break;
    }
  }
  // If no courses (fresh), create 3-easy
  if (staged.length === 0) {
    const def = generateCourse(3, Date.now(), { difficulty: 'easy' });
    staged.push(def);
  }
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
    // Normalize to staged unlocking model — only generates if a previously-unlocked stage is missing (once per unlock)
    const staged = ensureStagedCourses(valid);
    // If staged differs (e.g. old save had 18 only, or missing 3), persist normalized
    if (staged.length !== valid.length || staged.some((c,i) => c.id !== valid[i]?.id)) {
      try { saveCourses(staged); } catch {}
      _coursesCache = staged;
      _coursesCacheRaw = localStorage.getItem(COURSES_KEY);
      return staged;
    }
    _coursesCache = staged;
    _coursesCacheRaw = raw;
    return staged;
  } catch (e) {
    const def = generateCourse(3, Date.now(), { difficulty: 'easy' });
    try { saveCourses([def]); } catch {}
    _coursesCache = [def];
    try { _coursesCacheRaw = localStorage.getItem(COURSES_KEY); } catch {}
    return [def];
  }
}

export function ensureNextStageUnlocked(courses) {
  // Called after a stage is cleared (bestTotal set). If next stage locked, generate it.
  for (let i = 0; i < STAGES.length - 1; i++) {
    const currHC = STAGES[i];
    const nextHC = STAGES[i+1];
    const curr = courses.find(c => c.holeCount === currHC);
    const next = courses.find(c => c.holeCount === nextHC);
    if (curr && curr.bestTotal !== null && !next) {
      const gen = generateCourse(nextHC, Date.now());
      courses.push(gen);
      // Keep staged order
      courses.sort((a,b) => STAGES.indexOf(a.holeCount) - STAGES.indexOf(b.holeCount));
      saveCourses(courses);
      return gen;
    }
  }
  return null;
}

export function saveCourses(courses) {
  localStorage.setItem(COURSES_KEY, JSON.stringify({ version: 1, courses }));
  _coursesCache = courses;
  try { _coursesCacheRaw = localStorage.getItem(COURSES_KEY); } catch {}
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

export { ADJECTIVES, NOUNS };
