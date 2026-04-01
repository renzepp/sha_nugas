/* ═══════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════ */
const E_SUBJECT = ['🧮','📐','📏','🔬','⚗️','🧬','🔭','💻','📊','📈','🌍','⚖️','🏛️','🎵','🩺','📡'];
const E_HW      = ['🎀','🩷','🌸','🪞','💌','🌷','🩰','🧁','💗','🫶','🪄','💐','🦢','🍓','🌺','🪻'];
const E_EXAM    = ['📖','🎯','📋','✏️','📐','🧮','⭐','📝','🔬','💡','🏆','⚡'];
const STATUSES  = [
  {k:'untouched',  l:'Untouched',   d:'#e05555', ac:'a-untouched'},
  {k:'on-progress',l:'On Progress', d:'#f4c23a', ac:'a-on-progress'},
  {k:'done',       l:'Done',        d:'#5a9fe0', ac:'a-done'},
  {k:'submitted',  l:'Submitted',   d:'#5ec47e', ac:'a-submitted'},
];
const EXAM_TYPES = {quiz1:'Quiz 1',quiz2:'Quiz 2',quiz3:'Quiz 3',quiz4:'Quiz 4',quiz5:'Quiz 5',quiz6:'Quiz 6',uts:'UTS',uas:'UAS'};
// SB_URL and SB_KEY are loaded from config.js

/* ═══════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════ */
let subjects   = [];
let examEvents = [];
let mode = 'hw';
let activeSid = null, activeAid = null;
let activeESid = null, activeEFid = null;
let _pendingSid = null, _pendingESid = null;
let _selEmojiS = '🧮', _selEmojiHW = '🎀', _selEmojiEF = '📖';
let _saveT = null, _cdInt = null;
let _calMonth = new Date();
let _moveData = null, _moveSel = null;

/* ═══════════════════════════════════════════════
   NORMALIZATION
   All file and link objects are given stable IDs here so the
   snapshot-diff save system can track them individually.
═══════════════════════════════════════════════ */
function _ensureFileId(f) { return f.id ? f : { ...f, id: uid() }; }
function _ensureLinkId(l) {
  if (typeof l === 'string') return { id: uid(), url: l };
  return l.id ? l : { ...l, id: uid() };
}
function _ensurePhotoId(p) {
  if (typeof p === 'string') return { id: uid(), data: p };
  return p.id ? p : { ...p, id: uid() };
}

function _normalizeAssignment(a) {
  return {
    ...a,
    status:            a.status            || 'untouched',
    submitted:         !!a.submitted,
    submitLink:        a.submitLink        || '',
    notes:             a.notes             || '',
    startDate:         a.startDate         || null,
    dueDate:           a.dueDate           || null,
    dueTime:           a.dueTime           || null,
    pinned:            !!a.pinned,
    tasks:             Array.isArray(a.tasks)             ? a.tasks.map(_normalizeTask)                    : [],
    materialFiles:     Array.isArray(a.materialFiles)     ? a.materialFiles.map(_ensureFileId)             : [],
    materialLinks:     Array.isArray(a.materialLinks)     ? a.materialLinks.map(_ensureLinkId)             : [],
    questionFiles:     Array.isArray(a.questionFiles)     ? a.questionFiles.map(_ensureFileId)             : [],
    questionLinks:     Array.isArray(a.questionLinks)     ? a.questionLinks.map(_ensureLinkId)             : [],
    folderAttachments: Array.isArray(a.folderAttachments) ? a.folderAttachments.map(_ensureFileId)        : [],
    folderLinks:       Array.isArray(a.folderLinks)       ? a.folderLinks.map(_ensureLinkId)               : [],
  };
}
function _normalizeTask(t, idx) {
  return {
    ...t,
    id:     t.id     || uid(),
    number: t.number != null ? t.number : idx + 1,
    label:  t.label  || '',
    done:   !!t.done,
    links:  Array.isArray(t.links)  ? t.links.map(_ensureLinkId)  : [],
    photos: Array.isArray(t.photos) ? t.photos.map(_ensurePhotoId) : [],
  };
}
function _normalizeMateri(m) {
  return {
    ...m,
    id:    m.id    || uid(),
    name:  m.name  || '',
    done:  !!m.done,
    links: Array.isArray(m.links) ? m.links.map(_ensureLinkId)  : [],
    files: Array.isArray(m.files) ? m.files.map(_ensureFileId)  : [],
  };
}
function _normalizeExamFolder(f) {
  return {
    ...f,
    examDate:        f.examDate        || null,
    examTime:        f.examTime        || null,
    examRoom:        f.examRoom        || '',
    mainSource:      f.mainSource      || '',
    pptLink:         f.pptLink         || '',
    examCollections: f.examCollections || '',
    notes:           f.notes           || '',
    materiList: Array.isArray(f.materiList) ? f.materiList.map(_normalizeMateri) : [],
  };
}
function _normalizeSubject(s) {
  const openState = _getOpenState();
  return {
    ...s,
    name:        s.name        || 'Untitled',
    icon:        s.icon        || '📚',
    open:        openState[s.id] !== undefined ? openState[s.id] : !!s.open,
    driveLink:   s.driveLink   || null,
    assignments: Array.isArray(s.assignments) ? s.assignments.map(_normalizeAssignment) : [],
    exams:       Array.isArray(s.exams)       ? s.exams.map(_normalizeExamFolder)       : [],
  };
}

/* ═══════════════════════════════════════════════
   SUPABASE — RELATIONAL DB LAYER
   Replaces the old single-blob approach with targeted
   per-record reads and writes via snapshot diffing.
═══════════════════════════════════════════════ */

// ── Low-level HTTP helpers ───────────────────────────────────────
const _H  = () => ({ apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY });
const _HJ = () => ({ ...(_H()), 'Content-Type': 'application/json' });

async function _sbGet(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: _H() });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.json();
}
async function _sbUpsert(table, record) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ..._HJ(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(record),
  });
  if (!r.ok) throw new Error(`UPSERT ${table} → ${r.status}: ${await r.text()}`);
}
async function _sbDelete(table, filter) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: _H(),
  });
  // 404 = already gone (e.g. cascade deleted) — not an error
  if (!r.ok && r.status !== 404) throw new Error(`DELETE ${table} → ${r.status}`);
}

// ── Load from new relational tables ─────────────────────────────
async function loadDB() {
  try {
    // Single query — PostgREST embeds all child rows automatically
    const select = '*,assignments(*,assignment_files(*),assignment_links(*),tasks(*,task_links(*),task_photos(*))),exam_folders(*,exam_materials(*,exam_material_links(*),exam_material_files(*)),exam_events(*))';
    const rows = await _sbGet(`subjects?select=${select}&order=position`);

    subjects = rows.map(row => {
      const openState = _getOpenState();
      return {
        id:        row.id,
        name:      row.name       || 'Untitled',
        icon:      row.icon       || '📚',
        driveLink: row.drive_link || null,
        open:      openState[row.id] !== undefined ? openState[row.id] : true,
        assignments: (row.assignments || [])
          .sort((a, b) => a.position - b.position)
          .map(_mapAssignment),
        exams: (row.exam_folders || [])
          .sort((a, b) => a.position - b.position)
          .map(_mapExamFolder),
      };
    });

    // Flatten exam_events from all folders into the global examEvents array
    examEvents = [];
    rows.forEach(s => {
      (s.exam_folders || []).forEach(f => {
        (f.exam_events || []).forEach(ev => {
          examEvents.push({ id: ev.id, folderId: ev.folder_id, date: ev.date, time: ev.time || null, room: ev.room || '' });
        });
      });
    });

    _snap = _buildSnap();
    _saveLocalBackup();
  } catch (e) {
    console.warn('loadDB error — falling back to localStorage:', e);
    _loadFromLocalBackup();
  }
}

function _mapAssignment(row) {
  const files  = row.assignment_files  || [];
  const links  = row.assignment_links  || [];
  const tasks  = row.tasks             || [];
  return {
    id:                row.id,
    name:              row.name        || '',
    icon:              row.icon        || '🎀',
    status:            row.status      || 'untouched',
    submitted:         !!row.submitted,
    submitLink:        row.submit_link || '',
    notes:             row.notes       || '',
    startDate:         row.start_date  || null,
    dueDate:           row.due_date    || null,
    dueTime:           row.due_time    || null,
    pinned:            !!row.pinned,
    materialFiles:     files.filter(f => f.category === 'material').map(f => ({ id: f.id, name: f.name, data: f.data, type: f.type || '' })),
    materialLinks:     links.filter(l => l.category === 'material').map(l => ({ id: l.id, url: l.url })),
    questionFiles:     files.filter(f => f.category === 'question').map(f => ({ id: f.id, name: f.name, data: f.data, type: f.type || '' })),
    questionLinks:     links.filter(l => l.category === 'question').map(l => ({ id: l.id, url: l.url })),
    folderAttachments: files.filter(f => f.category === 'folder').map(f => ({ id: f.id, name: f.name, data: f.data, type: f.type || '' })),
    folderLinks:       links.filter(l => l.category === 'folder').map(l => ({ id: l.id, url: l.url })),
    tasks:             tasks.sort((a, b) => a.position - b.position).map((t, i) => ({
      id:     t.id,
      number: i + 1,
      label:  t.label || '',
      done:   !!t.done,
      links:  (t.task_links  || []).map(l => ({ id: l.id, url: l.url })),
      photos: (t.task_photos || []).map(p => ({ id: p.id, data: p.data })),
    })),
  };
}

function _mapExamFolder(row) {
  return {
    id:              row.id,
    examType:        row.exam_type        || 'quiz1',
    name:            row.name             || '',
    icon:            row.icon             || '📖',
    examDate:        row.exam_date        || null,
    examTime:        row.exam_time        || null,
    examRoom:        row.exam_room        || '',
    mainSource:      row.main_source      || '',
    pptLink:         row.ppt_link         || '',
    examCollections: row.exam_collections || '',
    notes:           row.notes            || '',
    materiList: (row.exam_materials || [])
      .sort((a, b) => a.position - b.position)
      .map(m => ({
        id:    m.id,
        name:  m.name || '',
        done:  !!m.done,
        links: (m.exam_material_links || []).map(l => ({ id: l.id, url: l.url })),
        files: (m.exam_material_files || []).map(f => ({ id: f.id, name: f.name, data: f.data, type: f.type || '' })),
      })),
  };
}

// ── Local backup ─────────────────────────────────────────────────
function _saveLocalBackup() {
  try { localStorage.setItem('sha-backup', JSON.stringify({ subjects, examEvents })); } catch(e) {}
}
function _loadFromLocalBackup() {
  try {
    const bk = localStorage.getItem('sha-backup');
    if (!bk) return;
    const d = JSON.parse(bk);
    if (d && Array.isArray(d.subjects)) {
      subjects   = d.subjects.map(_normalizeSubject);
      examEvents = Array.isArray(d.examEvents)
        ? d.examEvents.filter(ev => ev && ev.folderId && ev.date)
        : [];
      _snap = _buildSnap();
      console.log('Loaded from local backup~');
    }
  } catch(e) { console.error('backup load error:', e); }
}

// ── Sidebar open state (UI-only, stored in localStorage) ─────────
function _getOpenState() {
  try { return JSON.parse(localStorage.getItem('sha-open') || '{}'); } catch(e) { return {}; }
}
function _saveOpenState() {
  const state = {};
  subjects.forEach(s => { state[s.id] = s.open; });
  try { localStorage.setItem('sha-open', JSON.stringify(state)); } catch(e) {}
}

// ── Snapshot-diff save system ────────────────────────────────────
// _snap holds the flat record state as last confirmed saved to Supabase.
// On each save(), we diff current state against _snap and only send
// what actually changed (upserts for new/modified, deletes for removed).
let _snap = null;

