// Cutscene editor — hidden endpoint, canvas preview, placement/scale/movement, dialog, export
import { validateCutscene } from "./cutscene.js";

const LOGICAL_W = 1280;
const LOGICAL_H = 720;
const PREVIEW_W = 960;
const PREVIEW_H = 540;
const scalePreview = PREVIEW_W / LOGICAL_W;

let scene = {
  id: "intro-mt-aeolus",
  title: "The Windy Peak",
  background: { type: "image", src: "./img/splash/background-gfg-splash.png", color: "#1a1a1a" },
  duration: 15000,
  camera: { keyframes: [{ t:0, x:0, y:0, zoom:1, easing:"easeInOut" },{ t:8000, x:120, y:40, zoom:1.4, easing:"easeInOut" }] },
  characters: [
    { id:"may", character:"may", x:320, y:520, scale:0.65, anchor:"bottom", zIndex:0, keyframes:[{t:0,x:320,y:520,scale:0.65,easing:"easeOut"},{t:4000,x:640,y:520,scale:0.65,easing:"linear"}] }
  ],
  dialogs: [
    { t:500, speaker:"May", text:"Welcome to Mt. Aeolus...", cps:32, portrait:"./img/splash/may-gfg-splash.png", portraitSide:"left" },
    { t:4500, speaker:"Grand Marshal", text:"Putting is for cowards!", cps:28, portrait:"./img/logo.png", portraitSide:"right" }
  ]
};

let selectedCharId = "may";
let scrubTime = 0;
let playing = false;
let playRaf = null;
let playStart = 0;
let dragCharId = null;
let isDragging = false;
let collapsedChars = new Set();
let collapsedDialogs = new Set();

// New Scene blank template
function createBlankScene(){
  return {
    id: "new-scene",
    title: "",
    background: { type: "image", src: "./img/splash/background-gfg-splash.png", color: "#1a1a1a" },
    duration: 15000,
    camera: { keyframes: [] },
    characters: [],
    dialogs: []
  };
}
function handleNewScene(){
  scene = createBlankScene();
  selectedCharId = "";
  scrubTime = 0;
  collapsedChars = new Set();
  collapsedDialogs = new Set();
  try{ localStorage.removeItem('cutsceneEditorDraft.v1'); }catch{}
  try{ localStorage.setItem('cutsceneEditorDraft.v1', JSON.stringify(scene)); }catch{}
  syncToUI(); renderCharList(); renderCameraKfs(); renderDialogList(); syncJson(); renderPreview();
  showToast('new scene — blank template');
}

// Image discovery including subfolders (for dropdowns)
let availableImages = [
  "./img/splash/background-gfg-splash.png",
  "./img/splash/middleground-gfg-splash.png",
  "./img/splash/foreground-gfg-splash.png",
  "./img/splash/may-gfg-splash.png",
  "./img/cutscenes/bg-club-house.png",
  "./img/cutscenes/bg-green.png",
  "./img/cutscenes/bg-mountains.png",
  "./img/cutscenes/chars-back.png",
  "./img/cutscenes/chars-front.png",
  "./img/cutscenes/chars-left.png",
  "./img/cutscenes/chars-right.png",
  "./img/cutscenes/chars-slicer.png",
  "./img/cutscenes/dialog-caddy.png",
  "./img/cutscenes/dialog-cortex.png",
  "./img/cutscenes/dialog-may.png",
  "./img/cutscenes/dialog-rat.png",
  "./img/cutscenes/dialog-slicer.png",
  "./img/cutscenes/portrait-acolyte.png",
  "./img/cutscenes/portrait-caddy.png",
  "./img/cutscenes/portrait-cortex.png",
  "./img/cutscenes/portrait-may.png",
  "./img/cutscenes/portrait-rat.png",
  "./img/cutscenes/portrait-slicer.png",
  "./img/gfg-splash.png",
  "./img/logo.png",
  "./img/golfbag.png",
  "./img/magnifier-icon.png",
  "./img/liquifier-icon.png",
  "./img/deflector-icon.png",
  "./img/rotator-icon.png",
  "./img/field-extender-icon.png",
  "./img/power-cell-icon.png",
  "./img/amplify-icon.png",
  "./img/nullify-icon.png",
  "./img/flip-icon.png",
  "./img/rotate-icon.png"
];
async function fetchFolderImages(folder){
  try{
    const res = await fetch(folder, {cache:'no-store'});
    if(!res.ok) return [];
    const text = await res.text();
    const re = /href="([^"]+\.(png|jpg|jpeg|webp|gif))"/gi;
    const out=[];
    let m;
    while((m=re.exec(text))){
      const href=m[1];
      if(href.startsWith('http') || href.startsWith('/')) continue;
      if(href.includes('..')) continue;
      // href may be "bg-club-house.png" when folder is ./img/cutscenes/
      // or "cutscenes/bg..." when folder is ./img/
      let full = href;
      if(!href.includes('/')){
        const folderNorm = folder.replace(/\/$/,'');
        full = folderNorm + '/' + href;
      } else if(href.startsWith('./')) {
        full = href;
      } else if(!href.startsWith('./img')){
        // relative from folder
        const folderNorm = folder.replace(/\/$/,'');
        full = folderNorm + '/' + href.split('/').pop();
      }
      // normalize to ./img/... form
      if(full.startsWith('img/')) full='./'+full;
      if(!full.startsWith('./img/')) full='./img/'+full.split('/').pop();
      out.push(full);
    }
    return out;
  }catch{ return []; }
}
async function refreshAvailableImages(){
  try{
    const lists = await Promise.all([
      fetchFolderImages('./img/'),
      fetchFolderImages('./img/cutscenes/'),
      fetchFolderImages('./img/splash/'),
      fetchFolderImages('./img/characters/'),
    ]);
    const flat = lists.flat().filter(Boolean);
    const merged = [...new Set([...availableImages, ...flat])].sort();
    // only keep that look like ./img/...
    availableImages = merged.filter(p=>p.startsWith('./img/'));
    // update bg src dropdown if present
    if(els.bgSrc){
      const cur = els.bgSrc.value || scene.background?.src || "";
      els.bgSrc.innerHTML='';
      for(const p of availableImages){
        const opt=document.createElement('option');
        opt.value=p;
        // show short name with folder
        opt.textContent=p.replace('./img/','');
        if(p===cur) opt.selected=true;
        els.bgSrc.appendChild(opt);
      }
      // ensure current custom still visible? keep fallback
      if(cur && !availableImages.includes(cur)){
        const opt=document.createElement('option');
        opt.value=cur; opt.textContent=cur.replace('./img/',''); opt.selected=true;
        els.bgSrc.appendChild(opt);
      }
    }
  }catch{}
}

const els = {};
function q(id){ return document.getElementById(id); }

function initEls(){
  els.sceneId = q('scene-id');
  els.sceneTitle = q('scene-title');
  els.sceneDuration = q('scene-duration');
  els.bgType = q('bg-type');
  els.bgSrc = q('bg-src');
  els.bgSrcCustom = q('bg-src-custom');
  els.bgColor = q('bg-color');
  els.charList = q('char-list');
  els.addChar = q('add-char');
  els.cameraKfs = q('camera-kfs');
  els.addCameraKf = q('add-camera-kf');
  els.canvas = q('preview-canvas');
  els.ctx = els.canvas.getContext('2d');
  els.dialogList = q('dialog-list');
  els.addDialog = q('add-dialog');
  els.scrub = q('scrub');
  els.scrubLabel = q('scrub-label');
  els.playBtn = q('play-btn');
  els.previewWrap = q('preview-wrap');
  els.previewDialog = q('preview-dialog');
  els.previewPortrait = q('preview-portrait');
  els.previewSpeaker = q('preview-speaker');
  els.previewText = q('preview-text');
  els.jsonPreview = q('json-preview');
  els.exportBtn = q('cutscene-export-button');
  els.importBtn = q('import-btn');
  els.importArea = q('import-area');
  els.toast = q('toast');
  els.loadSelect = q('load-cutscene-select');
  els.loadBtn = q('load-cutscene-btn');
  els.refreshBtn = q('refresh-cutscene-list');
  els.loadIdInput = q('load-cutscene-id');
  els.loadIdBtn = q('load-cutscene-id-btn');
  els.newSceneBtn = q('new-scene-button');
  // 12 — intro/outro
  els.introEnabled = q('intro-enabled');
  els.introBlackMs = q('intro-black-ms');
  els.introTitleFadeMs = q('intro-title-fade-ms');
  els.introHoldMs = q('intro-hold-ms');
  els.introFadeInMs = q('intro-fadein-ms');
  els.introTitle = q('intro-title');
  els.outroFadeOutMs = q('outro-fadeout-ms');
  els.previewIntroBtn = q('preview-intro-btn');
  els.clearIntroBtn = q('clear-intro-btn');
}

const easingFn = {
  linear: t=>t,
  easeIn: t=>t*t,
  easeOut: t=>1-Math.pow(1-t,2),
  easeInOut: t=> t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2,
};

function lerp(a,b,t){ return a+(b-a)*t; }
function interpolate(kfs, t, defaults){
  if(!kfs||!kfs.length) return {...defaults};
  const sorted=[...kfs].sort((a,b)=>a.t-b.t);
  if(t<=sorted[0].t) return {x:sorted[0].x??defaults.x, y:sorted[0].y??defaults.y, zoom:sorted[0].zoom??defaults.zoom??1, scale:sorted[0].scale??defaults.scale??1};
  if(t>=sorted[sorted.length-1].t){ const l=sorted[sorted.length-1]; return {x:l.x??defaults.x,y:l.y??defaults.y,zoom:l.zoom??defaults.zoom??1,scale:l.scale??defaults.scale??1};}
  for(let i=0;i<sorted.length-1;i++){
    const a=sorted[i],b=sorted[i+1];
    if(t>=a.t && t<b.t){
      const dur=(b.t-a.t)||1;
      const p=(t-a.t)/dur;
      const fn=easingFn[b.easing||a.easing||'linear']||easingFn.linear;
      const e=fn(p);
      const res={};
      if(defaults.hasOwnProperty('x')||a.x!==undefined||b.x!==undefined) res.x=lerp(a.x??defaults.x,b.x??a.x??defaults.x,e);
      if(defaults.hasOwnProperty('y')||a.y!==undefined||b.y!==undefined) res.y=lerp(a.y??defaults.y,b.y??a.y??defaults.y,e);
      if(defaults.hasOwnProperty('zoom')||a.zoom!==undefined||b.zoom!==undefined) res.zoom=lerp(a.zoom??defaults.zoom??1,b.zoom??a.zoom??defaults.zoom??1,e);
      if(defaults.hasOwnProperty('scale')||a.scale!==undefined||b.scale!==undefined) res.scale=lerp(a.scale??defaults.scale??1,b.scale??a.scale??defaults.scale??1,e);
      return res;
    }
  }
  return {...defaults};
}

