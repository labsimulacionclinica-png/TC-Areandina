// Editor de casos para docentes: crea casos propios (paciente, orden, lesiones, pregunta) sin programar.
import { METAL_ITEMS, PROTOCOL_EXPECTED, LESION_TYPES, loadCustomCases, saveCustomCases, customToCase } from './cases.js';
import { PROTOCOLS } from './protocols.js';
import { buildAnatomy, serialize, structureAt, rasterize, structureMu, MU_WATER } from './phantom.js';
import { computeCurves, enhancementAt } from './contrast.js';
import { escapeHtml } from './evaluation.js';

const $ = (id) => document.getElementById(id);
let current = null; // caso en edición

const blank = () => ({
  key: `custom-${Date.now().toString(36)}`, title: '', protocolKey: 'abdomen', contrast: 'si', companion: false, order: '', history: '', positionTip: '',
  patient: { name: '', id: '', dob: '1975-01-01', age: 50, sex: 'F', weight: 70, height: 165, creatinine: 0.9, egfr: 85, allergies: 'Ninguna conocida', metformin: false, pregnancy: null, breathHold: 15, cooperative: true },
  items: [], lesions: [{ type: 'hipodensa', x: -60, y: 15, z: 620, rx: 12, ry: 12, rz: 12 }],
  question: { text: '¿Cuál es el hallazgo principal?', options: ['', '', '', ''], correct: 0, explanation: '' },
});

$('protocolKey').innerHTML = Object.keys(PROTOCOL_EXPECTED).map((k) => `<option value="${k}">${PROTOCOLS[k]?.label || k}</option>`).join('');
$('items').innerHTML = Object.entries(METAL_ITEMS).map(([k, v]) => `<label class="check"><input type="checkbox" data-item="${k}"> ${v}</label>`).join('');

const F = {
  title: 'title', protocolKey: 'protocolKey', contrast: 'contrast', order: 'order', history: 'history', positionTip: 'positionTip',
};
const P = { name: 'pName', id: 'pId', dob: 'pDob', age: 'pAge', sex: 'pSex', weight: 'pWeight', height: 'pHeight', creatinine: 'pCreat', egfr: 'pEgfr', allergies: 'pAllergies', pregnancy: 'pPregnancy', breathHold: 'pBreath' };

function toForm(d) {
  current = structuredClone(d);
  for (const [k, id] of Object.entries(F)) $(id).value = d[k] ?? '';
  $('companion').value = d.companion ? '1' : '0';
  for (const [k, id] of Object.entries(P)) $(id).value = d.patient[k] ?? '';
  $('pMetformin').value = d.patient.metformin ? '1' : '0';
  $('pCoop').value = d.patient.cooperative === false ? '0' : '1';
  for (const cb of $('items').querySelectorAll('input')) cb.checked = d.items.includes(cb.dataset.item);
  $('qText').value = d.question.text;
  const opts = [...d.question.options, '', '', '', ''].slice(0, 4);
  $('qOpts').innerHTML = opts.map((o, i) => `<input type="text" data-opt="${i}" maxlength="160" placeholder="Opción ${i + 1}" value="${escapeHtml(o)}">`).join('');
  $('qCorrect').value = String(d.question.correct);
  $('qExplanation').value = d.question.explanation;
  renderLesions();
  if (d.lesions[0]) $('previewZ').value = d.lesions[0].z;
  preview();
}

function fromForm() {
  const d = current;
  for (const [k, id] of Object.entries(F)) d[k] = $(id).value.trim();
  d.companion = $('companion').value === '1';
  for (const [k, id] of Object.entries(P)) {
    const v = $(id).value.trim();
    d.patient[k] = ['age', 'weight', 'height', 'creatinine', 'egfr', 'breathHold'].includes(k) ? +v : v || (k === 'pregnancy' ? null : v);
  }
  d.patient.metformin = $('pMetformin').value === '1';
  d.patient.cooperative = $('pCoop').value === '1';
  d.items = [...$('items').querySelectorAll('input:checked')].map((cb) => cb.dataset.item);
  d.question = {
    text: $('qText').value.trim(),
    options: [...$('qOpts').querySelectorAll('input')].map((i) => i.value.trim()),
    correct: +$('qCorrect').value,
    explanation: $('qExplanation').value.trim(),
  };
  return d;
}

// --- Lesiones ---------------------------------------------------------------------

let anatomy = null;
const baseAnatomy = () => (anatomy ||= serialize(buildAnatomy({ arms: 'up' })));

function renderLesions() {
  const box = $('lesions');
  box.innerHTML = current.lesions.map((l, i) => {
    const organ = structureAt(baseAnatomy(), +l.x, +l.y, +l.z);
    const bad = !organ || /aire|luz/.test(organ.name);
    return `<div class="lesion" data-i="${i}">
      <label>Tipo <select data-f="type">${Object.entries(LESION_TYPES).map(([k, t]) => `<option value="${k}" ${k === l.type ? 'selected' : ''}>${t.label}</option>`).join('')}</select></label>
      ${['x', 'y', 'z', 'rx', 'ry', 'rz'].map((f) => `<label>${f} (mm)<input type="number" data-f="${f}" value="${l[f]}" step="1"></label>`).join('')}
      <button data-del="${i}" title="Quitar">✕</button>
      <div class="where ${bad ? 'bad' : ''}">Centro dentro de: <b>${organ ? organ.name.replace(/-/g, ' ') : 'fuera del paciente'}</b>${bad ? ' — compruebe la posición' : ''}</div>
    </div>`;
  }).join('');
  for (const el of box.querySelectorAll('[data-f]')) el.onchange = () => {
    const l = current.lesions[+el.closest('.lesion').dataset.i];
    l[el.dataset.f] = el.dataset.f === 'type' ? el.value : +el.value;
    if (el.dataset.f === 'z') $('previewZ').value = el.value;
    renderLesions(); preview();
  };
  for (const b of box.querySelectorAll('[data-del]')) b.onclick = () => { current.lesions.splice(+b.dataset.del, 1); renderLesions(); preview(); };
}
$('btnAddLesion').onclick = () => {
  const z = +$('previewZ').value;
  current.lesions.push({ type: 'hipodensa', x: 0, y: 0, z, rx: 10, ry: 10, rz: 10 });
  renderLesions(); preview();
};