function _buildSnap() {
  const snap = {
    subjects: {}, assignments: {}, tasks: {},
    examFolders: {}, examMaterials: {}, examEvents: {},
    aFiles: {}, aLinks: {}, tLinks: {}, tPhotos: {}, mLinks: {}, mFiles: {},
  };
  subjects.forEach((s, si) => {
    snap.subjects[s.id] = { name: s.name, icon: s.icon, drive_link: s.driveLink || null, position: si };
    (s.assignments || []).forEach((a, ai) => {
      snap.assignments[a.id] = { subject_id: s.id, name: a.name, icon: a.icon || '🎀', status: a.status || 'untouched', start_date: a.startDate || null, due_date: a.dueDate || null, due_time: a.dueTime || null, submit_link: a.submitLink || '', submitted: !!a.submitted, notes: a.notes || '', pinned: !!a.pinned, position: ai };
      (a.materialFiles     || []).forEach(f => { if (f.id) snap.aFiles[f.id] = { assignment_id: a.id, category: 'material', name: f.name, data: f.data, type: f.type || '' }; });
      (a.materialLinks     || []).forEach(l => { if (l.id) snap.aLinks[l.id] = { assignment_id: a.id, category: 'material', url: l.url }; });
      (a.questionFiles     || []).forEach(f => { if (f.id) snap.aFiles[f.id] = { assignment_id: a.id, category: 'question', name: f.name, data: f.data, type: f.type || '' }; });
      (a.questionLinks     || []).forEach(l => { if (l.id) snap.aLinks[l.id] = { assignment_id: a.id, category: 'question', url: l.url }; });
      (a.folderAttachments || []).forEach(f => { if (f.id) snap.aFiles[f.id] = { assignment_id: a.id, category: 'folder',   name: f.name, data: f.data, type: f.type || '' }; });
      (a.folderLinks       || []).forEach(l => { if (l.id) snap.aLinks[l.id] = { assignment_id: a.id, category: 'folder',   url: l.url }; });
      (a.tasks || []).forEach((t, ti) => {
        snap.tasks[t.id] = { assignment_id: a.id, label: t.label || '', done: !!t.done, position: ti };
        (t.links  || []).forEach(l => { if (l.id) snap.tLinks[l.id]  = { task_id: t.id, url: l.url }; });
        (t.photos || []).forEach(p => { if (p.id) snap.tPhotos[p.id] = { task_id: t.id, data: p.data }; });
      });
    });
    (s.exams || []).forEach((f, fi) => {
      snap.examFolders[f.id] = { subject_id: s.id, exam_type: f.examType || 'quiz1', name: f.name, icon: f.icon || '📖', exam_date: f.examDate || null, exam_time: f.examTime || null, exam_room: f.examRoom || '', main_source: f.mainSource || '', ppt_link: f.pptLink || '', exam_collections: f.examCollections || '', notes: f.notes || '', position: fi };
      (f.materiList || []).forEach((m, mi) => {
        if (!m.id) return;
        snap.examMaterials[m.id] = { folder_id: f.id, name: m.name || '', done: !!m.done, position: mi };
        (m.links || []).forEach(l => { if (l.id) snap.mLinks[l.id] = { material_id: m.id, url: l.url }; });
        (m.files || []).forEach(fl => { if (fl.id) snap.mFiles[fl.id] = { material_id: m.id, name: fl.name, data: fl.data, type: fl.type || '' }; });
      });
    });
  });
  examEvents.forEach(ev => {
    snap.examEvents[ev.id] = { folder_id: ev.folderId, date: ev.date, time: ev.time || null, room: ev.room || '' };
  });
  return snap;
}

function _diffMaps(curr, prev) {
  const upserts = [], deletes = [];
  for (const [id, row] of Object.entries(curr)) {
    if (!prev[id] || JSON.stringify(prev[id]) !== JSON.stringify(row)) upserts.push({ id, ...row });
  }
  for (const id of Object.keys(prev)) {
    if (!curr[id]) deletes.push(id);
  }
  return { upserts, deletes };
}

async function _doSave() {
  const curr = _buildSnap();
  const prev = _snap || { subjects:{}, assignments:{}, tasks:{}, examFolders:{}, examMaterials:{}, examEvents:{}, aFiles:{}, aLinks:{}, tLinks:{}, tPhotos:{}, mLinks:{}, mFiles:{} };

  const dS  = _diffMaps(curr.subjects,      prev.subjects);
  const dA  = _diffMaps(curr.assignments,   prev.assignments);
  const dT  = _diffMaps(curr.tasks,         prev.tasks);
  const dEF = _diffMaps(curr.examFolders,   prev.examFolders);
  const dEM = _diffMaps(curr.examMaterials, prev.examMaterials);
  const dEE = _diffMaps(curr.examEvents,    prev.examEvents);
  const dAF = _diffMaps(curr.aFiles,        prev.aFiles);
  const dAL = _diffMaps(curr.aLinks,        prev.aLinks);
  const dTL = _diffMaps(curr.tLinks,        prev.tLinks);
  const dTP = _diffMaps(curr.tPhotos,       prev.tPhotos);
  const dML = _diffMaps(curr.mLinks,        prev.mLinks);
  const dMF = _diffMaps(curr.mFiles,        prev.mFiles);

  const hasChanges = [dS,dA,dT,dEF,dEM,dEE,dAF,dAL,dTL,dTP,dML,dMF]
    .some(d => d.upserts.length || d.deletes.length);
  if (!hasChanges) { _saveLocalBackup(); return true; }

  try {
    // Delete leaf → root (respects FK constraints; CASCADE handles orphans)
    await Promise.all([
      ...dTP.deletes.map(id => _sbDelete('task_photos',          `id=eq.${id}`)),
      ...dTL.deletes.map(id => _sbDelete('task_links',           `id=eq.${id}`)),
      ...dAF.deletes.map(id => _sbDelete('assignment_files',     `id=eq.${id}`)),
      ...dAL.deletes.map(id => _sbDelete('assignment_links',     `id=eq.${id}`)),
      ...dMF.deletes.map(id => _sbDelete('exam_material_files',  `id=eq.${id}`)),
      ...dML.deletes.map(id => _sbDelete('exam_material_links',  `id=eq.${id}`)),
    ]);
    await Promise.all([
      ...dT.deletes.map(id  => _sbDelete('tasks',          `id=eq.${id}`)),
      ...dEM.deletes.map(id => _sbDelete('exam_materials', `id=eq.${id}`)),
      ...dEE.deletes.map(id => _sbDelete('exam_events',    `id=eq.${id}`)),
    ]);
    await Promise.all([
      ...dA.deletes.map(id  => _sbDelete('assignments',  `id=eq.${id}`)),
      ...dEF.deletes.map(id => _sbDelete('exam_folders', `id=eq.${id}`)),
    ]);
    await Promise.all(dS.deletes.map(id => _sbDelete('subjects', `id=eq.${id}`)));

    // Upsert root → leaf (respects FK constraints)
    if (dS.upserts.length)  await Promise.all(dS.upserts.map(r  => _sbUpsert('subjects',      r)));
    if (dA.upserts.length || dEF.upserts.length) {
      await Promise.all([
        ...dA.upserts.map(r  => _sbUpsert('assignments',  r)),
        ...dEF.upserts.map(r => _sbUpsert('exam_folders', r)),
      ]);
    }
    await Promise.all([
      ...dT.upserts.map(r  => _sbUpsert('tasks',          r)),
      ...dEM.upserts.map(r => _sbUpsert('exam_materials', r)),
      ...dEE.upserts.map(r => _sbUpsert('exam_events',    r)),
    ]);
    await Promise.all([
      ...dAF.upserts.map(r => _sbUpsert('assignment_files',    r)),
      ...dAL.upserts.map(r => _sbUpsert('assignment_links',    r)),
      ...dTL.upserts.map(r => _sbUpsert('task_links',          r)),
      ...dTP.upserts.map(r => _sbUpsert('task_photos',         r)),
      ...dMF.upserts.map(r => _sbUpsert('exam_material_files', r)),
      ...dML.upserts.map(r => _sbUpsert('exam_material_links', r)),
    ]);

    _snap = curr;
    _saveLocalBackup();
    return true;
  } catch(e) {
    console.error('save error:', e);
    _showSaveError('save failed! 😰');
    return false;
  }
}

function _showSaveError(msg) {
  const ind = document.getElementById('save-indicator');
  if (!ind) return;
  ind.textContent = msg;
  ind.style.background = '#fde8e8'; ind.style.color = '#e05555'; ind.style.borderColor = '#f9b0b0';
  ind.classList.add('show');
  clearTimeout(ind._t);
  ind._t = setTimeout(() => {
    ind.classList.remove('show');
    ind.textContent = 'saving~ 🎀';
    ind.style.background = ''; ind.style.color = ''; ind.style.borderColor = '';
  }, 3000);
}

function save() {
  const ind = document.getElementById('save-indicator');
  if (ind) {
    ind.textContent = 'saving~ 🎀';
    ind.style.background = ''; ind.style.color = ''; ind.style.borderColor = '';
    ind.classList.add('show');
    clearTimeout(ind._t);
    ind._t = setTimeout(() => ind.classList.remove('show'), 2200);
  }
  // Always back up to localStorage immediately so data is safe
  // even if the tab closes before the debounced Supabase write fires.
  _saveLocalBackup();
  clearTimeout(_saveT);
  _saveT = setTimeout(_doSave, 400);
}

window.addEventListener('beforeunload', () => {
  // Flush any pending debounced save (best-effort; localStorage is already current)
  clearTimeout(_saveT);
  _doSave();
});

/* ═══════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════ */
const uid  = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const iso  = () => new Date().toISOString().slice(0, 10);
const esc  = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const getSub  = id => subjects.find(s => s.id === id);
const getHW   = (sid, aid) => { const s = getSub(sid); return s ? s.assignments.find(a => a.id === aid) : null; };
const getEF   = (sid, fid) => { const s = getSub(sid); return s ? s.exams.find(f => f.id === fid) : null; };
const typeClass = t => (t === 'uts' ? 'uts' : t === 'uas' ? 'uas' : 'quiz');
const findEF  = fid => { for (const s of subjects) for (const f of (s.exams || [])) if (f.id === fid) return { s, f }; return null; };

// ── File-upload helper — reads each selected file as a data URL ──
// Usage: readFilesAsDataURL(inputEl, ({id,name,data,type}) => { ... });
function readFilesAsDataURL(inputEl, onFile) {
  Array.from(inputEl.files).forEach(file => {
    const r = new FileReader();
    r.onload = e => onFile({ id: uid(), name: file.name, data: e.target.result, type: file.type });
    r.readAsDataURL(file);
  });
  inputEl.value = '';
}

