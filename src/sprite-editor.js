// Sprite mapping editor — for character images like may-right, may-front, may-back
// Maps id -> {src, frame{x,y,w,h}} referencing part of a PNG sheet (transparent background)

const SHEET_OPTIONS = [
  "./img/splash/may-gfg-splash.png",
  "./img/splash/background-gfg-splash.png",
  "./img/splash/middleground-gfg-splash.png",
  "./img/splash/foreground-gfg-splash.png",
  "./img/gfg-splash.png",
  "./img/logo.png",
  "./img/golfbag.png",
  "./img/magnifier-icon.png",
  "./img/liquifier-icon.png",
  "./img/deflector-icon.png",
  "./img/rotator-icon.png",
  "./img/field-extender-icon.png",
  "./img/power-cell-icon.png"
];

let library = {}; // id -> {src, frame}
let characters = {}; // characterId -> {name, sprites: [], defaultSprite}
let selectedId = null;
let selectedCharId = null;
let selectedType = 'sprite'; // 'sprite' or 'character'

const els = {};
function q(id){ return document.getElementById(id); }

function initEls(){
  els.list = q('sprite-list');
  els.addBtn = q('add-sprite');
  els.editId = q('edit-id');
  els.editSrc = q('edit-src');
  els.editSrcCustom = q('edit-src-custom');
  els.editX = q('edit-x');
  els.editY = q('edit-y');
  els.editW = q('edit-w');
  els.editH = q('edit-h');
  els.saveBtn = q('save-sprite');
  els.dupBtn = q('duplicate-sprite');
  els.delBtn = q('delete-sprite');
  els.charList = q('character-list');
  els.addCharBtn = q('add-character');
  els.charId = q('char-id');
  els.charName = q('char-name');
  els.charDefault = q('char-default');
  els.charSprites = q('char-sprites');
  els.saveCharBtn = q('save-character');
  els.delCharBtn = q('delete-character');
  els.editType = q('edit-type');
  els.editSpritePanel = q('edit-sprite-panel');
  els.editCharPanel = q('edit-character-panel');
  els.sheetImg = q('sheet-img');
  els.sheetWrap = q('sheet-wrap');
  els.sheetCanvas = q('sheet-canvas');
  els.rect = q('rect');
  els.preview = q('preview-cropped');
  els.previewCtx = els.preview ? els.preview.getContext('2d') : null;
  els.jsonPreview = q('json-preview');
  els.exportBtn = q('sprite-export-button');
  els.importBtn = q('import-btn');
  els.importArea = q('import-area');
  els.toast = q('toast');
}

function showToast(msg){
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  clearTimeout(els.toast._t);
  els.toast._t = setTimeout(()=> els.toast.classList.add('hidden'), 1800);
}

function populateSrcOptions(){
  if (!els.editSrc) return;
  els.editSrc.innerHTML = '';
  for (const src of SHEET_OPTIONS){
    const opt = document.createElement('option');
    opt.value = src;
    opt.textContent = src.replace('./img/','');
    els.editSrc.appendChild(opt);
  }
  // custom option
  const cust = document.createElement('option');
  cust.value = '__custom__';
  cust.textContent = '(custom path)';
  els.editSrc.appendChild(cust);
}

function getLibraryJson(){
  const out = { version: 2, sprites: library };
  if (Object.keys(characters).length) out.characters = characters;
  return out;
}

function syncJson(){
  const json = JSON.stringify(getLibraryJson(), null, 2);
  if (els.jsonPreview) els.jsonPreview.value = json;
}