function getCameraAt(t){
  const introCfgEC = getIntroForEditor();
  const introBeforeFadeEC = introCfgEC.introBeforeFade ?? (introCfgEC.total - (introCfgEC.fadeInMs||0));
  const eff = introBeforeFadeEC ? Math.max(0, t - introBeforeFadeEC) : t;
  // during fade-out, freeze at last
  const outro = getOutroForEditor();
  const contentDuration = scene.duration || 15000;
  const clamped = outro.fadeOutMs>0 ? Math.min(eff, contentDuration) : eff;
  return interpolate(scene.camera?.keyframes||[], clamped, {x:0,y:0,zoom:1});
}
function getCharAt(char, t){
  const introCfgGC = getIntroForEditor();
  const introBeforeFadeGC = introCfgGC.introBeforeFade ?? (introCfgGC.total - (introCfgGC.fadeInMs||0));
  const eff = introBeforeFadeGC ? Math.max(0, t - introBeforeFadeGC) : t;
  const outro = getOutroForEditor();
  const contentDuration = scene.duration || 15000;
  const clamped = outro.fadeOutMs>0 ? Math.min(eff, contentDuration) : eff;
  const base={x:char.x??640,y:char.y??360,scale:char.scale??1};
  if(!char.keyframes||!char.keyframes.length) return base;
  return interpolate(char.keyframes, clamped, base);
}
function getEffectiveSpriteId(ch, t){
  let baseId = ch.sprite || null;
  if(ch.character && characterGroups[ch.character]){
    const grp = characterGroups[ch.character];
    baseId = ch.sprite || grp.defaultSprite || (grp.sprites&&grp.sprites[0]) || null;
  }
  if(!ch.keyframes || !ch.keyframes.length) return baseId;
  const introCfg = getIntroForEditor();
  const introBeforeFade = introCfg.introBeforeFade ?? (introCfg.total - (introCfg.fadeInMs||0));
  const effT = introBeforeFade ? Math.max(0, t - introBeforeFade) : t;
  const outro = getOutroForEditor();
  const contentDuration = scene.duration || 15000;
  const clamped = outro.fadeOutMs>0 ? Math.min(effT, contentDuration) : effT;
  const sorted = [...ch.keyframes].sort((a,b)=>a.t-b.t);
  let eff = baseId;
  for(const kf of sorted){
    if(kf.t <= clamped && kf.sprite) eff = kf.sprite;
    else if(kf.t > clamped) break;
  }
  return eff;
}
function isAutoDialog(d){ return d.t == null || d.auto === true; }
// 12 — intro/outro helpers for editor
function getIntroForEditor(){
  const intro = scene.intro && typeof scene.intro==='object' ? scene.intro : null;
  if(!intro) return { blackMs:0, titleFadeMs:0, holdMs:0, fadeInMs:0, title:'', enabled:false, total:0, introBeforeFade:0 };
  const blackMs = Math.max(0, Math.min(10000, parseInt(intro.blackMs ?? intro.blackDuration ?? 0)||0));
  const titleFadeMs = Math.max(0, Math.min(5000, parseInt(intro.titleFadeMs ?? intro.textFadeMs ?? 0)||0));
  const holdMs = Math.max(0, Math.min(10000, parseInt(intro.holdMs ?? intro.pauseMs ?? 0)||0));
  const fadeInMs = Math.max(0, Math.min(10000, parseInt(intro.fadeInMs ?? intro.cutsceneFadeInMs ?? intro.sceneFadeMs ?? 0)||0));
  const title = typeof intro.title==='string' ? intro.title : '';
  const enabled = intro.enabled !== false && (intro.enabled===true || blackMs>0 || titleFadeMs>0 || holdMs>0 || fadeInMs>0 || !!title);
  const total = (enabled ? blackMs+titleFadeMs+holdMs+fadeInMs : 0);
  const introBeforeFade = blackMs+titleFadeMs+holdMs;
  return { blackMs, titleFadeMs, holdMs, fadeInMs, title, enabled, total, introBeforeFade };
}
function getOutroForEditor(){
  const outro = scene.outro && typeof scene.outro==='object' ? scene.outro : null;
  const flat = (!outro && (scene.fadeOutMs!==undefined || scene.fadeOutDuration!==undefined)) ? scene : null;
  const v = outro ? (outro.fadeOutMs ?? outro.fadeOutDuration) : (flat ? (flat.fadeOutMs ?? flat.fadeOutDuration) : 0);
  const fadeOutMs = Math.max(0, Math.min(10000, parseInt(v)||0));
  return { fadeOutMs, enabled: fadeOutMs>0 };
}
function getIntroTotalForEditor(){ return getIntroForEditor().total; }
function getIntroBeforeFadeForEditor(){ const c=getIntroForEditor(); return c.introBeforeFade ?? (c.total - (c.fadeInMs||0)); }
function getContentScrubTime(){ const c=getIntroForEditor(); const ibf=c.introBeforeFade ?? (c.total - (c.fadeInMs||0)); return scrubTime - ibf; }
function updateScrubLabel(){
  if(els.scrubLabel) els.scrubLabel.textContent = Math.round(getContentScrubTime()) + ' ms';
}
function syncIntroToSceneFromUI(){
  const enabled = els.introEnabled ? els.introEnabled.checked : false;
  const blackMs = Math.max(0, Math.min(10000, parseInt(els.introBlackMs?.value)||0));
  const titleFadeMs = Math.max(0, Math.min(5000, parseInt(els.introTitleFadeMs?.value)||0));
  const holdMs = Math.max(0, Math.min(10000, parseInt(els.introHoldMs?.value)||0));
  const fadeInMs = Math.max(0, Math.min(10000, parseInt(els.introFadeInMs?.value)||0));
  const title = (els.introTitle?.value||'').trim();
  const fadeOutMs = Math.max(0, Math.min(10000, parseInt(els.outroFadeOutMs?.value)||0));
  if(enabled || blackMs||titleFadeMs||holdMs||fadeInMs||title){
    if(!scene.intro || typeof scene.intro!=='object') scene.intro={};
    scene.intro.blackMs=blackMs;
    scene.intro.titleFadeMs=titleFadeMs;
    scene.intro.holdMs=holdMs;
    scene.intro.fadeInMs=fadeInMs;
    if(title) scene.intro.title=title; else delete scene.intro.title;
    scene.intro.enabled=enabled;
    // clean empty if all zero and disabled
    if(!enabled && blackMs===0 && titleFadeMs===0 && holdMs===0 && fadeInMs===0 && !title){
      delete scene.intro;
    }
  } else {
    delete scene.intro;
  }
  if(fadeOutMs>0){
    if(!scene.outro || typeof scene.outro!=='object') scene.outro={};
    scene.outro.fadeOutMs=fadeOutMs;
  } else {
    delete scene.outro;
    delete scene.fadeOutMs; delete scene.fadeOutDuration;
  }
}
const BOX_GAP_DEFAULT = 1000;
const BOX_GAP = BOX_GAP_DEFAULT; // legacy alias
function getBoxGapForEditor(dialog, boxIndex){
  const arr = Array.isArray(dialog.gaps) ? dialog.gaps : Array.isArray(dialog.boxGaps) ? dialog.boxGaps : Array.isArray(dialog.textGaps) ? dialog.textGaps : Array.isArray(dialog.lingers) ? dialog.lingers : null;
  if(arr && typeof arr[boxIndex] === 'number' && Number.isFinite(arr[boxIndex])) return Math.max(0, Math.min(10000, Math.round(arr[boxIndex])));
  const texts = dialog.texts || dialog.boxes || dialog.pages;
  if(Array.isArray(texts) && texts[boxIndex] && typeof texts[boxIndex] === 'object' && texts[boxIndex] !== null){
    const o = texts[boxIndex];
    if(typeof o.gap === 'number' && Number.isFinite(o.gap)) return Math.max(0, Math.min(10000, Math.round(o.gap)));
    if(typeof o.linger === 'number' && Number.isFinite(o.linger)) return Math.max(0, Math.min(10000, Math.round(o.linger)));
  }
  return BOX_GAP_DEFAULT;
}
function getDialogTextsForEditor(d){
  if(!d) return [""];
  if(Array.isArray(d.texts) && d.texts.length) return d.texts.filter(s=>typeof s==='string' || (s && typeof s.text==='string')).map(s=> typeof s==='string' ? s : s.text);
  if(Array.isArray(d.boxes) && d.boxes.length) return d.boxes.filter(s=>typeof s==='string' || (s && typeof s.text==='string')).map(s=> typeof s==='string' ? s : s.text);
  if(Array.isArray(d.pages) && d.pages.length) return d.pages.filter(s=>typeof s==='string' || (s && typeof s.text==='string')).map(s=> typeof s==='string' ? s : s.text);
  if(typeof d.text === 'string' && d.text.length) return [d.text];
  return [""];
}
function getDialogTotalRevealForEditor(d){
  const texts = getDialogTextsForEditor(d);
  const cps = d.cps ?? 20;
  let total = 0;
  for(let i=0;i<texts.length;i++){
    total += (texts[i].length / cps) * 1000;
    if(i < texts.length -1) total += getBoxGapForEditor(d, i);
  }
  return total;
}
function getEffectiveDialogsForEditor(dialogs){
  if (!dialogs || !dialogs.length) return [];
  const res = [];
  let lastEnd = 0;
  for(let i=0;i<dialogs.length;i++){
    const d = dialogs[i];
    let effT;
    if(isAutoDialog(d)){
      effT = lastEnd;
    } else {
      effT = Number(d.t);
      if(!Number.isFinite(effT) || effT < 0) effT = lastEnd;
    }
    const totalReveal = getDialogTotalRevealForEditor(d);
    const dur = d.duration != null && Number.isFinite(d.duration) ? d.duration : 0;
    const end = effT + totalReveal + dur;
    res.push({...d, effectiveT: effT, effectiveEnd: end, index: i});
    lastEnd = Math.max(lastEnd, end);
    if(!isAutoDialog(d) && effT > lastEnd - totalReveal - dur) lastEnd = end;
  }
  // sort by effectiveT for display/playback
  res.sort((a,b)=>a.effectiveT - b.effectiveT);
  return res;
}
function getEffectiveCharForPreview(ch, t){
  // during intro, clamp to 0
  const introCfgE = getIntroForEditor();
  const introBeforeFadeE = introCfgE.introBeforeFade ?? (introCfgE.total - (introCfgE.fadeInMs||0));
  const effT = introBeforeFadeE ? Math.max(0, t - introBeforeFadeE) : t;
  const clampedT = effT;
  // Resolve src/frame including per-keyframe sprite override and character group
  let baseSrc = ch.src;
  let baseFrame = ch.frame || null;
  // character group handling: if ch.character set, default to group's default sprite
  if(ch.character && characterGroups[ch.character]){
    const grp = characterGroups[ch.character];
    const def = ch.sprite || grp.defaultSprite || (grp.sprites&&grp.sprites[0]);
    if(def && spriteLibrary[def]){
      const s = spriteLibrary[def];
      baseSrc = s.src;
      baseFrame = s.frame || null;
    }
  } else if(ch.sprite && spriteLibrary[ch.sprite]){
    const s = spriteLibrary[ch.sprite];
    baseSrc = s.src;
    baseFrame = s.frame || null;
  }
  if(!ch.keyframes || !ch.keyframes.length) return {src: baseSrc, frame: baseFrame};
  const sorted = [...ch.keyframes].sort((a,b)=>a.t-b.t);
  let effSrc = baseSrc;
  let effFrame = baseFrame;
  for(const kf of sorted){
    if(kf.t <= clampedT){
      if(kf.sprite && spriteLibrary[kf.sprite]){
        const s = spriteLibrary[kf.sprite];
        effSrc = s.src;
        effFrame = s.frame || null;
      } else if(kf.character && characterGroups[kf.character]){
        const grp = characterGroups[kf.character];
        const def = kf.sprite || grp.defaultSprite || (grp.sprites&&grp.sprites[0]);
        if(def && spriteLibrary[def]){
          const s = spriteLibrary[def];
          effSrc = s.src;
          effFrame = s.frame || null;
        }
      } else if(kf.sprite && !spriteLibrary[kf.sprite]){
        // unknown sprite — ignore
      }
      if(kf.frame && typeof kf.frame.w === 'number') effFrame = kf.frame;
      if(kf.src) effSrc = kf.src;
    } else break;
  }
  return {src: effSrc, frame: effFrame};
}

