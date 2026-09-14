// Cutscene engine — 11-cutscenes.md
// Static bg on bg-canvas, characters on game canvas, dialog HTML overlay, synchronized pan/zoom, typewriter

const LOGICAL_W = 1280;
const LOGICAL_H = 720;

const ID_REGEX = /^[a-z0-9][a-z0-9-_]{2,40}$/;
const EASING_FNS = {
  linear: (t) => t,
  easeIn: (t) => t*t,
  easeOut: (t) => 1 - Math.pow(1 - t, 2),
  easeInOut: (t) => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2,
};

function easing(name) { return EASING_FNS[name] || EASING_FNS.linear; }

export function validateCutscene(data) {
  const errors = [];
  if (!data || typeof data !== 'object') { errors.push('scene must be object'); return { valid:false, errors }; }
  if (typeof data.id !== 'string' || !ID_REGEX.test(data.id)) errors.push('id must match ^[a-z0-9][a-z0-9-_]{2,40}$');
  if (data.title !== undefined && typeof data.title !== 'string') errors.push('title must be string');
  if (data.background !== undefined) {
    const bg = data.background;
    if (!bg || typeof bg !== 'object') errors.push('background must be object');
    else {
      if (bg.type && !['image','color'].includes(bg.type)) errors.push('background.type must be image|color');
      if (bg.type === 'image' && typeof bg.src !== 'string') errors.push('background.src required for image');
      if (bg.src && typeof bg.src === 'string' && bg.src.includes('..')) {/* allow relative but warn? */}
    }
  }
  if (data.camera !== undefined) {
    if (!data.camera || typeof data.camera !== 'object') errors.push('camera must be object');
    else if (data.camera.keyframes !== undefined) {
      if (!Array.isArray(data.camera.keyframes)) errors.push('camera.keyframes must be array');
      else for (let i=0;i<data.camera.keyframes.length;i++) {
        const kf=data.camera.keyframes[i];
        if (typeof kf.t !== 'number' || kf.t < 0) errors.push(`camera.keyframes[${i}].t invalid`);
        if (kf.zoom !== undefined && (typeof kf.zoom !== 'number' || kf.zoom < 0.5 || kf.zoom > 3.5)) errors.push(`camera.keyframes[${i}].zoom invalid`);
      }
    }
  }
  if (data.characters !== undefined) {
    if (!Array.isArray(data.characters)) errors.push('characters must be array');
    else {
      const seen=new Set();
      for (let i=0;i<data.characters.length;i++) {
        const c=data.characters[i];
        if (!c || typeof c !== 'object') { errors.push(`characters[${i}] must be object`); continue; }
        if (typeof c.id !== 'string' || !c.id) errors.push(`characters[${i}].id required`);
        else if (seen.has(c.id)) errors.push(`duplicate character id ${c.id}`);
        else seen.add(c.id);
        const hasSprite = typeof c.sprite === 'string' && c.sprite.trim();
        const hasSrc = typeof c.src === 'string' && c.src.trim();
        if (!hasSrc && !hasSprite) errors.push(`characters[${i}] requires src or sprite`);
        if (c.sprite !== undefined && c.sprite !== null && c.sprite !== '' && (typeof c.sprite !== 'string' || !/^[a-z0-9][a-z0-9-_]{1,40}$/.test(c.sprite))) errors.push(`characters[${i}].sprite must match id regex`);
        if (c.frame !== undefined && c.frame !== null) {
          if (typeof c.frame !== 'object' || typeof c.frame.x !== 'number' || typeof c.frame.y !== 'number' || typeof c.frame.w !== 'number' || typeof c.frame.h !== 'number') errors.push(`characters[${i}].frame must be {x,y,w,h}`);
          else {
            if (c.frame.x < 0 || c.frame.y < 0 || c.frame.w <= 0 || c.frame.h <= 0 || c.frame.w > 2048 || c.frame.h > 2048) errors.push(`characters[${i}].frame out of range`);
          }
        }
        if (c.x !== undefined && (typeof c.x !== 'number' || c.x < -200 || c.x > LOGICAL_W+200)) errors.push(`characters[${i}].x out of range`);
        if (c.y !== undefined && (typeof c.y !== 'number' || c.y < -200 || c.y > LOGICAL_H+200)) errors.push(`characters[${i}].y out of range`);
        if (c.scale !== undefined && (typeof c.scale !== 'number' || c.scale < 0.15 || c.scale > 4)) errors.push(`characters[${i}].scale out of range`);
        if (c.keyframes !== undefined) {
          if (!Array.isArray(c.keyframes)) errors.push(`characters[${i}].keyframes must be array`);
          else for (let j=0;j<c.keyframes.length;j++) {
            const kf=c.keyframes[j];
            if (typeof kf.t !== 'number' || kf.t<0) errors.push(`characters[${i}].keyframes[${j}].t invalid`);
            if (kf.sprite !== undefined && kf.sprite !== null && kf.sprite !== '' && typeof kf.sprite !== 'string') errors.push(`characters[${i}].keyframes[${j}].sprite must be string`);
            else if (kf.sprite && !/^[a-z0-9][a-z0-9-_]{1,40}$/.test(kf.sprite)) errors.push(`characters[${i}].keyframes[${j}].sprite invalid id`);
            if (kf.frame !== undefined && kf.frame !== null && typeof kf.frame !== 'object') errors.push(`characters[${i}].keyframes[${j}].frame must be {x,y,w,h}`);
            else if (kf.frame && (typeof kf.frame.x !== 'number' || typeof kf.frame.y !== 'number' || typeof kf.frame.w !== 'number' || typeof kf.frame.h !== 'number')) errors.push(`characters[${i}].keyframes[${j}].frame invalid`);
            if (kf.src !== undefined && kf.src !== null && kf.src !== '' && typeof kf.src !== 'string') errors.push(`characters[${i}].keyframes[${j}].src must be string`);
          }
        }
      }
    }
  }
  if (data.dialogs !== undefined) {
    if (!Array.isArray(data.dialogs)) errors.push('dialogs must be array');
    else for (let i=0;i<data.dialogs.length;i++) {
      const d=data.dialogs[i];
      if (!d || typeof d !== 'object') { errors.push(`dialogs[${i}] must be object`); continue; }
      if (d.t !== undefined && d.t !== null && (typeof d.t !== 'number' || d.t < 0)) errors.push(`dialogs[${i}].t invalid`);
      if (d.name !== undefined && d.name !== null && d.name !== '' && (typeof d.name !== 'string' || d.name.length>60)) errors.push(`dialogs[${i}].name must be 1-60 string`);
      // text / texts: allow either single text or multi-box texts array
      const hasTexts = Array.isArray(d.texts) && d.texts.length>0;
      const hasBoxes = Array.isArray(d.boxes) && d.boxes.length>0;
      const hasPages = Array.isArray(d.pages) && d.pages.length>0;
      const multi = hasTexts ? d.texts : hasBoxes ? d.boxes : hasPages ? d.pages : null;
      if(multi){
        if(!Array.isArray(multi) || multi.length===0 || multi.length>10) errors.push(`dialogs[${i}].texts must be 1-10 strings`);
        else for(let j=0;j<multi.length;j++){
          const t=multi[j];
          if(typeof t !== 'string' || !t.length || t.length>500) errors.push(`dialogs[${i}].texts[${j}] 1-500 required`);
          if(typeof t === 'string' && t.length>500) errors.push(`dialogs[${i}].texts[${j}] too long`);
        }
        // if multi provided, legacy text is optional but if present must be valid
        if(d.text !== undefined && d.text !== null && d.text !== '' && (typeof d.text !== 'string' || d.text.length>500)) errors.push(`dialogs[${i}].text 1-500 required`);
      } else {
        if (typeof d.text !== 'string' || !d.text.length || d.text.length>500) errors.push(`dialogs[${i}].text 1-500 required`);
      }
      if (d.cps !== undefined && (typeof d.cps !== 'number' || d.cps<5 || d.cps>80)) errors.push(`dialogs[${i}].cps out of range`);
      if (d.portrait !== undefined && d.portrait !== null && d.portrait !== '' && typeof d.portrait !== 'string') errors.push(`dialogs[${i}].portrait must be string`);
      if (d.portraitSide !== undefined && d.portraitSide !== null && d.portraitSide !== '' && !['left','right'].includes(d.portraitSide)) errors.push(`dialogs[${i}].portraitSide must be left|right`);
      if (d.duration !== undefined && d.duration !== null && d.duration !== '' && (typeof d.duration !== 'number' || !Number.isFinite(d.duration) || d.duration < 0 || d.duration > 60000)) errors.push(`dialogs[${i}].duration must be 0-60000`);
      if (d.auto !== undefined && typeof d.auto !== 'boolean') errors.push(`dialogs[${i}].auto must be boolean`);
      const gapsField2 = d.gaps ?? d.boxGaps ?? d.textGaps ?? d.lingers ?? d.linger ?? d.gap;
      if(gapsField2 !== undefined && gapsField2 !== null){
        if(!Array.isArray(gapsField2)) errors.push(`dialogs[${i}].gaps must be array`);
        else for(let j=0;j<gapsField2.length;j++){
          const g=gapsField2[j];
          if(typeof g !== 'number' || !Number.isFinite(g) || g < 0 || g > 10000) errors.push(`dialogs[${i}].gaps[${j}] must be 0-10000`);
        }
      }
    }
  }
  if (data.duration !== undefined && (typeof data.duration !== 'number' || data.duration<0)) errors.push('duration invalid');
  return { valid: errors.length===0, errors };
}

