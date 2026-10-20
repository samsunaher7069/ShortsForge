const OPT = {
  storyType: ['Motivational', 'Emotional', 'Funny', 'Horror', 'Mystery', 'Suspense', 'Life lesson', 'Historical biography', 'Fiction', 'Custom'],
  visualStyle: ['Minimal stick figure on paper', 'Realistic cinematic', '3D animated', 'Anime-inspired', 'Dark comic-book', 'Custom'],
  language: ['Hinglish', 'English', 'Hindi', 'Bangla', 'Custom'],
  duration: ['30', '45', '60'],
};
const FIELDS = [
  { k: 'projectName', l: 'Project name', t: 'text', max: 80, req: 1 },
  { k: 'idea', l: 'Story idea or topic', t: 'area', max: 1000, req: 1, rows: 3, ph: 'A real person, a moral story, a scary mystery...' },
  { k: 'storyType', l: 'Story type', t: 'sel', o: OPT.storyType, custom: 1, def: 'Motivational' },
  { k: 'visualStyle', l: 'Visual style', t: 'sel', o: OPT.visualStyle, custom: 1, def: 'Realistic cinematic' },
  { k: 'backgroundStyle', l: 'Background style', t: 'text', max: 200, ph: 'e.g. plain white paper, rainy city street at night' },
  { k: 'language', l: 'Voice-over language', t: 'sel', o: OPT.language, custom: 1, def: 'Hinglish' },
  { k: 'tone', l: 'Narration tone', t: 'text', max: 120, ph: 'e.g. intense and inspiring' },
  { k: 'duration', l: 'Target duration (seconds)', t: 'sel', o: OPT.duration, def: '45' },
  { k: 'character', l: 'Character description', t: 'area', max: 1500, rows: 3, ph: 'Face, skin tone, hair, build, age, outfit, accessories. Leave empty to let the AI design one.' },
  { k: 'continuity', l: 'Continuity notes', t: 'area', max: 800, rows: 2 },
  { k: 'custom', l: 'Custom instructions (optional)', t: 'area', max: 800, rows: 2 },
];
const TABS = [['story', 'Story & script'], ['scenes', 'Five scenes'], ['flow', 'Google Flow'], ['char', 'Character & continuity'], ['publish', 'Publish kit']];
const PACE = 2.5;

const $ = (s) => document.querySelector(s);
const S = { input: null, pack: null, id: null, dirty: false, busy: false, saving: false, tab: 'story', user: null };

function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}