let spriteLibrary = {};
let characterGroups = {}; // characterId -> {name, sprites:[], defaultSprite}
let spriteLibraryLoaded = false;
async function loadSpriteLibraryEditor(){
  const urls = ['./src/character-sprites.json','./src/sprites.json'];
  for (const url of urls){
    try{
      const res = await fetch(url, {cache:'no-store'});
      if (!res.ok) continue;
      const data = await res.json();
      let map = null;
      let charMap = null;
      if (data.sprites && typeof data.sprites === 'object') map = data.sprites;
      else if (data && typeof data === 'object' && !Array.isArray(data)){
        const keys = Object.keys(data);
        const isSpriteMap = keys.length && typeof data[keys[0]] === 'object' && data[keys[0]] && 'src' in data[keys[0]];
        if (isSpriteMap) map = data;
      }
      if (data.characters && typeof data.characters === 'object') charMap = data.characters;
      if (map && Object.keys(map).length){
        spriteLibrary = map;
        if (charMap) characterGroups = charMap;
        spriteLibraryLoaded = true; return map;
      }
      if (charMap && Object.keys(charMap).length){
        characterGroups = charMap;
      }
    } catch {}
  }
  spriteLibrary = {}; characterGroups = {}; spriteLibraryLoaded = true; return {};
}
const imgCache = new Map();
function getImg(src){
  if(!src) return null;
  if(imgCache.has(src)) return imgCache.get(src);
  const im=new Image();
  im.src=src;
  imgCache.set(src, im);
  return im;
}
function renderPreview(){
  const ctx=els.ctx;
  if(!ctx) return;
  const cam=getCameraAt(scrubTime);
  // clear
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,PREVIEW_W,PREVIEW_H);
  // bg with camera
  ctx.save();
  ctx.scale(scalePreview, scalePreview);
  ctx.translate(-cam.x, -cam.y);
  ctx.scale(cam.zoom, cam.zoom);
  if(scene.background?.type==='color'){
    ctx.fillStyle=scene.background.color||'#1a1a1a';
    ctx.fillRect(-1000,-1000,4000,4000);
  } else {
    const src=scene.background?.src;
    const im=getImg(src);
    if(im && im.complete && im.naturalWidth){
      const scale=Math.max(LOGICAL_W/im.naturalWidth, LOGICAL_H/im.naturalHeight)*1.1;
      const w=im.naturalWidth*scale, h=im.naturalHeight*scale;
      const x=(LOGICAL_W-w)/2, y=(LOGICAL_H-h)/2;
      ctx.drawImage(im,x,y,w,h);
    } else {
      ctx.fillStyle=scene.background?.color||'#2c3e50';
      ctx.fillRect(-1000,-1000,4000,4000);
      if(im) im.onload=()=>renderPreview();
    }
  }
  // characters sorted by zIndex — handle frame cropping (not expensive, 9-arg)
  const chars=[...(scene.characters||[])].sort((a,b)=>(a.zIndex||0)-(b.zIndex||0));
  for(const ch of chars){
    if(ch.visible===false) continue;
    const st=getCharAt(ch, scrubTime);
    // resolve effective sprite for current time (per-keyframe sprite or base)
    const eff = getEffectiveCharForPreview(ch, scrubTime);
    const src = eff.src || ch.src;
    const frame = eff.frame || ch.frame || null;
    const im=getImg(src);
    if(!im || !im.complete || !im.naturalWidth){
      ctx.fillStyle='rgba(255,255,255,0.12)';
      ctx.strokeStyle='rgba(255,255,255,0.6)';
      ctx.lineWidth=1.5/scalePreview;
      const sz=60*st.scale;
      ctx.fillRect(st.x-sz/2, st.y-sz/2, sz, sz);
      ctx.strokeRect(st.x-sz/2, st.y-sz/2, sz, sz);
      ctx.fillStyle='white'; ctx.font='600 10px system-ui'; ctx.textAlign='center';
      ctx.fillText(ch.id, st.x, st.y);
      if(im) im.onload=()=>renderPreview();
      continue;
    }
    let w, h;
    if(frame && Number.isFinite(frame.w) && Number.isFinite(frame.h)){ w=frame.w; h=frame.h; }
    else { w=im.naturalWidth; h=im.naturalHeight; }
    const sw=w*st.scale, sh=h*st.scale;
    let dx,dy;
    if(ch.anchor==='bottom'){ dx=st.x-sw/2; dy=st.y-sh; } else { dx=st.x-sw/2; dy=st.y-sh/2; }
    if(frame && Number.isFinite(frame.w)){
      ctx.drawImage(im, frame.x, frame.y, frame.w, frame.h, dx, dy, sw, sh);
    } else {
      ctx.drawImage(im, dx, dy, sw, sh);
    }
    // selection outline
    if(ch.id===selectedCharId){
      ctx.strokeStyle='#FFD700'; ctx.lineWidth=2/cam.zoom; ctx.strokeRect(dx, dy, sw, sh);
    }
  }
  ctx.restore();
  ctx.restore();

  // 12 — intro / outro overlay preview on canvas (black + title)
  try{
    const introP = getIntroForEditor();
    const outroP = getOutroForEditor();
    const introTotal = introP.total;
    const contentDuration = scene.duration || 15000;
    const introBeforeFadePrev = introP.introBeforeFade ?? (introP.total - (introP.fadeInMs||0));
    const totalActive = introBeforeFadePrev + contentDuration + outroP.fadeOutMs;
    let overlayAlpha = 0;
    let titleAlpha = 0;
    let titleToShow = introP.title || scene.title || scene.id || '';
    if(introP.enabled && scrubTime < introTotal){
      if(scrubTime < introP.blackMs){
        overlayAlpha = 1;
        titleAlpha = 0;
      } else if(scrubTime < introP.blackMs + introP.titleFadeMs){
        const p = introP.titleFadeMs>0 ? (scrubTime - introP.blackMs)/introP.titleFadeMs : 1;
        overlayAlpha = 1;
        titleAlpha = Math.max(0,Math.min(1,p));
      } else if(scrubTime < introP.blackMs + introP.titleFadeMs + introP.holdMs){
        overlayAlpha = 1;
        titleAlpha = 1;
      } else {
        const t0 = introP.blackMs + introP.titleFadeMs + introP.holdMs;
        const p = introP.fadeInMs>0 ? (scrubTime - t0)/introP.fadeInMs : 1;
        overlayAlpha = 1 - Math.max(0,Math.min(1,p));
        titleAlpha = 1 - Math.max(0,Math.min(1,p));
      }
    } else if(outroP.enabled && scrubTime >= totalActive - outroP.fadeOutMs){
      const p = outroP.fadeOutMs>0 ? (scrubTime - (totalActive - outroP.fadeOutMs))/outroP.fadeOutMs : 1;
      overlayAlpha = Math.max(0,Math.min(1,p));
      titleAlpha = 0;
    }
    if(overlayAlpha>0.001){
      ctx.save();
      ctx.setTransform(1,0,0,1,0,0);
      ctx.globalAlpha = overlayAlpha;
      ctx.fillStyle = '#000';
      ctx.fillRect(0,0,PREVIEW_W,PREVIEW_H);
      ctx.restore();
      if(titleToShow && titleAlpha>0.001){
        ctx.save();
        ctx.setTransform(1,0,0,1,0,0);
        ctx.globalAlpha = titleAlpha;
        ctx.fillStyle = '#fff';
        ctx.textAlign='center';
        ctx.textBaseline='middle';
        ctx.font='700 24px system-ui, sans-serif';
        // stroke for readability
        ctx.strokeStyle='rgba(0,0,0,0.75)';
        ctx.lineWidth=6;
        const cx = PREVIEW_W/2, cy = PREVIEW_H/2;
        try{ ctx.strokeText(titleToShow, cx, cy); }catch{}
        ctx.fillText(titleToShow, cx, cy);
        ctx.restore();
      }
    } else if(introP.enabled && scrubTime < introTotal && titleAlpha>0.001){
      // title without full overlay? already handled
    }
  }catch{}

  // dialog preview with portrait left/right, duration and auto (after previous) — offset by intro
  const introForDialog = getIntroForEditor();
  const introBeforeFadeDlg = introForDialog.introBeforeFade ?? (introForDialog.total - (introForDialog.fadeInMs||0));
  const outroForDialog = getOutroForEditor();
  const introBeforeFadeDlg2 = introForDialog.introBeforeFade ?? (introForDialog.total - (introForDialog.fadeInMs||0));
  const contentScrub = introBeforeFadeDlg2 ? scrubTime - introBeforeFadeDlg2 : scrubTime;
  const isInIntroDlg = introForDialog.enabled && scrubTime < (introForDialog.introBeforeFade ?? (introForDialog.total - (introForDialog.fadeInMs||0)));
  const isInOutroDlg = outroForDialog.enabled && scrubTime >= (introBeforeFadeDlg + (scene.duration||15000) + outroForDialog.fadeOutMs - outroForDialog.fadeOutMs);
  let cur=null;
  let curEff = null;
  if(!isInIntroDlg && !isInOutroDlg){
  const effDialogs = getEffectiveDialogsForEditor(scene.dialogs);
  for(let i=0;i<effDialogs.length;i++){
    const d = effDialogs[i];
    if(d.effectiveT <= contentScrub) { cur = d; curEff = d; }
    else break;
  }
  // use effective for next check — totalReveal includes boxes+gaps
  if(cur && curEff){
    const idxEff = effDialogs.indexOf(curEff);
    const effDialogs2 = effDialogs;
    const nextEff = effDialogs2[idxEff+1];
    if(nextEff && contentScrub>=nextEff.effectiveT) cur=null;
    else if(cur.duration != null && Number.isFinite(cur.duration)){
      const totalRevealTmp = getDialogTotalRevealForEditor(cur);
      const effT = curEff.effectiveT;
      if(contentScrub >= effT + totalRevealTmp + cur.duration) cur=null;
    }
  } else if(cur){
    const effDialogs3 = getEffectiveDialogsForEditor(scene.dialogs);
    const idx=effDialogs3.indexOf(curEff);
    const next=effDialogs3[idx+1];
    if(next && contentScrub>=next.effectiveT) cur=null;
  }
  }
  // expose effDialogs for later use in this scope? need to define for outer
  const _effDialogsForLater = getEffectiveDialogsForEditor(scene.dialogs);
  if(cur){
    const cps=cur.cps??20;
    const curTexts = getDialogTextsForEditor(cur);
    const effT2 = curEff?.effectiveT ?? cur.effectiveT ?? cur.t ?? 0;
    const elapsedInDlg = contentScrub - effT2;
    // find which text box is active (including gaps, default 1000ms, adjustable per box)
    let boxIdx = 0;
    let boxOffset = 0;
    let boxText = curTexts[0] || cur.text || "";
    let reveal = 0;
    if(curTexts.length > 1){
      let offset = 0;
      let found = false;
      for(let bi=0; bi<curTexts.length; bi++){
        const txt = curTexts[bi];
        const revealMs = (txt.length / cps) * 1000;
        const gap = bi < curTexts.length -1 ? getBoxGapForEditor(cur, bi) : 0;
        const boxEnd = offset + revealMs;
        const gapEnd = boxEnd + gap;
        if(elapsedInDlg < boxEnd){
          boxIdx = bi; boxOffset = offset; boxText = txt;
          reveal = Math.min(txt.length, Math.max(0, Math.floor((elapsedInDlg - offset)*cps/1000)));
          found = true; break;
        }
        if(elapsedInDlg < gapEnd){
          // lingering full text during gap
          boxIdx = bi; boxOffset = offset; boxText = txt;
          reveal = txt.length;
          found = true; break;
        }
        offset = gapEnd;
      }
      if(!found){
        // after all boxes, show last box fully
        boxIdx = curTexts.length -1;
        boxText = curTexts[boxIdx];
        reveal = boxText.length;
      }
      // override cur.text for rendering to use boxText
      cur = {...cur, text: boxText};
    } else {
      reveal=Math.min(cur.text.length, Math.max(0, Math.floor((scrubTime-effT2)*cps/1000)));
      boxText = cur.text;
    }
    els.previewDialog.classList.remove('hidden');
    const hasPortrait=!!(cur.portrait && String(cur.portrait).trim());
    const side=cur.portraitSide==='right'?'right':'left';
    els.previewDialog.classList.toggle('no-portrait', !hasPortrait);
    els.previewDialog.classList.toggle('portrait-left', hasPortrait && side==='left');
    els.previewDialog.classList.toggle('portrait-right', hasPortrait && side==='right');
    if(hasPortrait && els.previewPortrait){
      // resolve sprite id to src/frame if needed (like may-front)
      let pSrc = cur.portrait;
      let pFrame = null;
      if(spriteLibrary && spriteLibrary[pSrc]){
        pSrc = spriteLibrary[pSrc].src;
        pFrame = spriteLibrary[pSrc].frame || null;
      }
      if(pFrame){
        const sheet = getImg(pSrc);
        const apply = ()=>{
          try{
            const c = document.createElement('canvas');
            c.width=56; c.height=56;
            const cx=c.getContext('2d');
            cx.clearRect(0,0,56,56);
            cx.drawImage(sheet, pFrame.x, pFrame.y, pFrame.w, pFrame.h, 0,0,56,56);
            els.previewPortrait.src = c.toDataURL();
            els.previewPortrait.alt=cur.speaker||'';
            els.previewPortrait.classList.remove('hidden');
          }catch{}
        };
        const sImg = getImg(pSrc);
        if(sImg && sImg.complete && sImg.naturalWidth) apply();
        else if(sImg) sImg.addEventListener('load', apply, {once:true});
        else { els.previewPortrait.src=pSrc; els.previewPortrait.alt=cur.speaker||''; els.previewPortrait.classList.remove('hidden'); }
      } else {
        els.previewPortrait.src=pSrc;
        els.previewPortrait.alt=cur.speaker||'';
        els.previewPortrait.classList.remove('hidden');
      }
    } else if(els.previewPortrait){
      els.previewPortrait.classList.add('hidden');
      els.previewPortrait.removeAttribute('src');
    }
    els.previewSpeaker.textContent=cur.speaker||'';
    els.previewSpeaker.style.display=cur.speaker?'':'none';
    els.previewText.textContent=cur.text.slice(0, reveal) + (reveal<cur.text.length?'▌':'');
  } else {
    els.previewDialog.classList.add('hidden');
    els.previewDialog.classList.add('no-portrait');
    els.previewDialog.classList.remove('portrait-left','portrait-right');
    if(els.previewPortrait) els.previewPortrait.classList.add('hidden');
  }
}