// In-memory cache for loaded JSON
const cutsceneCache = new Map();
let cutsceneIndex = null; // for src/cutscenes.json array

// Seen persistence for one-time cutscenes (e.g. prologue)
export const CUTSCENE_SEEN_KEY = "golfVectorField.cutscenes.seen.v1";
export function loadSeenCutscenes(){
  try{
    const raw = localStorage.getItem(CUTSCENE_SEEN_KEY);
    if(!raw) return {version:1, seen:[]};
    const d = JSON.parse(raw);
    if(!d || d.version!==1 || !Array.isArray(d.seen)) return {version:1, seen:[]};
    return {version:1, seen: d.seen.filter(s=>typeof s==='string')};
  }catch{ return {version:1, seen:[]}; }
}
export function hasSeenCutscene(id){
  try{
    const {seen} = loadSeenCutscenes();
    return seen.includes(String(id));
  }catch{ return false; }
}
export function markCutsceneSeen(id){
  try{
    const cur = loadSeenCutscenes();
    const sid = String(id);
    if(!cur.seen.includes(sid)){
      cur.seen.push(sid);
      localStorage.setItem(CUTSCENE_SEEN_KEY, JSON.stringify({version:1, seen: cur.seen}));
    }
    return true;
  }catch{ return false; }
}
export function clearSeenCutscenes(){
  try{ localStorage.removeItem(CUTSCENE_SEEN_KEY); }catch{}
}

// Sprite library (character sprite mappings) — for sheet cropping + character groups
let spriteLibrary = null; // {id: {src, frame:{x,y,w,h}}}
let characterGroups = {}; // groupId -> {name, sprites:[], defaultSprite}
let spriteLibraryLoaded = false;
let spriteLibraryPromise = null;
export async function loadSpriteLibrary(){
  if (spriteLibraryLoaded && spriteLibrary) return spriteLibrary;
  if (spriteLibraryPromise) return spriteLibraryPromise;
  spriteLibraryPromise = (async()=>{
    const urls = ['./src/character-sprites.json', './src/sprites.json', './src/character-sprites/character-sprites.json'];
    for (const url of urls){
      try{
        const res = await fetch(url, {cache:'no-store'});
        if (!res.ok) continue;
        const data = await res.json();
        let map = {};
        let charMap = null;
        if (data && data.sprites && typeof data.sprites === 'object') map = data.sprites;
        else if (data && typeof data === 'object' && !Array.isArray(data) && !data.id) {
          const keys = Object.keys(data);
          const isSpriteMap = keys.length && typeof data[keys[0]] === 'object' && data[keys[0]] && 'src' in data[keys[0]];
          if (isSpriteMap) map = data;
          else if (data.version !== undefined) map = data.sprites || {};
        }
        if (data && data.characters && typeof data.characters === 'object') charMap = data.characters;
        spriteLibrary = map;
        if (charMap) characterGroups = charMap;
        spriteLibraryLoaded = true;
        return map;
      } catch {}
    }
    spriteLibrary = {};
    characterGroups = {};
    spriteLibraryLoaded = true;
    return {};
  })();
  return spriteLibraryPromise;
}
export function getSprite(id){
  if (!id || typeof id !== 'string') return null;
  if (!spriteLibrary) return null;
  return spriteLibrary[id] || null;
}
export function getSpriteLibrarySync(){ return spriteLibrary; }
function resolveSpriteRef(ref){
  // ref may be sprite id (e.g. may-right) or raw path ./img/...
  if (!ref || typeof ref !== 'string') return null;
  const trimmed = ref.trim();
  if (!trimmed) return null;
  // if it looks like a path (contains / or .png) treat as raw src unless it matches a sprite id
  const lib = spriteLibrary;
  if (lib && lib[trimmed]) {
    const s = lib[trimmed];
    return { src: s.src, frame: s.frame || null, id: trimmed };
  }
  // if contains slash or dot, treat as raw path (frame none)
  if (trimmed.includes('/') || trimmed.includes('.')) return { src: trimmed, frame: null, id: null };
  // otherwise try as sprite id fallback (maybe not loaded yet) - return null to allow async load
  return null;
}
function resolveCharacterSprite(char){
  // char may have {character (group), sprite, src, frame}
  if (!char) return { src: null, frame: null };
  // character group handling: if character group set, resolve to its default sprite unless explicit sprite
  if (char.character && characterGroups[char.character]){
    const cg = characterGroups[char.character];
    const defId = char.sprite || cg.defaultSprite || (cg.sprites&&cg.sprites[0]);
    if (defId && spriteLibrary[defId]){
      const s = spriteLibrary[defId];
      const src = char.src || s.src;
      const frame = char.frame || s.frame || null;
      return { src, frame };
    }
  }
  if (char.sprite && typeof char.sprite === 'string') {
    const resolved = resolveSpriteRef(char.sprite);
    if (resolved) {
      const src = char.src || resolved.src;
      const frame = char.frame || resolved.frame || null;
      return { src, frame };
    }
  }
  if (char.src) return { src: char.src, frame: char.frame || null };
  return { src: null, frame: null };
}
export function preloadSpriteLibrary(data){
  if (!data || typeof data !== 'object') return;
  let map = {};
  let charMap = null;
  if (data.sprites && typeof data.sprites === 'object') map = data.sprites;
  else {
    const keys = Object.keys(data);
    const isSpriteMap = keys.length && typeof data[keys[0]] === 'object' && data[keys[0]] && 'src' in data[keys[0]];
    if (isSpriteMap) map = data;
  }
  if (data.characters && typeof data.characters === 'object') charMap = data.characters;
  spriteLibrary = map;
  if (charMap) characterGroups = charMap;
  spriteLibraryLoaded = true;
}
const sheetImageCache = new Map();
function getSheetImage(src){
  if (!src) return null;
  if (sheetImageCache.has(src)) return sheetImageCache.get(src);
  const im = new Image();
  im.src = src;
  sheetImageCache.set(src, im);
  return im;
}