// --- Vista previa: imagen sin ruido (rasterización directa) -----------------------

function preview() {
  const d = fromForm();
  const c = customToCase(d);
  const z = +$('previewZ').value;
  $('previewZv').textContent = `${z} mm`;
  const structs = serialize(buildAnatomy({ arms: c.expected.armsDown ? 'down' : 'up', sex: c.patient.sex, weight: c.patient.weight, extras: c.extras }));
  const enh = c.contrast === 'si' ? enhancementAt(computeCurves({ volume: 100, flow: 3, conc: 350, saline: 30 }, { weight: c.patient.weight || 70, egfr: 90 }), 70) : {};
  const mu = structureMu(structs, 120, enh);
  const fov = c.region === 'head' ? 240 : 420, n = 256, px = fov / n;
  const soft = new Float32Array(n * n), hard = new Float32Array(n * n);
  rasterize(structs, mu, z, { n, px, xmin: -fov / 2 + px / 2, ymin: -fov / 2 + px / 2 }, soft, hard, 1);
  const ctx = $('preview').getContext('2d'), id = ctx.createImageData(n, n);
  const [ww, wl] = c.region === 'head' ? [100, 40] : [400, 50];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const p = j * n + i, hu = 1000 * ((soft[p] + hard[p]) / MU_WATER[120] - 1);
    const g = Math.max(0, Math.min(255, ((hu - (wl - ww / 2)) / ww) * 255));
    const q = ((n - 1 - j) * n + i) * 4; // fila 0 = anterior
    id.data[q] = id.data[q + 1] = id.data[q + 2] = g; id.data[q + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  $('previewInfo').textContent = `${c.region === 'head' ? 'ventana cerebro' : 'partes blandas'} · la derecha del paciente a la izquierda`;
}
$('previewZ').oninput = preview;
for (const id of ['protocolKey', 'contrast', 'pSex', 'pWeight']) $(id).addEventListener('change', preview);

// --- Guardar, listar, exportar ------------------------------------------------------

function validate(d) {
  const errs = [];
  if (!d.title) errs.push('falta el título');
  if (!d.patient.name) errs.push('falta el nombre del paciente');
  if (!d.order) errs.push('falta la orden médica');
  if (d.question.options.filter(Boolean).length < 2) errs.push('la pregunta necesita al menos 2 opciones');
  if (!d.question.options[d.question.correct]) errs.push('la respuesta correcta está vacía');
  return errs;
}

function renderSaved() {
  const list = loadCustomCases();
  $('saved').innerHTML = list.length ? list.map((d, i) => `<li><span><b>${escapeHtml(d.title)}</b><br><span class="muted">${escapeHtml(d.patient.name)} · ${escapeHtml(PROTOCOLS[d.protocolKey]?.label || d.protocolKey)}</span></span><button data-edit="${i}">Editar</button><button data-rm="${i}">Borrar</button></li>`).join('') : '<li class="muted">Aún no hay casos propios.</li>';
  for (const b of $('saved').querySelectorAll('[data-edit]')) b.onclick = () => toForm(list[+b.dataset.edit]);
  for (const b of $('saved').querySelectorAll('[data-rm]')) b.onclick = () => {
    if (!confirm(`¿Borrar «${list[+b.dataset.rm].title}» de este navegador?`)) return;
    list.splice(+b.dataset.rm, 1); saveCustomCases(list); renderSaved();
  };
}

$('btnSave').onclick = () => {
  const d = fromForm();
  const errs = validate(d);
  if (errs.length) { $('saveMsg').textContent = `No se guardó: ${errs.join('; ')}.`; return; }
  d.question.options = d.question.options.filter(Boolean);
  const list = loadCustomCases();
  const i = list.findIndex((x) => x.key === d.key);
  if (i >= 0) list[i] = d; else list.push(d);
  $('saveMsg').textContent = saveCustomCases(list) ? `Guardado: «${d.title}». Aparece en el simulador, en «Casos clínicos».` : 'No se pudo guardar (almacenamiento del navegador no disponible).';
  renderSaved();
};
$('btnNew').onclick = () => toForm(blank());
$('btnTry').onclick = () => { $('btnSave').click(); if (!/^No/.test($('saveMsg').textContent)) location.href = `index.html?case=${encodeURIComponent(current.key)}`; };
$('btnExport').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(loadCustomCases(), null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = `opentc-casos-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('importFile').onchange = async (e) => {
  try {
    const data = JSON.parse(await e.target.files[0].text());
    const incoming = (Array.isArray(data) ? data : [data]).filter((d) => d?.key && d.patient && d.question && Array.isArray(d.lesions));
    const list = loadCustomCases();
    for (const d of incoming) { const i = list.findIndex((x) => x.key === d.key); if (i >= 0) list[i] = d; else list.push(d); }
    saveCustomCases(list);
    $('saveMsg').textContent = `${incoming.length} caso(s) importado(s).`;
    renderSaved();
  } catch { $('saveMsg').textContent = 'El archivo no es un JSON de casos válido.'; }
  e.target.value = '';
};

toForm(blank());
renderSaved();