function syncFromUI(){
  scene.id=(els.sceneId.value.trim()||'intro-mt-aeolus');
  scene.title=els.sceneTitle.value.trim();
  scene.duration=Math.max(1000, Math.min(120000, parseInt(els.sceneDuration.value)||15000));
  const outro = getOutroForEditor();
  // scrub covers introBeforeFade + content + outro fade (so intro scrub-able) — time 0 at fade start per 11-cutscenes.md §12
  const _ibfSC = getIntroForEditor().introBeforeFade ?? (getIntroForEditor().total - (getIntroForEditor().fadeInMs||0));
  els.scrub.max=String(scene.duration + _ibfSC + outro.fadeOutMs);
  const bgType=els.bgType.value;
  const custom=els.bgSrcCustom.value.trim();
  const sel=els.bgSrc.value;
  scene.background={ type:bgType, src: custom || sel, color: els.bgColor.value };
  // intro/outro are synced via syncIntroToSceneFromUI (called from input handlers)
  // characters and camera/dialogs are synced via individual handlers that mutate scene directly
}

function syncToUI(){
  els.sceneId.value=scene.id||'';
  els.sceneTitle.value=scene.title||'';
  els.sceneDuration.value=String(scene.duration||15000);
  const intro = getIntroForEditor();
  const outro = getOutroForEditor();
  const _ibfST = intro.introBeforeFade ?? (intro.total - (intro.fadeInMs||0));
  els.scrub.max=String((scene.duration||15000) + _ibfST + outro.fadeOutMs);
  els.bgType.value=scene.background?.type||'image';
  // try to match bgSrc
  const src=scene.background?.src||'';
  let matched=false;
  for(const opt of els.bgSrc.options){ if(opt.value===src){ els.bgSrc.value=src; matched=true; break; } }
  if(!matched && src) els.bgSrcCustom.value=src;
  else if(matched) els.bgSrcCustom.value='';
  els.bgColor.value=scene.background?.color||'#1a1a1a';
  els.scrub.value=String(scrubTime);
  updateScrubLabel();
  // intro/outro UI
  if(els.introEnabled) els.introEnabled.checked = !!intro.enabled;
  if(els.introBlackMs) els.introBlackMs.value = String(intro.blackMs||0);
  if(els.introTitleFadeMs) els.introTitleFadeMs.value = String(intro.titleFadeMs||0);
  if(els.introHoldMs) els.introHoldMs.value = String(intro.holdMs||0);
  if(els.introFadeInMs) els.introFadeInMs.value = String(intro.fadeInMs||0);
  if(els.introTitle) els.introTitle.value = intro.title || '';
  if(els.outroFadeOutMs) els.outroFadeOutMs.value = String(outro.fadeOutMs||0);
  // disable inputs when not enabled? keep editable but visually indicate
  const en = !!intro.enabled;
  if(els.introBlackMs) els.introBlackMs.disabled = !en && false; // keep enabled for direct editing, but checkbox controls inclusion
}