export async function loadCutscene(id) {
  if (!id || typeof id !== 'string') return null;
  if (cutsceneCache.has(id)) return cutsceneCache.get(id);
  // Try src/cutscenes/<id>.json then src/cutscenes.json
  const tryUrls = [`./src/cutscenes/${id}.json`, `./src/cutscenes.json`, `./src/cutscene-data.json`];
  for (const url of tryUrls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data)) {
        // cutscenes.json is array
        for (const sc of data) {
          if (sc && sc.id) cutsceneCache.set(sc.id, sc);
        }
        cutsceneIndex = data;
        if (cutsceneCache.has(id)) return cutsceneCache.get(id);
        // if array didn't contain id, keep trying next url
        if (url === './src/cutscenes.json') break;
      } else if (data && data.id) {
        if (data.id === id) { cutsceneCache.set(id, data); return data; }
        // single file might be requested id mismatch but cache it
        cutsceneCache.set(data.id, data);
        if (cutsceneCache.has(id)) return cutsceneCache.get(id);
      }
    } catch {}
  }
  return cutsceneCache.get(id) || null;
}

export function preloadCutscene(data) {
  if (!data || !data.id) return;
  cutsceneCache.set(data.id, data);
}

// Internal active state
let active = null; // { data, startTime, elapsed, bgImg, charImgs: Map, currentDialogIndex, dialogStart, revealed, onComplete, camera }
let activeId = null;
let dialogEl = null; // HTML elements cached
let dialogBoxEl = null;
let portraitEl = null;
let speakerEl = null;
let textEl = null;
let hintEl = null;

function ensureDialogElements() {
  if (dialogEl) return;
  dialogEl = document.getElementById('cutscene-dialog');
  if (!dialogEl) {
    dialogEl = document.createElement('div');
    dialogEl.id = 'cutscene-dialog';
    dialogEl.className = 'hidden';
    const box = document.createElement('div');
    box.className = 'cutscene-dialog-box no-portrait';
    const portrait = document.createElement('img');
    portrait.className = 'cutscene-portrait hidden';
    portrait.alt = '';
    const content = document.createElement('div');
    content.className = 'cutscene-dialog-content';
    const sp = document.createElement('div');
    sp.className = 'cutscene-speaker';
    const tx = document.createElement('div');
    tx.className = 'cutscene-text';
    const hint = document.createElement('div');
    hint.className = 'cutscene-hint';
    hint.textContent = '▼';
    content.append(sp, tx, hint);
    box.append(portrait, content);
    dialogEl.appendChild(box);
    const container = document.getElementById('game-container');
    if (container) container.appendChild(dialogEl);
    else document.body.appendChild(dialogEl);
    dialogBoxEl = box; portraitEl = portrait; speakerEl = sp; textEl = tx; hintEl = hint;
    return;
  }
  dialogBoxEl = dialogEl.querySelector('.cutscene-dialog-box');
  portraitEl = dialogEl.querySelector('.cutscene-portrait');
  // migrate old structure (no portrait/content wrapper) — create if missing
  if (!portraitEl) {
    portraitEl = document.createElement('img');
    portraitEl.className = 'cutscene-portrait hidden';
    portraitEl.alt = '';
    dialogBoxEl.prepend(portraitEl);
  }
  let content = dialogEl.querySelector('.cutscene-dialog-content');
  if (!content) {
    content = document.createElement('div');
    content.className = 'cutscene-dialog-content';
    const spOld = dialogEl.querySelector('.cutscene-speaker');
    const txOld = dialogEl.querySelector('.cutscene-text');
    const hintOld = dialogEl.querySelector('.cutscene-hint');
    if (spOld && txOld && hintOld) {
      content.append(spOld, txOld, hintOld);
      dialogBoxEl.appendChild(content);
    }
  }
  speakerEl = dialogEl.querySelector('.cutscene-speaker');
  textEl = dialogEl.querySelector('.cutscene-text');
  hintEl = dialogEl.querySelector('.cutscene-hint');
}

function lerp(a,b,t){ return a + (b-a)*t; }

function interpolateKeyframes(kfs, t, defaults) {
  if (!kfs || !kfs.length) return { ...defaults };
  // sort by t
  const sorted = [...kfs].sort((a,b)=>a.t-b.t);
  if (t <= sorted[0].t) return { x: sorted[0].x ?? defaults.x, y: sorted[0].y ?? defaults.y, zoom: sorted[0].zoom ?? defaults.zoom ?? 1, scale: sorted[0].scale ?? defaults.scale };
  if (t >= sorted[sorted.length-1].t) {
    const last = sorted[sorted.length-1];
    return { x: last.x ?? defaults.x, y: last.y ?? defaults.y, zoom: last.zoom ?? defaults.zoom ?? 1, scale: last.scale ?? defaults.scale };
  }
  for (let i=0;i<sorted.length-1;i++) {
    const a=sorted[i], b=sorted[i+1];
    if (t>=a.t && t<b.t) {
      const dur = (b.t - a.t) || 1;
      const p = (t - a.t)/dur;
      const fn = easing(b.easing || a.easing || 'linear');
      const e = fn(p);
      const res = {};
      if (defaults.hasOwnProperty('x') || a.x!==undefined || b.x!==undefined) res.x = lerp(a.x ?? defaults.x, b.x ?? a.x ?? defaults.x, e);
      if (defaults.hasOwnProperty('y') || a.y!==undefined || b.y!==undefined) res.y = lerp(a.y ?? defaults.y, b.y ?? a.y ?? defaults.y, e);
      if (defaults.hasOwnProperty('zoom') || a.zoom!==undefined || b.zoom!==undefined) res.zoom = lerp(a.zoom ?? defaults.zoom ?? 1, b.zoom ?? a.zoom ?? defaults.zoom ?? 1, e);
      if (defaults.hasOwnProperty('scale') || a.scale!==undefined || b.scale!==undefined) res.scale = lerp(a.scale ?? defaults.scale ?? 1, b.scale ?? a.scale ?? defaults.scale ?? 1, e);
      return res;
    }
  }
  return { ...defaults };
}