/* ═══════════════════════════════════════════════
   MODE SELECTOR
═══════════════════════════════════════════════ */
function showModeSelector() {
  document.getElementById('mode-selector').classList.remove('hidden');
  _spawnPetals();
}
function _spawnPetals() {
  const ms = document.getElementById('mode-selector');
  ms.querySelectorAll('.ms-petal').forEach(p => p.remove());
  const symbols = ['🌸','🌷','✿','❀','🌹'];
  for (let i = 0; i < 10; i++) {
    const p = document.createElement('div');
    p.className = 'ms-petal';
    p.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    p.style.left = (Math.random() * 96) + '%';
    p.style.animationDuration = (7 + Math.random() * 10) + 's';
    p.style.animationDelay = (Math.random() * 14) + 's';
    p.style.fontSize = (.5 + Math.random() * .65) + 'rem';
    ms.appendChild(p);
  }
}
function selectMode(m) {
  mode = m;
  localStorage.setItem('sha-mode', m);
  document.getElementById('mode-selector').classList.add('hidden');
  applyMode();
}
function applyMode() {
  const isE = mode === 'exam';
  document.body.classList.toggle('exam-mode', isE);
  ['r1','r2','r3','r4'].forEach((id, i) => {
    const emojis = isE ? ['📚','✏️','⭐','📖'] : ['🎀','🌸','💕','🌷'];
    const el = document.getElementById(id); if (el) el.textContent = emojis[i];
  });
  document.getElementById('tagline').textContent = isE ? 'exam preparation mode 📖' : 'your digital study desk ✨';
  document.getElementById('mode-badge-wrap').innerHTML = `<div class="mode-badge ${isE?'exam':'hw'}" onclick="showModeSelector()" title="switch mode">${isE?'📚 exam prep':'📝 homework'} ↕</div>`;
  document.getElementById('sb-label').textContent = isE ? '📖 Exam Subjects' : '📚 Subjects';
  const addBtn = document.getElementById('add-matkul-btn');
  addBtn.textContent = isE ? '✦ add exam subject' : '✦ add subject';
  addBtn.onclick = () => openSubModal(isE ? 'exam' : 'hw');
  const calWrap = document.getElementById('cal-btn-wrap');
  calWrap.innerHTML = isE ? `<button class="cal-sidebar-btn" onclick="openCal()">🗓️ exam schedule</button>` : '';
  renderSidebar();
  renderEmpty();
}
function renderEmpty() {
  const e = mode === 'exam';
  document.getElementById('main-content').innerHTML = `<div class="empty-state"><div class="empty-icon">${e?'📖':'🌸'}</div><div class="empty-text">${e?'pick an exam folder from the sidebar~':'pick an assignment from the sidebar~'}</div></div>`;
}

/* ═══════════════════════════════════════════════
   MODALS CORE
═══════════════════════════════════════════════ */
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
['modal-subject','modal-hw','modal-confirm','modal-exam-folder','modal-exam-event','modal-move'].forEach(id => {
  document.getElementById(id).addEventListener('click', function(e) { if (e.target === this) closeModal(id); });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ['modal-subject','modal-hw','modal-confirm','modal-exam-folder','modal-exam-event','modal-move'].forEach(id => closeModal(id));
    closeLightbox(); closeCtx(); closeCal(); closeCQPicker();
  }
});
function askDelete(title, msg, cb) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').innerHTML = msg;
  document.getElementById('modal-confirm').classList.remove('hidden');
  const old = document.getElementById('btn-confirm-ok'), fresh = old.cloneNode(true);
  old.replaceWith(fresh);
  fresh.addEventListener('click', () => { closeModal('modal-confirm'); cb(); });
}
function openLightbox(s) { document.getElementById('lightbox-img').src = s; document.getElementById('lightbox').classList.remove('hidden'); }
function closeLightbox() { document.getElementById('lightbox').classList.add('hidden'); }
function mkEmojiPicker(rowId, emojis, cur, set) {
  const row = document.getElementById(rowId); if (!row) return; row.innerHTML = '';
  emojis.forEach(e => {
    const b = document.createElement('button');
    b.className = 'emoji-opt' + (e === cur ? ' sel' : '');
    b.textContent = e;
    b.onclick = () => { set(e); mkEmojiPicker(rowId, emojis, e, set); };
    row.appendChild(b);
  });
}

/* ═══════════════════════════════════════════════
   SUBJECT MODAL
═══════════════════════════════════════════════ */
function openSubModal(type) {
  _selEmojiS = '🧮';
  document.getElementById('ms-title').textContent = type === 'exam' ? 'new exam subject 📖' : 'new subject 📚';
  document.getElementById('subject-name-inp').value = '';
  mkEmojiPicker('emoji-subject', E_SUBJECT, _selEmojiS, v => _selEmojiS = v);
  document.getElementById('modal-subject').classList.remove('hidden');
  const btn = document.getElementById('btn-subject-ok');
  const fresh = btn.cloneNode(true); btn.replaceWith(fresh);
  fresh.onclick = () => {
    const name = document.getElementById('subject-name-inp').value.trim();
    if (!name) { document.getElementById('subject-name-inp').focus(); return; }
    subjects.push(_normalizeSubject({ id: uid(), name, icon: _selEmojiS, open: true, assignments: [], exams: [] }));
    save(); closeModal('modal-subject'); renderSidebar();
  };
  setTimeout(() => document.getElementById('subject-name-inp').focus(), 60);
}
document.getElementById('subject-name-inp').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-subject-ok').click(); });

/* ═══════════════════════════════════════════════
   HW ASSIGNMENT MODAL
═══════════════════════════════════════════════ */
function openHWModal(sid) {
  _pendingSid = sid; _selEmojiHW = '🎀';
  const s = getSub(sid);
  document.getElementById('hw-name-inp').value = '';
  document.getElementById('modal-hw-sub').innerHTML = `in: <strong>${esc(s.name)}</strong>`;
  mkEmojiPicker('emoji-hw', E_HW, _selEmojiHW, v => _selEmojiHW = v);
  document.getElementById('modal-hw').classList.remove('hidden');
  setTimeout(() => document.getElementById('hw-name-inp').focus(), 60);
}
document.getElementById('hw-name-inp').addEventListener('keydown', e => { if (e.key === 'Enter') createHW(); });
function createHW() {
  const name = document.getElementById('hw-name-inp').value.trim();
  if (!name) { document.getElementById('hw-name-inp').focus(); return; }
  const s = getSub(_pendingSid); if (!s) return;
  const a = _normalizeAssignment({ id: uid(), name, icon: _selEmojiHW, createdAt: iso() });
  s.assignments.push(a); s.open = true; _saveOpenState();
  save(); closeModal('modal-hw');
  activeSid = _pendingSid; activeAid = a.id;
  renderSidebar(); renderHW();
}

/* ═══════════════════════════════════════════════
   EXAM FOLDER MODAL
═══════════════════════════════════════════════ */
function openEFModal(sid) {
  _pendingESid = sid; _selEmojiEF = '📖';
  const s = getSub(sid);
  document.getElementById('ef-name-inp').value = '';
  document.getElementById('modal-ef-sub').innerHTML = `in: <strong>${esc(s.name)}</strong>`;
  document.getElementById('ef-type-sel').value = 'quiz1';
  mkEmojiPicker('emoji-ef', E_EXAM, _selEmojiEF, v => _selEmojiEF = v);
  document.getElementById('modal-exam-folder').classList.remove('hidden');
  setTimeout(() => document.getElementById('ef-name-inp').focus(), 60);
}
document.getElementById('ef-name-inp').addEventListener('keydown', e => { if (e.key === 'Enter') createEF(); });
function createEF() {
  const s = getSub(_pendingESid); if (!s) return;
  const type = document.getElementById('ef-type-sel').value;
  const custom = document.getElementById('ef-name-inp').value.trim();
  const name = custom || EXAM_TYPES[type];
  const f = _normalizeExamFolder({ id: uid(), name, icon: _selEmojiEF, examType: type });
  s.exams.push(f); s.open = true; _saveOpenState();
  save(); closeModal('modal-exam-folder');
  activeESid = _pendingESid; activeEFid = f.id;
  renderSidebar(); renderExam();
}

/* ═══════════════════════════════════════════════
   EXAM EVENT MODAL
═══════════════════════════════════════════════ */
function openEVModal(prefill = null) {
  const sel = document.getElementById('ev-folder-sel'); sel.innerHTML = '';
  subjects.forEach(s => (s.exams || []).forEach(f => {
    const opt = document.createElement('option'); opt.value = f.id;
    opt.textContent = `${s.icon} ${s.name} — ${f.name}`;
    if (f.id === prefill) opt.selected = true;
    sel.appendChild(opt);
  }));
  const selectedFid = prefill || sel.value;
  const prefillData = findEF(selectedFid);
  document.getElementById('ev-date').value = prefillData?.f?.examDate || '';
  document.getElementById('ev-time').value = prefillData?.f?.examTime || '';
  document.getElementById('ev-room').value = prefillData?.f?.examRoom || '';
  sel.onchange = () => {
    const r = findEF(sel.value);
    if (r) {
      document.getElementById('ev-date').value = r.f.examDate || '';
      document.getElementById('ev-time').value = r.f.examTime || '';
      document.getElementById('ev-room').value = r.f.examRoom || '';
    }
  };
  document.getElementById('modal-exam-event').classList.remove('hidden');
}
function createEV() {
  const fid  = document.getElementById('ev-folder-sel').value;
  const date = document.getElementById('ev-date').value;
  const time = document.getElementById('ev-time').value;
  const room = document.getElementById('ev-room').value.trim();
  if (!fid || !date) { alert('Please pick an exam and date~'); return; }
  subjects.forEach(s => (s.exams || []).forEach(f => {
    if (f.id === fid) { f.examDate = date; f.examTime = time || null; f.examRoom = room || ''; }
  }));
  const existing = examEvents.findIndex(ev => ev.folderId === fid);
  const ev = { id: existing >= 0 ? examEvents[existing].id : uid(), folderId: fid, date, time: time || null, room: room || '' };
  if (existing >= 0) examEvents[existing] = ev; else examEvents.push(ev);
  save(); closeModal('modal-exam-event');
  renderCalContent();
  if (activeEFid === fid) renderExam();
}

/* ═══════════════════════════════════════════════
   MOVE MODAL
═══════════════════════════════════════════════ */
function openMoveModal(type, sid, id) {
  _moveData = { type, sid, id }; _moveSel = null;
  const list = document.getElementById('move-list'); list.innerHTML = '';
  subjects.forEach(s => {
    if (s.id === sid) return;
    const item = document.createElement('div'); item.className = 'ssi';
    item.innerHTML = `<span>${s.icon}</span><span>${esc(s.name)}</span>`;
    item.dataset.sid = s.id;
    item.addEventListener('click', () => { list.querySelectorAll('.ssi').forEach(el => el.classList.remove('sel')); item.classList.add('sel'); _moveSel = s.id; });
    list.appendChild(item);
  });
  document.getElementById('modal-move').classList.remove('hidden');
  const btn = document.getElementById('btn-move-ok');
  const fresh = btn.cloneNode(true); btn.replaceWith(fresh);
  fresh.addEventListener('click', () => {
    if (!_moveSel || !_moveData) { closeModal('modal-move'); return; }
    const { type, sid, id } = _moveData;
    const fromS = getSub(sid), toS = getSub(_moveSel); if (!fromS || !toS) return;
    if (type === 'hw') {
      const idx = fromS.assignments.findIndex(a => a.id === id); if (idx < 0) return;
      const [item] = fromS.assignments.splice(idx, 1); toS.assignments.push(item);
      if (activeAid === id) { activeSid = _moveSel; }
    } else {
      const idx = fromS.exams.findIndex(f => f.id === id); if (idx < 0) return;
      const [item] = fromS.exams.splice(idx, 1); toS.exams.push(item);
      if (activeEFid === id) { activeESid = _moveSel; }
    }
    save(); closeModal('modal-move'); renderSidebar();
  });
}

/* ═══════════════════════════════════════════════
   DUPLICATE
═══════════════════════════════════════════════ */
function dupHW(sid, aid) {
  const s = getSub(sid); const a = getHW(sid, aid); if (!s || !a) return;
  const d = _normalizeAssignment(JSON.parse(JSON.stringify(a)));
  d.id = uid(); d.name = 'Copy of ' + d.name; d.createdAt = iso();
  s.assignments.push(d); save(); renderSidebar();
}
function dupEF(sid, fid) {
  const s = getSub(sid); const f = getEF(sid, fid); if (!s || !f) return;
  const d = _normalizeExamFolder(JSON.parse(JSON.stringify(f)));
  d.id = uid(); d.name = 'Copy of ' + d.name;
  s.exams.push(d); save(); renderSidebar();
}