function renderCharList(){
  // migrate legacy characters (src/frame/id) to character-based model if needed
  (scene.characters||[]).forEach(ch=>{
    if(!ch.character){
      // try to infer character from id/sprite
      if(ch.id && characterGroups[ch.id]){
        ch.character = ch.id;
      } else if(ch.sprite && typeof ch.sprite==='string'){
        for(const [cid,cg] of Object.entries(characterGroups)){
          if(cg.sprites && cg.sprites.includes(ch.sprite)){ ch.character = cid; break; }
        }
      }
      if(!ch.character){
        // try src/frame match by looking up sprite with same src
        const probeSrc = ch.src || '';
        if(probeSrc){
          for(const [sid, s] of Object.entries(spriteLibrary)){
            if(s.src===probeSrc){
              // find owner
              for(const [cid,cg] of Object.entries(characterGroups)){
                if(cg.sprites && cg.sprites.includes(sid)){ ch.character = cid; ch.sprite=sid; break; }
              }
              if(ch.character) break;
            }
          }
        }
      }
      if(!ch.character){
        const first = Object.keys(characterGroups)[0];
        if(first) ch.character = first;
      }
    }
    // id is derived from character name if needed
    if(!ch.id || ch.id!==ch.character) {
      // keep existing id if it equals character for uniqueness check, otherwise sync
      // if duplicate ids exist, dedupe
      const base = ch.character || 'char';
      if(!ch.id || !/^[a-z0-9][a-z0-9-_]{1,40}$/.test(ch.id) || !characterGroups[ch.id]){
        ch.id = base;
      }
      // ensure uniqueness later; for now keep
    }
    // remove legacy image/frame fields - source of truth is character-sprites.json
    if(ch.src) delete ch.src;
    if(ch.frame) delete ch.frame;
    // keep ch.sprite only if it belongs to the character's set, otherwise reset to default
    const grp = characterGroups[ch.character];
    if(grp){
      if(ch.sprite && !grp.sprites.includes(ch.sprite)){
        delete ch.sprite;
      }
      if(!ch.sprite && grp.defaultSprite) ch.sprite = grp.defaultSprite;
      // ensure id matches character for non-duplicate case
      if(scene.characters.filter(c=>c.character===ch.character).length===1){
        ch.id = ch.character;
      }
    }
  });
  // deduplicate ids that now collide (multiple same character) -> suffix
  const seenCharIds = new Map();
  (scene.characters||[]).forEach(ch=>{
    const base = ch.character || ch.id;
    let cand = base;
    let n=1;
    // count previous occurrence of same base
    const count = seenCharIds.get(base) || 0;
    if(count>0){
      cand = base + '-' + (count+1);
      // ensure not already taken
      let t=cand, m=1;
      while((scene.characters||[]).some(o=>o!==ch && o.id===t)){ t=cand+'-'+m; m++; }
      cand=t;
      ch.id=cand;
    }
    seenCharIds.set(base, (seenCharIds.get(base)||0)+1);
    ch.id=cand;
  });
  els.charList.innerHTML='';
  if(!Object.keys(characterGroups).length){
    const hint=document.createElement('div');
    hint.className='hint';
    hint.textContent='Loading characters from ./src/character-sprites.json...';
    els.charList.appendChild(hint);
    return;
  }
  (scene.characters||[]).forEach((ch, idx)=>{
    const grp = characterGroups[ch.character] || {name: ch.character, sprites: []};
    const displayName = grp.name || ch.character || ch.id;
    const isCollapsed = collapsedChars.has(ch.id);
    const div=document.createElement('div');
    div.className='item' + (isCollapsed ? ' collapsed' : '');
    if(ch.id===selectedCharId) { div.classList.add('selected'); div.style.borderColor='#FFD700'; }
    const charGroups = Object.keys(characterGroups);
    let charOpts = '';
    for (const cid of charGroups){
      const cg = characterGroups[cid];
      charOpts += `<option value="${cid}" ${ch.character===cid?'selected':''}>${cg.name||cid}</option>`;
    }
    div.innerHTML=`
      <div class="item-header"><span class="collapse-toggle">▼</span><h4>${displayName} ${ch.id===selectedCharId? '★':''}</h4><span class="small" style="margin-left:auto; color:#888;">${ch.character}</span></div>
      <div class="item-body">
      <label>Character</label><select data-k="character">${charOpts}</select>
      <div class="hint">Select from ./src/character-sprites.json — image/frame come from the sprite sheet</div>
      <div class="row"><div><label>x</label><input data-k="x" type="number" min="-1000" max="2280" value="${ch.x??640}"></div><div><label>y</label><input data-k="y" type="number" min="-1000" max="1720" value="${ch.y??360}"></div></div>
      <label>scale <span class="small">${(ch.scale??1).toFixed(2)}</span></label><input data-k="scale" type="range" min="0.2" max="3" step="0.05" value="${ch.scale??1}">
      <div class="row"><div><label>anchor</label><select data-k="anchor"><option value="center" ${ch.anchor==='center'?'selected':''}>center</option><option value="bottom" ${ch.anchor==='bottom'?'selected':''}>bottom</option></select></div><div><label>zIndex</label><input data-k="zIndex" type="number" value="${ch.zIndex??0}"></div></div>
      <div class="row" style="margin-top:6px"><button data-act="select" class="secondary">Select</button><button data-act="duplicate" class="secondary">Duplicate</button><button data-act="remove" class="danger">Remove</button></div>
      <div style="margin-top:8px"><strong class="small">Keyframes (movement & scale) — click canvas Shift adds</strong></div>
      <div data-k="kfs"></div>
      <button data-act="add-kf" class="secondary" style="margin-top:6px">+ Add keyframe at ${Math.round(getContentScrubTime())} ms</button>
      </div>
    `;
    // bind
    div.querySelectorAll('input,select').forEach(el=>{
      const handler = ()=>{
        const k=el.dataset.k;
        if(k==='character'){
          const v=el.value;
          if(v && characterGroups[v]){
            // ensure not creating duplicate character id if already exists elsewhere
            const existing = scene.characters.find((c,i)=>i!==idx && c.character===v && c.id===v);
            // allow duplicate but will suffix on next render
            ch.character = v;
            // reset to default sprite for new character (base)
            delete ch.sprite;
            // dedupe id
            ch.id = v;
            let nid=v, n=1;
            while(scene.characters.find((c,i)=>i!==idx && c.id===nid)){ nid = v + '-' + (n+1); n++; }
            ch.id=nid;
            selectedCharId=ch.id;
            renderCharList();
          }
        }
        else if(k==='x') ch.x=parseInt(el.value)||0;
        else if(k==='y') ch.y=parseInt(el.value)||0;
        else if(k==='scale') { ch.scale=parseFloat(el.value)||1; const span=div.querySelector('span'); if(span) span.textContent=ch.scale.toFixed(2); }
        else if(k==='anchor') ch.anchor=el.value;
        else if(k==='zIndex') ch.zIndex=parseInt(el.value)||0;
        syncJson(); renderPreview();
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    });
    const header = div.querySelector('.item-header');
    if(header) header.addEventListener('click', (e)=>{
      if(e.target.closest('button')) return;
      if(collapsedChars.has(ch.id)) collapsedChars.delete(ch.id);
      else collapsedChars.add(ch.id);
      renderCharList();
    });
    const dupBtn = div.querySelector('[data-act="duplicate"]');
    if(dupBtn) dupBtn.addEventListener('click', ()=>{
      // duplicate same character type
      const baseChar = ch.character;
      let nid = baseChar, n=1;
      // find next free suffix
      const taken = new Set(scene.characters.map(c=>c.id));
      while(taken.has(nid)){ n++; nid = baseChar + '-' + n; }
      const copy = JSON.parse(JSON.stringify(ch));
      copy.character = baseChar;
      copy.id = nid;
      delete copy.src; delete copy.frame;
      // keep base sprite inherit (default) — don't copy per-char sprite override unless valid
      copy.x = (copy.x||640) + 20;
      copy.y = (copy.y||360) + 20;
      scene.characters.push(copy);
      selectedCharId = nid;
      renderCharList(); syncJson(); renderPreview();
    });
    div.querySelector('[data-act="select"]').addEventListener('click', ()=>{ selectedCharId=ch.id; renderCharList(); renderPreview(); });
    div.querySelector('[data-act="remove"]').addEventListener('click', ()=>{
      scene.characters.splice(idx,1);
      if(selectedCharId===ch.id) selectedCharId=scene.characters[0]?.id||'';
      renderCharList(); syncJson(); renderPreview();
    });
    div.querySelector('[data-act="add-kf"]').addEventListener('click', ()=>{
      if(!ch.keyframes) ch.keyframes=[];
      const introBeforeFadeAddKf = getIntroForEditor().introBeforeFade ?? (getIntroForEditor().total - (getIntroForEditor().fadeInMs||0));
      const effAddKf = Math.max(0, scrubTime - introBeforeFadeAddKf);
      const st=getCharAt(ch, scrubTime);
      const curSprite = getEffectiveSpriteId(ch, scrubTime);
      const kf = {t:effAddKf, x:Math.round(st.x), y:Math.round(st.y), scale:Number(st.scale.toFixed(2)), easing:'linear'};
      if(curSprite && curSprite !== (characterGroups[ch.character]?.defaultSprite || '')) {
        // only store if differs from default to keep JSON minimal; but allow explicit
        const def = characterGroups[ch.character]?.defaultSprite;
        if(curSprite !== def) kf.sprite = curSprite;
        else {
          // if default, still allow but we can omit; keep if user explicitly wants
        }
      } else if(curSprite) {
        // if base has no explicit sprite, store curSprite if not default
        const def = characterGroups[ch.character]?.defaultSprite;
        if(curSprite !== def) kf.sprite = curSprite;
      }
      ch.keyframes.push(kf);
      ch.keyframes.sort((a,b)=>a.t-b.t);
      renderCharList(); syncJson(); renderPreview();
    });
    // keyframe rows — with sprite selector filtered to this character
    const kfWrap=div.querySelector('[data-k="kfs"]');
    let kfSpriteOptions = [];
    if(ch.character && characterGroups[ch.character] && characterGroups[ch.character].sprites){
      kfSpriteOptions = characterGroups[ch.character].sprites.filter(id=> spriteLibrary[id]);
    }
    (ch.keyframes||[]).forEach((kf, kfi)=>{
      const row=document.createElement('div');
      row.className='kf-row';
      row.style.cursor='pointer';
      row.title='Click to jump to this keyframe time';
      const curKfSprite = kf.sprite || '';
      const defSprite = characterGroups[ch.character]?.defaultSprite || '';
      let kfSpriteOpts = `<option value="">(default: ${defSprite||'none'})</option>`;
      for(const sid of kfSpriteOptions){
        kfSpriteOpts += `<option value="${sid}" ${curKfSprite===sid?'selected':''}>${sid}</option>`;
      }
      if(curKfSprite && !kfSpriteOptions.includes(curKfSprite) && spriteLibrary[curKfSprite]){
        kfSpriteOpts += `<option value="${curKfSprite}" selected>${curKfSprite}</option>`;
      }
      row.innerHTML=`<input type="number" value="${kf.t}" style="width:60px" title="t ms"><input type="number" value="${kf.x}" style="width:56px" title="x"><input type="number" value="${kf.y}" style="width:56px" title="y"><input type="number" value="${kf.scale}" step="0.05" style="width:48px" title="scale"><select data-k="kf-sprite" style="min-width:90px">${kfSpriteOpts}</select><select style="min-width:70px"><option value="linear" ${kf.easing==='linear'?'selected':''}>linear</option><option value="easeIn" ${kf.easing==='easeIn'?'selected':''}>easeIn</option><option value="easeOut" ${kf.easing==='easeOut'?'selected':''}>easeOut</option><option value="easeInOut" ${kf.easing==='easeInOut'?'selected':''}>easeInOut</option></select><button data-act="jump" title="Jump to this time" style="padding:4px 6px;background:#1a3a8a;border-color:#2a4a9a">⏱</button><button class="danger" style="padding:4px 6px">✕</button>`;
      const inputs=row.querySelectorAll('input'); const sels=row.querySelectorAll('select');
      const spriteSel = sels[0]; const easingSel = sels[1];
      inputs[0].addEventListener('input',()=>{ kf.t=parseInt(inputs[0].value)||0; ch.keyframes.sort((a,b)=>a.t-b.t); syncJson(); renderPreview(); });
      inputs[1].addEventListener('input',()=>{ kf.x=parseInt(inputs[1].value)||0; syncJson(); renderPreview(); });
      inputs[2].addEventListener('input',()=>{ kf.y=parseInt(inputs[2].value)||0; syncJson(); renderPreview(); });
      inputs[3].addEventListener('input',()=>{ kf.scale=parseFloat(inputs[3].value)||1; syncJson(); renderPreview(); });
      spriteSel.addEventListener('change',()=>{
        const v=spriteSel.value;
        if(!v) delete kf.sprite;
        else kf.sprite=v;
        syncJson(); renderPreview();
      });
      easingSel.addEventListener('change',()=>{ kf.easing=easingSel.value; syncJson(); renderPreview(); });
      const jumpBtnC = row.querySelector('[data-act="jump"]');
      if(jumpBtnC) jumpBtnC.addEventListener('click',(e)=>{ e.stopPropagation(); const introBeforeFadeJumpC = getIntroBeforeFadeForEditor(); scrubTime = introBeforeFadeJumpC + kf.t; els.scrub.value = String(scrubTime); updateScrubLabel(); renderPreview(); });
      row.querySelector('button.danger').addEventListener('click',(e)=>{ e.stopPropagation(); ch.keyframes.splice(kfi,1); renderCharList(); syncJson(); renderPreview(); });
      row.addEventListener('click', (e)=>{
        if(e.target.tagName==='INPUT' || e.target.tagName==='SELECT' || e.target.tagName==='BUTTON') return;
        const introBeforeFadeRow = getIntroBeforeFadeForEditor();
        scrubTime = introBeforeFadeRow + kf.t;
        els.scrub.value = String(scrubTime);
        updateScrubLabel();
        renderPreview();
      });
      kfWrap.appendChild(row);
    });
    els.charList.appendChild(div);
  });
}

function renderCameraKfs(){
  els.cameraKfs.innerHTML='';
  const kfs=(scene.camera && scene.camera.keyframes)||[];
  kfs.sort((a,b)=>a.t-b.t);
  kfs.forEach((kf, idx)=>{
    const div=document.createElement('div');
    div.className='kf-row';
    div.style.cursor='pointer';
    div.title='Click to jump to this keyframe time';
    div.innerHTML=`<span class="small" style="min-width:28px">${idx}.</span><input type="number" value="${kf.t}" style="width:72px" title="t"><input type="number" value="${kf.x}" style="width:64px"><input type="number" value="${kf.y}" style="width:64px"><input type="number" value="${kf.zoom}" step="0.05" style="width:56px"><select><option value="linear" ${kf.easing==='linear'?'selected':''}>linear</option><option value="easeIn" ${kf.easing==='easeIn'?'selected':''}>easeIn</option><option value="easeOut" ${kf.easing==='easeOut'?'selected':''}>easeOut</option><option value="easeInOut" ${kf.easing==='easeInOut'?'selected':''}>easeInOut</option></select><button data-act="jump" title="Jump to this time" style="padding:4px 6px;background:#1a3a8a;border-color:#2a4a9a">⏱</button><button class="danger" style="padding:4px 6px">✕</button>`;
    const inputs=div.querySelectorAll('input'); const sel=div.querySelector('select');
    inputs[0].addEventListener('input',()=>{ kf.t=parseInt(inputs[0].value)||0; kfs.sort((a,b)=>a.t-b.t); syncJson(); renderPreview(); });
    inputs[1].addEventListener('input',()=>{ kf.x=parseInt(inputs[1].value)||0; syncJson(); renderPreview(); });
    inputs[2].addEventListener('input',()=>{ kf.y=parseInt(inputs[2].value)||0; syncJson(); renderPreview(); });
    inputs[3].addEventListener('input',()=>{ kf.zoom=parseFloat(inputs[3].value)||1; syncJson(); renderPreview(); });
    sel.addEventListener('change',()=>{ kf.easing=sel.value; syncJson(); renderPreview(); });
    const jumpBtn = div.querySelector('[data-act="jump"]');
    if(jumpBtn) jumpBtn.addEventListener('click',(e)=>{ e.stopPropagation(); const introBeforeFadeJump = getIntroBeforeFadeForEditor(); scrubTime = introBeforeFadeJump + kf.t; els.scrub.value = String(scrubTime); updateScrubLabel(); renderPreview(); });
    div.querySelector('button.danger').addEventListener('click',(e)=>{ e.stopPropagation(); kfs.splice(idx,1); renderCameraKfs(); syncJson(); renderPreview(); });
    div.addEventListener('click', (e)=>{
      if(e.target.tagName==='INPUT' || e.target.tagName==='SELECT' || e.target.tagName==='BUTTON') return;
      const introBeforeFadeRow = getIntroBeforeFadeForEditor();
      scrubTime = introBeforeFadeRow + kf.t;
      els.scrub.value = String(scrubTime);
      updateScrubLabel();
      renderPreview();
    });
    els.cameraKfs.appendChild(div);
  });
}

function renderDialogList(){
  // include all discovered images including subfolders (./img/cutscenes/... etc) plus sprite ids
  const basePortraitOptions = [
    '', ...availableImages,
    './img/splash/may-gfg-splash.png','./img/splash/background-gfg-splash.png','./img/splash/middleground-gfg-splash.png','./img/splash/foreground-gfg-splash.png','./img/gfg-splash.png','./img/logo.png','./img/golfbag.png','./img/magnifier-icon.png','./img/liquifier-icon.png','./img/deflector-icon.png','./img/rotator-icon.png','./img/field-extender-icon.png','./img/power-cell-icon.png'
  ];
  // dedupe and keep order: availableImages first (includes subfolders correctly)
  const uniqBase = [...new Set(basePortraitOptions)];
  // include sprite ids from library (e.g. may-right)
  const spriteIds = Object.keys(spriteLibrary);
  const portraitOptions = [...uniqBase, ...spriteIds];
  els.dialogList.innerHTML='';
  (scene.dialogs||[]).forEach((d, idx)=>{
    const isCollapsed = collapsedDialogs.has(String(idx));
    const isAuto = isAutoDialog(d);
    const div=document.createElement('div');
    div.className='item' + (isCollapsed ? ' collapsed' : '');
    const selPortrait = d.portrait || '';
    const side = d.portraitSide || 'left';
    // Build portrait select options
    let optsHtml = portraitOptions.map(v=>`<option value="${v}" ${v===selPortrait?'selected':''}>${v ? v.replace('./img/','') : '(none)'}</option>`).join('');
    // if custom not in list
    if(selPortrait && !portraitOptions.includes(selPortrait)){
      optsHtml += `<option value="${selPortrait}" selected>${selPortrait}</option>`;
    }
    const durVal = d.duration != null ? d.duration : '';
    const effHeaderT = isAuto ? (getEffectiveDialogsForEditor(scene.dialogs).find(e=> e.index===idx)?.effectiveT ?? 0) : d.t;
    const isFirst = idx === 0;
    const isLast = idx === scene.dialogs.length - 1;
    const boxTexts = getDialogTextsForEditor(d);
    const headerName = d.name ? ` — ${d.name}` : '';
    div.innerHTML=`
      <div class="item-header"><span class="collapse-toggle">▼</span><h4>Dialog ${idx+1}${headerName} @ ${isAuto ? 'auto ('+Math.round(effHeaderT)+' ms)' : d.t+' ms'}</h4><span class="dialog-move" style="margin-left:auto; display:flex; gap:4px;"><button data-act="move-up" title="Move up" ${isFirst?'disabled':''} style="padding:2px 6px; font:700 12px system-ui; line-height:1; min-width:26px;">▲</button><button data-act="move-down" title="Move down" ${isLast?'disabled':''} style="padding:2px 6px; font:700 12px system-ui; line-height:1; min-width:26px;">▼</button></span></div>
      <div class="item-body">
      <label>Dialog name <span class="small">optional</span></label><input data-k="name" value="${(d.name||'').replace(/"/g,'&quot;')}" placeholder="e.g. greeting">
      <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" data-k="auto" ${isAuto?'checked':''} style="width:auto"><span>Start right after previous (auto)</span></label>
      <label>t (ms)</label><input data-k="t" type="number" min="0" step="100" value="${d.t ?? ''}" ${isAuto?'disabled':''} placeholder="auto">
      <label>speaker</label><input data-k="speaker" value="${d.speaker||''}" placeholder="May">
      <label>portrait (who is talking)</label><select data-k="portrait">${optsHtml}</select>
      <input data-k="portrait-custom" placeholder="or custom ./img/... path (overrides select if filled)" value="${!portraitOptions.includes(selPortrait) && selPortrait ? selPortrait : ''}" style="margin-top:4px">
      <div class="row"><div><label>side</label><select data-k="portraitSide"><option value="left" ${side==='left'?'selected':''}>left</option><option value="right" ${side==='right'?'selected':''}>right</option></select></div><div><label>cps</label><input data-k="cps" type="number" min="10" max="80" value="${d.cps??20}"></div></div>
      <label>duration (ms, auto-hide) <span class="small">empty = stay until next dialog / manual</span></label><input data-k="duration" type="number" min="0" step="100" placeholder="e.g. 2500" value="${durVal}">
      <label>Text boxes <span class="small">same window, 1000ms linger between (adjustable per box)</span></label>
      <div class="boxes-list" style="display:flex; flex-direction:column; gap:8px;"></div>
      <button data-act="add-box" class="secondary" style="width:100%; margin-top:6px;">+ Add text box</button>
      <div class="row" style="margin-top:8px;"><div><button data-act="preview" class="secondary" style="width:100%">Preview @ this dialog</button></div><div><button data-act="duplicate" class="secondary" style="width:100%">Duplicate</button></div><div><button data-act="remove" class="danger" style="width:100%">Remove</button></div></div>
      </div>
    `;
    // render text boxes with per-box linger (gap) — default 1000ms
    const boxesWrap = div.querySelector('.boxes-list');
    let boxGaps = (() => {
      let arr = Array.isArray(d.gaps) ? [...d.gaps] : Array.isArray(d.boxGaps) ? [...d.boxGaps] : Array.isArray(d.textGaps) ? [...d.textGaps] : [];
      while(arr.length < boxTexts.length) arr.push(BOX_GAP_DEFAULT);
      return arr.slice(0, boxTexts.length);
    })();
    function syncBoxesToDialog(){
      // keep d.text in sync for backward compat (first box)
      const texts = boxTexts;
      const gaps = boxGaps.slice(0, Math.max(0, texts.length -1));
      // trim default gaps at end? keep all for explicitness
      if(texts.length === 1){
        d.text = texts[0];
        delete d.texts; delete d.boxes; delete d.pages;
        delete d.gaps; delete d.boxGaps; delete d.textGaps;
      } else if(texts.length > 1){
        d.texts = [...texts];
        d.text = texts[0];
        // store gaps array (linger after each box except last, last gap ignored)
        d.gaps = [...gaps];
        delete d.boxes; delete d.pages;
      } else {
        d.text = "";
        delete d.texts;
        delete d.gaps;
      }
      syncJson(); renderPreview();
    }
    function renderBoxes(){
      boxesWrap.innerHTML = '';
      boxTexts.forEach((txt, bIdx)=>{
        const isLastBox = bIdx === boxTexts.length - 1;
        const gapVal = !isLastBox ? getBoxGapForEditor({gaps: boxGaps, texts: boxTexts}, bIdx) : null;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; gap:6px; align-items:flex-start;';
        row.innerHTML = `
          <div style="flex:1; display:flex; flex-direction:column; gap:2px;">
            <label style="margin:0; font:600 10px system-ui; color:#aaa;">Box ${bIdx+1}</label>
            <textarea data-k="box-text" data-bidx="${bIdx}" placeholder="Dialog text..." style="min-height:56px;">${txt.replace(/</g,'&lt;')}</textarea>
            ${!isLastBox ? `<label style="margin:4px 0 2px; font:600 10px system-ui; color:#bbb;">Linger after this box (ms) <span class="small">default 1000</span></label><input type="number" data-k="box-gap" data-bidx="${bIdx}" min="0" max="10000" step="100" value="${gapVal}" placeholder="1000" style="padding:4px 6px; font:500 11px system-ui;">` : `<div style="margin-top:4px; font:500 10px system-ui; color:#888;">No linger — last box</div>`}
          </div>
          <div style="display:flex; flex-direction:column; gap:4px; margin-top:18px;">
            <button data-act="box-up" data-bidx="${bIdx}" title="Move box up" ${bIdx===0?'disabled':''} style="padding:2px 6px; font:700 10px system-ui;">▲</button>
            <button data-act="box-down" data-bidx="${bIdx}" title="Move box down" ${bIdx===boxTexts.length-1?'disabled':''} style="padding:2px 6px; font:700 10px system-ui;">▼</button>
            <button data-act="box-remove" data-bidx="${bIdx}" title="Remove box" class="danger" style="padding:2px 6px; font:700 10px system-ui;">✕</button>
          </div>
        `;
        boxesWrap.appendChild(row);
      });
      // bind box text inputs
      boxesWrap.querySelectorAll('textarea[data-k="box-text"]').forEach(ta=>{
        ta.addEventListener('input', ()=>{
          const bi = parseInt(ta.dataset.bidx);
          boxTexts[bi] = ta.value;
          syncBoxesToDialog();
        });
      });
      boxesWrap.querySelectorAll('input[data-k="box-gap"]').forEach(inp=>{
        inp.addEventListener('input', ()=>{
          const bi = parseInt(inp.dataset.bidx);
          let v = parseInt(inp.value);
          if(!Number.isFinite(v) || v < 0) v = 0;
          if(v > 10000) v = 10000;
          boxGaps[bi] = v;
          syncBoxesToDialog();
        });
        inp.addEventListener('change', ()=>{
          const bi = parseInt(inp.dataset.bidx);
          let v = parseInt(inp.value);
          if(!Number.isFinite(v) || v < 0) v = 0;
          if(v > 10000) v = 10000;
          boxGaps[bi] = v;
          syncBoxesToDialog();
        });
      });
      boxesWrap.querySelectorAll('[data-act="box-up"]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const bi = parseInt(btn.dataset.bidx);
          if(bi<=0) return;
          const tmp = boxTexts[bi];
          boxTexts[bi] = boxTexts[bi-1];
          boxTexts[bi-1] = tmp;
          const tmpG = boxGaps[bi];
          boxGaps[bi] = boxGaps[bi-1];
          boxGaps[bi-1] = tmpG;
          syncBoxesToDialog();
          renderDialogList();
        });
      });
      boxesWrap.querySelectorAll('[data-act="box-down"]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const bi = parseInt(btn.dataset.bidx);
          if(bi>=boxTexts.length-1) return;
          const tmp = boxTexts[bi];
          boxTexts[bi] = boxTexts[bi+1];
          boxTexts[bi+1] = tmp;
          const tmpG = boxGaps[bi];
          boxGaps[bi] = boxGaps[bi+1];
          boxGaps[bi+1] = tmpG;
          syncBoxesToDialog();
          renderDialogList();
        });
      });
      boxesWrap.querySelectorAll('[data-act="box-remove"]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const bi = parseInt(btn.dataset.bidx);
          if(boxTexts.length <= 1){
            // keep at least one empty box
            boxTexts[0] = "";
            boxGaps[0] = BOX_GAP_DEFAULT;
          } else {
            boxTexts.splice(bi,1);
            boxGaps.splice(bi,1);
          }
          syncBoxesToDialog();
          renderDialogList();
        });
      });
    }
    renderBoxes();
    div.querySelector('[data-act="add-box"]')?.addEventListener('click', ()=>{
      boxTexts.push("");
      boxGaps.push(BOX_GAP_DEFAULT);
      syncBoxesToDialog();
      renderDialogList();
    });
    div.querySelectorAll('input,textarea,select').forEach(el=>{
      el.addEventListener('input',()=>{
        const k=el.dataset.k;
        if(k==='box-text') return; // handled by boxesWrap listeners
        if(k==='auto'){
          const checked = el.checked;
          if(checked){ d.t = null; d.auto = true; }
          else { delete d.auto; if(d.t == null) d.t = 0; }
          renderDialogList(); syncJson(); renderPreview(); return;
        }
        else if(k==='name'){ const v=el.value.trim(); if(v) d.name=v; else delete d.name; syncJson(); renderPreview(); return; }
        else if(k==='t') { const v=el.value.trim(); if(v===''){ d.t=null; d.auto=true; } else { d.t=parseInt(v)||0; delete d.auto; } }
        else if(k==='speaker') d.speaker=el.value.trim();
        else if(k==='text') d.text=el.value;
        else if(k==='cps') d.cps=parseInt(el.value)||20;
        else if(k==='duration'){
          const v=el.value.trim();
          if(v===''){ delete d.duration; }
          else { const n=parseInt(v); if(Number.isFinite(n) && n>=0) d.duration=n; else delete d.duration; }
        }
        else if(k==='portrait'){
          const v=el.value;
          if(v) d.portrait=v; else delete d.portrait;
          if(!v) delete d.portraitSide;
          else if(!d.portraitSide) d.portraitSide='left';
        }
        else if(k==='portrait-custom'){
          const v=el.value.trim();
          if(v){ d.portrait=v; if(!d.portraitSide) d.portraitSide='left'; }
        }
        else if(k==='portraitSide') d.portraitSide=el.value;
        syncJson(); renderPreview();
      });
      el.addEventListener('change',()=>{
        const k=el.dataset.k;
        if(k==='box-text') return;
        if(k==='auto'){
          const checked = el.checked;
          if(checked){ d.t = null; d.auto = true; }
          else { delete d.auto; if(d.t == null) d.t = 0; }
          renderDialogList(); syncJson(); renderPreview(); return;
        }
        if(k==='name'){ const v=el.value.trim(); if(v) d.name=v; else delete d.name; syncJson(); renderPreview(); return; }
        if(k==='portrait'){
          const v=el.value;
          if(v) d.portrait=v; else delete d.portrait;
          if(!v) delete d.portraitSide;
          else if(!d.portraitSide) d.portraitSide='left';
          syncJson(); renderPreview();
        }
        if(k==='portraitSide'){ d.portraitSide=el.value; syncJson(); renderPreview(); }
        if(k==='duration'){
          const v=el.value.trim();
          if(v===''){ delete d.duration; }
          else { const n=parseInt(v); if(Number.isFinite(n) && n>=0) d.duration=n; else delete d.duration; }
          syncJson(); renderPreview();
        }
        if(k==='t'){
          const v=el.value.trim();
          if(v===''){ d.t=null; d.auto=true; }
          else { d.t=parseInt(v)||0; delete d.auto; }
          renderDialogList(); syncJson(); renderPreview();
        }
      });
    });
    const header = div.querySelector('.item-header');
    if(header) header.addEventListener('click', (e)=>{
      if(e.target.closest('button')) return;
      const key = String(idx);
      if(collapsedDialogs.has(key)) collapsedDialogs.delete(key);
      else collapsedDialogs.add(key);
      renderDialogList();
    });
    // move up / down arrows — chronological reorder; if both have time set, swap timestamps as well
    const moveUpBtn = div.querySelector('[data-act="move-up"]');
    const moveDownBtn = div.querySelector('[data-act="move-down"]');
    function doMove(oldIdx, newIdx){
      if(newIdx < 0 || newIdx >= scene.dialogs.length) return;
      const a = scene.dialogs[oldIdx];
      const b = scene.dialogs[newIdx];
      const isAutoA = isAutoDialog(a);
      const isAutoB = isAutoDialog(b);
      // If both dialogs have time set (not auto), swap timestamps so chronological order stays consistent
      if(!isAutoA && !isAutoB){
        const tmp = a.t;
        a.t = b.t;
        b.t = tmp;
      }
      // swap positions
      const tmpDialog = scene.dialogs[oldIdx];
      scene.dialogs[oldIdx] = scene.dialogs[newIdx];
      scene.dialogs[newIdx] = tmpDialog;
      // collapsed state travels with the dialog, not the position — swap entries for the two indices
      const hasOld = collapsedDialogs.has(String(oldIdx));
      const hasNew = collapsedDialogs.has(String(newIdx));
      const corrected = new Set();
      for(const k of collapsedDialogs){
        const n = parseInt(k);
        if(n !== oldIdx && n !== newIdx) corrected.add(k);
      }
      if(hasOld) corrected.add(String(newIdx));
      if(hasNew) corrected.add(String(oldIdx));
      collapsedDialogs = corrected;
      renderDialogList(); syncJson(); renderPreview();
    }
    if(moveUpBtn) moveUpBtn.addEventListener('click', (e)=>{ e.stopPropagation(); doMove(idx, idx-1); });
    if(moveDownBtn) moveDownBtn.addEventListener('click', (e)=>{ e.stopPropagation(); doMove(idx, idx+1); });
    const dupBtn = div.querySelector('[data-act="duplicate"]');
    if(dupBtn) dupBtn.addEventListener('click', ()=>{
      const copy = JSON.parse(JSON.stringify(d));
      // Preserve auto vs fixed: if source was auto, keep auto; else offset t by +500 (null+500 would incorrectly become 500)
      if(d.t == null || d.auto === true){ copy.t = null; copy.auto = true; }
      else copy.t = (d.t ?? 0) + 500;
      // keep insertion order — do not sort, so duplicate stays right after original in authored order
      const at = scene.dialogs.indexOf(d);
      if(at >= 0) scene.dialogs.splice(at+1, 0, copy);
      else scene.dialogs.push(copy);
      renderDialogList(); syncJson(); renderPreview();
    });
    div.querySelector('[data-act="remove"]').addEventListener('click',()=>{ scene.dialogs.splice(idx,1); // clean collapsed keys
      const newSet = new Set();
      for(const k of collapsedDialogs){ const n=parseInt(k); if(n < idx) newSet.add(k); else if(n > idx) newSet.add(String(n-1)); }
      collapsedDialogs = newSet;
      renderDialogList(); syncJson(); renderPreview(); });
    div.querySelector('[data-act="preview"]').addEventListener('click',()=>{
      const eff = getEffectiveDialogsForEditor(scene.dialogs).find(e=> e.index===idx)?.effectiveT ?? d.t ?? 0;
      scrubTime = (getIntroForEditor().introBeforeFade ?? (getIntroForEditor().total - (getIntroForEditor().fadeInMs||0))) + eff; els.scrub.value=String(scrubTime); updateScrubLabel(); renderPreview();
    });
    els.dialogList.appendChild(div);
  });
}