function updateEditPanels(){
  const isChar = selectedType === 'character';
  if (els.editSpritePanel) els.editSpritePanel.classList.toggle('hidden', isChar);
  if (els.editCharPanel) els.editCharPanel.classList.toggle('hidden', !isChar);
  if (els.editType) els.editType.textContent = isChar ? '(character)' : '(sprite)';
}
function renderList(){
  els.list.innerHTML = '';
  const ids = Object.keys(library).sort();
  for (const id of ids){
    const entry = library[id];
    const div = document.createElement('div');
    div.className = 'item' + (id === selectedId && selectedType==='sprite' ? ' selected' : '');
    const fw = entry.frame ? `${entry.frame.w}×${entry.frame.h}` : 'full';
    div.innerHTML = `<h4>${id}</h4><div class="small">${entry.src.replace('./img/','')} — ${fw} @ ${entry.frame ? entry.frame.x+','+entry.frame.y : 'full'}</div>`;
    div.addEventListener('click', ()=>{ selectedId = id; selectedType='sprite'; selectedCharId=null; updateEditPanels(); loadSelectedToForm(); renderList(); renderCharacterList(); updateSheetAndRect(); });
    els.list.appendChild(div);
  }
}
function renderCharacterList(){
  if (!els.charList) return;
  els.charList.innerHTML = '';
  const ids = Object.keys(characters).sort();
  for (const cid of ids){
    const c = characters[cid];
    const div = document.createElement('div');
    div.className = 'item' + (cid === selectedCharId && selectedType==='character' ? ' selected' : '');
    const count = c.sprites ? c.sprites.length : 0;
    div.innerHTML = `<h4>${cid} <span class="small">(${c.name||''})</span></h4><div class="small">${count} sprites — default: ${c.defaultSprite||'(none)'}</div>`;
    div.addEventListener('click', ()=>{ selectedCharId = cid; selectedType='character'; selectedId=null; updateEditPanels(); loadCharacterToForm(); renderCharacterList(); renderList(); syncJson(); });
    els.charList.appendChild(div);
  }
}
function loadCharacterToForm(){
  if (!selectedCharId || !characters[selectedCharId]) return;
  const c = characters[selectedCharId];
  if (els.charId) els.charId.value = selectedCharId;
  if (els.charName) els.charName.value = c.name || '';
  // populate default sprite dropdown
  if (els.charDefault){
    els.charDefault.innerHTML = '<option value="">(none)</option>';
    for (const sid of (c.sprites||[])){
      const opt=document.createElement('option');
      opt.value=sid; opt.textContent=sid;
      if(sid===c.defaultSprite) opt.selected=true;
      els.charDefault.appendChild(opt);
    }
    // also add all sprites as options for switching
    for (const sid of Object.keys(library)){
      if ((c.sprites||[]).includes(sid)) continue;
      const opt=document.createElement('option');
      opt.value=sid; opt.textContent=sid+' (not in character)';
      els.charDefault.appendChild(opt);
    }
  }
  // populate sprites checklist
  if (els.charSprites){
    els.charSprites.innerHTML='';
    for (const sid of Object.keys(library).sort()){
      const row=document.createElement('label');
      row.style.display='flex'; row.style.alignItems='center'; row.style.gap='6px'; row.style.font='500 11px system-ui';
      const cb=document.createElement('input');
      cb.type='checkbox'; cb.value=sid; cb.checked = (c.sprites||[]).includes(sid);
      cb.addEventListener('change',()=>{
        if(cb.checked){ if(!c.sprites.includes(sid)) c.sprites.push(sid); }
        else { c.sprites = c.sprites.filter(s=>s!==sid); if(c.defaultSprite===sid) c.defaultSprite=c.sprites[0]||''; }
        syncJson(); renderCharacterList();
        // update default dropdown
        loadCharacterToForm();
      });
      row.appendChild(cb);
      const span=document.createElement('span');
      span.textContent=sid;
      row.appendChild(span);
      els.charSprites.appendChild(row);
    }
  }
}

let sheetNaturalW = 0, sheetNaturalH = 0;
let displayScaleX = 1, displayScaleY = 1;