/* ═══════════════════════════════════════════════
   CONTEXT MENU
═══════════════════════════════════════════════ */
function closeCtx() { const m = document.getElementById('ctx-menu'); m.style.display = 'none'; m.innerHTML = ''; }
document.addEventListener('click', () => closeCtx());
function showCtx(e, items) {
  e.preventDefault(); e.stopPropagation(); closeCtx();
  const menu = document.getElementById('ctx-menu');
  items.forEach(item => {
    if (item === 'sep') { const sep = document.createElement('div'); sep.className = 'ctx-sep'; menu.appendChild(sep); return; }
    const el = document.createElement('div'); el.className = 'ctx-item' + (item.danger ? ' danger' : '');
    el.innerHTML = (item.icon || '') + ' ' + esc(item.label);
    el.addEventListener('click', () => { closeCtx(); item.action(); });
    menu.appendChild(el);
  });
  menu.style.display = 'block';
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let x = e.clientX, y = e.clientY;
  if (x + mw > window.innerWidth) x = window.innerWidth - mw - 8;
  if (y + mh > window.innerHeight) y = window.innerHeight - mh - 8;
  menu.style.left = x + 'px'; menu.style.top = y + 'px';
}

/* ═══════════════════════════════════════════════
   SIDEBAR
═══════════════════════════════════════════════ */
function renderSidebar() { mode === 'hw' ? renderHWSidebar() : renderExamSidebar(); }
function _buildSubjects(isExam) {
  const list = document.getElementById('matkul-list'); list.innerHTML = '';
  subjects.forEach((s, si) => {
    const row = document.createElement('div'); row.className = 'matkul-row';
    const hdr = document.createElement('button'); hdr.className = 'matkul-hdr' + (s.open ? ' open' : '');
    const count = isExam ? (s.exams || []).length : (s.assignments || []).length;
    hdr.innerHTML = `<span class="matkul-chev">▶</span><span class="matkul-icon">${s.icon}</span><span class="matkul-name">${esc(s.name)}</span><span class="matkul-cnt">${count} ${isExam?'exams':'tasks'}</span>`;
    const acts = document.createElement('div'); acts.className = 'matkul-acts';
    const addA = document.createElement('button'); addA.className = 'matkul-act'; addA.title = 'add'; addA.textContent = '＋';
    addA.addEventListener('click', e => { e.stopPropagation(); isExam ? openEFModal(s.id) : openHWModal(s.id); });
    const delA = document.createElement('button'); delA.className = 'matkul-act'; delA.title = 'delete subject'; delA.textContent = '🗑';
    delA.addEventListener('click', e => {
      e.stopPropagation();
      askDelete('delete this subject? 🥺', `<strong>"${esc(s.name)}"</strong> will be gone forever~`, () => {
        subjects.splice(si, 1);
        if (activeSid === s.id) { activeSid = null; activeAid = null; }
        if (activeESid === s.id) { activeESid = null; activeEFid = null; }
        save(); renderSidebar(); renderEmpty();
      });
    });
    acts.append(addA, delA);
    if (!isExam) {
      const gd = document.createElement('button'); gd.className = 'gdrive-btn' + (s.driveLink ? ' has-link' : ''); gd.title = 'drive folder'; gd.textContent = '📁';
      gd.addEventListener('click', e => {
        e.stopPropagation();
        if (s.driveLink) { const a = document.createElement('a'); a.href = s.driveLink; a.target = '_blank'; a.click(); }
        else { const u = prompt('Drive folder link~'); if (u && u.trim()) { s.driveLink = u.trim(); save(); renderSidebar(); } }
      });
      gd.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); const u = prompt('Update drive link~', s.driveLink || ''); if (u !== null) { s.driveLink = u.trim() || null; save(); renderSidebar(); } });
      hdr.appendChild(gd);
    }
    hdr.appendChild(acts);
    hdr.addEventListener('click', () => { s.open = !s.open; _saveOpenState(); renderSidebar(); });
    row.appendChild(hdr);
    if (s.open) {
      const subL = document.createElement('div'); subL.className = 'subfolder-list';
      const items = isExam ? (s.exams || []) : (s.assignments || []);
      items.forEach((item, ii) => {
        const btn = document.createElement('button'); btn.className = 'sfbtn';
        const isActiveHW   = !isExam && activeSid  === s.id && activeAid  === item.id;
        const isActiveExam =  isExam && activeESid === s.id && activeEFid === item.id;
        if (isActiveHW || isActiveExam) btn.classList.add('active');
        if (!isExam && item.pinned) btn.classList.add('pinned-f');
        btn.innerHTML = `<span class="sf-icon">${item.icon}</span>`;
        const nameEl = document.createElement('span'); nameEl.className = 'sf-name'; nameEl.textContent = item.name; btn.appendChild(nameEl);
        if (item.name.length > 15) { const tip = document.createElement('span'); tip.className = 'sf-tooltip'; tip.textContent = item.name; btn.appendChild(tip); }
        if (isExam) {
          const tc = typeClass(item.examType);
          const badge = document.createElement('span'); badge.className = `exam-type-mini ${tc}`; badge.textContent = EXAM_TYPES[item.examType] || item.examType; btn.appendChild(badge);
        } else {
          const dot = document.createElement('span'); dot.className = 'sb-status-dot ' + (item.status || 'untouched'); btn.appendChild(dot);
        }
        if (!isExam && item.pinned) { const pb = document.createElement('span'); pb.className = 'sf-icon'; pb.textContent = '📌'; btn.insertBefore(pb, btn.querySelector('.sf-icon').nextSibling); }
        const del = document.createElement('button'); del.className = 'sf-del'; del.textContent = '🗑';
        del.addEventListener('click', e => {
          e.stopPropagation();
          askDelete(`delete? 🥺`, `<strong>"${esc(item.name)}"</strong> will be gone~`, () => {
            items.splice(ii, 1);
            if (!isExam && activeAid === item.id) { activeAid = null; renderEmpty(); }
            if (isExam && activeEFid === item.id) { activeEFid = null; renderEmpty(); }
            save(); renderSidebar();
          });
        });
        btn.appendChild(del);
        btn.addEventListener('click', () => {
          if (isExam) { activeESid = s.id; activeEFid = item.id; renderSidebar(); renderExam(); }
          else { activeSid = s.id; activeAid = item.id; renderSidebar(); renderHW(); }
        });
        if (isExam) {
          btn.addEventListener('contextmenu', e => { showCtx(e, [
            {icon:'📋', label:'Duplicate', action:() => dupEF(s.id, item.id)},
            {icon:'📂', label:'Move to...', action:() => openMoveModal('exam', s.id, item.id)},
            {icon:'🗓️', label:'Add to schedule', action:() => openEVModal(item.id)},
            'sep',
            {icon:'🗑', label:'Delete', danger:true, action:() => askDelete('delete? 🥺', `<strong>"${esc(item.name)}"</strong>`, () => { items.splice(ii,1); if(activeEFid===item.id){activeEFid=null;renderEmpty();} save(); renderSidebar(); })}
          ]); });
        } else {
          btn.addEventListener('contextmenu', e => { showCtx(e, [
            {icon:'📋', label:'Duplicate', action:() => dupHW(s.id, item.id)},
            {icon:'📂', label:'Move to...', action:() => openMoveModal('hw', s.id, item.id)},
            {icon:'📌', label:item.pinned?'Unpin':'Pin to top', action:() => { item.pinned = !item.pinned; save(); renderSidebar(); }},
            'sep',
            {icon:'🗑', label:'Delete', danger:true, action:() => askDelete('delete? 🥺', `<strong>"${esc(item.name)}"</strong>`, () => { items.splice(ii,1); if(activeAid===item.id){activeAid=null;renderEmpty();} save(); renderSidebar(); })}
          ]); });
        }
        subL.appendChild(btn);
      });
      const addSub = document.createElement('button'); addSub.className = 'add-sf-btn';
      addSub.textContent = isExam ? '＋ new exam folder' : '＋ new assignment';
      addSub.addEventListener('click', () => isExam ? openEFModal(s.id) : openHWModal(s.id));
      subL.appendChild(addSub);
      row.appendChild(subL);
    }
    list.appendChild(row);
  });
}
function renderHWSidebar() {
  const pw = document.getElementById('pinned-wrap');
  const pinned = [];
  subjects.forEach(s => (s.assignments || []).forEach(a => { if (a.pinned) pinned.push({ s, a }); }));
  if (pinned.length) {
    pw.innerHTML = `<div class="pinned-strip"><div class="pinned-strip-label">📌 pinned</div>${
      pinned.map(({s,a}) => `<button class="pinned-item" onclick="jumpHW('${s.id}','${a.id}')"><span>📌</span><span class="pinned-item-name">${esc(a.icon)} ${esc(a.name)}</span><span class="pinned-item-sub">${esc(s.name)}</span></button>`).join('')
    }</div>`;
  } else pw.innerHTML = '';
  _buildSubjects(false);
}
function renderExamSidebar() {
  document.getElementById('pinned-wrap').innerHTML = '';
  _buildSubjects(true);
}
function jumpHW(sid, aid) {
  mode = 'hw'; activeSid = sid; activeAid = aid; applyMode();
  const s = getSub(sid); if (s) { s.open = true; _saveOpenState(); }
  renderSidebar(); renderHW();
}