function syncJson(){
  syncFromUI();
  // dialogs are kept in authored order; effective order for playback is computed via
  // getEffectiveDialogsForEditor / getSortedDialogs. Do NOT sort dialogs by raw t here,
  // otherwise toggling "auto" (t=null) would move the dialog to the end (1e9) and the
  // checkbox would appear to enable on the wrong dialog (visual index vs array index).
  // Only sort camera/char keyframes which are purely time-ordered.
  if(scene.camera && scene.camera.keyframes) scene.camera.keyframes.sort((a,b)=>a.t-b.t);
  for(const ch of scene.characters||[]) if(ch.keyframes) ch.keyframes.sort((a,b)=>a.t-b.t);
  const json=JSON.stringify(scene, null, 2);
  els.jsonPreview.value=json;
}

function showToast(msg){
  els.toast.textContent=msg;
  els.toast.classList.remove('hidden');
  clearTimeout(els.toast._t);
  els.toast._t=setTimeout(()=>els.toast.classList.add('hidden'), 1800);
}

function exportJson(){
  syncJson();
  const json=els.jsonPreview.value;
  // copy to clipboard
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(json).then(()=>showToast('copied to clipboard')).catch(()=>{
      els.jsonPreview.select(); try{document.execCommand('copy')}catch{}; showToast('copied to clipboard');
    });
  } else {
    els.jsonPreview.select(); try{document.execCommand('copy')}catch{}; showToast('copied to clipboard');
  }
}

