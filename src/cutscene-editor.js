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
    { id:"may", src:"./img/splash/may-gfg-splash.png", x:320, y:520, scale:0.65, anchor:"bottom", zIndex:0, keyframes:[{t:0,x:320,y:520,scale:0.65,easing:"easeOut"},{t:4000,x:640,y:520,scale:0.65,easing:"linear"}] }
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
  return interpolate(scene.camera?.keyframes||[], t, {x:0,y:0,zoom:1});
}
function getCharAt(char, t){
  const base={x:char.x??640,y:char.y??360,scale:char.scale??1};
  if(!char.keyframes||!char.keyframes.length) return base;
  return interpolate(char.keyframes, t, base);
}
function getEffectiveSpriteId(ch, t){
  let baseId = ch.sprite || null;
  if(ch.character && characterGroups[ch.character]){
    const grp = characterGroups[ch.character];
    baseId = ch.sprite || grp.defaultSprite || (grp.sprites&&grp.sprites[0]) || null;
  }
  if(!ch.keyframes || !ch.keyframes.length) return baseId;
  const sorted = [...ch.keyframes].sort((a,b)=>a.t-b.t);
  let eff = baseId;
  for(const kf of sorted){
    if(kf.t <= t && kf.sprite) eff = kf.sprite;
    else if(kf.t > t) break;
  }
  return eff;
}
function isAutoDialog(d){ return d.t == null || d.auto === true; }
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
  const cps = d.cps ?? 30;
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
    if(kf.t <= t){
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

  // dialog preview with portrait left/right, duration and auto (after previous)
  const effDialogs = getEffectiveDialogsForEditor(scene.dialogs);
  let cur=null;
  let curEff = null;
  for(let i=0;i<effDialogs.length;i++){
    const d = effDialogs[i];
    if(d.effectiveT <= scrubTime) { cur = d; curEff = d; }
    else break;
  }
  // use effective for next check — totalReveal includes boxes+gaps
  if(cur && curEff){
    const idxEff = effDialogs.indexOf(curEff);
    const nextEff = effDialogs[idxEff+1];
    if(nextEff && scrubTime>=nextEff.effectiveT) cur=null;
    else if(cur.duration != null && Number.isFinite(cur.duration)){
      const totalRevealTmp = getDialogTotalRevealForEditor(cur);
      const effT = curEff.effectiveT;
      if(scrubTime >= effT + totalRevealTmp + cur.duration) cur=null;
    }
  } else if(cur){
    const idx=effDialogs.indexOf(curEff);
    const next=effDialogs[idx+1];
    if(next && scrubTime>=next.effectiveT) cur=null;
  }
  if(cur){
    const cps=cur.cps??30;
    const curTexts = getDialogTextsForEditor(cur);
    const effT2 = curEff?.effectiveT ?? cur.effectiveT ?? cur.t ?? 0;
    const elapsedInDlg = scrubTime - effT2;
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
  els.scrub.max=String(scene.duration);
  const bgType=els.bgType.value;
  const custom=els.bgSrcCustom.value.trim();
  const sel=els.bgSrc.value;
  scene.background={ type:bgType, src: custom || sel, color: els.bgColor.value };
  // characters and camera/dialogs are synced via individual handlers that mutate scene directly
}

function syncToUI(){
  els.sceneId.value=scene.id||'';
  els.sceneTitle.value=scene.title||'';
  els.sceneDuration.value=String(scene.duration||15000);
  els.scrub.max=String(scene.duration||15000);
  els.bgType.value=scene.background?.type||'image';
  // try to match bgSrc
  const src=scene.background?.src||'';
  let matched=false;
  for(const opt of els.bgSrc.options){ if(opt.value===src){ els.bgSrc.value=src; matched=true; break; } }
  if(!matched && src) els.bgSrcCustom.value=src;
  else if(matched) els.bgSrcCustom.value='';
  els.bgColor.value=scene.background?.color||'#1a1a1a';
  els.scrub.value=String(scrubTime);
  els.scrubLabel.textContent=Math.round(scrubTime)+' ms';
}

function renderCharList(){
  els.charList.innerHTML='';
  (scene.characters||[]).forEach((ch, idx)=>{
    const isCollapsed = collapsedChars.has(ch.id);
    const div=document.createElement('div');
    div.className='item' + (isCollapsed ? ' collapsed' : '');
    if(ch.id===selectedCharId) { div.classList.add('selected'); div.style.borderColor='#FFD700'; }
    // sprite library options — filtered by character group if set
    const allSpriteIds = Object.keys(spriteLibrary);
    const charGroups = Object.keys(characterGroups);
    const curCharacter = ch.character || '';
    let charOpts = `<option value="">(none) custom</option>`;
    for (const cid of charGroups){
      const cg = characterGroups[cid];
      charOpts += `<option value="${cid}" ${curCharacter===cid?'selected':''}>${cid} — ${cg.name||cid} (${(cg.sprites||[]).length} sprites)</option>`;
    }
    const curSprite = ch.sprite || '';
    // if character group selected, filter sprites to that group's list
    let spriteIds = allSpriteIds;
    if (curCharacter && characterGroups[curCharacter] && characterGroups[curCharacter].sprites){
      spriteIds = characterGroups[curCharacter].sprites.filter(id=> spriteLibrary[id]);
      // if current sprite not in group but still valid, keep it in list
      if (curSprite && !spriteIds.includes(curSprite) && spriteLibrary[curSprite]) spriteIds = [...spriteIds, curSprite];
    }
    let spriteOpts = `<option value="">(none) — use src/frame below</option>`;
    for (const sid of spriteIds){
      const s = spriteLibrary[sid];
      if(!s) continue;
      spriteOpts += `<option value="${sid}" ${curSprite===sid?'selected':''}>${sid} — ${s.src.replace('./img/','')} ${s.frame ? s.frame.w+'×'+s.frame.h : 'full'}</option>`;
    }
    // frame display
    const hasFrame = !!(ch.frame && typeof ch.frame.w === 'number');
    const frameX = hasFrame ? ch.frame.x : 0;
    const frameY = hasFrame ? ch.frame.y : 0;
    const frameW = hasFrame ? ch.frame.w : 64;
    const frameH = hasFrame ? ch.frame.h : 64;
    div.innerHTML=`
      <div class="item-header"><span class="collapse-toggle">▼</span><h4>${ch.id||'(no id)'} ${ch.id===selectedCharId? '★':''}</h4></div>
      <div class="item-body">
      <label>ID</label><input data-k="id" value="${ch.id||''}" placeholder="may">
      <label>Character (group from sprite library)</label><select data-k="character">${charOpts}</select>
      <div class="hint">group sprites into a character (e.g. may = may-front + may-right ...) — selects which sprites are available per keyframe</div>
      <label>Sprite (variant for this character)</label><select data-k="sprite">${spriteOpts}</select>
      <div class="hint">pick a saved sprite (may-right etc.) to auto-fill src + frame; per-keyframe sprite can be changed below</div>
      <label>src</label><select data-k="src">
        <option value="./img/splash/may-gfg-splash.png" ${ch.src==="./img/splash/may-gfg-splash.png"?'selected':''}>may-gfg-splash.png</option>
        <option value="./img/splash/background-gfg-splash.png" ${ch.src==="./img/splash/background-gfg-splash.png"?'selected':''}>background-gfg-splash.png</option>
        <option value="./img/logo.png" ${ch.src==="./img/logo.png"?'selected':''}>logo.png</option>
        <option value="./img/golfbag.png" ${ch.src==="./img/golfbag.png"?'selected':''}>golfbag.png</option>
        <option value="./img/magnifier-icon.png" ${ch.src==="./img/magnifier-icon.png"?'selected':''}>magnifier-icon.png</option>
        <option value="./img/liquifier-icon.png" ${ch.src==="./img/liquifier-icon.png"?'selected':''}>liquifier-icon.png</option>
        <option value="./img/deflector-icon.png" ${ch.src==="./img/deflector-icon.png"?'selected':''}>deflector-icon.png</option>
        <option value="./img/rotator-icon.png" ${ch.src==="./img/rotator-icon.png"?'selected':''}>rotator-icon.png</option>
      </select>
      <input data-k="src-custom" placeholder="or custom ./img/..." value="${(['./img/splash/may-gfg-splash.png','./img/logo.png','./img/golfbag.png','./img/magnifier-icon.png','./img/liquifier-icon.png','./img/deflector-icon.png','./img/rotator-icon.png','./img/splash/background-gfg-splash.png'].includes(ch.src)?'':ch.src)}" style="margin-top:4px">
      <div class="row"><div><label>frame x</label><input data-k="frame-x" type="number" min="0" value="${frameX}"></div><div><label>y</label><input data-k="frame-y" type="number" min="0" value="${frameY}"></div></div>
      <div class="row"><div><label>w</label><input data-k="frame-w" type="number" min="1" value="${frameW}"></div><div><label>h</label><input data-k="frame-h" type="number" min="1" value="${frameH}"></div><div style="display:flex;align-items:flex-end"><button data-act="clear-frame" class="secondary" style="width:100%">Clear frame (full image)</button></div></div>
      <div class="hint">frame crops part of PNG (transparent sheet with multiple characters) — not expensive, same 1 blit</div>
      <div class="row"><div><label>x</label><input data-k="x" type="number" min="0" max="1280" value="${ch.x??640}"></div><div><label>y</label><input data-k="y" type="number" min="0" max="720" value="${ch.y??360}"></div></div>
      <label>scale <span class="small">${(ch.scale??1).toFixed(2)}</span></label><input data-k="scale" type="range" min="0.2" max="3" step="0.05" value="${ch.scale??1}">
      <div class="row"><div><label>anchor</label><select data-k="anchor"><option value="center" ${ch.anchor==='center'?'selected':''}>center</option><option value="bottom" ${ch.anchor==='bottom'?'selected':''}>bottom</option></select></div><div><label>zIndex</label><input data-k="zIndex" type="number" value="${ch.zIndex??0}"></div></div>
      <div class="row" style="margin-top:6px"><button data-act="select" class="secondary">Select</button><button data-act="duplicate" class="secondary">Duplicate</button><button data-act="remove" class="danger">Remove</button></div>
      <div style="margin-top:8px"><strong class="small">Keyframes (movement & scale) — click canvas Shift adds</strong></div>
      <div data-k="kfs"></div>
      <button data-act="add-kf" class="secondary" style="margin-top:6px">+ Add keyframe at ${scrubTime} ms</button>
      </div>
    `;
    // bind
    div.querySelectorAll('input,select').forEach(el=>{
      const handler = (e)=>{
        const k=el.dataset.k;
        if(k==='id') ch.id=el.value.trim()||ch.id;
        else if(k==='character'){
          const v=el.value;
          if(!v){ delete ch.character; }
          else {
            ch.character = v;
            const grp = characterGroups[v];
            const def = grp && (grp.defaultSprite || (grp.sprites&&grp.sprites[0]));
            if(def && spriteLibrary[def]){
              ch.sprite = def;
              const s = spriteLibrary[def];
              ch.src = s.src;
              ch.frame = s.frame ? {...s.frame} : undefined;
            }
            renderCharList();
          }
        }
        else if(k==='sprite'){
          const v=el.value;
          if(!v){ delete ch.sprite; }
          else {
            ch.sprite = v;
            const s = spriteLibrary[v];
            if(s){ ch.src = s.src; ch.frame = s.frame ? {...s.frame} : undefined; renderCharList(); }
          }
        }
        else if(k==='src'){ ch.src=el.value; const cust=div.querySelector('[data-k="src-custom"]'); if(cust) cust.value=''; delete ch.sprite; if(ch.character) delete ch.character; }
        else if(k==='src-custom'){ const v=el.value.trim(); if(v){ ch.src=v; delete ch.sprite; if(ch.character) delete ch.character; } }
        else if(k==='frame-x'){ if(!ch.frame) ch.frame={x:0,y:0,w:64,h:64}; ch.frame.x=parseInt(el.value)||0; delete ch.sprite; }
        else if(k==='frame-y'){ if(!ch.frame) ch.frame={x:0,y:0,w:64,h:64}; ch.frame.y=parseInt(el.value)||0; delete ch.sprite; }
        else if(k==='frame-w'){ if(!ch.frame) ch.frame={x:0,y:0,w:64,h:64}; ch.frame.w=parseInt(el.value)||1; delete ch.sprite; }
        else if(k==='frame-h'){ if(!ch.frame) ch.frame={x:0,y:0,w:64,h:64}; ch.frame.h=parseInt(el.value)||1; delete ch.sprite; }
        else if(k==='x') ch.x=parseInt(el.value)||0;
        else if(k==='y') ch.y=parseInt(el.value)||0;
        else if(k==='scale') { ch.scale=parseFloat(el.value)||1; const span=div.querySelector('span'); if(span) span.textContent=ch.scale.toFixed(2); }
        else if(k==='anchor') ch.anchor=el.value;
        else if(k==='zIndex') ch.zIndex=parseInt(el.value)||0;
        if(k==='id' && ch.id) selectedCharId=ch.id;
        syncJson(); renderPreview();
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    });
    const clearBtn = div.querySelector('[data-act="clear-frame"]');
    if(clearBtn) clearBtn.addEventListener('click', ()=>{ delete ch.frame; delete ch.sprite; renderCharList(); syncJson(); renderPreview(); });
    const header = div.querySelector('.item-header');
    if(header) header.addEventListener('click', (e)=>{
      if(e.target.closest('button')) return;
      if(collapsedChars.has(ch.id)) collapsedChars.delete(ch.id);
      else collapsedChars.add(ch.id);
      renderCharList();
    });
    const dupBtn = div.querySelector('[data-act="duplicate"]');
    if(dupBtn) dupBtn.addEventListener('click', ()=>{
      const newId = ch.id + '-copy';
      let nid = newId, n=1;
      while(scene.characters.find(c=>c.id===nid)) { nid = newId + n; n++; }
      const copy = JSON.parse(JSON.stringify(ch));
      copy.id = nid;
      copy.x = (copy.x||640) + 20;
      copy.y = (copy.y||360) + 20;
      scene.characters.push(copy);
      selectedCharId = nid;
      // copy collapsed state? not needed
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
      const st=getCharAt(ch, scrubTime);
      const curSprite = getEffectiveSpriteId(ch, scrubTime);
      const kf = {t:scrubTime, x:Math.round(st.x), y:Math.round(st.y), scale:Number(st.scale.toFixed(2)), easing:'linear'};
      if(curSprite && curSprite !== ch.sprite) kf.sprite = curSprite;
      ch.keyframes.push(kf);
      ch.keyframes.sort((a,b)=>a.t-b.t);
      renderCharList(); syncJson(); renderPreview();
    });
    // keyframe rows — now with sprite selector and click-to-jump
    const kfWrap=div.querySelector('[data-k="kfs"]');
    // determine available sprites for this character's group
    let kfSpriteOptions = Object.keys(spriteLibrary);
    if(ch.character && characterGroups[ch.character] && characterGroups[ch.character].sprites){
      kfSpriteOptions = characterGroups[ch.character].sprites.filter(id=> spriteLibrary[id]);
      // keep current kf sprite even if not in group
    }
    (ch.keyframes||[]).forEach((kf, kfi)=>{
      const row=document.createElement('div');
      row.className='kf-row';
      row.style.cursor='pointer';
      row.title='Click to jump to this keyframe time';
      const curKfSprite = kf.sprite || '';
      let kfSpriteOpts = `<option value="">(inherit base: ${ch.sprite||'none'})</option>`;
      for(const sid of kfSpriteOptions){
        kfSpriteOpts += `<option value="${sid}" ${curKfSprite===sid?'selected':''}>${sid}</option>`;
      }
      // if current sprite not in filtered list but exists, add it
      if(curKfSprite && !kfSpriteOptions.includes(curKfSprite) && spriteLibrary[curKfSprite]){
        kfSpriteOpts += `<option value="${curKfSprite}" selected>${curKfSprite}</option>`;
      }
      row.innerHTML=`<input type="number" value="${kf.t}" style="width:60px" title="t ms"><input type="number" value="${kf.x}" style="width:56px" title="x"><input type="number" value="${kf.y}" style="width:56px" title="y"><input type="number" value="${kf.scale}" step="0.05" style="width:48px" title="scale"><select data-k="kf-sprite" style="min-width:90px">${kfSpriteOpts}</select><select style="min-width:70px"><option value="linear" ${kf.easing==='linear'?'selected':''}>linear</option><option value="easeIn" ${kf.easing==='easeIn'?'selected':''}>easeIn</option><option value="easeOut" ${kf.easing==='easeOut'?'selected':''}>easeOut</option><option value="easeInOut" ${kf.easing==='easeInOut'?'selected':''}>easeInOut</option></select><button class="danger" style="padding:4px 6px">✕</button>`;
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
      row.querySelector('button').addEventListener('click',(e)=>{ e.stopPropagation(); ch.keyframes.splice(kfi,1); renderCharList(); syncJson(); renderPreview(); });
      row.addEventListener('click', (e)=>{
        if(e.target.tagName==='INPUT' || e.target.tagName==='SELECT' || e.target.tagName==='BUTTON') return;
        scrubTime = kf.t;
        els.scrub.value = String(scrubTime);
        els.scrubLabel.textContent = Math.round(scrubTime)+' ms';
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
    div.innerHTML=`<span class="small" style="min-width:28px">${idx}.</span><input type="number" value="${kf.t}" style="width:72px" title="t"><input type="number" value="${kf.x}" style="width:64px"><input type="number" value="${kf.y}" style="width:64px"><input type="number" value="${kf.zoom}" step="0.05" style="width:56px"><select><option value="linear" ${kf.easing==='linear'?'selected':''}>linear</option><option value="easeIn" ${kf.easing==='easeIn'?'selected':''}>easeIn</option><option value="easeOut" ${kf.easing==='easeOut'?'selected':''}>easeOut</option><option value="easeInOut" ${kf.easing==='easeInOut'?'selected':''}>easeInOut</option></select><button class="danger" style="padding:4px 6px">✕</button>`;
    const inputs=div.querySelectorAll('input'); const sel=div.querySelector('select');
    inputs[0].addEventListener('input',()=>{ kf.t=parseInt(inputs[0].value)||0; kfs.sort((a,b)=>a.t-b.t); syncJson(); renderPreview(); });
    inputs[1].addEventListener('input',()=>{ kf.x=parseInt(inputs[1].value)||0; syncJson(); renderPreview(); });
    inputs[2].addEventListener('input',()=>{ kf.y=parseInt(inputs[2].value)||0; syncJson(); renderPreview(); });
    inputs[3].addEventListener('input',()=>{ kf.zoom=parseFloat(inputs[3].value)||1; syncJson(); renderPreview(); });
    sel.addEventListener('change',()=>{ kf.easing=sel.value; syncJson(); renderPreview(); });
    div.querySelector('button').addEventListener('click',()=>{ kfs.splice(idx,1); renderCameraKfs(); syncJson(); renderPreview(); });
    els.cameraKfs.appendChild(div);
  });
}

function renderDialogList(){
  const basePortraitOptions = [
    '', './img/splash/may-gfg-splash.png','./img/splash/background-gfg-splash.png','./img/splash/middleground-gfg-splash.png','./img/splash/foreground-gfg-splash.png','./img/gfg-splash.png','./img/logo.png','./img/golfbag.png','./img/magnifier-icon.png','./img/liquifier-icon.png','./img/deflector-icon.png','./img/rotator-icon.png','./img/field-extender-icon.png','./img/power-cell-icon.png'
  ];
  // include sprite ids from library (e.g. may-right)
  const spriteIds = Object.keys(spriteLibrary);
  const portraitOptions = [...basePortraitOptions, ...spriteIds];
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
      <div class="row"><div><label>side</label><select data-k="portraitSide"><option value="left" ${side==='left'?'selected':''}>left</option><option value="right" ${side==='right'?'selected':''}>right</option></select></div><div><label>cps</label><input data-k="cps" type="number" min="10" max="80" value="${d.cps??30}"></div></div>
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
        else if(k==='cps') d.cps=parseInt(el.value)||30;
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
      scrubTime = eff; els.scrub.value=String(scrubTime); els.scrubLabel.textContent=Math.round(scrubTime)+' ms'; renderPreview();
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

async function refreshCutsceneList(){
  if(!els.loadSelect) return;
  els.loadSelect.innerHTML = '<option value="">(loading...)</option>';
  let ids = [];
  try{
    const res = await fetch('./src/cutscenes.json', {cache:'no-store'});
    if(res.ok){
      const data = await res.json();
      if(Array.isArray(data)){
        ids = data.map(s=>s.id).filter(Boolean);
      } else if(data && data.id){
        ids = [data.id];
      }
    }
  }catch{}
  // also try to discover via known repo files: we have at least intro-mt-aeolus
  if(!ids.length){
    ids = ['intro-mt-aeolus'];
  }
  // deduplicate and sort
  ids = [...new Set(ids)].sort();
  els.loadSelect.innerHTML = '';
  if(!ids.length){
    const opt=document.createElement('option');
    opt.value=''; opt.textContent='(no cutscenes found)';
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
  // try src/cutscenes/<id>.json first, then src/cutscenes.json, then inline cache
  const urls = [`./src/cutscenes/${id}.json`, './src/cutscenes.json'];
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
  alert('Cutscene not found: '+id+' (tried ./src/cutscenes/'+id+'.json and ./src/cutscenes.json)');
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
    const kf = {t:scrubTime, x:Math.round(worldX), y:Math.round(worldY), scale: sel.scale||1, easing:'linear'};
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
  // also update keyframe at scrubTime if exists
  if(ch.keyframes){
    const kf=ch.keyframes.find(k=>k.t===scrubTime);
    if(kf){ kf.x=ch.x; kf.y=ch.y; }
  }
  renderPreview(); syncJson();
}
function handleMouseUp(){ if(isDragging){ isDragging=false; dragCharId=null; renderCharList(); } }

function tickPlay(now){
  if(!playing) return;
  const elapsed=now-playStart;
  scrubTime=Math.round(Math.min(scene.duration, elapsed));
  els.scrub.value=String(scrubTime);
  els.scrubLabel.textContent=Math.round(scrubTime)+' ms';
  renderPreview();
  if(scrubTime>=scene.duration){ playing=false; els.playBtn.textContent='▶︎ Play'; return; }
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
  syncToUI(); renderCharList(); renderCameraKfs(); renderDialogList(); syncJson(); renderPreview();

  // events
  els.sceneId.addEventListener('input', ()=>{ syncJson(); });
  els.sceneTitle.addEventListener('input', ()=>{ syncJson(); });
  els.sceneDuration.addEventListener('input', ()=>{ syncJson(); renderPreview(); });
  els.bgType.addEventListener('change', ()=>{ syncJson(); renderPreview(); });
  els.bgSrc.addEventListener('change', ()=>{ els.bgSrcCustom.value=''; syncJson(); renderPreview(); });
  els.bgSrcCustom.addEventListener('input', ()=>{ syncJson(); renderPreview(); });
  els.bgColor.addEventListener('input', ()=>{ syncJson(); renderPreview(); });
  els.addChar.addEventListener('click', ()=>{
    const nid='char'+(scene.characters.length+1);
    const firstCharGroup = Object.keys(characterGroups)[0];
    if(firstCharGroup){
      const grp = characterGroups[firstCharGroup];
      const defSprite = grp.defaultSprite || (grp.sprites && grp.sprites[0]);
      const s = defSprite ? spriteLibrary[defSprite] : null;
      scene.characters.push({id:nid, character:firstCharGroup, sprite:defSprite || undefined, src: s ? s.src : './img/magnifier-icon.png', frame: s && s.frame ? {...s.frame} : undefined, x:640, y:360, scale:1, anchor:'center', zIndex:scene.characters.length, keyframes:[]});
    } else {
      scene.characters.push({id:nid, src:'./img/magnifier-icon.png', x:640, y:360, scale:1, anchor:'center', zIndex:scene.characters.length, keyframes:[]});
    }
    selectedCharId=nid;
    renderCharList(); syncJson(); renderPreview();
  });
  els.addCameraKf.addEventListener('click', ()=>{
    if(!scene.camera) scene.camera={keyframes:[]};
    scene.camera.keyframes.push({t:scrubTime, x:0, y:0, zoom:1, easing:'linear'});
    scene.camera.keyframes.sort((a,b)=>a.t-b.t);
    renderCameraKfs(); syncJson(); renderPreview();
  });
  els.addDialog.addEventListener('click', ()=>{
    if(!scene.dialogs) scene.dialogs=[];
    // default portrait is first character's src or may
    const defPortrait = scene.characters?.[0]?.src || './img/splash/may-gfg-splash.png';
    scene.dialogs.push({t:scrubTime, speaker:'May', text:'New dialog...', cps:30, portrait:defPortrait, portraitSide:'left'});
    // keep insertion order — do not sort, effective order handles playback
    renderDialogList(); syncJson(); renderPreview();
  });
  els.scrub.addEventListener('input', ()=>{
    scrubTime=parseInt(els.scrub.value)||0;
    els.scrubLabel.textContent=Math.round(scrubTime)+' ms';
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