function computeCamera(data, elapsed) {
  const defaults = { x:0, y:0, zoom:1 };
  if (!data.camera || !data.camera.keyframes || !data.camera.keyframes.length) return defaults;
  return interpolateKeyframes(data.camera.keyframes, elapsed, defaults);
}

function computeCharacterState(char, elapsed) {
  const base = { x: char.x ?? LOGICAL_W/2, y: char.y ?? LOGICAL_H/2, scale: char.scale ?? 1 };
  if (!char.keyframes || !char.keyframes.length) return base;
  return interpolateKeyframes(char.keyframes, elapsed, base);
}

function getEffectiveCharacterFrame(char){
  if (char.frame && typeof char.frame === 'object' && Number.isFinite(char.frame.w) && Number.isFinite(char.frame.h)) return char.frame;
  if (char.sprite && typeof char.sprite === 'string') {
    const r = resolveSpriteRef(char.sprite);
    if (r && r.frame) return r.frame;
  }
  return null;
}
function getEffectiveCharacterSrc(char){
  const r = resolveCharacterSprite(char);
  return r.src;
}
function resolveCharacterAtTime(char, t){
  // base
  let src = null, frame = null;
  if (char.frame && typeof char.frame === 'object') frame = char.frame;
  if (char.sprite && typeof char.sprite === 'string'){
    const r = resolveSpriteRef(char.sprite);
    if (r){ src = r.src; if(r.frame) frame = r.frame; }
  }
  if (char.src) src = char.src;
  // override with last keyframe <= t that has sprite/src/frame
  if (char.keyframes && Array.isArray(char.keyframes)){
    const sorted = [...char.keyframes].sort((a,b)=>a.t-b.t);
    for (const kf of sorted){
      if (kf.t <= t){
        if (kf.sprite && typeof kf.sprite === 'string'){
          const r = resolveSpriteRef(kf.sprite);
          if (r){ src = r.src; frame = r.frame || frame; }
          else { src = null; frame = null; }
          // if sprite ref not found, keep previous? but we set to null
          if (r) { src = r.src; frame = r.frame; }
          else if (kf.sprite) { /* unknown sprite — keep previous */ }
        }
        if (kf.frame && typeof kf.frame === 'object' && Number.isFinite(kf.frame.w)) frame = kf.frame;
        if (kf.src && typeof kf.src === 'string') src = kf.src;
      } else break;
    }
  }
  if (!src && char.src) src = char.src;
  return { src: src || char.src || null, frame };
}
function computeCharDrawPos(char, state, img, t) {
  // anchor bottom vs center — if frame present use frame size otherwise natural size, time-aware for per-keyframe sprite
  let fr = null;
  if (typeof t === 'number') {
    const at = resolveCharacterAtTime(char, t);
    fr = at.frame;
  } else {
    fr = getEffectiveCharacterFrame(char);
  }
  let w, h;
  if (fr) { w = fr.w; h = fr.h; }
  else { w = (img && img.naturalWidth) ? img.naturalWidth : 100; h = (img && img.naturalHeight) ? img.naturalHeight : 100; }
  const sw = w * state.scale;
  const sh = h * state.scale;
  if (char.anchor === 'bottom') {
    return { x: state.x - sw/2, y: state.y - sh, w: sw, h: sh };
  }
  return { x: state.x - sw/2, y: state.y - sh/2, w: sw, h: sh };
}
function getEffectivePortraitInfo(portraitRef){
  if (!portraitRef || typeof portraitRef !== 'string') return null;
  const trimmed = portraitRef.trim();
  if (!trimmed) return null;
  // try sprite library first (full sprite id like may-front)
  if (spriteLibrary && spriteLibrary[trimmed]) {
    const s = spriteLibrary[trimmed];
    return { src: s.src, frame: s.frame || null };
  }
  // try character group id (e.g. may) -> resolve to default sprite
  if (characterGroups && characterGroups[trimmed]) {
    const cg = characterGroups[trimmed];
    const def = cg.defaultSprite || (cg.sprites && cg.sprites[0]);
    if (def && spriteLibrary[def]) {
      const s = spriteLibrary[def];
      return { src: s.src, frame: s.frame || null };
    }
  }
  // otherwise treat as raw src path
  if (trimmed.includes('/') || trimmed.includes('.')) return { src: trimmed, frame: null };
  return null;
}