async function call(path, { method = 'GET', body, signal } = {}) {
  if (!navigator.onLine) throw new Error('You appear to be offline. Check your connection and try again.');
  let r;
  try {
    r = await fetch(path, { method, signal, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('The request took too long and was cancelled. Try again.');
    throw new Error('Network error: could not reach the server.');
  }
  let data = null;
  try { data = await r.json(); } catch { /* non-JSON error page */ }
  if (!r.ok) {
    if (data?.error?.code === 'LOGIN_REQUIRED') { S.user = null; renderAuth(); initAuth(); }
    const err = new Error(data?.error?.message || `Request failed (${r.status}).`);
    err.details = data?.error?.details;
    throw err;
  }
  return data;
}

function status(msg, kind = 'info') {
  const el = $('#status');
  el.hidden = !msg;
  el.className = `status ${kind}`;
  el.textContent = msg || '';
}

/* ---------- form ---------- */
function buildForm() {
  const form = $('#form');
  const grid = h('div', { class: 'grid two' });
  for (const f of FIELDS) {
    const id = `f-${f.k}`;
    let ctl;
    if (f.t === 'sel') ctl = h('select', { id, name: f.k }, f.o.map((o) => h('option', { value: o }, o)));
    else if (f.t === 'area') ctl = h('textarea', { id, name: f.k, class: 'in', rows: f.rows, maxlength: f.max, placeholder: f.ph });
    else ctl = h('input', { id, name: f.k, type: 'text', class: 'in', maxlength: f.max, placeholder: f.ph, required: f.req ? true : null });
    const wrap = h('div', { class: 'field' }, h('label', { for: id }, f.l, f.req ? ' *' : ''), ctl);
    if (f.t === 'sel') ctl.value = f.def;
    if (f.custom) {
      const c = h('input', { id: `${id}Custom`, type: 'text', class: 'in', maxlength: 120, placeholder: `Describe your custom ${f.l.toLowerCase()}`, 'aria-label': `${f.l} (custom)`, hidden: true });
      wrap.append(c, h('div', { class: 'err', id: `e-${f.k}Custom` }));
      ctl.addEventListener('change', () => { c.hidden = ctl.value !== 'Custom'; });
    }
    wrap.append(h('div', { class: 'err', id: `e-${f.k}` }));
    if (f.t === 'area' || f.k === 'projectName') wrap.style.gridColumn = '1 / -1';
    grid.append(wrap);
  }
  form.append(grid, h('div', { class: 'actions' },
    h('button', { class: 'btn main', type: 'submit', id: 'btn-gen' }, 'Generate production pack'),
    h('button', { class: 'btn ghost', type: 'button', onclick: () => $('#file').click() }, 'Import project file')));
  form.addEventListener('submit', (e) => { e.preventDefault(); generate(); });
}

function readForm() {
  const v = {};
  for (const f of FIELDS) {
    v[f.k] = $(`#f-${f.k}`).value.trim();
    if (f.custom) v[`${f.k}Custom`] = $(`#f-${f.k}Custom`).value.trim();
  }
  v.duration = Number(v.duration);
  return v;
}

function fillForm(i) {
  for (const f of FIELDS) {
    const el = $(`#f-${f.k}`);
    el.value = String(i[f.k] ?? f.def ?? '');
    if (f.custom) { const c = $(`#f-${f.k}Custom`); c.value = i[`${f.k}Custom`] || ''; c.hidden = el.value !== 'Custom'; }
  }
}

function clearErrors() {
  document.querySelectorAll('#form .err').forEach((e) => { e.textContent = ''; });
  document.querySelectorAll('#form [aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
}

function showErrors(errs) {
  let first = null;
  for (const [k, m] of Object.entries(errs || {})) {
    const box = $(`#e-${k}`);
    const ctl = $(`#f-${k}`);
    if (box) box.textContent = m;
    if (ctl) { ctl.setAttribute('aria-invalid', 'true'); first ||= ctl; }
  }
  first?.focus();
}

function validateClient(v) {
  const e = {};
  if (!v.projectName) e.projectName = 'Enter a project name.';
  if (!v.idea) e.idea = 'Enter a story idea or topic.';
  else if (v.idea.length < 5) e.idea = 'Add a little more detail so the AI has something to work with.';
  for (const f of FIELDS) {
    if (f.max && v[f.k].length > f.max) e[f.k] = `Keep this under ${f.max} characters.`;
    if (f.custom && v[f.k] === 'Custom' && !v[`${f.k}Custom`]) e[`${f.k}Custom`] = 'Describe your custom choice.';
  }
  return e;
}

function setBusy(on) {
  S.busy = on;
  const b = $('#btn-gen');
  b.disabled = on;
  b.textContent = on ? 'Generating...' : 'Generate production pack';
  $('#form').setAttribute('aria-busy', String(on));
}

async function generate() {
  if (S.busy) return;
  clearErrors();
  const input = readForm();
  const errs = validateClient(input);
  if (Object.keys(errs).length) { showErrors(errs); status('Fix the highlighted fields, then generate again.', 'err'); return; }
  if (S.pack && S.dirty && !confirm('Generating replaces the current pack, including unsaved edits. Continue?')) return;
  setBusy(true);
  const steps = ['Understanding your idea...', 'Outlining the story beats...', 'Writing the voice-over...', 'Designing five connected scenes...', 'Writing image and Flow prompts...'];
  let n = 0;
  status(steps[0], 'busy');
  const timer = setInterval(() => status(steps[Math.min(++n, steps.length - 1)], 'busy'), 7000);
  const ctrl = new AbortController();
  const abort = setTimeout(() => ctrl.abort(), 75000);
  try {
    const d = await call('/api/generate', { method: 'POST', body: input, signal: ctrl.signal });
    Object.assign(S, { input: d.input, pack: d.pack, id: null, dirty: true, tab: 'story' });
    renderResults();
    status('Production pack ready. Review, edit and save it.', 'ok');
    $('#results').scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    if (e.details) showErrors(e.details);
    status(e.message, 'err');
  } finally {
    clearInterval(timer); clearTimeout(abort); setBusy(false);
  }
}

/* ---------- results ---------- */
const get = (p) => p.reduce((o, k) => o?.[k], S.pack);
function set(p, v) { get(p.slice(0, -1))[p[p.length - 1]] = v; S.dirty = true; }

async function copyText(text, label) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const t = h('textarea', { 'aria-hidden': 'true' }); t.value = text; document.body.append(t); t.select();
    try { document.execCommand('copy'); } catch { status('Copy failed. Select the text and copy it manually.', 'err'); t.remove(); return; }
    t.remove();
  }
  status(`Copied: ${label}`, 'ok');
}

function edit(label, path, { rows = 3, mode = 'text', copy = true } = {}) {
  const id = `x${Math.random().toString(36).slice(2, 8)}`;
  const val = get(path);
  const ta = h('textarea', { id, class: 'in', rows });
  ta.value = mode === 'lines' ? (val || []).join('\n') : mode === 'words' ? (val || []).join(' ') : val ?? '';
  ta.addEventListener('input', () => {
    set(path, mode === 'lines' ? ta.value.split('\n').map((s) => s.trim()).filter(Boolean) : mode === 'words' ? ta.value.split(/\s+/).filter(Boolean) : ta.value);
    if (path.join() === 'voiceover') updateStats();
  });
  return h('div', { class: 'ef' }, h('div', { class: 'ef-head' }, h('label', { for: id }, label), copy && h('button', { class: 'btn mini', type: 'button', onclick: () => copyText(ta.value, label) }, 'Copy')), ta);
}

const wordsOf = (t) => t.trim().split(/\s+/).filter(Boolean).length;
function updateStats() {
  const w = wordsOf(S.pack.voiceover);
  const a = $('#st-w'); const b = $('#st-d');
  if (a) a.textContent = String(w);
  if (b) b.textContent = `about ${Math.round(w / PACE)} s`;
}

function syncVoiceover() {
  const joined = S.pack.scenes.map((s) => s.narration).join(' ');
  if (S.pack.voiceover !== joined && !confirm('This replaces the voice-over with the five scene narrations joined in order. Any manual voice-over edits will be lost. Continue?')) return;
  S.pack.voiceover = joined; S.dirty = true; renderPanel(); status('Voice-over now matches the scene narrations.', 'ok');
}

const PANELS = {
  story: () => [
    edit('Story summary', ['summary'], { rows: 3 }),
    edit('Complete voice-over', ['voiceover'], { rows: 9 }),
    h('div', { class: 'stats' }, h('span', {}, 'Words: ', h('b', { id: 'st-w' }, '')), h('span', {}, 'Estimated narration: ', h('b', { id: 'st-d' }, '')), h('span', {}, `Language: ${S.pack.language}`)),
    h('p', { class: 'note' }, `Duration is estimated at ${PACE} spoken words per second. The voice-over and scene narrations are separate once you edit either one; sync them when you choose.`),
    h('div', { class: 'row' }, h('button', { class: 'btn ghost', type: 'button', onclick: syncVoiceover }, 'Sync voice-over from scenes')),
  ],
  scenes: () => S.pack.scenes.map((s, i) => h('article', { class: 'card scene' }, h('h3', {}, `Scene ${s.sceneNumber}: ${s.beat} (${s.durationSeconds} s)`), h('div', { class: 'grid' },
    edit('Narration', ['scenes', i, 'narration'], { rows: 3 }),
    edit('Visual description', ['scenes', i, 'visualDescription'], { rows: 3 }),
    edit('Character action', ['scenes', i, 'characterAction'], { rows: 2 }),
    edit('Emotion', ['scenes', i, 'emotion'], { rows: 1 }),
    edit('Environment', ['scenes', i, 'environment'], { rows: 2 }),
    edit('Camera', ['scenes', i, 'camera'], { rows: 2 }),
    edit('Image prompt', ['scenes', i, 'imagePrompt'], { rows: 7 })))),
  flow: () => [
    h('p', { class: 'note' }, 'ShortsForge does not connect to Google Flow. Generate each still from its image prompt, then paste the matching prompt below into Flow with that image.'),
    h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => copyText(S.pack.scenes.map((s) => `Scene ${s.sceneNumber} (${s.durationSeconds} s)\n${s.flowPrompt}`).join('\n\n'), 'all Flow prompts') }, 'Copy all prompts')),
    ...S.pack.scenes.map((s, i) => h('article', { class: 'card scene' }, h('h3', {}, `Scene ${s.sceneNumber}: ${s.beat} (${s.durationSeconds} s)`), h('div', { class: 'grid' },
      edit('Flow prompt (motion and continuity)', ['scenes', i, 'flowPrompt'], { rows: 7 }),
      edit('Transition to next scene', ['scenes', i, 'transitionToNext'], { rows: 2 })))),
  ],
  char: () => [
    edit('Main character', ['characterBible', 'mainCharacter'], { rows: 5 }),
    edit('Supporting characters (one per line)', ['characterBible', 'supportingCharacters'], { rows: 3, mode: 'lines' }),
    edit('Fixed visual traits (one per line)', ['characterBible', 'fixedVisualTraits'], { rows: 5, mode: 'lines' }),
    edit('Outfit rules (one per line)', ['characterBible', 'outfitRules'], { rows: 4, mode: 'lines' }),
    edit('Continuity rules (one per line)', ['characterBible', 'continuityRules'], { rows: 5, mode: 'lines' }),
    h('div', { class: 'card' }, h('h3', {}, 'Your continuity notes'), h('p', { class: 'note' }, S.input.continuity || 'None entered.')),
    h('div', { class: 'card' }, h('h3', {}, 'Scene transitions'), h('ul', { class: 'lines' }, S.pack.scenes.map((s) => h('li', {}, `Scene ${s.sceneNumber} to ${s.sceneNumber + 1 > 5 ? 'end' : s.sceneNumber + 1}: ${s.transitionToNext}`)))),
  ],
  publish: () => [
    edit('YouTube title', ['publishing', 'title'], { rows: 2 }),
    edit('Description', ['publishing', 'description'], { rows: 5 }),
    edit('Caption', ['publishing', 'caption'], { rows: 2 }),
    edit('Hashtags (separated by spaces)', ['publishing', 'hashtags'], { rows: 2, mode: 'words' }),
  ],
};