function updateSheetAndRect(){
  // handle character selection: show default sprite's sheet
  if (selectedType==='character'){
    if (!selectedCharId || !characters[selectedCharId]) {
      els.sheetImg.removeAttribute('src');
      els.rect.classList.add('hidden');
      if (els.previewCtx) { els.previewCtx.clearRect(0,0,72,72); els.previewCtx.fillStyle='#1a1a1a'; els.previewCtx.fillRect(0,0,72,72); }
      return;
    }
    const c = characters[selectedCharId];
    const defId = c.defaultSprite || (c.sprites&&c.sprites[0]);
    if (!defId || !library[defId]) {
      els.sheetImg.removeAttribute('src');
      els.rect.classList.add('hidden');
      if (els.previewCtx) { els.previewCtx.clearRect(0,0,72,72); els.previewCtx.fillStyle='#1a1a1a'; els.previewCtx.fillRect(0,0,72,72); }
      return;
    }
    const entry = library[defId];
    const src = entry.src;
    // load sheet image for character preview (default sprite)
    els.sheetImg.onload = () => {
      sheetNaturalW = els.sheetImg.naturalWidth;
      sheetNaturalH = els.sheetImg.naturalHeight;
      const rect = els.sheetImg.getBoundingClientRect();
      els.sheetCanvas.width = rect.width;
      els.sheetCanvas.height = rect.height;
      els.sheetCanvas.style.width = rect.width + 'px';
      els.sheetCanvas.style.height = rect.height + 'px';
      displayScaleX = rect.width / sheetNaturalW;
      displayScaleY = rect.height / sheetNaturalH;
      updateRectPositionForCharacter();
      updatePreviewForCharacter();
    };
    els.sheetImg.onerror = () => {
      sheetNaturalW = 0; sheetNaturalH = 0;
      els.rect.classList.add('hidden');
    };
    els.sheetImg.src = src;
    if (els.sheetImg.complete && els.sheetImg.naturalWidth) {
      setTimeout(()=> els.sheetImg.onload(), 0);
    }
    return;
  }
  // sprite mode
  if (!selectedId || !library[selectedId]) {
    els.sheetImg.removeAttribute('src');
    els.rect.classList.add('hidden');
    if (els.previewCtx) { els.previewCtx.clearRect(0,0,72,72); els.previewCtx.fillStyle='#1a1a1a'; els.previewCtx.fillRect(0,0,72,72); }
    return;
  }
  const entry = library[selectedId];
  const src = entry.src;
  // set src select (for sprite panel)
  if (SHEET_OPTIONS.includes(src)) {
    if(els.editSrc) els.editSrc.value = src;
    if(els.editSrcCustom) els.editSrcCustom.value = '';
  } else {
    if(els.editSrc) els.editSrc.value = '__custom__';
    if(els.editSrcCustom) els.editSrcCustom.value = src;
  }
  // load sheet image
  els.sheetImg.onload = () => {
    sheetNaturalW = els.sheetImg.naturalWidth;
    sheetNaturalH = els.sheetImg.naturalHeight;
    const rect = els.sheetImg.getBoundingClientRect();
    els.sheetCanvas.width = rect.width;
    els.sheetCanvas.height = rect.height;
    els.sheetCanvas.style.width = rect.width + 'px';
    els.sheetCanvas.style.height = rect.height + 'px';
    displayScaleX = rect.width / sheetNaturalW;
    displayScaleY = rect.height / sheetNaturalH;
    updateRectPosition();
    updatePreview();
  };
  els.sheetImg.onerror = () => {
    sheetNaturalW = 0; sheetNaturalH = 0;
    els.rect.classList.add('hidden');
  };
  els.sheetImg.src = src;
  if (entry.frame) {
    if(els.editX) els.editX.value = entry.frame.x;
    if(els.editY) els.editY.value = entry.frame.y;
    if(els.editW) els.editW.value = entry.frame.w;
    if(els.editH) els.editH.value = entry.frame.h;
  } else {
    if(els.editX) els.editX.value = 0; if(els.editY) els.editY.value = 0; if(els.editW) els.editW.value = 64; if(els.editH) els.editH.value = 64;
  }
  if (els.sheetImg.complete && els.sheetImg.naturalWidth) {
    setTimeout(()=> els.sheetImg.onload(), 0);
  }
}
function updateRectPositionForCharacter(){
  if (selectedType!=='character' || !selectedCharId || !characters[selectedCharId]) { els.rect.classList.add('hidden'); return; }
  const c = characters[selectedCharId];
  const defId = c.defaultSprite || (c.sprites&&c.sprites[0]);
  if (!defId || !library[defId] || !library[defId].frame) { els.rect.classList.add('hidden'); return; }
  const fr = library[defId].frame;
  if (!sheetNaturalW) { els.rect.classList.add('hidden'); return; }
  const left = fr.x * displayScaleX;
  const top = fr.y * displayScaleY;
  const w = fr.w * displayScaleX;
  const h = fr.h * displayScaleY;
  els.rect.style.left = left + 'px';
  els.rect.style.top = top + 'px';
  els.rect.style.width = w + 'px';
  els.rect.style.height = h + 'px';
  els.rect.classList.remove('hidden');
}
function updatePreviewForCharacter(){
  if (!els.previewCtx) return;
  els.previewCtx.clearRect(0,0,72,72);
  els.previewCtx.fillStyle = '#1a1a1a';
  els.previewCtx.fillRect(0,0,72,72);
  if (selectedType!=='character' || !selectedCharId || !characters[selectedCharId]) return;
  const c = characters[selectedCharId];
  const defId = c.defaultSprite || (c.sprites&&c.sprites[0]);
  if (!defId || !library[defId]) return;
  const entry = library[defId];
  const fr = entry.frame;
  const img = els.sheetImg;
  if (!fr || !img.complete || !img.naturalWidth) {
    if (img.complete && img.naturalWidth) {
      const scale = Math.min(72/img.naturalWidth, 72/img.naturalHeight);
      const w = img.naturalWidth*scale, h = img.naturalHeight*scale;
      els.previewCtx.drawImage(img, (72-w)/2, (72-h)/2, w, h);
    }
    return;
  }
  try {
    els.previewCtx.imageSmoothingEnabled = true;
    els.previewCtx.drawImage(img, fr.x, fr.y, fr.w, fr.h, 0, 0, 72, 72);
  } catch {}
}