function importJson(){
  const raw=els.importArea.value.trim();
  if(!raw) return;
  try{
    const data=JSON.parse(raw);
    const v=validateCutscene(data);
    if(!v.valid){ alert('Invalid: '+v.errors.join('; ')); return; }
    scene=data;
    // ensure defaults
    if(!scene.camera) scene.camera={keyframes:[]};
    if(!scene.characters) scene.characters=[];
    if(!scene.dialogs) scene.dialogs=[];
    // preserve authored order from file — do not sort dialogs here (effective order is computed for playback)
    selectedCharId=scene.characters[0]?.id||'';
    scrubTime=0; els.scrub.value='0';
    syncToUI(); renderCharList(); renderCameraKfs(); renderDialogList(); syncJson(); renderPreview();
    showToast('loaded');
  }catch(e){ alert('JSON parse failed: '+e.message); }
}

function applyLoadedScene(data){
  const v=validateCutscene(data);
  if(!v.valid){ alert('Invalid cutscene: '+v.errors.join('; ')); return false; }
  scene=data;
  if(!scene.camera) scene.camera={keyframes:[]};
  if(!scene.characters) scene.characters=[];
  if(!scene.dialogs) scene.dialogs=[];
  // preserve authored order from file
  selectedCharId=scene.characters[0]?.id||'';
  scrubTime=0;
  syncToUI(); renderCharList(); renderCameraKfs(); renderDialogList(); syncJson(); renderPreview();
  showToast('loaded '+ (scene.id||''));
  return true;
}

async function discoverCutsceneIdsFromFolder(){
  // Try to list folder ./src/cutscenes/ via directory listing (python -m http.server) and parse *.json
  const ids=new Set();
  try{
    const res=await fetch('./src/cutscenes/', {cache:'no-store'});
    if(res.ok){
      const ct=(res.headers.get('content-type')||'').toLowerCase();
      const text=await res.text();
      if(ct.includes('application/json')){
        try{
          const j=JSON.parse(text);
          if(Array.isArray(j)){
            for(const e of j){ if(e && typeof e==='object' && e.id) ids.add(String(e.id)); else if(typeof e==='string') ids.add(e.replace(/\.json$/,'')); }
          } else if(j && typeof j==='object' && Array.isArray(j.files)){
            for(const f of j.files) ids.add(String(f).replace(/\.json$/,''));
          } else if(j && j.id) ids.add(String(j.id));
        }catch{}
      } else {
        // HTML directory listing: href="*.json"
        const re=/href="([^"]*\.json)"/gi;
        let m;
        while((m=re.exec(text))){
          const href=m[1];
          if(href.includes('/')) {
            // href may be like "prologue.json" or "./prologue.json" or full path
            const file=href.split('/').pop();
            if(!file) continue;
            const id=file.replace(/\.json$/,'');
            if(/^[a-z0-9][a-z0-9-_]{2,40}$/.test(id)) ids.add(id);
          } else {
            const id=href.replace(/\.json$/,'').replace(/^\.\//,'');
            if(/^[a-z0-9][a-z0-9-_]{2,40}$/.test(id)) ids.add(id);
          }
        }
      }
    }
  }catch{}
  return [...ids];
}
async function refreshCutsceneList(){
  if(!els.loadSelect) return;
  els.loadSelect.innerHTML = '<option value="">(loading...)</option>';
  let ids = [];
  // Primary: folder listing (separate files, NOT src/cutscenes.json)
  ids = await discoverCutsceneIdsFromFolder();
  // Fallback: probe known id 'prologue' if listing empty or blocked (e.g. GitHub Pages without directory index)
  if(!ids.length){
    try{
      const r=await fetch('./src/cutscenes/prologue.json', {cache:'no-store'});
      if(r.ok){
        try{ const j=await r.clone().json(); if(j && j.id && /^[a-z0-9][a-z0-9-_]{2,40}$/.test(j.id)) ids.push(j.id); else ids.push('prologue'); }catch{ ids.push('prologue'); }
      }
    }catch{}
  }
  // Also include any ids already cached in localStorage draft? keep at least current scene id if valid and file exists?
  if(!ids.length && scene && scene.id && /^[a-z0-9][a-z0-9-_]{2,40}$/.test(scene.id)){
    // try to see if file for current scene exists? keep it as option
    ids.push(scene.id);
  }
  // deduplicate and sort, filter valid
  ids = [...new Set(ids)].filter(id=>/^[a-z0-9][a-z0-9-_]{2,40}$/.test(id)).sort();
  // Do NOT fetch src/cutscenes.json (deprecated)
  els.loadSelect.innerHTML = '';
  if(!ids.length){
    const opt=document.createElement('option');
    opt.value=''; opt.textContent='(no cutscenes found — create with New Scene)';
    els.loadSelect.appendChild(opt);
  } else {
    for(const id of ids){
      const opt=document.createElement('option');
      opt.value=id;
      opt.textContent=id;
      if(id===scene.id) opt.selected=true;
      els.loadSelect.appendChild(opt);
    }
  }
}

async function loadCutsceneById(id){
  if(!id) { alert('Enter a cutscene id'); return; }
  // Only per-file storage: ./src/cutscenes/<id>.json (src/cutscenes.json is NOT used)
  const urls = [`./src/cutscenes/${id}.json`];
  for(const url of urls){
    try{
      const res = await fetch(url, {cache:'no-store'});
      if(!res.ok) continue;
      const data = await res.json();
      let found = null;
      if(Array.isArray(data)){
        found = data.find(s=>s.id===id);
      } else if(data && data.id===id){
        found = data;
      } else if(data && data.id){
        // single file but id mismatch - still try if url was direct file
        if(url.includes(`${id}.json`)) found = data;
      }
      if(found){
        return applyLoadedScene(found);
      }
      // if url was direct file and data is the scene itself, use it
      if(url.includes(`${id}.json`) && data && data.id){
        return applyLoadedScene(data);
      }
    }catch{}
  }
  alert('Cutscene not found: '+id+' (tried ./src/cutscenes/'+id+'.json — separate files in ./src/cutscenes/; src/cutscenes.json is not used)');
  return false;
}