/* ═══════════════════════════════════════════════
   HW PAGE
═══════════════════════════════════════════════ */
function renderHW() {
  const main = document.getElementById('main-content');
  const subj = getSub(activeSid), asgn = subj ? getHW(activeSid, activeAid) : null;
  if (!asgn) { renderEmpty(); return; }
  if (!Array.isArray(asgn.tasks)) asgn.tasks = [];
  if (!Array.isArray(asgn.materialFiles)) asgn.materialFiles = [];
  if (!Array.isArray(asgn.materialLinks)) asgn.materialLinks = [];
  if (!Array.isArray(asgn.questionFiles)) asgn.questionFiles = [];
  if (!Array.isArray(asgn.questionLinks)) asgn.questionLinks = [];
  if (!Array.isArray(asgn.folderAttachments)) asgn.folderAttachments = [];
  if (!Array.isArray(asgn.folderLinks)) asgn.folderLinks = [];
  if (!asgn.status) asgn.status = 'untouched';

  const done = asgn.tasks.filter(t => t.done).length, total = asgn.tasks.length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const overdue = asgn.dueDate && new Date(asgn.dueDate + 'T' + (asgn.dueTime || '23:59')) < new Date();
  const sbHtml = STATUSES.map(st => `<button class="sbtn ${asgn.status===st.k?st.ac:''}" data-status="${st.k}"><span class="sdot" style="background:${st.d}"></span>${st.l}</button>`).join('');
  const isSubmitted = !!asgn.submitted;

  const page = document.createElement('div'); page.className = 'memo-page';
  page.innerHTML = `
  <div class="crumb"><span class="cs">${esc(subj.icon)} ${esc(subj.name)}</span><span class="sep">›</span><span class="ct">${esc(asgn.icon)} ${esc(asgn.name)}</span></div>
  <div class="memo-hdr">
    <span class="memo-icon">${asgn.icon}</span>
    <div class="memo-fields">
      <input class="memo-title" value="${esc(asgn.name)}" placeholder="assignment title..." id="hw-title-inp"/>
      <div class="status-strip"><span class="sl">status :</span>${sbHtml}</div>
      <div class="date-row">
        <div class="df">
          <span class="dfl">start :</span>
          <div class="start-pill">
            <button type="button" class="date-trigger-btn" id="hw-start-btn">
              <span class="cal-icon">📅</span>
              <span id="hw-start-lbl">${asgn.startDate || 'pick date'}</span>
            </button>
            <button class="today-btn" id="hw-today">today</button>
          </div>
        </div>
        <div class="df">
          <span class="dfl dead">DEADLINE !</span>
          <div class="deadline-pill ${overdue?'overdue':''}">
            <button type="button" class="date-trigger-btn" id="hw-dl-btn" style="border:none;padding:.2rem .5rem;background:transparent;">
              <span class="cal-icon">🗓️</span>
              <span id="hw-dl-lbl" style="color:#c0392b;font-weight:700;">${asgn.dueDate||'pick date'}${asgn.dueTime?' '+asgn.dueTime:''}</span>
            </button>
            ${(asgn.dueDate||asgn.dueTime)?'<button class="dl-clear" id="hw-dl-clear">✕</button>':''}
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="card" style="margin-bottom:1.3rem">
    <div class="card-hdr">
      <span class="card-label">📬 submission</span>
      <button class="submit-toggle ${isSubmitted?'on':''}" id="hw-submit-btn"><span>${isSubmitted?'✅':'⬜'}</span>${isSubmitted?'Submitted!':'Mark as Submitted'}</button>
    </div>
    <div class="link-row">
      <span class="link-label">🔗 submit to :</span>
      <div class="link-wrap"><input type="url" class="link-inp" id="hw-submit-link" placeholder="paste submission link..." value="${esc(asgn.submitLink||'')}"/><button class="open-btn" id="hw-submit-open">open ↗</button></div>
    </div>
  </div>
  <div class="card" style="margin-bottom:1.3rem">
    <div class="two-col">
      <div>
        <div class="col-hdr"><span class="card-label">📎 materials</span><div class="col-btns"><button class="add-chip-btn" id="mat-file-btn">＋ file</button><button class="add-chip-btn blue" id="mat-link-btn">＋ link</button></div></div>
        <div class="chips-wrap" id="mat-chips"></div>
        <div id="mat-link-row" style="display:none" class="add-link-row"><input class="add-link-inp" id="mat-link-inp" type="url" placeholder="paste url..."/><button class="add-link-ok" id="mat-link-ok">add</button></div>
        <input type="file" id="mat-file-inp" style="display:none" multiple accept="image/*,.pdf,.doc,.docx,.pptx,.xlsx,.txt"/>
      </div>
      <div class="col-div"></div>
      <div>
        <div class="col-hdr"><span class="card-label">📋 question files</span><div class="col-btns"><button class="add-chip-btn" id="qf-file-btn">＋ file</button><button class="add-chip-btn blue" id="qf-link-btn">＋ link</button></div></div>
        <div class="chips-wrap" id="qf-chips"></div>
        <div id="qf-link-row" style="display:none" class="add-link-row"><input class="add-link-inp" id="qf-link-inp" type="url" placeholder="paste url..."/><button class="add-link-ok" id="qf-link-ok">add</button></div>
        <input type="file" id="qf-file-inp" style="display:none" multiple accept="image/*,.pdf,.doc,.docx,.pptx,.xlsx,.txt"/>
      </div>
    </div>
  </div>
  <div class="card" style="margin-bottom:1.3rem">
    <span class="card-label">🗒️ notes</span>
    <textarea class="notes-ta" id="hw-notes" placeholder="write notes for this assignment...">${esc(asgn.notes||'')}</textarea>
  </div>
  <div class="task-lbl">✦ task checklist</div>
  <div class="task-list" id="task-list"></div>
  <div class="add-task-row" id="add-task-row"><span>＋</span> add task</div>
  <div class="progress-section">
    <div class="progress-row"><span class="progress-text">progress</span><span class="progress-pct">${done}/${total} (${pct}%)</span></div>
    <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
  </div>
  <div class="card" style="margin-bottom:1.3rem;margin-top:1.3rem">
    <div class="card-hdr">
      <span class="card-label">🗂️ assignment files</span>
      <div class="folder-attach-btns">
        <button class="add-chip-btn" id="fa-file-btn">📁 upload</button>
        <button class="add-chip-btn" id="fa-photo-btn">🖼️ photo</button>
        <button class="add-chip-btn blue" id="fa-link-btn">🔗 link</button>
      </div>
    </div>
    <div class="chips-wrap" id="fa-chips"></div>
    <div id="fa-link-row" style="display:none" class="add-link-row"><input class="add-link-inp" id="fa-link-inp" type="url" placeholder="paste url..."/><button class="add-link-ok" id="fa-link-ok">add</button></div>
    <input type="file" id="fa-file-inp" style="display:none" multiple accept=".pdf,.doc,.docx,.pptx,.xlsx,.txt,.zip"/>
    <input type="file" id="fa-photo-inp" style="display:none" multiple accept="image/*"/>
  </div>`;

  _bindHW(page, subj, asgn);
  main.innerHTML = ''; main.appendChild(page);
  _renderChips('mat-chips', asgn.materialFiles, asgn.materialLinks,
    i => { asgn.materialFiles.splice(i,1); save(); _renderChips('mat-chips',asgn.materialFiles,asgn.materialLinks,null,null); },
    i => { asgn.materialLinks.splice(i,1); save(); _renderChips('mat-chips',asgn.materialFiles,asgn.materialLinks,null,null); });
  _renderChips('qf-chips', asgn.questionFiles, asgn.questionLinks,
    i => { asgn.questionFiles.splice(i,1); save(); _renderChips('qf-chips',asgn.questionFiles,asgn.questionLinks,null,null); },
    i => { asgn.questionLinks.splice(i,1); save(); _renderChips('qf-chips',asgn.questionFiles,asgn.questionLinks,null,null); });
  _renderFAChips(asgn);
  renderTasks(asgn);
}

function _bindHW(page, subj, asgn) {
  page.querySelector('#hw-title-inp').addEventListener('change', function() { asgn.name = this.value; save(); renderSidebar(); });
  page.querySelectorAll('.sbtn').forEach(b => b.addEventListener('click', () => { asgn.status = b.dataset.status; save(); renderSidebar(); renderHW(); }));
  page.querySelector('#hw-submit-btn').addEventListener('click', () => { asgn.submitted = !asgn.submitted; if (asgn.submitted) asgn.status = 'submitted'; save(); renderSidebar(); renderHW(); });
  page.querySelector('#hw-submit-link').addEventListener('change', function() { asgn.submitLink = this.value.trim(); save(); });
  page.querySelector('#hw-submit-open').addEventListener('click', () => { const u = page.querySelector('#hw-submit-link').value.trim(); if (u) open(u, '_blank'); });
  page.querySelector('#hw-start-btn').addEventListener('click', () => {
    openCQPicker({ date: asgn.startDate, showTime: false, title: '🌸 start date', callback: (d) => {
      asgn.startDate = d; save();
      const lbl = page.querySelector('#hw-start-lbl'); if (lbl) lbl.textContent = d;
    }});
  });
  page.querySelector('#hw-today').addEventListener('click', () => {
    asgn.startDate = iso(); save();
    const lbl = page.querySelector('#hw-start-lbl'); if (lbl) lbl.textContent = iso();
  });
  page.querySelector('#hw-dl-btn').addEventListener('click', () => {
    openCQPicker({ date: asgn.dueDate, time: asgn.dueTime, showTime: true, title: '🗓️ deadline', callback: (d, t) => {
      asgn.dueDate = d; asgn.dueTime = t || null; save(); renderHW();
    }});
  });
  const dlc = page.querySelector('#hw-dl-clear');
  if (dlc) dlc.addEventListener('click', () => askDelete('clear deadline? 🥺', '', () => { asgn.dueDate = null; asgn.dueTime = null; save(); renderHW(); }));
  _bindFileChip(page,'#mat-file-btn','#mat-file-inp','#mat-link-btn','#mat-link-row','#mat-link-inp','#mat-link-ok',asgn,'materialFiles','materialLinks','mat-chips');
  _bindFileChip(page,'#qf-file-btn','#qf-file-inp','#qf-link-btn','#qf-link-row','#qf-link-inp','#qf-link-ok',asgn,'questionFiles','questionLinks','qf-chips');
  const fafi = page.querySelector('#fa-file-inp'), fapi = page.querySelector('#fa-photo-inp');
  page.querySelector('#fa-file-btn').addEventListener('click', () => fafi.click());
  page.querySelector('#fa-photo-btn').addEventListener('click', () => fapi.click());
  [fafi, fapi].forEach(inp => inp.addEventListener('change', function() {
    readFilesAsDataURL(this, file => { asgn.folderAttachments.push(file); save(); _renderFAChips(asgn); });
  }));
  const falr = page.querySelector('#fa-link-row'), fali = page.querySelector('#fa-link-inp');
  page.querySelector('#fa-link-btn').addEventListener('click', () => { falr.style.display = falr.style.display === 'none' ? 'flex' : 'none'; if (falr.style.display === 'flex') setTimeout(() => fali.focus(), 40); });
  const commitFA = () => { const u = fali.value.trim(); if (!u) return; asgn.folderLinks.push({ id: uid(), url: u }); save(); _renderFAChips(asgn); fali.value = ''; falr.style.display = 'none'; };
  page.querySelector('#fa-link-ok').addEventListener('click', commitFA);
  fali.addEventListener('keydown', e => { if (e.key === 'Enter') commitFA(); });
  page.querySelector('#add-task-row').addEventListener('click', addTask);
  page.querySelector('#hw-notes').addEventListener('input', function() { asgn.notes = this.value; save(); });
}

function _bindFileChip(page, fileBtnSel, fileInpSel, linkBtnSel, linkRowSel, linkInpSel, linkOkSel, asgn, fileKey, linkKey, chipsId) {
  const fi = page.querySelector(fileInpSel);
  page.querySelector(fileBtnSel).addEventListener('click', () => fi.click());
  fi.addEventListener('change', function() {
    readFilesAsDataURL(this, file => {
      if (!Array.isArray(asgn[fileKey])) asgn[fileKey] = [];
      asgn[fileKey].push(file);
      save();
      _renderChips(chipsId, asgn[fileKey], asgn[linkKey] || [],
        i => { asgn[fileKey].splice(i,1); save(); _renderChips(chipsId,asgn[fileKey],asgn[linkKey]||[],null,null); },
        i => { asgn[linkKey].splice(i,1); save(); _renderChips(chipsId,asgn[fileKey]||[],asgn[linkKey],null,null); });
    });
  });
  const lr = page.querySelector(linkRowSel), li = page.querySelector(linkInpSel);
  page.querySelector(linkBtnSel).addEventListener('click', () => { lr.style.display = lr.style.display === 'none' ? 'flex' : 'none'; if (lr.style.display === 'flex') setTimeout(() => li.focus(), 40); });
  const commit = () => {
    const u = li.value.trim(); if (!u) return;
    if (!Array.isArray(asgn[linkKey])) asgn[linkKey] = [];
    asgn[linkKey].push({ id: uid(), url: u }); save();
    _renderChips(chipsId, asgn[fileKey] || [], asgn[linkKey],
      i => { asgn[fileKey].splice(i,1); save(); _renderChips(chipsId,asgn[fileKey],asgn[linkKey]||[],null,null); },
      i => { asgn[linkKey].splice(i,1); save(); _renderChips(chipsId,asgn[fileKey]||[],asgn[linkKey],null,null); });
    li.value = ''; lr.style.display = 'none';
  };
  page.querySelector(linkOkSel).addEventListener('click', commit);
  li.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); });
}