function renderPanel() {
  const p = $('#panel');
  p.replaceChildren(...PANELS[S.tab]());
  if (S.tab === 'story') updateStats();
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === S.tab)));
}

function renderResults() {
  const r = $('#results');
  r.hidden = false;
  r.replaceChildren(
    h('div', { class: 'card' },
      h('div', { class: 'bar' },
        h('h2', {}, S.input.projectName),
        h('div', { class: 'btns' }, h('button', { class: 'btn', type: 'button', id: 'btn-save', onclick: saveProject }, 'Save project'), h('button', { class: 'btn ghost', type: 'button', onclick: exportProject }, 'Export JSON')))),
    h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Production pack sections' },
      TABS.map(([k, l]) => h('button', { class: 'tab', role: 'tab', type: 'button', 'data-tab': k, onclick: () => { S.tab = k; renderPanel(); } }, l))),
    h('div', { id: 'panel', class: 'panel', role: 'tabpanel' }));
  renderPanel();
}

/* ---------- projects ---------- */
async function saveProject() {
  if (!S.pack || S.saving) return;
  S.saving = true;
  const b = $('#btn-save'); if (b) { b.disabled = true; b.textContent = 'Saving...'; }
  try {
    const body = { name: S.input.projectName, input: S.input, pack: S.pack };
    const d = S.id ? await call(`/api/projects/${S.id}`, { method: 'PUT', body }) : await call('/api/projects', { method: 'POST', body });
    S.id = d.project.id; S.dirty = false;
    status('Project saved.', 'ok');
  } catch (e) { status(`Save failed: ${e.message}`, 'err'); }
  finally { S.saving = false; const b2 = $('#btn-save'); if (b2) { b2.disabled = false; b2.textContent = 'Save project'; } }
}

