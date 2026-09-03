import { generateLevels } from "./levels.js";

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

export function generateCourse(holeCount = 18, seed = Date.now()) {
  if (![3,9,18].includes(holeCount)) throw new Error("holeCount must be 3, 9 or 18");
  const id = makeUUID();
  const name = randomName();
  const holes = generateLevels(seed, holeCount);
  // Deep clone holes to avoid reference sharing with global LEVELS
  const holesCopy = JSON.parse(JSON.stringify(holes));
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
  if (!Array.isArray(c.holes) || ![3,9,18].includes(c.holes.length)) throw new Error("Invalid course data");
  for (const h of c.holes) {
    if (!h || typeof h.tee !== 'object' || typeof h.hole !== 'object' || !Array.isArray(h.obstacles) || typeof h.field !== 'object') {
      throw new Error("Invalid course data");
    }
  }
  return true;
}

export function loadCourses() {
  try {
    const raw = localStorage.getItem(COURSES_KEY);
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
        valid.push(c);
      } catch (e) {
        console.warn("Discarding invalid course", c, e);
      }
    }
    return valid;
  } catch (e) {
    const def = generateCourse(18, Date.now());
    try { saveCourses([def]); } catch {}
    return [def];
  }
}

export function saveCourses(courses) {
  localStorage.setItem(COURSES_KEY, JSON.stringify({ version: 1, courses }));
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
