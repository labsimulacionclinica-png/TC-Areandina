// Atlas anatómico: el fantoma del simulador convertido en un volumen de etiquetas (vóxeles de 2,5 × 2,5 × 4 mm),
// con cortes axial, coronal y sagital sincronizados, búsqueda de estructuras y modo de preguntas.
import { buildAnatomy, labelMap } from './phantom.js';
import { NAMES, SYSTEMS, displayName, systemOf } from './anatomy-names.js';
import { initI18n, getLang } from './i18n.js';

initI18n();
const $ = (id) => document.getElementById(id);
const NX = 200, PX = 2.5, X0 = -(NX * PX) / 2 + PX / 2, DZ = 4, Z0 = 2, NZ = Math.ceil(1060 / DZ);
const WIN = { soft: [400, 40], brain: [80, 40], lung: [1500, -600], bone: [2000, 500] };
const SYS_COLOR = { neuro: [236, 196, 120], cabeza: [120, 200, 220], torax: [150, 200, 255], cardio: [235, 90, 90], abdomen: [140, 210, 130], pelvis: [210, 150, 230], hueso: [250, 250, 220], pared: [200, 160, 130], feto: [255, 170, 200] };
const PATIENTS = {
  M: { sex: 'M', arms: 'up' }, F: { sex: 'F', arms: 'up', weight: 65 }, obeso: { sex: 'M', arms: 'up', weight: 120 },
  nino: { sex: 'M', arms: 'up', weight: 19, scale: 0.86 }, embarazo: { sex: 'F', arms: 'up', weight: 72, pregnantWeeks: 24 },
};

let structs = [], vol = null, nameOf = [], nameIds = new Map(), counts = [], huOf = null, built = false;
const cur = { x: NX / 2, y: NX / 2 + 10, z: 110 }; // índices de vóxel
let selName = -1, hoverName = -1, mode = 'explore', quiz = null, score = { ok: 0, n: 0 }, buildToken = 0;

async function build() {
  const token = ++buildToken;
  built = false;
  structs = buildAnatomy(PATIENTS[$('selPatient').value]);
  nameIds = new Map(); nameOf = structs.map((s) => { if (!nameIds.has(s.name)) nameIds.set(s.name, nameIds.size); return nameIds.get(s.name); });
  huOf = Float32Array.from(structs, (s) => s.hu + (s.bone || 0));
  vol = new Int16Array(NX * NX * NZ).fill(-1);
  const bar = $('prog').firstElementChild;
  for (let k = 0; k < NZ; k++) {
    const idx = labelMap(structs, Z0 + k * DZ, { n: NX, px: PX, xmin: X0, ymin: X0 });
    vol.set(idx, k * NX * NX);
    if (k % 6 === 5) { bar.style.width = `${(100 * k) / NZ}%`; draw(); await new Promise((r) => setTimeout(r, 0)); if (token !== buildToken) return; }
  }
  bar.style.width = '100%';
  counts = new Array(nameIds.size).fill(0);
  for (let p = 0; p < vol.length; p++) if (vol[p] >= 0) counts[nameOf[vol[p]]]++;
  built = true;
  renderList();
  draw();
  if (mode === 'quiz') newQuestion();
}

const slugById = () => [...nameIds.keys()];
const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= NX || y >= NX || z >= NZ ? -1 : vol[(z * NX + y) * NX + x]);

// --- Dibujo -----------------------------------------------------------------
const views = {
  ax: { cv: $('cvAx'), w: NX, h: NX, sx: PX, sy: PX, pick: (c, r) => [c, NX - 1 - r, cur.z], cross: () => [cur.x, NX - 1 - cur.y] },
  co: { cv: $('cvCo'), w: NX, h: NZ, sx: PX, sy: DZ, pick: (c, r) => [c, cur.y, r], cross: () => [cur.x, cur.z] },
  sa: { cv: $('cvSa'), w: NX, h: NZ, sx: PX, sy: DZ, pick: (c, r) => [cur.x, NX - 1 - c, r], cross: () => [NX - 1 - cur.y, cur.z] },
};