async function openList() {
  const box = $('#plist');
  box.replaceChildren(h('p', { class: 'note' }, 'Loading...'));
  $('#dlg').showModal();
  try {
    const { projects } = await call('/api/projects');
    if (!projects.length) { box.replaceChildren(h('p', { class: 'note' }, 'No saved projects yet. Generate a pack and choose Save project.')); return; }
    box.replaceChildren(h('div', { class: 'plist' }, projects.map((p) => h('div', { class: 'pitem' },
      h('strong', {}, p.name), h('span', { class: 'hint' }, `${p.storyType || ''} - updated ${new Date(p.updatedAt).toLocaleString()}`),
      h('div', { class: 'row' }, h('button', { class: 'btn mini', type: 'button', onclick: () => openProject(p.id) }, 'Open'), h('button', { class: 'btn mini danger', type: 'button', onclick: () => removeProject(p) }, 'Delete'))))));
  } catch (e) { box.replaceChildren(h('p', { class: 'err' }, e.message)); }
}

async function openProject(id) {
  if (S.pack && S.dirty && !confirm('Opening a project discards your unsaved edits. Continue?')) return;
  try {
    const { project } = await call(`/api/projects/${id}`);
    Object.assign(S, { input: project.input, pack: project.pack, id: project.id, dirty: false, tab: 'story' });
    fillForm(project.input); clearErrors(); renderResults();
    $('#dlg').close(); status(`Opened "${project.name}".`, 'ok');
  } catch (e) { $('#plist').prepend(h('p', { class: 'err' }, e.message)); }
}