function updateRectPosition(){
  if (!selectedId || !library[selectedId] || !library[selectedId].frame) {
    els.rect.classList.add('hidden');
    return;
  }
  const fr = library[selectedId].frame;
  if (!sheetNaturalW) { els.rect.classList.add('hidden'); return; }
  const left = fr.x * displayScaleX;
  const top = fr.y * displayScaleY;
  const w = fr.w * displayScaleX;
  const h = fr.h * displayScaleY;
  els.rect.style.left = left + 'px';
  els.rect.style.top = top + 'px';
  els.rect.style.width = w + 'px';
  els.rect.style.height = h + 'px';
  els.rect.classList.remove('hidden');
}

function updatePreview(){
  if (!els.previewCtx) return;
  els.previewCtx.clearRect(0,0,72,72);
  els.previewCtx.fillStyle = '#1a1a1a';
  els.previewCtx.fillRect(0,0,72,72);
  if (!selectedId || !library[selectedId]) return;
  const entry = library[selectedId];
  const fr = entry.frame;
  const src = entry.src;
  const img = els.sheetImg;
  if (!fr || !img.complete || !img.naturalWidth) {
    // draw whole image scaled to 72
    if (img.complete && img.naturalWidth) {
      const scale = Math.min(72/img.naturalWidth, 72/img.naturalHeight);
      const w = img.naturalWidth*scale, h = img.naturalHeight*scale;
      els.previewCtx.drawImage(img, (72-w)/2, (72-h)/2, w, h);
    }
    return;
  }
  // draw cropped frame scaled to 72
  try {
    els.previewCtx.imageSmoothingEnabled = true;
    els.previewCtx.drawImage(img, fr.x, fr.y, fr.w, fr.h, 0, 0, 72, 72);
  } catch {}
}

function loadSelectedToForm(){
  if (!selectedId || !library[selectedId]) {
    els.editId.value = '';
    return;
  }
  const entry = library[selectedId];
  els.editId.value = selectedId;
  if (SHEET_OPTIONS.includes(entry.src)) {
    els.editSrc.value = entry.src;
    els.editSrcCustom.value = '';
  } else {
    els.editSrc.value = '__custom__';
    els.editSrcCustom.value = entry.src;
  }
  if (entry.frame){
    els.editX.value = entry.frame.x;
    els.editY.value = entry.frame.y;
    els.editW.value = entry.frame.w;
    els.editH.value = entry.frame.h;
  }
}