function pixel(k, lut, color, out, o) {
  if (k < 0) { out[o] = out[o + 1] = out[o + 2] = 0; out[o + 3] = 255; return; }
  let g = lut(huOf[k]), r = g, gg = g, b = g;
  const nm = nameOf[k];
  if (nm === selName) { r = 0.4 * g + 0.6 * 40; gg = 0.4 * g + 0.6 * 220; b = 0.4 * g + 0.6 * 255; }
  else if (color) { const c = SYS_COLOR[systemOf(structs[k].name)]; if (c) { r = 0.7 * g + 0.3 * c[0]; gg = 0.7 * g + 0.3 * c[1]; b = 0.7 * g + 0.3 * c[2]; } }
  if (nm === hoverName && nm !== selName) { r = r * 0.75 + 64; gg = gg * 0.75 + 64; b = b * 0.75 + 64; }
  out[o] = r; out[o + 1] = gg; out[o + 2] = b; out[o + 3] = 255;
}

function drawView(key) {
  const v = views[key], ctx = v.cv.getContext('2d');
  const W = v.cv.width, H = v.cv.height;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (!vol) return;
  const [ww, wl] = WIN[$('selWin').value], lo = wl - ww / 2;
  const lut = (hu) => Math.max(0, Math.min(255, ((hu - lo) / ww) * 255));
  const color = $('chkColor').checked;
  const img = new ImageData(v.w, v.h), d = img.data;
  for (let r = 0; r < v.h; r++) for (let c = 0; c < v.w; c++) {
    const [x, y, z] = v.pick(c, r);
    pixel(at(x, y, z), lut, color, d, 4 * (r * v.w + c));
  }
  // Ajuste con la proporción real (mm) de los vóxeles
  const mmW = v.w * v.sx, mmH = v.h * v.sy, s = Math.min(W / mmW, H / mmH);
  v.ox = (W - mmW * s) / 2; v.oy = (H - mmH * s) / 2; v.kx = v.sx * s; v.ky = v.sy * s;
  const off = new OffscreenCanvas(v.w, v.h); off.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(off, v.ox, v.oy, mmW * s, mmH * s);
  const [cx, cy] = v.cross();
  ctx.strokeStyle = 'rgba(255,200,0,0.55)'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(v.ox + (cx + 0.5) * v.kx, v.oy); ctx.lineTo(v.ox + (cx + 0.5) * v.kx, v.oy + mmH * s);
  ctx.moveTo(v.ox, v.oy + (cy + 0.5) * v.ky); ctx.lineTo(v.ox + mmW * s, v.oy + (cy + 0.5) * v.ky);
  ctx.stroke();
  if (mode === 'quiz' && quiz) { ctx.strokeStyle = '#ff0'; ctx.lineWidth = 2; const px = v.ox + (cx + 0.5) * v.kx, py = v.oy + (cy + 0.5) * v.ky; ctx.beginPath(); ctx.arc(px, py, 7, 0, 2 * Math.PI); ctx.stroke(); }
}

function draw() {
  for (const k of Object.keys(views)) drawView(k);
  $('lblAx').textContent = `Axial · z ${Math.round(Z0 + cur.z * DZ)} mm`;
  $('lblCo').textContent = `Coronal · y ${Math.round(X0 + cur.y * PX)} mm`;
  $('lblSa').textContent = `Sagital · x ${Math.round(X0 + cur.x * PX)} mm`;
}

// --- Interacción ------------------------------------------------------------
function toVoxel(key, e) {
  const v = views[key], rect = v.cv.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / rect.width) * v.cv.width, py = ((e.clientY - rect.top) / rect.height) * v.cv.height;
  const c = Math.floor((px - v.ox) / v.kx), r = Math.floor((py - v.oy) / v.ky);
  if (c < 0 || r < 0 || c >= v.w || r >= v.h) return null;
  return v.pick(c, r);
}