const BOX_GAP_DEFAULT = 1000; // ms linger between text boxes in same dialog (adjustable per box)
const BOX_GAP = BOX_GAP_DEFAULT; // legacy alias
function isAutoDialog(d){ return d.t == null || d.auto === true; }
export function getBoxGap(dialog, boxIndex){
  // gaps array stores linger after each box; supports aliases gaps/boxGaps/textGaps/lingers
  const arr = Array.isArray(dialog.gaps) ? dialog.gaps : Array.isArray(dialog.boxGaps) ? dialog.boxGaps : Array.isArray(dialog.textGaps) ? dialog.textGaps : Array.isArray(dialog.lingers) ? dialog.lingers : Array.isArray(dialog.linger) ? dialog.linger : null;
  if(arr && typeof arr[boxIndex] === 'number' && Number.isFinite(arr[boxIndex])) {
    const v = Math.max(0, Math.min(10000, Math.round(arr[boxIndex])));
    return v;
  }
  // also support texts as objects with gap/linger field
  const texts = dialog.texts || dialog.boxes || dialog.pages;
  if(Array.isArray(texts) && texts[boxIndex] && typeof texts[boxIndex] === 'object' && texts[boxIndex] !== null){
    const o = texts[boxIndex];
    if(typeof o.gap === 'number' && Number.isFinite(o.gap)) return Math.max(0, Math.min(10000, Math.round(o.gap)));
    if(typeof o.linger === 'number' && Number.isFinite(o.linger)) return Math.max(0, Math.min(10000, Math.round(o.linger)));
    if(typeof o.delay === 'number' && Number.isFinite(o.delay)) return Math.max(0, Math.min(10000, Math.round(o.delay)));
  }
  return BOX_GAP_DEFAULT;
}
export function getDialogTexts(d){
  if(!d) return [""];
  if(Array.isArray(d.texts) && d.texts.length) return d.texts.filter(s=>typeof s==='string');
  if(Array.isArray(d.boxes) && d.boxes.length) return d.boxes.filter(s=>typeof s==='string' || (s && typeof s.text==='string')).map(s=> typeof s==='string' ? s : s.text);
  if(Array.isArray(d.pages) && d.pages.length) return d.pages.filter(s=>typeof s==='string');
  if(typeof d.text === 'string' && d.text.length) return [d.text];
  return [""];
}
export function getDialogBoxCount(d){ return getDialogTexts(d).length; }
function getDialogTotalReveal(dialog){
  const texts = getDialogTexts(dialog);
  const cps = dialog.cps ?? 30;
  let total = 0;
  for(let i=0;i<texts.length;i++){
    total += (texts[i].length / cps) * 1000;
    if(i < texts.length - 1) total += getBoxGap(dialog, i);
  }
  return total;
}
function getEffectiveDialogs(dialogs){
  if (!dialogs || !dialogs.length) return [];
  const res = [];
  let lastEnd = 0;
  // Iterate in array order (editor order) and compute effectiveT sequentially for auto.
  // Auto dialogs get effectiveT = lastEnd; fixed dialogs get effectiveT = d.t
  for(let i=0;i<dialogs.length;i++){
    const d = dialogs[i];
    let effT;
    if (isAutoDialog(d)){
      effT = lastEnd;
    } else {
      effT = Number(d.t);
      if (!Number.isFinite(effT) || effT < 0) effT = lastEnd;
    }
    const totalReveal = getDialogTotalReveal(d);
    const dur = d.duration != null && Number.isFinite(d.duration) ? d.duration : 0;
    const end = effT + totalReveal + dur;
    res.push({...d, effectiveT: effT, effectiveEnd: end});
    lastEnd = Math.max(lastEnd, end);
    if (!isAutoDialog(d) && effT > lastEnd - totalReveal - dur) {
      lastEnd = end;
    }
  }
  // sort by effectiveT for display/playback order
  res.sort((a,b)=>a.effectiveT - b.effectiveT);
  return res;
}
function getSortedDialogs(data) {
  if (!data.dialogs || !data.dialogs.length) return [];
  // if any dialog is auto, use effective order
  const hasAuto = data.dialogs.some(isAutoDialog);
  if (hasAuto) return getEffectiveDialogs(data.dialogs);
  return [...data.dialogs].sort((a,b)=>a.t-b.t);
}

function updateDialogDisplay() {
  ensureDialogElements();
  if (!active || !dialogEl || !textEl) return;
  const dialogs = getSortedDialogs(active.data);
  if (!dialogs.length) {
    dialogEl.classList.add('hidden');
    return;
  }
  if (active.currentDialogIndex < 0 || active.currentDialogIndex >= dialogs.length) {
    dialogEl.classList.add('hidden');
    return;
  }
  const dlg = dialogs[active.currentDialogIndex];
  const dlgEffT = dlg.effectiveT ?? dlg.t ?? 0;
  if (active.elapsed < dlgEffT) {
    dialogEl.classList.add('hidden');
    return;
  }
  // duration: if set, hide after total reveal + duration (so it doesn't stay forever)
  const dlgTexts = getDialogTexts(dlg);
  const cps = dlg.cps ?? 30;
  const totalReveal = getDialogTotalReveal(dlg);
  if (dlg.duration != null && Number.isFinite(dlg.duration)) {
    const hideAt = active.dialogStart + totalReveal + dlg.duration;
    if (active.elapsed >= hideAt) {
      const next = dialogs[active.currentDialogIndex + 1];
      const nextEffT = next ? (next.effectiveT ?? next.t ?? 0) : Infinity;
      if (!next || active.elapsed < nextEffT) {
        dialogEl.classList.add('hidden');
        return;
      }
    }
  }
  const elapsedSinceStart = active.elapsed - active.dialogStart;
  // Determine which text box is active based on elapsed time (including gaps, default 1000ms, adjustable per box)
  let boxIdx = active.currentBoxIndex ?? 0;
  // If elapsed has naturally moved beyond current box's reveal+gap, auto-advance boxIdx for display
  // Compute box start offsets to find correct box for current elapsed (ignore stored index if time has passed)
  let computedIdx = 0;
  let offset = 0;
  for(let bi=0; bi<dlgTexts.length; bi++){
    const txt = dlgTexts[bi];
    const revealMs = (txt.length / cps) * 1000;
    const gap = bi < dlgTexts.length - 1 ? getBoxGap(dlg, bi) : 0;
    const boxEnd = offset + revealMs;
    const gapEnd = boxEnd + gap;
    if(elapsedSinceStart < boxEnd){
      computedIdx = bi;
      break;
    }
    if(elapsedSinceStart < gapEnd){
      computedIdx = bi; // still showing previous box fully during gap
      break;
    }
    offset = gapEnd;
    if(bi === dlgTexts.length -1){
      computedIdx = bi;
    } else if(elapsedSinceStart >= gapEnd && bi+1 < dlgTexts.length){
      // will be handled next loop iteration
      continue;
    }
  }
  // Clamp computed
  if(computedIdx < 0) computedIdx = 0;
  if(computedIdx >= dlgTexts.length) computedIdx = dlgTexts.length - 1;
  // If active.currentBoxIndex is behind computed (time has advanced), update it
  if(active.currentBoxIndex === undefined || computedIdx > active.currentBoxIndex){
    // auto-advance lingering gaps — keep revealed cleared
    if(active.revealed !== null && active.currentBoxIndex === computedIdx -1){
      // we had fast-forwarded previous box, clear for next
      active.revealed = null;
    }
    active.currentBoxIndex = computedIdx;
  }
  // Use computed box as fallback if stored index is out of sync due to fast-forward jumps
  const effectiveBoxIdx = active.currentBoxIndex ?? computedIdx;
  const fullText = dlgTexts[effectiveBoxIdx] || dlgTexts[0] || '';
  // Find offset for this box to compute reveal based on time within box
  let boxStartOffset = 0;
  for(let i=0;i<effectiveBoxIdx;i++){
    boxStartOffset += (dlgTexts[i].length / cps) * 1000 + getBoxGap(dlg, i);
  }
  const timeInBox = elapsedSinceStart - boxStartOffset;
  const revealForBox = Math.max(0, Math.min(fullText.length, Math.floor(timeInBox * cps / 1000)));
  const revealedCount = active.revealed !== null && active.currentBoxIndex === effectiveBoxIdx ? active.revealed : revealForBox;
  const revealed = typeof active.revealed === 'number' && active.currentBoxIndex === effectiveBoxIdx ? active.revealed : revealedCount;
  const visibleText = fullText.slice(0, Math.max(0, Math.min(fullText.length, revealed)));
  const isRevealing = revealed < fullText.length;
  dialogEl.classList.remove('hidden');
  if (dialogBoxEl) {
    const hasPortrait = !!(dlg.portrait && String(dlg.portrait).trim());
    const side = dlg.portraitSide === 'right' ? 'right' : 'left';
    dialogBoxEl.classList.toggle('no-portrait', !hasPortrait);
    dialogBoxEl.classList.toggle('portrait-left', hasPortrait && side === 'left');
    dialogBoxEl.classList.toggle('portrait-right', hasPortrait && side === 'right');
    if (hasPortrait) {
      dialogBoxEl.classList.remove('no-portrait');
    }
  }
  if (portraitEl) {
    if (dlg.portrait && String(dlg.portrait).trim()) {
      const info = getEffectivePortraitInfo(dlg.portrait);
      if (info && info.frame) {
        // cropped sprite — render to 72x72 canvas
        const cacheKey = info.src + JSON.stringify(info.frame);
        if (portraitEl.dataset.frameKey !== cacheKey) {
          portraitEl.dataset.frameKey = cacheKey;
          const sheet = getSheetImage(info.src);
          const applyCrop = () => {
            try {
              const fr = info.frame;
              const c = document.createElement('canvas');
              c.width = 72; c.height = 72;
              const cx = c.getContext('2d');
              // draw cropped region scaled to 72x72, preserve aspect by filling
              cx.imageSmoothingEnabled = true;
              cx.clearRect(0,0,72,72);
              cx.drawImage(sheet, fr.x, fr.y, fr.w, fr.h, 0, 0, 72, 72);
              portraitEl.src = c.toDataURL();
              portraitEl.alt = dlg.speaker || '';
              portraitEl.classList.remove('hidden');
            } catch {}
          };
          if (sheet && sheet.complete && sheet.naturalWidth) applyCrop();
          else if (sheet) sheet.addEventListener('load', applyCrop, {once:true});
          else {
            portraitEl.src = info.src;
            portraitEl.alt = dlg.speaker || '';
            portraitEl.classList.remove('hidden');
          }
        } else {
          portraitEl.alt = dlg.speaker || '';
          portraitEl.classList.remove('hidden');
        }
      } else if (info && info.src) {
        portraitEl.dataset.frameKey = '';
        if (portraitEl.src !== info.src && !portraitEl.src.endsWith(info.src)) portraitEl.src = info.src;
        else if (!portraitEl.getAttribute('src')) portraitEl.src = info.src;
        portraitEl.alt = dlg.speaker || '';
        portraitEl.classList.remove('hidden');
      } else {
        // raw path fallback
        const raw = String(dlg.portrait).trim();
        portraitEl.dataset.frameKey = '';
        if (portraitEl.src !== raw && !portraitEl.src.endsWith(raw)) portraitEl.src = raw;
        else if (!portraitEl.getAttribute('src')) portraitEl.src = raw;
        portraitEl.alt = dlg.speaker || '';
        portraitEl.classList.remove('hidden');
      }
    } else {
      portraitEl.classList.add('hidden');
      portraitEl.removeAttribute('src');
      portraitEl.dataset.frameKey = '';
    }
  }
  if (speakerEl) {
    if (dlg.speaker) { speakerEl.textContent = dlg.speaker; speakerEl.style.display=''; }
    else { speakerEl.textContent=''; speakerEl.style.display='none'; }
  }
  if (textEl) {
    textEl.textContent = visibleText + (isRevealing ? '▌' : '');
  }
  if (hintEl) {
    hintEl.textContent = isRevealing ? '▸ fast-forward (Space/R/Click)' : '▼ next (Space/R/Click)';
    hintEl.style.opacity = isRevealing ? '0.7' : '1';
  }
}