async function removeProject(p) {
  if (!confirm(`Delete "${p.name}" permanently? This cannot be undone.`)) return;
  try {
    await call(`/api/projects/${p.id}`, { method: 'DELETE' });
    if (S.id === p.id) { S.id = null; S.dirty = true; }
    status('Project deleted.', 'ok'); openList();
  } catch (e) { $('#plist').prepend(h('p', { class: 'err' }, `Delete failed: ${e.message}`)); }
}

function exportProject() {
  const blob = new Blob([JSON.stringify({ app: 'ShortsForge', version: 1, name: S.input.projectName, input: S.input, pack: S.pack }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `${S.input.projectName.replace(/[^\w-]+/g, '_') || 'shortsforge'}.json` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importFile(file) {
  if (!file) return;
  try {
    if (file.size > 400 * 1024) throw new Error('That file is too large.');
    const d = JSON.parse(await file.text());
    if (!d?.input || !Array.isArray(d?.pack?.scenes) || d.pack.scenes.length !== 5) throw new Error('This is not a ShortsForge project file.');
    Object.assign(S, { input: d.input, pack: d.pack, id: null, dirty: true, tab: 'story' });
    fillForm(d.input); clearErrors(); renderResults();
    status('Project imported. Save it to keep a copy online.', 'ok');
  } catch (e) { status(`Import failed: ${e.message}`, 'err'); }
  finally { $('#file').value = ''; }
}

function newProject() {
  if (S.pack && S.dirty && !confirm('Start a new project? Unsaved edits will be lost.')) return;
  Object.assign(S, { input: null, pack: null, id: null, dirty: false });
  $('#form').reset(); fillForm({}); clearErrors();
  $('#results').hidden = true; $('#results').replaceChildren(); status('');
  $('#f-projectName').focus();
}

/* ---------- Google sign-in ---------- */
function renderAuth() {
  const on = Boolean(S.user);
  $('#login').hidden = on;
  $('#setup').hidden = !on;
  if (!on) $('#results').hidden = true;
  $('#user').textContent = on ? S.user.email : '';
  for (const id of ['#btn-out', '#btn-new', '#btn-projects']) $(id).hidden = !on;
}

function waitGsi() {
  return new Promise((res) => {
    const t = setInterval(() => { if (window.google?.accounts?.id) { clearInterval(t); res(); } }, 100);
    setTimeout(() => { clearInterval(t); res(); }, 8000);
  });
}

async function onCredential(r) {
  try {
    const d = await call('/api/session', { method: 'POST', body: { credential: r.credential } });
    S.user = d.user; renderAuth(); status(`Signed in as ${d.user.email}.`, 'ok');
  } catch (e) { status(e.message, 'err'); }
}

async function initAuth() {
  let s;
  try { s = await call('/api/session'); } catch (e) { status(e.message, 'err'); return; }
  S.user = s.user; renderAuth();
  if (S.user) return;
  if (!s.clientId) { status('Google login is not configured yet (GOOGLE_CLIENT_ID missing).', 'err'); return; }
  await waitGsi();
  if (!window.google?.accounts?.id) { status('Could not load Google sign-in. Check your connection or ad blocker.', 'err'); return; }
  google.accounts.id.initialize({ client_id: s.clientId, callback: onCredential });
  $('#g-btn').replaceChildren();
  google.accounts.id.renderButton($('#g-btn'), { theme: 'filled_black', size: 'large', text: 'signin_with', width: Math.min(300, window.innerWidth - 80) });
}

async function signOut() {
  if (S.pack && S.dirty && !confirm('Sign out? Unsaved edits will be lost.')) return;
  S.dirty = false;
  try { await call('/api/session', { method: 'DELETE' }); } catch { /* reload anyway */ }
  location.reload();
}

buildForm();
fillForm({});
$('#btn-new').addEventListener('click', newProject);
$('#btn-projects').addEventListener('click', openList);
$('#btn-out').addEventListener('click', signOut);
$('#dlg-close').addEventListener('click', () => $('#dlg').close());
$('#file').addEventListener('change', (e) => importFile(e.target.files[0]));
window.addEventListener('offline', () => status('You are offline. Generating and saving need a connection.', 'err'));
window.addEventListener('online', () => status('Back online.', 'ok'));
window.addEventListener('beforeunload', (e) => { if (S.dirty && S.pack) e.preventDefault(); });
initAuth();