function saveSelected(){
  const newId = els.editId.value.trim();
  if (!newId || !/^[a-z0-9][a-z0-9-_]{1,40}$/.test(newId)){
    alert('Invalid id: must be /^[a-z0-9][a-z0-9-_]{1,40}$/ e.g. may-right');
    return;
  }
  let src = '';
  if (els.editSrc.value === '__custom__') src = els.editSrcCustom.value.trim();
  else src = els.editSrc.value;
  if (!src) { alert('Sheet src required'); return; }
  const x = parseInt(els.editX.value)||0;
  const y = parseInt(els.editY.value)||0;
  const w = parseInt(els.editW.value)||1;
  const h = parseInt(els.editH.value)||1;
  if (w<=0 || h<=0){ alert('w/h must be >0'); return; }
  // if renaming, delete old
  if (selectedId && selectedId !== newId && library[selectedId]) {
    delete library[selectedId];
  }
  library[newId] = { src, frame: {x,y,w,h} };
  selectedId = newId;
  renderList();
  syncJson();
  updateSheetAndRect();
  updatePreview();
  // persist draft
  try{ localStorage.setItem('spriteEditorDraft.v1', JSON.stringify(getLibraryJson())); }catch{}
}

function deleteSelected(){
  if (!selectedId || !library[selectedId]) return;
  if (!confirm(`Delete ${selectedId}?`)) return;
  delete library[selectedId];
  selectedId = Object.keys(library)[0] || null;
  renderList();
  syncJson();
  updateSheetAndRect();
  updatePreview();
  try{ localStorage.setItem('spriteEditorDraft.v1', JSON.stringify(getLibraryJson())); }catch{}
}

function duplicateSelected(){
  if (!selectedId || !library[selectedId]) return;
  let base = selectedId + '-copy';
  let nid = base, n=1;
  while(library[nid]) { nid = base + n; n++; }
  library[nid] = JSON.parse(JSON.stringify(library[selectedId]));
  selectedId = nid;
  renderList();
  loadSelectedToForm();
  syncJson();
  updateSheetAndRect();
  updatePreview();
}

async function loadLibrary(){
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
        library = map;
        if (charMap) characters = charMap;
        selectedId = Object.keys(library)[0] || null;
        selectedCharId = Object.keys(characters)[0] || null;
        if (selectedId) selectedType='sprite';
        else if (selectedCharId) selectedType='character';
        return;
      }
      if (charMap && Object.keys(charMap).length){
        characters = charMap;
      }
    } catch {}
  }
  // fallback: try localStorage draft
  try{
    const raw = localStorage.getItem('spriteEditorDraft.v1');
    if (raw){
      const d=JSON.parse(raw);
      if(d.sprites){ library = d.sprites; if(d.characters) characters = d.characters; selectedId = Object.keys(library)[0]||null; selectedCharId = Object.keys(characters)[0]||null; if(selectedId) selectedType='sprite'; else if(selectedCharId) selectedType='character'; return; }
      else if(d['may-front']){ library=d; selectedId=Object.keys(library)[0]||null; return; }
    }
  }catch{}
  // keep example empty will be filled with defaults
  if (!Object.keys(library).length){
    // use default from repo's file if not yet loaded? keep as is
  }
}

function exportJson(){
  syncJson();
  const json = els.jsonPreview.value;
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(json).then(()=> showToast('copied to clipboard')).catch(()=>{
      els.jsonPreview.select(); try{ document.execCommand('copy')}catch{}; showToast('copied to clipboard');
    });
  } else {
    els.jsonPreview.select(); try{ document.execCommand('copy')}catch{}; showToast('copied to clipboard');
  }
}