function _renderChips(cid, files, links, onFileDel, onLinkDel) {
  const c = document.getElementById(cid); if (!c) return; c.innerHTML = '';
  const safeFiles = Array.isArray(files) ? files : [];
  const safeLinks = Array.isArray(links) ? links : [];
  if (!safeFiles.length && !safeLinks.length) { c.innerHTML = '<span class="chip-empty">nothing yet~</span>'; return; }
  safeFiles.forEach((f, i) => {
    const img = f.type && f.type.startsWith('image/');
    const chip = document.createElement('div'); chip.className = 'file-chip'; chip.title = 'click to open';
    chip.innerHTML = `<span>${img?'🖼️':fileIcon(f.name)}</span><span class="chip-name">${esc(f.name)}</span><button class="chip-del">✕</button>`;
    chip.addEventListener('click', e => { if (e.target.classList.contains('chip-del')) return; img ? openLightbox(f.data) : dlFile(f); });
    chip.querySelector('.chip-del').addEventListener('click', e => { e.stopPropagation(); if (onFileDel) askDelete('delete file?', `<strong>"${esc(f.name)}"</strong>`, () => onFileDel(i)); });
    c.appendChild(chip);
  });
  safeLinks.forEach((l, i) => {
    const url = typeof l === 'string' ? l : (l.url || '');
    const label = url.replace(/^https?:\/\//, '').split('/')[0] || url;
    const chip = document.createElement('div'); chip.className = 'link-chip'; chip.title = url;
    chip.innerHTML = `<span>🔗</span><span class="link-chip-name">${esc(label)}</span><button class="link-chip-del">✕</button>`;
    chip.querySelector('.link-chip-name').addEventListener('click', () => { if (url) window.open(url, '_blank'); });
    chip.querySelector('.link-chip-del').addEventListener('click', e => { e.stopPropagation(); if (onLinkDel) askDelete('delete link?', '', () => onLinkDel(i)); });
    c.appendChild(chip);
  });
}
function _renderFAChips(asgn) {
  _renderChips('fa-chips', asgn.folderAttachments || [], asgn.folderLinks || [],
    i => { asgn.folderAttachments.splice(i,1); save(); _renderFAChips(asgn); },
    i => { asgn.folderLinks.splice(i,1); save(); _renderFAChips(asgn); });
}
function dlFile(f) { const a = document.createElement('a'); a.href = f.data; a.download = f.name; a.click(); }
function fileIcon(n) { const e = n.split('.').pop().toLowerCase(); return {pdf:'📄',doc:'📝',docx:'📝',pptx:'📊',ppt:'📊',xlsx:'📋',xls:'📋'}[e] || '📎'; }

/* ── Tasks ── */
function renderTasks(asgn) {
  const list = document.getElementById('task-list'); if (!list) return; list.innerHTML = '';
  (asgn.tasks || []).forEach((t, i) => {
    const card = document.createElement('div'); card.className = 'task-card';
    const mainRow = document.createElement('div'); mainRow.className = 'task-main';
    const chk = document.createElement('div'); chk.className = 'task-chk' + (t.done ? ' done' : ''); chk.innerHTML = t.done ? '✓' : '';
    chk.addEventListener('click', () => { t.done = !t.done; save(); renderHW(); renderSidebar(); });
    const num = document.createElement('span'); num.className = 'task-num'; num.textContent = t.number + '.';
    const inp = document.createElement('input'); inp.className = 'task-inp' + (t.done ? ' done' : ''); inp.value = t.label || ''; inp.placeholder = `task no. ${t.number}...`;
    inp.addEventListener('change', function() { t.label = this.value; save(); renderSidebar(); });
    const hasA = (t.links && t.links.length) || (t.photos && t.photos.length);
    const exp = document.createElement('button'); exp.className = 'task-exp'; exp.textContent = hasA ? '🔗📎' : '+ answers';
    exp.addEventListener('click', () => { const p = card.querySelector('.task-attach'); p.classList.toggle('open'); exp.textContent = p.classList.contains('open') ? '▲ close' : (hasA ? '🔗📎' : '+ answers'); });
    const del = document.createElement('button'); del.className = 'task-del'; del.textContent = '🗑';
    del.addEventListener('click', () => {
      const lbl = t.label || 'no.' + t.number;
      askDelete('delete task? 🥺', `<strong>"${esc(lbl)}"</strong>`, () => {
        asgn.tasks.splice(i, 1);
        asgn.tasks.forEach((tt, idx) => tt.number = idx + 1);
        save(); renderHW(); renderSidebar();
      });
    });
    mainRow.append(chk, num, inp, exp, del);
    const panel = document.createElement('div'); panel.className = 'task-attach'; panel.innerHTML = _buildAttach(t, i); _bindAttach(panel, i, asgn);
    card.append(mainRow, panel); list.appendChild(card);
  });
}

function addTask() {
  const asgn = getHW(activeSid, activeAid); if (!asgn) return;
  if (!Array.isArray(asgn.tasks)) asgn.tasks = [];
  const maxN = asgn.tasks.length > 0 ? Math.max(...asgn.tasks.map(t => t.number || 0)) : 0;
  asgn.tasks.push(_normalizeTask({ number: maxN + 1, label: '', done: false, links: [], photos: [] }, maxN));
  save(); renderHW(); renderSidebar();
  setTimeout(() => { const ins = document.querySelectorAll('.task-inp'); if (ins.length) ins[ins.length - 1].focus(); }, 60);
}

function _buildAttach(t, i) {
  const links = t.links || [];
  let h = links.map((l, li) => { const url = typeof l === 'string' ? l : (l.url || ''); return `<div class="attach-row"><span class="attach-lbl">🔗 link</span><div class="link-inp-wrap"><input class="ta-inp" type="url" value="${esc(url)}" data-li="${li}"/><button class="ta-open" data-lo="${li}">open ↗</button><button class="chip-del" data-ld="${li}">✕</button></div></div>`; }).join('');
  h += `<div class="attach-row"><span class="attach-lbl"></span><button class="add-chip-btn" data-al="${i}" style="margin:0">＋ add link</button></div>`;
  const photos = t.photos || [];
  h += `<div class="attach-row" style="align-items:flex-start"><span class="attach-lbl" style="padding-top:6px">📸 photo</span><div class="photo-chips" id="pchips-${i}">`;
  photos.forEach((p, pi) => { const src = typeof p === 'string' ? p : (p.data || ''); h += `<div class="photo-chip"><img src="${src}" alt=""/><button class="photo-chip-del" data-pd="${pi}">✕</button></div>`; });
  h += `<label class="photo-add"><span style="pointer-events:none">📷</span><input type="file" accept="image/*" multiple data-pu="${i}"/></label></div></div>`;
  return h;
}
function _bindAttach(panel, i, asgn) {
  panel.querySelectorAll('.ta-inp').forEach(inp => inp.addEventListener('change', function() {
    if (!Array.isArray(asgn.tasks[i].links)) asgn.tasks[i].links = [];
    const li2 = parseInt(this.dataset.li);
    const existing = asgn.tasks[i].links[li2];
    asgn.tasks[i].links[li2] = existing && existing.id ? { ...existing, url: this.value.trim() } : { id: uid(), url: this.value.trim() };
    save();
  }));
  panel.querySelectorAll('[data-lo]').forEach(b => b.addEventListener('click', () => { const l = (asgn.tasks[i].links || [])[parseInt(b.dataset.lo)]; const u = typeof l === 'string' ? l : (l && l.url); if (u) window.open(u, '_blank'); }));
  panel.querySelectorAll('[data-ld]').forEach(b => b.addEventListener('click', () => askDelete('delete link?', '', () => { asgn.tasks[i].links.splice(parseInt(b.dataset.ld), 1); save(); renderHW(); })));
  panel.querySelectorAll('[data-al]').forEach(b => b.addEventListener('click', () => {
    if (!Array.isArray(asgn.tasks[i].links)) asgn.tasks[i].links = [];
    asgn.tasks[i].links.push({ id: uid(), url: '' }); save(); renderHW();
    setTimeout(() => { const cards = document.querySelectorAll('.task-card'); if (cards[i]) { const p = cards[i].querySelector('.task-attach'); if (p) p.classList.add('open'); } }, 60);
  }));
  panel.querySelectorAll('.photo-chip img').forEach(img => img.addEventListener('click', () => { if (img.src) openLightbox(img.src); }));
  panel.querySelectorAll('[data-pd]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); askDelete('delete photo?', '', () => { asgn.tasks[i].photos.splice(parseInt(b.dataset.pd), 1); save(); renderHW(); }); }));
  panel.querySelectorAll('[data-pu]').forEach(inp => inp.addEventListener('change', function() {
    readFilesAsDataURL(this, file => {
      if (!Array.isArray(asgn.tasks[i].photos)) asgn.tasks[i].photos = [];
      asgn.tasks[i].photos.push({ id: file.id, data: file.data });
      save(); renderHW();
    });
  }));
}

/* ═══════════════════════════════════════════════
   EXAM PAGE
   CHANGES:
   - All Indonesian text → English
   - Sources & Collections: input field + proper link button
     that shows title/label when link is set
═══════════════════════════════════════════════ */
function renderExam() {
  clearInterval(_cdInt);
  const main = document.getElementById('main-content');
  const s = getSub(activeESid), f = s ? getEF(activeESid, activeEFid) : null;
  if (!f) { renderEmpty(); return; }
  if (!Array.isArray(f.materiList)) f.materiList = [];
  f.materiList = f.materiList.map(_normalizeMateri);

  const tc = typeClass(f.examType), tn = EXAM_TYPES[f.examType] || f.examType;
  const done = f.materiList.filter(m => m.done).length, total = f.materiList.length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const calEv = examEvents.find(ev => ev.folderId === f.id);
  const displayDate = f.examDate || calEv?.date || null;
  const displayTime = f.examTime || calEv?.time || null;
  const displayRoom = f.examRoom || calEv?.room || '';

  const cdHtml = displayDate ? `
    <div class="cd-timer">
      <div class="cd-unit"><span class="cd-num" id="cd-d">--</span><span class="cd-unit-lbl">days</span></div>
      <span class="cd-sep">:</span>
      <div class="cd-unit"><span class="cd-num" id="cd-h">--</span><span class="cd-unit-lbl">hrs</span></div>
      <span class="cd-sep">:</span>
      <div class="cd-unit"><span class="cd-num" id="cd-m">--</span><span class="cd-unit-lbl">min</span></div>
      <span class="cd-sep">:</span>
      <div class="cd-unit"><span class="cd-num" id="cd-s">--</span><span class="cd-unit-lbl">sec</span></div>
    </div>` : `<div style="font-size:.83rem;opacity:.7;margin:.3rem 0">set exam date to start countdown~</div>`;

  const matHtml = f.materiList.map((m, i) => `
    <div class="materi-item" id="mi-${i}">
      <div class="materi-main">
        <div class="materi-chk ${m.done?'done':''}" data-mi="${i}">${m.done?'✓':''}</div>
        <input class="materi-name-inp ${m.done?'done':''}" value="${esc(m.name||'')}" placeholder="material name..." data-mn="${i}"/>
        <div class="materi-btns">
          ${(m.links&&m.links.length)||(m.files&&m.files.length)?'<span style="font-size:.65rem;color:#b899e0">📎</span>':''}
          <button class="materi-att-btn" data-mlink="${i}">🔗 link</button>
          <label class="materi-att-btn" style="cursor:pointer;display:flex;align-items:center">📁 file<input type="file" data-mfile="${i}" style="display:none" accept="image/*,.pdf,.doc,.docx,.pptx"/></label>
          <button class="materi-del" data-mdel="${i}">🗑</button>
        </div>
      </div>
      <div class="materi-attachments ${(m.links&&m.links.length)||(m.files&&m.files.length)?'open':''}" id="ma-${i}">
        ${(m.links||[]).map((l,li)=>{ const u=typeof l==='string'?l:(l.url||''); return `<div class="link-chip"><span>🔗</span><span class="link-chip-name" data-open="${esc(u)}">${esc(u.replace(/^https?:\/\//,'').split('/')[0]||u)}</span><button class="link-chip-del" data-dml="${i}-${li}">✕</button></div>`; }).join('')}
        ${(m.files||[]).map((fl,fi)=>`<div class="file-chip" style="background:linear-gradient(135deg,#f3eeff,#e8dcf8)"><span>${fileIcon(fl.name)}</span><span class="chip-name">${esc(fl.name)}</span><button class="chip-del" data-dmf="${i}-${fi}">✕</button></div>`).join('')}
      </div>
    </div>`).join('');

  // Helper: build a source item with URL input + link button
  function srcItem(label, key, val, btnId, inpId) {
    const hasLink = !!val;
    const btnLabel = hasLink ? _sourceLinkTitle(val, label) : `open ${label} ↗`;
    return `
      <div class="source-item">
        <span class="source-lbl">${label}</span>
        <input class="source-url-inp" type="url" id="${inpId}" placeholder="paste link here..." value="${esc(val||'')}"/>
        <button class="source-link-btn ${hasLink?'has-link':'no-link'}" id="${btnId}" title="${esc(val||'')}">
          <span class="source-link-btn-text">${esc(btnLabel)}</span>
        </button>
      </div>`;
  }

  const page = document.createElement('div'); page.className = 'exam-page';
  page.innerHTML = `
  <div class="crumb exam-crumb"><span class="cs">${esc(s.icon)} ${esc(s.name)}</span><span class="sep">›</span><span class="ct">${f.icon} ${esc(f.name)}</span></div>
  <div class="exam-hdr">
    <div class="exam-hdr-left">
      <div class="exam-title-row">
        <span class="exam-type-badge ${tc}">${tn}</span>
        <input class="exam-title-inp" value="${esc(f.name)}" placeholder="exam name..." id="ef-title"/>
      </div>
      ${displayRoom?`<div style="font-size:.75rem;color:#9a7ac8;font-weight:600;margin-top:.2rem">📍 ${esc(displayRoom)}</div>`:''}
    </div>
    <div class="countdown-box ${displayDate?'':'no-date'}">
      <div class="cd-label">⏳ exam countdown</div>
      ${cdHtml}
      <div class="exam-when-row">
        <span class="exam-when-lbl">📅</span>
        <button type="button" class="exam-inp" id="ef-date-btn" style="cursor:pointer;font-size:.73rem;font-weight:700;">${displayDate||'pick date'}</button>
        <span class="exam-when-lbl">⏰</span>
        <button type="button" class="exam-inp" id="ef-time-btn" style="cursor:pointer;font-size:.73rem;font-weight:700;">${displayTime||'pick time'}</button>
        <span class="exam-when-lbl">📍</span><input class="exam-room-inp" id="ef-room" placeholder="room..." value="${esc(displayRoom)}"/>
      </div>
    </div>
  </div>
  <div class="exam-card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.8rem">
      <span class="exam-card-label">📌 sources & collections</span>
    </div>
    <div class="sources-grid">
      ${srcItem('📗 Main Source (Book)', 'mainSource', f.mainSource, 'src-main-btn', 'src-main-inp')}
      ${srcItem('📊 PPT Slides', 'pptLink', f.pptLink, 'src-ppt-btn', 'src-ppt-inp')}
      ${srcItem('📁 Exam Collections', 'examCollections', f.examCollections, 'src-ec-btn', 'src-ec-inp')}
    </div>
  </div>
  <div class="exam-card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
      <span class="exam-card-label">📝 study materials checklist</span>
      <span style="font-size:.73rem;font-weight:700;color:#9b6fd4" id="materi-pct">${done}/${total} (${pct}%)</span>
    </div>
    <div class="materi-list" id="materi-list">${matHtml}</div>
    <div class="materi-progress"><div class="materi-pbar"><div class="materi-pfill" id="materi-fill" style="width:${pct}%"></div></div></div>
    <div class="add-materi-btn" id="add-materi"><span>＋</span> add material</div>
  </div>
  <div class="exam-card">
    <span class="exam-card-label">🗒️ notes</span>
    <textarea class="notes-ta exam-notes-ta" id="ef-notes" placeholder="write notes for this exam...">${esc(f.notes||'')}</textarea>
  </div>`;

  _bindExam(page, s, f);
  main.innerHTML = ''; main.appendChild(page);
  if (displayDate) _startCD({ ...f, examDate: displayDate, examTime: displayTime });
}

/* Helper: extract a readable title from a URL for the button label */
function _sourceLinkTitle(url, fallback) {
  try {
    const u = new URL(url);
    // Google Drive: try to extract folder/file name hint from path
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'drive.google.com') return '📂 Open Google Drive';
    if (host === 'docs.google.com') return '📄 Open Google Docs';
    if (host.includes('youtube')) return '▶ Open YouTube';
    // Generic: show host without www
    return `↗ Open ${host}`;
  } catch {
    return fallback || 'open link ↗';
  }
}

function _bindExam(page, s, f) {
  page.querySelector('#ef-title').addEventListener('change', function() { f.name = this.value; save(); renderSidebar(); });
  page.querySelector('#ef-date-btn').addEventListener('click', () => {
    openCQPicker({ date: f.examDate, showTime: false, title: '📅 exam date', callback: (d) => {
      f.examDate = d; _syncFolderToCalEvent(f); save();
      const btn = page.querySelector('#ef-date-btn'); if (btn) btn.textContent = d;
      _startCD(f);
    }});
  });
  page.querySelector('#ef-time-btn').addEventListener('click', () => {
    openCQPicker({ date: f.examDate || iso(), time: f.examTime, showTime: true, title: '⏰ exam time', callback: (d, t) => {
      f.examTime = t || null; _syncFolderToCalEvent(f); save();
      const btn = page.querySelector('#ef-time-btn'); if (btn) btn.textContent = t || 'pick time';
      _startCD(f);
    }});
  });
  page.querySelector('#ef-room').addEventListener('change', function() { f.examRoom = this.value.trim(); _syncFolderToCalEvent(f); save(); });

  // Source & Collections bindings: input saves value, button opens link
  [
    ['#src-main-inp', '#src-main-btn', 'mainSource'],
    ['#src-ppt-inp',  '#src-ppt-btn',  'pptLink'],
    ['#src-ec-inp',   '#src-ec-btn',   'examCollections'],
  ].forEach(([inpSel, btnSel, key]) => {
    const inp = page.querySelector(inpSel);
    const btn = page.querySelector(btnSel);
    const updateBtn = () => {
      const val = f[key];
      if (val) {
        btn.className = 'source-link-btn has-link';
        btn.title = val;
        btn.querySelector('.source-link-btn-text').textContent = _sourceLinkTitle(val, 'open link ↗');
      } else {
        btn.className = 'source-link-btn no-link';
        btn.title = '';
        btn.querySelector('.source-link-btn-text').textContent = 'open link ↗';
      }
    };
    inp.addEventListener('change', function() {
      f[key] = this.value.trim(); save(); updateBtn();
    });
    inp.addEventListener('input', function() {
      // live update button state while typing
      f[key] = this.value.trim(); updateBtn();
    });
    btn.addEventListener('click', () => {
      if (f[key]) window.open(f[key], '_blank');
    });
  });

  page.querySelectorAll('[data-mi]').forEach(el => el.addEventListener('click', () => {
    const i = parseInt(el.dataset.mi); f.materiList[i].done = !f.materiList[i].done; save();
    el.innerHTML = f.materiList[i].done ? '✓' : ''; el.classList.toggle('done', f.materiList[i].done);
    const ni = page.querySelector(`[data-mn="${i}"]`); if (ni) ni.classList.toggle('done', f.materiList[i].done);
    _updMatPct(f);
  }));
  page.querySelectorAll('[data-mn]').forEach(inp => inp.addEventListener('change', function() { f.materiList[parseInt(this.dataset.mn)].name = this.value; save(); }));
  page.querySelectorAll('[data-mlink]').forEach(btn => btn.addEventListener('click', () => {
    const i = parseInt(btn.dataset.mlink); const u = prompt('Paste link for this material~');
    if (u && u.trim()) { if (!Array.isArray(f.materiList[i].links)) f.materiList[i].links = []; f.materiList[i].links.push({ id: uid(), url: u.trim() }); save(); renderExam(); }
  }));
  page.querySelectorAll('[data-mfile]').forEach(inp => inp.addEventListener('change', function() {
    const i = parseInt(this.dataset.mfile);
    readFilesAsDataURL(this, file => {
      if (!Array.isArray(f.materiList[i].files)) f.materiList[i].files = [];
      f.materiList[i].files.push(file);
      save(); renderExam();
    });
  }));
  page.querySelectorAll('[data-mdel]').forEach(btn => btn.addEventListener('click', () => askDelete('delete material?', '', () => { f.materiList.splice(parseInt(btn.dataset.mdel), 1); save(); renderExam(); })));
  page.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', () => window.open(el.dataset.open, '_blank')));
  page.querySelectorAll('[data-dml]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); const [mi, li] = b.dataset.dml.split('-').map(Number); askDelete('remove link?', '', () => { f.materiList[mi].links.splice(li, 1); save(); renderExam(); }); }));
  page.querySelectorAll('[data-dmf]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); const [mi, fi] = b.dataset.dmf.split('-').map(Number); askDelete('remove file?', '', () => { f.materiList[mi].files.splice(fi, 1); save(); renderExam(); }); }));
  page.querySelector('#add-materi').addEventListener('click', () => {
    f.materiList.push(_normalizeMateri({ name: '', done: false, links: [], files: [] }));
    save(); renderExam();
    setTimeout(() => { const ins = document.querySelectorAll('.materi-name-inp'); if (ins.length) ins[ins.length - 1].focus(); }, 60);
  });
  page.querySelector('#ef-notes').addEventListener('input', function() { f.notes = this.value; save(); });
}

function _syncFolderToCalEvent(f) {
  if (!f.examDate) return;
  const existing = examEvents.findIndex(ev => ev.folderId === f.id);
  const ev = { id: existing >= 0 ? examEvents[existing].id : uid(), folderId: f.id, date: f.examDate, time: f.examTime || null, room: f.examRoom || '' };
  if (existing >= 0) examEvents[existing] = ev; else examEvents.push(ev);
}

function _updMatPct(f) {
  const done = (f.materiList || []).filter(m => m.done).length, total = (f.materiList || []).length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const fill = document.getElementById('materi-fill'); if (fill) fill.style.width = pct + '%';
  const lbl = document.getElementById('materi-pct'); if (lbl) lbl.textContent = `${done}/${total} (${pct}%)`;
}

function _startCD(f) { clearInterval(_cdInt); _updCD(f); _cdInt = setInterval(() => _updCD(f), 1000); }
function _updCD(f) {
  if (!f || !f.examDate) return;
  const timeStr = f.examTime || '09:00';
  const [yr, mo, dy] = f.examDate.split('-').map(Number);
  const [hr, mn] = timeStr.split(':').map(Number);
  const target = new Date(yr, mo - 1, dy, hr, mn, 0);
  const now = new Date(), diff = target - now;
  const dd = document.getElementById('cd-d'), dh = document.getElementById('cd-h'), dm = document.getElementById('cd-m'), ds = document.getElementById('cd-s');
  if (!dd) { clearInterval(_cdInt); return; }
  if (diff <= 0) { [dd, dh, dm, ds].forEach(el => { if (el) el.textContent = '00'; }); return; }
  const d = Math.floor(diff / 86400000), h = Math.floor((diff % 86400000) / 3600000), m = Math.floor((diff % 3600000) / 60000), sec = Math.floor((diff % 60000) / 1000);
  dd.textContent = String(d).padStart(2, '0');
  dh.textContent = String(h).padStart(2, '0');
  dm.textContent = String(m).padStart(2, '0');
  ds.textContent = String(sec).padStart(2, '0');
}

/* ═══════════════════════════════════════════════
   CALENDAR MODAL
═══════════════════════════════════════════════ */
function openCal() { document.getElementById('cal-modal-overlay').classList.remove('hidden'); renderCalContent(); }
function closeCal() { document.getElementById('cal-modal-overlay').classList.add('hidden'); }
document.getElementById('cal-modal-overlay').addEventListener('click', function(e) { if (e.target === this) closeCal(); });
document.getElementById('cal-prev').addEventListener('click', () => { _calMonth = new Date(_calMonth.getFullYear(), _calMonth.getMonth() - 1, 1); renderCalContent(); });
document.getElementById('cal-next').addEventListener('click', () => { _calMonth = new Date(_calMonth.getFullYear(), _calMonth.getMonth() + 1, 1); renderCalContent(); });
document.getElementById('add-ev-btn').addEventListener('click', () => openEVModal());
document.getElementById('cal-today-btn').addEventListener('click', () => { _calMonth = new Date(); renderCalContent(); });

function renderCalContent() {
  const yr = _calMonth.getFullYear(), mo = _calMonth.getMonth();
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DOWS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const todayStr = iso();
  document.getElementById('cal-month-lbl').textContent = MONTHS[mo] + ' ' + yr;
  const grid = document.getElementById('cal-grid'); grid.innerHTML = '';
  DOWS.forEach(d => { const el = document.createElement('div'); el.className = 'cal-dow'; el.textContent = d; grid.appendChild(el); });
  const firstDay = new Date(yr, mo, 1).getDay(), dIM = new Date(yr, mo + 1, 0).getDate();
  for (let i = 0; i < firstDay; i++) { const prev = new Date(yr, mo, -(firstDay - 1 - i)); const el = document.createElement('div'); el.className = 'cal-cell other-m'; el.innerHTML = `<div class="cal-date-num">${prev.getDate()}</div>`; grid.appendChild(el); }
  for (let d = 1; d <= dIM; d++) {
    const ds = `${yr}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayEvs = examEvents.filter(ev => ev.date === ds);
    const isToday = ds === todayStr;
    const el = document.createElement('div'); el.className = 'cal-cell' + (isToday?' today-c':'') + (dayEvs.length?' has-ev':'');
    el.dataset.date = ds;
    el.innerHTML = `<div class="cal-date-num">${d}</div>${dayEvs.map(ev => { const r = findEF(ev.folderId); if (!r) return ''; const tc = typeClass(r.f.examType); return `<div class="cal-ev ${tc}-ev" title="${esc(r.s.name)} — ${esc(r.f.name)}">${esc(r.f.name)}</div>`; }).join('')}`;
    el.addEventListener('click', e => { if (e.target.classList.contains('cal-ev')) return; document.getElementById('ev-date').value = ds; openEVModal(); });
    el.querySelectorAll('.cal-ev').forEach((evEl, eidx) => { evEl.addEventListener('click', e => { e.stopPropagation(); const ev = dayEvs[eidx]; if (!ev) return; const r = findEF(ev.folderId); if (!r) return; closeCal(); activeESid = r.s.id; activeEFid = r.f.id; r.s.open = true; _saveOpenState(); renderSidebar(); renderExam(); }); });
    grid.appendChild(el);
  }
  const filled = firstDay + dIM, rem = (7 - filled % 7) % 7;
  for (let i = 1; i <= rem; i++) { const el = document.createElement('div'); el.className = 'cal-cell other-m'; el.innerHTML = `<div class="cal-date-num">${i}</div>`; grid.appendChild(el); }

  const now = new Date();
  const upcoming = examEvents.filter(ev => {
    if (!ev.date) return false;
    const [ey, em, ed] = ev.date.split('-').map(Number);
    const [eh, emn] = (ev.time || '23:59').split(':').map(Number);
    return new Date(ey, em - 1, ed, eh, emn) >= now;
  }).sort((a, b) => a.date.localeCompare(b.date));

  const upList = document.getElementById('upcoming-list'); upList.innerHTML = '';
  if (!upcoming.length) { upList.innerHTML = '<div class="no-upcoming">no upcoming exams~</div>'; return; }
  upcoming.forEach((ev, idx) => {
    const r = findEF(ev.folderId); if (!r) return;
    const [ey, em, ed] = ev.date.split('-').map(Number);
    const dt = new Date(ey, em - 1, ed);
    const dLeft = Math.ceil((dt - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    const MONS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const tc = typeClass(r.f.examType);
    const item = document.createElement('div'); item.className = 'upcoming-item';
    item.innerHTML = `
      <div class="upcoming-date-box"><div class="udb-day">${String(dt.getDate()).padStart(2,'0')}</div><div class="udb-mon">${MONS[dt.getMonth()]}</div></div>
      <div class="upcoming-info">
        <div class="upcoming-name">${esc(r.s.icon)} ${esc(r.s.name)} — ${esc(r.f.name)}</div>
        <div class="upcoming-meta">
          <span class="exam-type-badge ${tc}" style="font-size:.58rem;padding:.04rem .45rem">${EXAM_TYPES[r.f.examType]||r.f.examType}</span>
          ${ev.time?`⏰ ${ev.time}`:''}
          ${ev.room?`📍 ${esc(ev.room)}`:''}
        </div>
      </div>
      <div class="upcoming-right"><div class="upcoming-days">${dLeft}</div><div class="upcoming-dl">days left</div></div>
      <button class="upcoming-del" data-idx="${idx}">🗑</button>`;
    item.addEventListener('click', e => { if (e.target.classList.contains('upcoming-del') || e.target.closest('.upcoming-del')) return; closeCal(); activeESid = r.s.id; activeEFid = r.f.id; r.s.open = true; _saveOpenState(); renderSidebar(); renderExam(); });
    item.querySelector('.upcoming-del').addEventListener('click', e => { e.stopPropagation(); askDelete('delete schedule?', '', () => { const gi = examEvents.findIndex(ev2 => ev2.id === ev.id); if (gi >= 0) examEvents.splice(gi, 1); save(); renderCalContent(); }); });
    upList.appendChild(item);
  });
}

/* ═══════════════════════════════════════════════
   COQUETTE DATE/TIME PICKER
═══════════════════════════════════════════════ */
let _cqPickerMonth = new Date();
let _cqSelDate = null;
let _cqShowTime = false;
let _cqCallback = null;

function openCQPicker(opts) {
  _cqSelDate = opts.date || null;
  _cqShowTime = !!opts.showTime;
  _cqCallback = opts.callback;
  document.querySelector('.cq-picker-title').textContent = opts.title || '🎀 pick a date';
  document.getElementById('cq-time-row').style.display = _cqShowTime ? 'flex' : 'none';
  if (_cqShowTime && opts.time) {
    const parts = opts.time.split(':');
    document.getElementById('cq-hr').value = parts[0] || '';
    document.getElementById('cq-mn').value = parts[1] || '';
  } else {
    document.getElementById('cq-hr').value = '';
    document.getElementById('cq-mn').value = '';
  }
  if (opts.date) {
    const parts = opts.date.split('-').map(Number);
    _cqPickerMonth = new Date(parts[0], parts[1] - 1, 1);
  } else {
    _cqPickerMonth = new Date();
    _cqPickerMonth.setDate(1);
  }
  _renderCQCal();
  document.getElementById('cq-picker-overlay').classList.remove('hidden');
}

function closeCQPicker() { document.getElementById('cq-picker-overlay').classList.add('hidden'); }

function _renderCQCal() {
  const yr = _cqPickerMonth.getFullYear(), mo = _cqPickerMonth.getMonth();
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DOWS = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  const todayStr = iso();
  document.getElementById('cq-month-lbl').textContent = MONTHS[mo] + ' ' + yr;
  const grid = document.getElementById('cq-cal-grid'); grid.innerHTML = '';
  DOWS.forEach(d => { const el = document.createElement('div'); el.className = 'cq-dow'; el.textContent = d; grid.appendChild(el); });
  const firstDay = new Date(yr, mo, 1).getDay(), dIM = new Date(yr, mo + 1, 0).getDate();
  for (let i = 0; i < firstDay; i++) {
    const prev = new Date(yr, mo, -(firstDay - 1 - i));
    const el = document.createElement('button'); el.className = 'cq-day other-m'; el.textContent = prev.getDate(); el.type = 'button';
    grid.appendChild(el);
  }
  for (let d = 1; d <= dIM; d++) {
    const ds = `${yr}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const el = document.createElement('button'); el.type = 'button';
    el.className = 'cq-day' + (ds === todayStr ? ' today' : '') + (ds === _cqSelDate ? ' selected' : '');
    el.textContent = d;
    el.addEventListener('click', () => { _cqSelDate = ds; _renderCQCal(); });
    grid.appendChild(el);
  }
  const filled = firstDay + dIM, rem = (7 - filled % 7) % 7;
  for (let i = 1; i <= rem; i++) { const el = document.createElement('button'); el.className = 'cq-day other-m'; el.textContent = i; el.type = 'button'; grid.appendChild(el); }
}

document.getElementById('cq-prev').addEventListener('click', () => { _cqPickerMonth = new Date(_cqPickerMonth.getFullYear(), _cqPickerMonth.getMonth() - 1, 1); _renderCQCal(); });
document.getElementById('cq-next').addEventListener('click', () => { _cqPickerMonth = new Date(_cqPickerMonth.getFullYear(), _cqPickerMonth.getMonth() + 1, 1); _renderCQCal(); });
document.getElementById('cq-cancel').addEventListener('click', closeCQPicker);
document.getElementById('cq-picker-overlay').addEventListener('click', function(e) { if (e.target === this) closeCQPicker(); });
document.getElementById('cq-ok').addEventListener('click', () => {
  if (!_cqSelDate) { alert('please pick a date first~'); return; }
  let timeStr = null;
  if (_cqShowTime) {
    const hr = document.getElementById('cq-hr').value;
    const mn = document.getElementById('cq-mn').value;
    if (hr !== '' && mn !== '') {
      const h = Math.min(23, Math.max(0, parseInt(hr) || 0));
      const m = Math.min(59, Math.max(0, parseInt(mn) || 0));
      timeStr = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }
  }
  closeCQPicker();
  if (_cqCallback) _cqCallback(_cqSelDate, timeStr);
});

/* ═══════════════════════════════════════════════
   HEADER CONTROLS
═══════════════════════════════════════════════ */
document.getElementById('sb-toggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('collapsed'));
const nightBtn = document.getElementById('night-btn');
if (localStorage.getItem('sha-night') === '1') { document.body.classList.add('night'); nightBtn.textContent = '☀️'; }
nightBtn.addEventListener('click', () => { const on = document.body.classList.toggle('night'); nightBtn.textContent = on ? '☀️' : '🌙'; localStorage.setItem('sha-night', on ? '1' : '0'); });

setInterval(() => {
  localStorage.setItem('sha-mode', mode);
  if (mode === 'hw' && activeSid && activeAid) localStorage.setItem('sha-last-hw', activeSid + '|' + activeAid);
  if (mode === 'exam' && activeESid && activeEFid) localStorage.setItem('sha-last-exam', activeESid + '|' + activeEFid);
}, 2000);

/* ═══════════════════════════════════════════════
   EVENT DELEGATION
   Handles all data-action attributes from HTML elements,
   replacing scattered inline onclick handlers.
═══════════════════════════════════════════════ */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, modal, mode: dMode } = el.dataset;
  if (action === 'close-modal')    { closeModal(modal); return; }
  if (action === 'select-mode')    { selectMode(dMode); return; }
  if (action === 'close-cal')      { closeCal(); return; }
  if (action === 'create-hw')      { createHW(); return; }
  if (action === 'create-ef')      { createEF(); return; }
  if (action === 'create-ev')      { createEV(); return; }
  if (action === 'close-lightbox') { closeLightbox(); return; }
});

/* ═══════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════ */
(async function init() {
  await loadDB();
  const ls = document.getElementById('loading-screen');
  ls.classList.add('fade-out');
  setTimeout(() => ls.style.display = 'none', 520);
  const savedMode = localStorage.getItem('sha-mode');
  if (savedMode) {
    mode = savedMode; applyMode();
    if (savedMode === 'hw') {
      const last = localStorage.getItem('sha-last-hw');
      if (last) {
        const [sid, aid] = last.split('|');
        if (sid && aid && getHW(sid, aid)) {
          activeSid = sid; activeAid = aid;
          const s = getSub(sid); if (s) { s.open = true; _saveOpenState(); }
          renderSidebar(); renderHW(); return;
        }
      }
    } else {
      const last = localStorage.getItem('sha-last-exam');
      if (last) {
        const [sid, fid] = last.split('|');
        if (sid && fid && getEF(sid, fid)) {
          activeESid = sid; activeEFid = fid;
          const s = getSub(sid); if (s) { s.open = true; _saveOpenState(); }
          renderSidebar(); renderExam(); return;
        }
      }
    }
    renderSidebar(); renderEmpty();
  } else {
    mode = 'hw'; applyMode(); showModeSelector();
  }
})();