function describe(k) {
  if (k < 0) return 'Aire (fuera del paciente)';
  const s = structs[k], lang = getLang();
  return `<b>${displayName(s.name, lang)}</b> · ${SYSTEMS[systemOf(s.name)]?.[{ es: 0, en: 1, pt: 2 }[lang] ?? 0] || ''} · ${Math.round(huOf[k])} HU sin contraste`;
}

for (const key of Object.keys(views)) {
  const cv = views[key].cv;
  cv.addEventListener('mousemove', (e) => {
    if (!built) return;
    const p = toVoxel(key, e);
    const k = p ? at(...p) : -1;
    const nm = k >= 0 ? nameOf[k] : -1;
    $('tip').hidden = mode === 'quiz' || k < 0;
    if (k >= 0 && mode !== 'quiz') { $('tip').innerHTML = describe(k); $('tip').style.left = `${e.clientX + 14}px`; $('tip').style.top = `${e.clientY + 10}px`; }
    if (nm !== hoverName && mode !== 'quiz') { hoverName = nm; draw(); }
  });
  cv.addEventListener('mouseleave', () => { $('tip').hidden = true; if (hoverName !== -1) { hoverName = -1; draw(); } });
  cv.addEventListener('click', (e) => {
    if (!built || mode === 'quiz') return;
    const p = toVoxel(key, e);
    if (!p) return;
    [cur.x, cur.y, cur.z] = p;
    const k = at(...p);
    selName = k >= 0 && systemOf(structs[k].name) !== 'relleno' ? nameOf[k] : -1;
    $('info').innerHTML = describe(k);
    renderList(); draw();
  });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const d = Math.sign(e.deltaY);
    if (key === 'ax') cur.z = Math.max(0, Math.min(NZ - 1, cur.z + d));
    if (key === 'co') cur.y = Math.max(0, Math.min(NX - 1, cur.y - d));
    if (key === 'sa') cur.x = Math.max(0, Math.min(NX - 1, cur.x + d));
    draw();
  }, { passive: false });
}

// Centro (vóxel de la estructura más cercano a su centroide)
function centerOf(nm) {
  let sx = 0, sy = 0, sz = 0, n = 0;
  for (let z = 0; z < NZ; z++) for (let y = 0; y < NX; y++) for (let x = 0; x < NX; x++) { const k = vol[(z * NX + y) * NX + x]; if (k >= 0 && nameOf[k] === nm) { sx += x; sy += y; sz += z; n++; } }
  if (!n) return null;
  const c = [sx / n, sy / n, sz / n];
  let best = null, bd = Infinity;
  for (let z = 0; z < NZ; z++) for (let y = 0; y < NX; y++) for (let x = 0; x < NX; x++) {
    const k = vol[(z * NX + y) * NX + x];
    if (k < 0 || nameOf[k] !== nm) continue;
    const dd = (x - c[0]) ** 2 + (y - c[1]) ** 2 + ((z - c[2]) * 1.6) ** 2;
    if (dd < bd) { bd = dd; best = [x, y, z]; }
  }
  return best;
}

function select(nm) {
  selName = nm;
  const c = centerOf(nm);
  if (c) [cur.x, cur.y, cur.z] = c;
  $('info').innerHTML = describe(at(cur.x, cur.y, cur.z));
  renderList(); draw();
}