function importJson(){
  const raw = els.importArea.value.trim();
  if (!raw) return;
  try{
    const data = JSON.parse(raw);
    let map = null;
    let charMap = null;
    if (data.sprites && typeof data.sprites === 'object') map = data.sprites;
    else if (data && typeof data === 'object'){
      const keys = Object.keys(data);
      const isSpriteMap = keys.length && typeof data[keys[0]] === 'object' && data[keys[0]] && 'src' in data[keys[0]];
      if (isSpriteMap) map = data;
      else if (data.version !== undefined && data.sprites) map = data.sprites;
    }
    if (data.characters && typeof data.characters === 'object') charMap = data.characters;
    if (!map || !Object.keys(map).length){ alert('Invalid: no sprites found'); return; }
    // validate each sprite
    for (const [k,v] of Object.entries(map)){
      if (!/^[a-z0-9][a-z0-9-_]{1,40}$/.test(k)){ alert('Invalid id '+k); return; }
      if (!v.src || typeof v.src !== 'string'){ alert('Invalid src for '+k); return; }
      if (!v.frame || typeof v.frame.x !== 'number'){ alert('Invalid frame for '+k); return; }
    }
    // validate characters if present
    if (charMap){
      for (const [cid,c] of Object.entries(charMap)){
        if (!/^[a-z0-9][a-z0-9-_]{1,40}$/.test(cid)){ alert('Invalid character id '+cid); return; }
        if (c.sprites && !Array.isArray(c.sprites)){ alert('Invalid sprites for character '+cid); return; }
      }
      characters = charMap;
    } else {
      // keep existing characters if import is flat sprites only? reset?
      // do not overwrite characters if not provided
    }
    library = map;
    if (charMap) characters = charMap;
    selectedId = Object.keys(library)[0] || null;
    selectedCharId = Object.keys(characters)[0] || null;
    if(selectedId) selectedType='sprite';
    else if(selectedCharId) selectedType='character';
    updateEditPanels();
    renderList(); renderCharacterList();
    if(selectedType==='sprite') loadSelectedToForm(); else loadCharacterToForm();
    syncJson();
    updateSheetAndRect();
    updatePreview();
    showToast('loaded');
    try{ localStorage.setItem('spriteEditorDraft.v1', JSON.stringify(getLibraryJson())); }catch{}
  } catch(e){ alert('JSON parse failed: '+e.message); }
}

// Dragging logic for rect
let dragMode = null; // 'move' | 'nw'|'ne'|'sw'|'se'
let dragStart = null; // {x,y, fx,fy,fw,fh, mx,my}
function getDisplayScales(){
  return { sx: displayScaleX, sy: displayScaleY };
}
function getCurrentFrameRef(){
  if (selectedType==='character'){
    if (!selectedCharId || !characters[selectedCharId]) return null;
    const c = characters[selectedCharId];
    const defId = c.defaultSprite || (c.sprites&&c.sprites[0]);
    if (!defId || !library[defId]) return null;
    return { frame: library[defId].frame, id: defId, spriteEntry: library[defId] };
  } else {
    if (!selectedId || !library[selectedId]) return null;
    return { frame: library[selectedId].frame, id: selectedId, spriteEntry: library[selectedId] };
  }
}
function onRectMouseDown(e){
  const ref = getCurrentFrameRef();
  if (!ref || !ref.frame) return;
  const target = e.target;
  const isHandle = target.classList.contains('handle');
  if (isHandle){
    if (target.classList.contains('nw')) dragMode='nw';
    else if (target.classList.contains('ne')) dragMode='ne';
    else if (target.classList.contains('sw')) dragMode='sw';
    else if (target.classList.contains('se')) dragMode='se';
  } else if (target===els.rect) {
    dragMode='move';
  } else return;
  e.preventDefault();
  e.stopPropagation();
  dragStart = { fx: ref.frame.x, fy: ref.frame.y, fw: ref.frame.w, fh: ref.frame.h, mx: e.clientX, my: e.clientY };
  window.addEventListener('mousemove', onWindowMouseMove);
  window.addEventListener('mouseup', onWindowMouseUp);
}
function onWindowMouseMove(e){
  const ref = getCurrentFrameRef();
  if (!dragMode || !dragStart || !ref) return;
  const dx = (e.clientX - dragStart.mx) / displayScaleX;
  const dy = (e.clientY - dragStart.my) / displayScaleY;
  const fr = ref.frame;
  let nx = fr.x, ny = fr.y, nw = fr.w, nh = fr.h;
  if (dragMode==='move'){
    nx = dragStart.fx + dx;
    ny = dragStart.fy + dy;
  } else if (dragMode==='se'){
    nw = dragStart.fw + dx;
    nh = dragStart.fh + dy;
  } else if (dragMode==='nw'){
    nx = dragStart.fx + dx;
    ny = dragStart.fy + dy;
    nw = dragStart.fw - dx;
    nh = dragStart.fh - dy;
  } else if (dragMode==='ne'){
    ny = dragStart.fy + dy;
    nw = dragStart.fw + dx;
    nh = dragStart.fh - dy;
    nx = dragStart.fx;
  } else if (dragMode==='sw'){
    nx = dragStart.fx + dx;
    nw = dragStart.fw - dx;
    nh = dragStart.fh + dy;
    ny = dragStart.fy;
  }
  // clamp
  nx = Math.max(0, Math.round(nx));
  ny = Math.max(0, Math.round(ny));
  nw = Math.max(8, Math.round(nw));
  nh = Math.max(8, Math.round(nh));
  // keep within sheet bounds if known
  if (sheetNaturalW) {
    if (nx + nw > sheetNaturalW) nw = sheetNaturalW - nx;
    if (ny + nh > sheetNaturalH) nh = sheetNaturalH - ny;
  }
  fr.x = nx; fr.y = ny; fr.w = nw; fr.h = nh;
  if (selectedType==='sprite'){
    els.editX.value = fr.x; els.editY.value = fr.y; els.editW.value = fr.w; els.editH.value = fr.h;
    updateRectPosition();
    updatePreview();
  } else {
    // character case: update char panel preview as well
    updateRectPositionForCharacter();
    updatePreviewForCharacter();
  }
  syncJson();
}
function onWindowMouseUp(){
  dragMode = null;
  dragStart = null;
  window.removeEventListener('mousemove', onWindowMouseMove);
  window.removeEventListener('mouseup', onWindowMouseUp);
  try{ localStorage.setItem('spriteEditorDraft.v1', JSON.stringify(getLibraryJson())); }catch{}
}