function handleCanvasClick(e){
  const rect=els.canvas.getBoundingClientRect();
  const x=(e.clientX-rect.left)/rect.width * LOGICAL_W;
  const y=(e.clientY-rect.top)/rect.height * LOGICAL_H;
  // convert logical through camera
  const cam=getCameraAt(scrubTime);
  const worldX = x/cam.zoom + cam.x;
  const worldY = y/cam.zoom + cam.y;
  const sel=scene.characters.find(c=>c.id===selectedCharId);
  if(!sel) return;
  if(e.shiftKey){
    // add keyframe — include current sprite variant for per-keyframe sprite control
    if(!sel.keyframes) sel.keyframes=[];
    const curSprite = getEffectiveSpriteId(sel, scrubTime);
    const introBeforeFadeClk = getIntroBeforeFadeForEditor();
    const effClk = Math.max(0, scrubTime - introBeforeFadeClk);
    const kf = {t:effClk, x:Math.round(worldX), y:Math.round(worldY), scale: sel.scale||1, easing:'linear'};
    if(curSprite) kf.sprite = curSprite;
    sel.keyframes.push(kf);
    sel.keyframes.sort((a,b)=>a.t-b.t);
  } else {
    sel.x=Math.round(worldX); sel.y=Math.round(worldY);
  }
  renderCharList(); syncJson(); renderPreview();
}
function handleMouseDown(e){
  const rect=els.canvas.getBoundingClientRect();
  const x=(e.clientX-rect.left)/rect.width * LOGICAL_W;
  const y=(e.clientY-rect.top)/rect.height * LOGICAL_H;
  const cam=getCameraAt(scrubTime);
  const worldX = x/cam.zoom + cam.x;
  const worldY = y/cam.zoom + cam.y;
  // hit test characters at scrubTime — uses effective frame size (cropped)
  let hit=null;
  for(const ch of [...scene.characters].sort((a,b)=>(b.zIndex||0)-(a.zIndex||0))){
    const st=getCharAt(ch, scrubTime);
    const eff=getEffectiveCharForPreview(ch, scrubTime);
    const src = eff.src || ch.src;
    const fr = eff.frame || ch.frame || null;
    const im=getImg(src);
    let w, h;
    if(fr && Number.isFinite(fr.w)){ w=fr.w*st.scale; h=fr.h*st.scale; }
    else { w=(im&&im.naturalWidth?im.naturalWidth:100)*st.scale; h=(im&&im.naturalHeight?im.naturalHeight:100)*st.scale; }
    let dx,dy;
    if(ch.anchor==='bottom'){ dx=st.x-w/2; dy=st.y-h; } else { dx=st.x-w/2; dy=st.y-h/2; }
    if(worldX>=dx && worldX<=dx+w && worldY>=dy && worldY<=dy+h){ hit=ch; break; }
  }
  if(hit){ selectedCharId=hit.id; dragCharId=hit.id; isDragging=true; renderCharList(); renderPreview(); e.preventDefault(); }
}

function handleMouseMove(e){
  if(!isDragging || !dragCharId) return;
  const rect=els.canvas.getBoundingClientRect();
  const x=(e.clientX-rect.left)/rect.width * LOGICAL_W;
  const y=(e.clientY-rect.top)/rect.height * LOGICAL_H;
  const cam=getCameraAt(scrubTime);
  const worldX = x/cam.zoom + cam.x;
  const worldY = y/cam.zoom + cam.y;
  const ch=scene.characters.find(c=>c.id===dragCharId);
  if(!ch) return;
  ch.x=Math.round(worldX); ch.y=Math.round(worldY);
  // also update keyframe at scrubTime if exists — use content time when intro present
  if(ch.keyframes){
    const introBeforeFadeMM = getIntroBeforeFadeForEditor();
    const effMM = Math.max(0, scrubTime - introBeforeFadeMM);
    const kf=ch.keyframes.find(k=>k.t===effMM) || ch.keyframes.find(k=>k.t===scrubTime);
    if(kf){ kf.x=ch.x; kf.y=ch.y; }
  }
  renderPreview(); syncJson();
}
function handleMouseUp(){ if(isDragging){ isDragging=false; dragCharId=null; renderCharList(); } }

function tickPlay(now){
  if(!playing) return;
  const elapsed=now-playStart;
  const ibfTick = getIntroForEditor().introBeforeFade ?? (getIntroForEditor().total - (getIntroForEditor().fadeInMs||0));
  const total = (scene.duration||15000) + ibfTick + getOutroForEditor().fadeOutMs;
  scrubTime=Math.round(Math.min(total, elapsed));
  els.scrub.value=String(scrubTime);
  updateScrubLabel();
  renderPreview();
  if(scrubTime>=total){ playing=false; els.playBtn.textContent='▶︎ Play'; return; }
  playRaf=requestAnimationFrame(tickPlay);
}

async function init(){
  initEls();
  // load draft from localStorage
  try{
    const raw=localStorage.getItem('cutsceneEditorDraft.v1');
    if(raw){ const d=JSON.parse(raw); const v=validateCutscene(d); if(v.valid){ scene=d; } }
  }catch{}
  try{ await loadSpriteLibraryEditor(); }catch{}
  try{ await refreshCutsceneList(); }catch{}
  try{ await refreshAvailableImages(); }catch{}
  // ensure bg dropdown reflects discovered subfolder images
  try{ if(els.bgSrc) { /* already populated by refreshAvailableImages */ } }catch{}
  syncToUI(); renderCharList(); renderCameraKfs(); renderDialogList(); syncJson(); renderPreview();

  // events
  els.sceneId.addEventListener('input', ()=>{ syncJson(); });
  els.sceneTitle.addEventListener('input', ()=>{ syncJson(); });
  els.sceneDuration.addEventListener('input', ()=>{ syncJson(); renderPreview(); });
  els.bgType.addEventListener('change', ()=>{ syncJson(); renderPreview(); });
  els.bgSrc.addEventListener('change', ()=>{ els.bgSrcCustom.value=''; syncJson(); renderPreview(); });
  els.bgSrcCustom.addEventListener('input', ()=>{ syncJson(); renderPreview(); });
  els.bgColor.addEventListener('input', ()=>{ syncJson(); renderPreview(); });
  // 12 — intro/outro controls
  function bindIntro(){
    if(els.introEnabled) els.introEnabled.addEventListener('change', ()=>{ syncIntroToSceneFromUI(); syncJson(); syncToUI(); renderPreview(); });
    if(els.introBlackMs) els.introBlackMs.addEventListener('input', ()=>{ syncIntroToSceneFromUI(); syncJson(); syncToUI(); renderPreview(); });
    if(els.introTitleFadeMs) els.introTitleFadeMs.addEventListener('input', ()=>{ syncIntroToSceneFromUI(); syncJson(); syncToUI(); renderPreview(); });
    if(els.introHoldMs) els.introHoldMs.addEventListener('input', ()=>{ syncIntroToSceneFromUI(); syncJson(); syncToUI(); renderPreview(); });
    if(els.introFadeInMs) els.introFadeInMs.addEventListener('input', ()=>{ syncIntroToSceneFromUI(); syncJson(); syncToUI(); renderPreview(); });
    if(els.introTitle) els.introTitle.addEventListener('input', ()=>{ syncIntroToSceneFromUI(); syncJson(); renderPreview(); });
    if(els.outroFadeOutMs) els.outroFadeOutMs.addEventListener('input', ()=>{ syncIntroToSceneFromUI(); syncJson(); syncToUI(); renderPreview(); });
    if(els.previewIntroBtn) els.previewIntroBtn.addEventListener('click', ()=>{
      scrubTime = 0;
      if(els.scrub) els.scrub.value='0';
      updateScrubLabel();
      renderPreview();
      // optional auto-play intro segment
      if(playing){ /* restart */ playing=false; cancelAnimationFrame(playRaf); }
      playing=true; playStart=performance.now(); els.playBtn.textContent='⏸︎ Pause';
      playRaf=requestAnimationFrame(tickPlay);
    });
    if(els.clearIntroBtn) els.clearIntroBtn.addEventListener('click', ()=>{
      delete scene.intro; delete scene.outro; delete scene.fadeOutMs; delete scene.fadeOutDuration;
      syncToUI(); syncJson(); renderPreview();
    });
  }
  bindIntro();
  els.addChar.addEventListener('click', ()=>{
    const groups = Object.keys(characterGroups);
    if(!groups.length){
      showToast('No characters in character-sprites.json');
      return;
    }
    // pick first unused character, otherwise first group
    const used = new Set((scene.characters||[]).map(c=>c.character));
    let pick = groups.find(g=>!used.has(g)) || groups[0];
    // generate unique id from character name
    let nid = pick;
    let n=1;
    const taken = new Set((scene.characters||[]).map(c=>c.id));
    while(taken.has(nid)){ n++; nid = pick + '-' + n; }
    const grp = characterGroups[pick];
    const defSprite = grp.defaultSprite || (grp.sprites && grp.sprites[0]);
    // store minimal: id = character name, character = group, optional sprite = default for validation
    const entry = {id:nid, character:pick, x:640, y:360, scale:1, anchor:'center', zIndex:scene.characters.length, keyframes:[]};
    if(defSprite) entry.sprite = defSprite;
    scene.characters.push(entry);
    selectedCharId=nid;
    renderCharList(); syncJson(); renderPreview();
  });
  els.addCameraKf.addEventListener('click', ()=>{
    if(!scene.camera) scene.camera={keyframes:[]};
    const introBeforeFade = getIntroBeforeFadeForEditor();
    const eff = Math.round(scrubTime - introBeforeFade);
    scene.camera.keyframes.push({t:eff, x:0, y:0, zoom:1, easing:'linear'});
    scene.camera.keyframes.sort((a,b)=>a.t-b.t);
    renderCameraKfs(); syncJson(); renderPreview();
  });
  els.addDialog.addEventListener('click', ()=>{
    if(!scene.dialogs) scene.dialogs=[];
    // default portrait is first character's src or may
    const defPortrait = scene.characters?.[0]?.src || './img/splash/may-gfg-splash.png';
    const introBeforeFade = getIntroBeforeFadeForEditor();
    const eff = Math.round(scrubTime - introBeforeFade);
    scene.dialogs.push({t:eff, speaker:'May', text:'New dialog...', cps:20, portrait:defPortrait, portraitSide:'left'});
    // keep insertion order — do not sort, effective order handles playback
    renderDialogList(); syncJson(); renderPreview();
  });
  els.scrub.addEventListener('input', ()=>{
    scrubTime=parseInt(els.scrub.value)||0;
    updateScrubLabel();
    renderPreview();
  });
  els.playBtn.addEventListener('click', ()=>{
    if(playing){ playing=false; cancelAnimationFrame(playRaf); els.playBtn.textContent='▶︎ Play'; return; }
    playing=true; playStart=performance.now()-scrubTime; els.playBtn.textContent='⏸︎ Pause';
    playRaf=requestAnimationFrame(tickPlay);
  });
  els.exportBtn.addEventListener('click', exportJson);
  els.importBtn.addEventListener('click', importJson);
  if(els.loadBtn) els.loadBtn.addEventListener('click', async ()=>{
    const id = els.loadSelect.value;
    if(!id){ alert('Select a cutscene'); return; }
    await loadCutsceneById(id);
  });
  if(els.refreshBtn) els.refreshBtn.addEventListener('click', async ()=>{
    await refreshCutsceneList();
    showToast('list refreshed');
  });
  if(els.loadIdBtn) els.loadIdBtn.addEventListener('click', async ()=>{
    const id = (els.loadIdInput.value||'').trim();
    await loadCutsceneById(id);
  });
  if(els.loadIdInput) els.loadIdInput.addEventListener('keydown', (e)=>{
    if(e.key==='Enter'){ e.preventDefault(); const id=(els.loadIdInput.value||'').trim(); loadCutsceneById(id); }
  });
  if(els.newSceneBtn) els.newSceneBtn.addEventListener('click', ()=>{
    handleNewScene();
  });

  // canvas
  els.canvas.addEventListener('click', handleCanvasClick);
  els.canvas.addEventListener('mousedown', handleMouseDown);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);

  // autosave draft
  setInterval(()=>{
    try{ localStorage.setItem('cutsceneEditorDraft.v1', JSON.stringify(scene)); }catch{}
  }, 1000);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