export function isCutsceneActive() { return !!active; }
export function getActiveCutsceneId() { return activeId; }
export function getCutsceneTime() { return active ? active.elapsed : 0; }

export function playCutscene(idOrData, options={}) {
  ensureDialogElements();
  let data = null;
  if (typeof idOrData === 'string') {
    data = cutsceneCache.get(idOrData) || null;
    if (!data) {
      console.warn(`[cutscene] id ${idOrData} not preloaded, trying fetch...`);
      // async load then play
      loadCutscene(idOrData).then(d => { if (d) playCutscene(d, options); else console.warn(`[cutscene] not found ${idOrData}`); });
      return false;
    }
  } else if (idOrData && typeof idOrData === 'object') {
    data = idOrData;
    if (data.id) cutsceneCache.set(data.id, data);
  } else {
    console.warn('[cutscene] playCutscene invalid arg');
    return false;
  }
  const v = validateCutscene(data);
  if (!v.valid) { console.warn('[cutscene] invalid', v.errors); return false; }

  // Stop previous
  if (active && active.onComplete) try{ active.onComplete(false);}catch{}
  // Setup
  activeId = data.id;
  active = {
    data,
    elapsed: 0,
    bgImg: null,
    charImgs: new Map(),
    currentDialogIndex: -1,
    currentBoxIndex: 0,
    dialogStart: 0,
    revealed: null,
    onComplete: options.onComplete || null,
    duration: data.duration || 0,
  };
  // compute duration if missing
  if (!active.duration) {
    const dialogs = getSortedDialogs(data);
    if (dialogs.length) {
      const last = dialogs[dialogs.length-1];
      const lastT = last.effectiveT ?? last.t ?? 0;
      active.duration = lastT + getDialogTotalReveal(last) + 1200;
    } else active.duration = 8000;
  }
  // Load background image
  if (data.background && data.background.type !== 'color' && data.background.src) {
    const img = new Image();
    img.src = data.background.src;
    active.bgImg = img;
  }
  // Ensure sprite library loaded (async but continue)
  try { if (!spriteLibraryLoaded) loadSpriteLibrary(); } catch {}
  // Preload character images (resolve sprite -> src, including per-keyframe sprites)
  if (Array.isArray(data.characters)) {
    for (const ch of data.characters) {
      const res = resolveCharacterSprite(ch);
      const src = res.src || ch.src;
      if (src) {
        const img = getSheetImage(src);
        active.charImgs.set(ch.id, img);
      }
      if (Array.isArray(ch.keyframes)){
        for (const kf of ch.keyframes){
          if (kf.sprite){
            const r = resolveSpriteRef(kf.sprite);
            if (r && r.src) getSheetImage(r.src);
          }
          if (kf.src) getSheetImage(kf.src);
        }
      }
    }
  }
  // Preload dialog portrait images (resolve sprite ids)
  if (Array.isArray(data.dialogs)) {
    for (const d of data.dialogs) {
      if (d.portrait && String(d.portrait).trim()) {
        const pinfo = getEffectivePortraitInfo(d.portrait);
        const psrc = pinfo ? pinfo.src : String(d.portrait).trim();
        if (psrc) {
          const pim = getSheetImage(psrc);
        } else {
          const pim = new Image(); pim.src = String(d.portrait).trim();
        }
      }
    }
  }
  // Initialize dialog pointer to first dialog whose t <= 0? set to -1, will advance in update
  active.currentDialogIndex = -1;
  // find first dialog to show at 0 if any with t <=0, else wait
  // update will handle advancing
  // Hide HUD etc will be handled by main.js sync
  // Start at 0, advance if needed
  advanceDialogIfNeeded();
  updateDialogDisplay();
  // dispatch event
  try { window.dispatchEvent(new CustomEvent('cutscene:start', {detail:{id:activeId}})); } catch {}
  return true;
}