// Canvas click to create new frame? Not needed, rect handled

async function init(){
  initEls();
  populateSrcOptions();
  await loadLibrary();
  // if still empty, create examples may-front etc. for demo
  if (!Object.keys(library).length){
    library = {
      "may-front": { src: "./img/splash/may-gfg-splash.png", frame: {x:0,y:0,w:96,h:96}},
      "may-right": { src: "./img/splash/may-gfg-splash.png", frame: {x:96,y:0,w:96,h:96}},
      "may-back": { src: "./img/splash/may-gfg-splash.png", frame: {x:192,y:0,w:96,h:96}}
    };
    selectedId = "may-front";
  }
  if (!selectedId) selectedId = Object.keys(library)[0] || null;
  if (!selectedCharId && Object.keys(characters).length) { selectedCharId = Object.keys(characters)[0]; if(!selectedId) selectedType='character'; }
  updateEditPanels();
  renderList();
  renderCharacterList();
  if(selectedType==='sprite') loadSelectedToForm();
  else loadCharacterToForm();
  syncJson();
  updateSheetAndRect();
  updatePreview();

  // events
  els.addBtn.addEventListener('click', ()=>{
    let nid = 'may-right';
    let n=1;
    while(library[nid]) { nid = 'may-right'+n; n++; }
    library[nid] = { src: SHEET_OPTIONS[0], frame: {x:0,y:0,w:64,h:64}};
    selectedId = nid; selectedType='sprite'; updateEditPanels();
    renderList(); renderCharacterList();
    loadSelectedToForm();
    syncJson();
    updateSheetAndRect();
    updatePreview();
  });
  if(els.addCharBtn) els.addCharBtn.addEventListener('click', ()=>{
    let nid='may';
    let n=1;
    while(characters[nid]) { nid='may'+n; n++; }
    characters[nid] = { name: nid, sprites: [], defaultSprite: '' };
    selectedCharId=nid; selectedType='character'; updateEditPanels();
    renderCharacterList(); renderList(); loadCharacterToForm(); syncJson();
  });
  els.editId.addEventListener('input', ()=>{ /* handled on save */ });
  els.editSrc.addEventListener('change', ()=>{
    const isCustom = els.editSrc.value === '__custom__';
    if (isCustom) {
      // keep custom value if already there
    } else {
      // update library immediately
      if (selectedId && library[selectedId]) {
        library[selectedId].src = els.editSrc.value;
        updateSheetAndRect();
        updatePreview();
        syncJson();
      }
    }
  });
  els.editSrcCustom.addEventListener('input', ()=>{
    if (els.editSrc.value === '__custom__' && selectedId && library[selectedId]) {
      library[selectedId].src = els.editSrcCustom.value.trim() || library[selectedId].src;
      updateSheetAndRect();
      updatePreview();
      syncJson();
    }
  });
  [els.editX, els.editY, els.editW, els.editH].forEach(el=>{
    el.addEventListener('input', ()=>{
      if (!selectedId || !library[selectedId]) return;
      const fr = library[selectedId].frame;
      fr.x = parseInt(els.editX.value)||0;
      fr.y = parseInt(els.editY.value)||0;
      fr.w = parseInt(els.editW.value)||1;
      fr.h = parseInt(els.editH.value)||1;
      updateRectPosition();
      updatePreview();
      syncJson();
    });
  });
  els.saveBtn.addEventListener('click', saveSelected);
  els.dupBtn.addEventListener('click', duplicateSelected);
  els.delBtn.addEventListener('click', deleteSelected);
  if(els.saveCharBtn) els.saveCharBtn.addEventListener('click', ()=>{
    const newId = (els.charId.value||'').trim();
    if(!newId || !/^[a-z0-9][a-z0-9-_]{1,40}$/.test(newId)){ alert('Invalid character id'); return; }
    const name = (els.charName.value||'').trim() || newId;
    const def = els.charDefault.value||'';
    // if renaming, delete old
    if(selectedCharId && selectedCharId!==newId && characters[selectedCharId]){
      const old = characters[selectedCharId];
      delete characters[selectedCharId];
      // update sprites references if needed? keep
      characters[newId] = old;
      selectedCharId = newId;
    }
    if(!characters[newId]) characters[newId] = { name, sprites: [], defaultSprite: def };
    characters[newId].name = name;
    characters[newId].defaultSprite = def;
    // ensure default is in sprites list
    if(def && !(characters[newId].sprites||[]).includes(def)){
      characters[newId].sprites = [...(characters[newId].sprites||[]), def];
    }
    renderCharacterList(); syncJson();
    try{ localStorage.setItem('spriteEditorDraft.v1', JSON.stringify(getLibraryJson())); }catch{}
  });
  if(els.delCharBtn) els.delCharBtn.addEventListener('click', ()=>{
    if(!selectedCharId || !characters[selectedCharId]) return;
    if(!confirm(`Delete character ${selectedCharId}?`)) return;
    delete characters[selectedCharId];
    selectedCharId = Object.keys(characters)[0]||null;
    if(selectedCharId) selectedType='character'; else selectedType='sprite';
    updateEditPanels();
    renderCharacterList(); renderList(); syncJson();
    if(selectedType==='character') loadCharacterToForm(); else loadSelectedToForm();
  });
  if(els.charId) els.charId.addEventListener('input', ()=>{ /* handled on save */ });
  if(els.charName) els.charName.addEventListener('input', ()=>{
    if(selectedCharId && characters[selectedCharId]) characters[selectedCharId].name = els.charName.value.trim();
    syncJson();
  });
  if(els.charDefault) els.charDefault.addEventListener('change', ()=>{
    if(selectedCharId && characters[selectedCharId]) characters[selectedCharId].defaultSprite = els.charDefault.value;
    syncJson();
  });
  els.exportBtn.addEventListener('click', exportJson);
  els.importBtn.addEventListener('click', importJson);
  // rect drag
  els.rect.addEventListener('mousedown', onRectMouseDown);
  els.rect.querySelectorAll('.handle').forEach(h=> h.addEventListener('mousedown', onRectMouseDown));
  // also allow clicking on sheet to set frame center? optional
  els.sheetCanvas.addEventListener('click', (e)=>{
    const rect = els.sheetCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / displayScaleX;
    const y = (e.clientY - rect.top) / displayScaleY;
    const ref = getCurrentFrameRef();
    if (!ref) return;
    const fr = ref.frame;
    fr.x = Math.round(x - fr.w/2);
    fr.y = Math.round(y - fr.h/2);
    if (fr.x<0) fr.x=0; if (fr.y<0) fr.y=0;
    if (selectedType==='sprite'){
      els.editX.value = fr.x; els.editY.value = fr.y;
      updateRectPosition();
      updatePreview();
    } else {
      updateRectPositionForCharacter();
      updatePreviewForCharacter();
    }
    syncJson();
  });
  window.addEventListener('resize', ()=>{
    if (els.sheetImg.complete) {
      const r = els.sheetImg.getBoundingClientRect();
      displayScaleX = r.width / sheetNaturalW;
      displayScaleY = r.height / sheetNaturalH;
      updateRectPosition();
    }
  });
}

if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