function renderList() {
  if (!built) return;
  const lang = getLang(), q = $('search').value.trim().toLowerCase();
  const slugs = slugById();
  const groups = {};
  slugs.forEach((slug, id) => {
    const sys = systemOf(slug);
    if (sys === 'relleno' || !counts[id]) return;
    const label = displayName(slug, lang);
    if (q && !label.toLowerCase().includes(q)) return;
    (groups[sys] ||= []).push([id, label]);
  });
  const li = { es: 0, en: 1, pt: 2 }[lang] ?? 0;
  $('list').innerHTML = Object.keys(SYSTEMS).filter((s) => groups[s]).map((s) => `<details ${q || groups[s].some(([id]) => id === selName) ? 'open' : ''}><summary>${SYSTEMS[s][li]} (${groups[s].length})</summary>${groups[s].sort((a, b) => a[1].localeCompare(b[1])).map(([id, label]) => `<button data-id="${id}" class="${id === selName ? 'sel' : ''}">${label}</button>`).join('')}</details>`).join('') || '<p class="small">Sin resultados.</p>';
  for (const b of $('list').querySelectorAll('button')) b.onclick = () => select(+b.dataset.id);
}

// --- Preguntas --------------------------------------------------------------
function newQuestion() {
  const slugs = slugById();
  const pool = slugs.map((s, id) => [s, id]).filter(([s, id]) => counts[id] > 40 && systemOf(s) !== 'relleno' && NAMES[s]);
  const [slug, id] = pool[Math.floor(Math.random() * pool.length)];
  // Vóxel interior al azar (sus 4 vecinos en el plano pertenecen a la misma estructura)
  const cand = [];
  for (let z = 0; z < NZ; z++) for (let y = 1; y < NX - 1; y++) for (let x = 1; x < NX - 1; x++) {
    const k = vol[(z * NX + y) * NX + x];
    if (k < 0 || nameOf[k] !== id) continue;
    if ([at(x + 1, y, z), at(x - 1, y, z), at(x, y + 1, z), at(x, y - 1, z)].every((n) => n >= 0 && nameOf[n] === id)) cand.push([x, y, z]);
  }
  const pick = cand.length ? cand[Math.floor(Math.random() * cand.length)] : centerOf(id);
  [cur.x, cur.y, cur.z] = pick;
  const same = pool.filter(([s, i]) => i !== id && systemOf(s) === systemOf(slug)).sort(() => Math.random() - 0.5);
  const other = pool.filter(([s, i]) => i !== id && systemOf(s) !== systemOf(slug)).sort(() => Math.random() - 0.5);
  const opts = [[slug, id], ...same.slice(0, 2), ...other].slice(0, 4).sort(() => Math.random() - 0.5);
  quiz = { id, answered: false };
  selName = -1; hoverName = -1;
  const lang = getLang();
  $('qOpts').innerHTML = opts.map(([s, i]) => `<button data-id="${i}">${displayName(s, lang)}</button>`).join('');
  $('qFeedback').textContent = '';
  for (const b of $('qOpts').querySelectorAll('button')) b.onclick = () => {
    if (quiz.answered) return;
    quiz.answered = true;
    const ok = +b.dataset.id === quiz.id;
    score.n++; if (ok) score.ok++;
    for (const x of $('qOpts').querySelectorAll('button')) { if (+x.dataset.id === quiz.id) x.classList.add('right'); else if (x === b) x.classList.add('wrong'); }
    $('qFeedback').textContent = ok ? 'Correcto.' : `Era: ${displayName(slug, getLang())}.`;
    $('qScore').textContent = `${score.ok}/${score.n}`;
    selName = quiz.id; draw();
  };
  draw();
}

for (const b of $('segMode').querySelectorAll('button')) b.onclick = () => {
  mode = b.dataset.v;
  for (const x of $('segMode').querySelectorAll('button')) x.classList.toggle('active', x === b);
  $('explore').hidden = mode !== 'explore'; $('quiz').hidden = mode !== 'quiz';
  quiz = null; selName = -1;
  if (mode === 'quiz' && built) newQuestion(); else { renderList(); draw(); }
};
$('qNext').onclick = () => built && newQuestion();
$('search').oninput = renderList;
$('selPatient').onchange = build;
$('selWin').onchange = draw;
$('chkColor').onchange = draw;
new MutationObserver(() => { renderList(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

build();