function advanceDialogIfNeeded() {
  if (!active) return;
  const dialogs = getSortedDialogs(active.data);
  if (!dialogs.length) return;
  // If no current dialog, pick next whose effectiveT <= elapsed
  if (active.currentDialogIndex < 0) {
    for (let i=0;i<dialogs.length;i++) {
      const effT = dialogs[i].effectiveT ?? dialogs[i].t ?? 0;
      if (effT <= active.elapsed) { active.currentDialogIndex = i; active.currentBoxIndex = 0; active.dialogStart = Math.max(effT, active.elapsed); active.revealed = null; }
    }
    // if none yet, wait for time to reach first
    if (active.currentDialogIndex < 0) {
      // check if upcoming dialog time reached on next update; keep hidden
    }
    return;
  }
  // else advance to next if current is done and next's effectiveT <= elapsed
  const nextIdx = active.currentDialogIndex + 1;
  const nextEffT = nextIdx < dialogs.length ? (dialogs[nextIdx].effectiveT ?? dialogs[nextIdx].t ?? 0) : Infinity;
  if (nextIdx < dialogs.length && nextEffT <= active.elapsed) {
    active.currentDialogIndex = nextIdx;
    active.currentBoxIndex = 0;
    active.dialogStart = Math.max(nextEffT, active.elapsed);
    active.revealed = null;
  }
}

export function updateCutscene(dtMs) {
  if (!active) return;
  // dtMs is seconds? main loop gives 1/60; we work in ms
  const dt = dtMs * 1000;
  if (typeof dt !== 'number' || !Number.isFinite(dt)) return;
  active.elapsed += dt;
  // auto-advance dialog visibility when its time comes and previous is fully revealed
  const dialogs = getSortedDialogs(active.data);
  if (dialogs.length) {
    if (active.currentDialogIndex < 0) {
      for (let i=0;i<dialogs.length;i++) if ((dialogs[i].effectiveT ?? dialogs[i].t ?? 0) <= active.elapsed) { active.currentDialogIndex=i; active.currentBoxIndex=0; active.dialogStart=dialogs[i].effectiveT ?? dialogs[i].t ?? active.elapsed; active.revealed=null; break; }
    }
    // duration auto-advance: if current dialog has duration and fully revealed + duration passed, advance to next
    if (active.currentDialogIndex >= 0 && active.currentDialogIndex < dialogs.length) {
      const cur = dialogs[active.currentDialogIndex];
      if (cur.duration != null && Number.isFinite(cur.duration)) {
        const totalReveal = getDialogTotalReveal(cur);
        const hideAt = active.dialogStart + totalReveal + cur.duration;
        if (active.elapsed >= hideAt) {
          const nextIdx = active.currentDialogIndex + 1;
          const nextEffT = nextIdx < dialogs.length ? (dialogs[nextIdx].effectiveT ?? dialogs[nextIdx].t ?? 0) : Infinity;
          if (nextIdx < dialogs.length && nextEffT <= active.elapsed + 50) {
            active.currentDialogIndex = nextIdx;
            active.currentBoxIndex = 0;
            active.dialogStart = Math.max(nextEffT, active.elapsed);
            active.revealed = null;
          } else if (nextIdx < dialogs.length) {
            // hide current until next arrives — keep index but display will hide via updateDialogDisplay
          } else {
            // last dialog duration expired — keep hidden until duration end, then endCutscene will handle
          }
        }
      }
    }
  }
  // auto-end after duration + dialogs done
  if (active.elapsed >= active.duration) {
    const lastDialogIdx = dialogs.length ? dialogs.length-1 : -1;
    if (lastDialogIdx < 0 || active.currentDialogIndex === lastDialogIdx) {
      // if last dialog is fully revealed, end
      if (lastDialogIdx < 0) { endCutscene(true); return; }
      const lastDlg = dialogs[lastDialogIdx];
      const totalReveal = getDialogTotalReveal(lastDlg);
      if (active.elapsed >= active.dialogStart + totalReveal + 800) { endCutscene(true); return; }
    }
  }
  updateDialogDisplay();
}

function endCutscene(completed) {
  if (!active) return;
  const cb = active.onComplete;
  const id = activeId;
  // hide dialog
  ensureDialogElements();
  if (dialogEl) dialogEl.classList.add('hidden');
  active = null;
  activeId = null;
  try { window.dispatchEvent(new CustomEvent('cutscene:end', {detail:{id, completed}})); } catch {}
  if (cb) try{ cb(completed);}catch{}
}

export function skipCutscene() {
  if (!active) return false;
  endCutscene(false);
  return true;
}

export function handleCutsceneInput(e) {
  if (!active) return false;
  // e is KeyboardEvent or MouseEvent; we check type
  // Fast-forward / advance logic: Space, KeyR, click
  const isSpace = e.type === 'keydown' && (e.code === 'Space' || e.key === ' ' || e.code === 'Space');
  const isR = e.type === 'keydown' && (e.code === 'KeyR' || e.key?.toLowerCase()==='r');
  const isClick = e.type === 'click' || e.type === 'mousedown';
  const isEscape = e.type === 'keydown' && (e.code==='Escape');
  if (!(isSpace || isR || isClick || isEscape)) return false;
  if (e.preventDefault) try{ e.preventDefault(); }catch{}
  const dialogs = getSortedDialogs(active.data);
  if (!dialogs.length) { endCutscene(true); return true; }
  // If no dialog yet shown (waiting for t), fast-forward time to next dialog?
  if (active.currentDialogIndex < 0) {
    // jump to next dialog's t
    const next = dialogs.find(d=> (d.effectiveT ?? d.t) > active.elapsed);
    if (next) { const eff = next.effectiveT ?? next.t; active.elapsed = eff; active.currentDialogIndex = dialogs.indexOf(next); active.dialogStart=eff; active.revealed=null; updateDialogDisplay(); return true; }
    return true;
  }
  const dlg = dialogs[active.currentDialogIndex];
  const dlgTexts = getDialogTexts(dlg);
  const cps = dlg.cps ?? 30;
  const curBoxIdx = active.currentBoxIndex ?? 0;
  const curText = dlgTexts[curBoxIdx] || dlgTexts[0] || "";
  const fullLen = curText.length;
  // Determine if current box is still revealing based on time or revealed override
  let boxStartOffset = 0;
  for(let i=0;i<curBoxIdx;i++) boxStartOffset += (dlgTexts[i].length / cps) * 1000 + getBoxGap(dlg, i);
  const timeInBox = active.elapsed - active.dialogStart - boxStartOffset;
  const isRevealing = (active.revealed === null || active.currentBoxIndex !== curBoxIdx) ? (Math.floor(Math.max(0,timeInBox)*cps/1000) < fullLen) : (active.revealed < fullLen);
  let currentRevealed = active.revealed !== null && active.currentBoxIndex === curBoxIdx ? active.revealed : Math.min(fullLen, Math.floor(Math.max(0,timeInBox)*cps/1000));
  if (currentRevealed < fullLen) {
    // first press: instant reveal current box
    active.revealed = fullLen;
    active.currentBoxIndex = curBoxIdx;
    updateDialogDisplay();
    return true;
  } else {
    // current box fully revealed — check if there is next box in same dialog
    if(curBoxIdx + 1 < dlgTexts.length){
      // advance to next text box within same dialog, skip linger gap
      let nextBoxOffset = 0;
      for(let i=0;i<=curBoxIdx;i++) nextBoxOffset += (dlgTexts[i].length / cps) * 1000 + getBoxGap(dlg, i);
      // next box starts at dialogStart + nextBoxOffset
      const nextBoxStart = active.dialogStart + nextBoxOffset;
      if(nextBoxStart > active.elapsed) active.elapsed = nextBoxStart;
      active.currentBoxIndex = curBoxIdx + 1;
      active.revealed = null;
      updateDialogDisplay();
      return true;
    }
    // no more boxes — advance to next dialog or close if last
    const nextIdx = active.currentDialogIndex + 1;
    if (nextIdx < dialogs.length) {
      const nextDlg = dialogs[nextIdx];
      const nextEff = nextDlg.effectiveT ?? nextDlg.t ?? 0;
      if (nextEff > active.elapsed) active.elapsed = nextEff;
      active.currentDialogIndex = nextIdx;
      active.currentBoxIndex = 0;
      active.dialogStart = active.elapsed;
      active.revealed = null;
      updateDialogDisplay();
      return true;
    } else {
      endCutscene(true);
      return true;
    }
  }
}

export function renderCutscene(bgCtx, fgCtx, W, H) {
  if (!active) return;
  const data = active.data;
  const cam = computeCamera(data, active.elapsed);
  const dpr = (typeof window !== 'undefined' ? (window.devicePixelRatio||1) : 1);
  // --- BG canvas ---
  if (bgCtx) {
    bgCtx.save();
    try { bgCtx.setTransform(dpr,0,0,dpr,0,0); } catch {}
    bgCtx.clearRect(0,0,W,H);
    // draw background with camera transform
    bgCtx.save();
    bgCtx.translate(-cam.x, -cam.y);
    bgCtx.scale(cam.zoom, cam.zoom);
    if (data.background && data.background.type === 'color') {
      bgCtx.fillStyle = data.background.color || '#1a1a1a';
      // fill expanded to cover pan
      bgCtx.fillRect(cam.x, cam.y, W/cam.zoom + Math.abs(cam.x)*0.5, H/cam.zoom + Math.abs(cam.y)*0.5);
      // simpler: fill logical space expanded
      bgCtx.fillRect(-2000, -2000, 6000, 6000);
    } else if (active.bgImg && active.bgImg.complete && active.bgImg.naturalWidth) {
      const img = active.bgImg;
      const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight) * 1.1; // cover with slight overscan for pan
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      const x = (W - w)/2;
      const y = (H - h)/2;
      bgCtx.drawImage(img, x, y, w, h);
    } else if (data.background && data.background.src) {
      // fallback solid
      bgCtx.fillStyle = data.background.color || '#2c3e50';
      bgCtx.fillRect(-1000,-1000,4000,4000);
    } else {
      bgCtx.fillStyle = '#1a1a1a';
      bgCtx.fillRect(-1000,-1000,4000,4000);
    }
    bgCtx.restore();
    bgCtx.restore();
  }
  // --- FG canvas (characters) ---
  if (fgCtx) {
    fgCtx.save();
    try { fgCtx.setTransform(dpr,0,0,dpr,0,0); } catch {}
    fgCtx.clearRect(0,0,W,H);
    fgCtx.save();
    fgCtx.translate(-cam.x, -cam.y);
    fgCtx.scale(cam.zoom, cam.zoom);
    const chars = Array.isArray(data.characters) ? [...data.characters].sort((a,b)=>(a.zIndex||0)-(b.zIndex||0)) : [];
    for (const ch of chars) {
      if (ch.visible === false) continue;
      const state = computeCharacterState(ch, active.elapsed);
      const at = resolveCharacterAtTime(ch, active.elapsed);
      const src = at.src || ch.src;
      let img = null;
      if (src) {
        img = getSheetImage(src);
        // fallback to preloaded map if not in cache
        if (!img || !img.complete) img = active.charImgs.get(ch.id) || getSheetImage(src);
      } else {
        img = active.charImgs.get(ch.id);
      }
      if (!img || !img.complete || !img.naturalWidth) {
        // placeholder box
        fgCtx.fillStyle = 'rgba(255,255,255,0.15)';
        fgCtx.strokeStyle = 'rgba(255,255,255,0.6)';
        fgCtx.lineWidth = 1.5;
        const sz = 60 * state.scale;
        fgCtx.fillRect(state.x - sz/2, state.y - sz/2, sz, sz);
        fgCtx.strokeRect(state.x - sz/2, state.y - sz/2, sz, sz);
        fgCtx.fillStyle = 'white';
        fgCtx.font = '600 10px system-ui';
        fgCtx.textAlign='center';
        fgCtx.fillText(ch.id, state.x, state.y);
        continue;
      }
      const pos = computeCharDrawPos(ch, state, img, active.elapsed);
      const fr = at.frame;
      if (fr) {
        // 9-arg: crop source rect, not expensive (same one blit)
        fgCtx.drawImage(img, fr.x, fr.y, fr.w, fr.h, pos.x, pos.y, pos.w, pos.h);
      } else {
        fgCtx.drawImage(img, pos.x, pos.y, pos.w, pos.h);
      }
    }
    fgCtx.restore();
    fgCtx.restore();
  }
}

// Expose for debug
try {
  if (typeof window !== 'undefined') {
    window.__cutscene = { playCutscene, loadCutscene, validateCutscene, isCutsceneActive, getActiveCutsceneId, handleCutsceneInput, skipCutscene, hasSeenCutscene, markCutsceneSeen, loadSeenCutscenes, clearSeenCutscenes, CUTSCENE_SEEN_KEY };
    window.__hasSeenCutscene = hasSeenCutscene;
    window.__markCutsceneSeen = markCutsceneSeen;
    window.__CUTSCENE_SEEN_KEY = CUTSCENE_SEEN_KEY;
  }
} catch {}
