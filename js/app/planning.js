// Módulo «planning» de OpenTC Sim (antes parte de main.js).
import { buildAnatomy, serialize, LANDMARKS, lesion, structureAt, HARD_FACTOR, mulberry32 } from '../phantom.js';
import { COLLIMATIONS, KERNELS, WINDOWS, SCANNER, DRL, K_EFFECTIVE, doseReport, masProfile, dwFromTopogram, expectedNoise, ctdiVol, organDoses, heartDisplacement } from '../ct.js';
import { computeCurves, enhancementAt, CATHETERS, injectionSummary } from '../contrast.js';
import { CASES, caseByKey, allCases, METAL_ITEMS, METAL_Z, loadCustomCases, saveCustomCases } from '../cases.js';
import { PROTOCOLS, PARAM_DEFS } from '../protocols.js';
import { ReconPool } from '../pool.js';
import { Viewer, drawTopogram } from '../viewer.js';
import { evaluate, loadHistory, saveToHistory, exportJson, exportCsv, reportHtml, escapeHtml } from '../evaluation.js';
import { ARTIFACT_CASES, ARTIFACT_TYPES, artifactByKey, evaluateArtifact } from '../artifacts.js';
import { dicomSlice, zip, uid } from '../dicom.js';
import { Tour } from '../tour.js';
import { lms } from '../lms.js';
import { tourSteps } from '../tourSteps.js';
import { perfusionMaps, perfusionSummary } from '../perfusion.js';
import { dualEnergyImages, DE_OUTPUTS, parseOutput } from '../dualenergy.js';
import { $, pool, fmt, STEPS, viewer, hooks } from './base.js';
import { S, ask, log, offY, practice, renderGuide, renderNav, step } from './core.js';
import { ensureAnatomy } from './roomstep.js';
import { addDose } from './acquisition.js';

// ---------------------------------------------------------------------------
// 3. Topograma y planificación
// ---------------------------------------------------------------------------

export function renderTopoControls() {
  const pr = PROTOCOLS[S.protocolKey] || null;
  const def = pr?.topo || { view: S.caseDef.region === 'head' ? 'LAT' : 'AP', start: S.caseDef.region === 'head' ? -170 : -100, length: S.caseDef.region === 'head' ? 260 : 450 };
  $('topoView').value = def.view; $('topoStart').value = def.start; $('topoLen').value = def.length;
  renderRangeInputs();
}

$('btnTopo').onclick = async () => {
  if (!S) return;
  if (S.position.zero == null || !S.position.atIso) return ask('Paciente no preparado', '<p>Marque el cero con el láser y lleve al paciente al isocentro (paso «Sala y posición»).</p>', [['Entendido', 0, true]]);
  await acquireTopogram($('topoView').value, +$('topoStart').value, Math.max(100, Math.min(1000, +$('topoLen').value)));
};

export async function acquireTopogram(view, start, len) {
  const z0 = Math.max(-150, S.position.zero + start);
  $('btnTopo').disabled = true; $('topoInfo').textContent = 'Adquiriendo…';
  try {
    const an = await ensureAnatomy();
    const topo = await pool.topogram({ anatomyId: an.id, kv: 120, z0, z1: z0 + len, view, offX: 0, offY: offY(), seed: S.topos.length + 3 });
    topo.label = `Topograma ${view} ${S.topos.length + 1}`;
    S.topos.push(topo);
    S.topoIndex = S.topos.length - 1;
    const dlp = 0.02 * len;
    addDose(`${topo.label}`, 0.15, dlp);
    log(`${topo.label}: ${len} mm`, S.topos.length > 2 ? 'warn' : '');
    if (!S.range) {
      const [a, b] = S.caseDef.expected.coverage;
      const mid = (z0 + z0 + len) / 2;
      S.range = practice() ? [Math.max(z0, mid - 120), Math.min(z0 + len, mid + 120)] : [z0 + len * 0.25, z0 + len * 0.75];
      void a; void b;
    }
    renderTopoTabs(); drawTopo(); renderRangeInputs(); renderMetrics(); renderNav(); renderGuide();
  } finally {
    $('btnTopo').disabled = false; $('topoInfo').textContent = '';
  }
}

export function renderTopoTabs() {
  $('topoTabs').innerHTML = S.topos.map((t, i) => `<button data-i="${i}" class="${i === S.topoIndex ? 'active' : ''}">${t.label}</button>`).join('');
  for (const b of $('topoTabs').querySelectorAll('button')) b.onclick = () => { S.topoIndex = +b.dataset.i; renderTopoTabs(); drawTopo(); };
}

export let topoLayout = null;
export function drawTopo() {
  const cv = $('topoCanvas');
  const topo = S?.topos[S.topoIndex];
  $('topoEmpty').hidden = !!topo;
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (!topo) return;
  const img = drawTopogram(cv, topo);
  const wMm = topo.cols * topo.px, hMm = topo.rows * topo.dz;
  const sc = Math.min(W / wMm, H / hMm) * 0.98;
  const dw = wMm * sc, dh = hMm * sc, x0 = (W - dw) / 2, y0 = (H - dh) / 2;
  ctx.drawImage(img, x0, y0, dw, dh);
  topoLayout = { x0, y0, dw, dh, sc, topo };
  const zy = (z) => y0 + (z - topo.z0) * sc;
  // DFOV (ancho) y rango
  if (S.range) {
    const [a, b] = S.range;
    const dfov = S.params?.dfov || 380;
    const cx = x0 + dw / 2, half = (dfov / 2) * sc;
    ctx.fillStyle = 'rgba(242,193,78,.12)';
    ctx.fillRect(cx - half, zy(a), 2 * half, zy(b) - zy(a));
    ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 2;
    // Con el gantry inclinado, en el topograma lateral los límites del rango se ven oblicuos (eje horizontal = y)
    const tn = topo.view === 'LAT' ? Math.tan(((S.params?.tilt || 0) * Math.PI) / 180) : 0;
    const yAt = (xpx) => ((xpx - x0) / dw - 0.5) * topo.cols * topo.px; // mm (anterior a la derecha)
    for (const z of [a, b]) { ctx.beginPath(); ctx.moveTo(x0, zy(z + yAt(x0) * tn)); ctx.lineTo(x0 + dw, zy(z + yAt(x0 + dw) * tn)); ctx.stroke(); }
    ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
    ctx.strokeRect(cx - half, zy(a), 2 * half, zy(b) - zy(a)); ctx.setLineDash([]);
    ctx.fillStyle = '#f2c14e'; ctx.font = '12px Segoe UI, sans-serif';
    ctx.fillText(`${fmtTable(a)} mm`, x0 + 4, zy(a) - 4);
    ctx.fillText(`${fmtTable(b)} mm`, x0 + 4, zy(b) + 14);
  }
  // marca del cero
  if (S.position.zero != null) {
    ctx.strokeStyle = 'rgba(255,60,60,.7)'; ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(x0, zy(S.position.zero)); ctx.lineTo(x0 + dw, zy(S.position.zero)); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.fillStyle = '#cfe3ee'; ctx.font = '11px Segoe UI, sans-serif';
  ctx.fillText(topo.view === 'AP' ? 'D' : 'P', x0 + 4, y0 + dh / 2);
  ctx.fillText(topo.view === 'AP' ? 'Iz' : 'A', x0 + dw - 16, y0 + dh / 2);
}

export const fmtTable = (z) => Math.round(z - (S.position.zero ?? 0));

(() => {
  const cv = $('topoCanvas');
  let drag = null;
  const zAt = (e) => { const r = cv.getBoundingClientRect(); return topoLayout.topo.z0 + (e.clientY - r.top - topoLayout.y0) / topoLayout.sc; };
  cv.addEventListener('pointerdown', (e) => {
    if (!topoLayout || !S.range) return;
    const z = zAt(e), tol = 8 / topoLayout.sc;
    const [a, b] = S.range;
    drag = Math.abs(z - a) < tol ? 'a' : Math.abs(z - b) < tol ? 'b' : z > a && z < b ? { move: z } : null;
    if (drag) cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag || !topoLayout) return;
    const t = topoLayout.topo, z = Math.max(t.z0, Math.min(t.z1, zAt(e)));
    if (drag === 'a') S.range = [Math.min(z, S.range[1] - 10), S.range[1]];
    else if (drag === 'b') S.range = [S.range[0], Math.max(z, S.range[0] + 10)];
    else {
      const d = z - drag.move, len = S.range[1] - S.range[0];
      let a = Math.max(t.z0, Math.min(t.z1 - len, S.range[0] + d));
      S.range = [a, a + len]; drag.move = z;
    }
    S.range = S.range.map((v) => Math.round(v));
    drawTopo(); renderRangeInputs(); renderMetrics();
  });
  const end = () => { if (drag) { drag = null; renderNav(); renderGuide(); } };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  new ResizeObserver(() => { if (step === 'topograma') drawTopo(); }).observe(cv);
})();

export function renderRangeInputs() {
  const has = !!S?.range;
  $('rangeStart').value = has ? fmtTable(S.range[0]) : '';
  $('rangeEnd').value = has ? fmtTable(S.range[1]) : '';
  $('rangeLen').textContent = has ? `${S.range[1] - S.range[0]} mm` : '—';
}
for (const id of ['rangeStart', 'rangeEnd']) {
  $(id).onchange = () => {
    if (!S?.range) return;
    const a = +$('rangeStart').value + S.position.zero, b = +$('rangeEnd').value + S.position.zero;
    if (b - a >= 10) S.range = [a, b];
    renderRangeInputs(); drawTopo(); renderMetrics();
  };
}

// ---------------------------------------------------------------------------
// 4. Protocolo
// ---------------------------------------------------------------------------

export function renderProtocolSelect() {
  $('selProtocol').innerHTML = '<option value="">Elija un protocolo…</option>' + Object.entries(PROTOCOLS).map(([k, p]) => `<option value="${k}">${p.label}</option>`).join('');
  $('params').innerHTML = '';
  $('seriesPlan').innerHTML = '<p class="muted">Cargue un protocolo.</p>';
  $('metrics').innerHTML = '';
  $('doseWarn').innerHTML = '';
}

$('btnLoadProtocol').onclick = () => {
  const k = $('selProtocol').value;
  if (!S || !k) return;
  const p = PROTOCOLS[k];
  S.protocolKey = k;
  S.params = { ...p.params, sfov: p.sfov };
  S.region = p.region;
  S.plan = JSON.parse(JSON.stringify(p.series));
  if (p.injector) S.injector = { ...p.injector };
  log(`Protocolo cargado: ${p.label}`);
  renderParams(); renderMetrics(); renderInjector(); renderNav(); renderGuide();
  if (!S.topos.length) renderTopoControls();
};

export function renderParams() {
  const box = $('params');
  if (!S?.params) { box.innerHTML = ''; return; }
  box.innerHTML = PARAM_DEFS.map((d) => {
    const v = S.params[d.key];
    let input;
    if (d.type === 'select') input = `<select data-k="${d.key}">${d.options.map((o) => `<option value="${o}" ${String(o) === String(v) ? 'selected' : ''}>${d.labels?.[o] || String(o).replace('.', ',')}</option>`).join('')}</select>`;
    else if (d.type === 'bool') input = `<select data-k="${d.key}"><option value="1" ${v ? 'selected' : ''}>Sí</option><option value="0" ${!v ? 'selected' : ''}>No</option></select>`;
    else if (d.type === 'coll') input = `<select data-k="${d.key}">${Object.entries(COLLIMATIONS).map(([k, c]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${c.label}</option>`).join('')}</select>`;
    else if (d.type === 'kernel') input = `<select data-k="${d.key}">${Object.entries(KERNELS).map(([k, c]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${c.label}</option>`).join('')}</select>`;
    else input = `<input type="number" data-k="${d.key}" min="${d.min}" max="${d.max}" step="${d.step}" value="${v}">`;
    return `<div class="param"><label>${d.label}</label>${input}</div>`;
  }).join('');
  for (const el of box.querySelectorAll('[data-k]')) el.onchange = () => {
    const d = PARAM_DEFS.find((x) => x.key === el.dataset.k);
    let v = el.value;
    if (d.type === 'bool') v = v === '1';
    else if (d.type === 'number' || (d.type === 'select' && typeof d.options[0] === 'number')) v = +v;
    if (d.type === 'number') v = Math.max(d.min, Math.min(d.max, v));
    S.params[d.key] = v;
    renderMetrics(); drawTopo();
  };
  renderSeriesPlan();
}

export function dwAt() {
  const t = S.topos.find((x) => x.view === 'AP') || S.topos[0];
  return t ? dwFromTopogram(t) : null;
}

export function regionKey() { return S.region || S.caseDef.region; }

export function renderMetrics() {
  if (!S?.params) return;
  const p = { ...S.params, hr: S.hr || 70 };
  const [a, b] = S.range || [0, 300];
  const r = doseReport(p, a, b, dwAt(), regionKey());
  const noise = expectedNoise(p, r.dw);
  const drl = DRL[S.caseDef.expected.drl];
  const cls = (v, lim) => (v > lim * 1.5 ? 'err' : v > lim ? 'warn' : 'ok');
  $('metrics').className = 'metrics five';
  $('metrics').innerHTML = [
    ['CTDIvol', `${fmt(r.ctdi, 1)} mGy`, practice() ? cls(r.ctdi, drl) : ''],
    ['DLP', `${fmt(r.dlp)} mGy·cm`, ''],
    ['Dosis efectiva', `${fmt(r.effective, 1)} mSv`, ''],
    ['SSDE', `${fmt(r.ssde, 1)} mGy`, ''],
    ['Tiempo', `${fmt(r.time, 1)} s`, S.caseDef.patient.breathHold && r.time > S.caseDef.patient.breathHold && S.region !== 'head' ? 'warn' : ''],
    ['Corriente', `${fmt(r.mA)} mA`, r.limited ? 'err' : ''],
    ['mAs medio', fmt(r.avgMas), ''],
    ['Velocidad mesa', `${fmt(r.speed)} mm/s`, ''],
    ['Ruido esperado', `≈ ${fmt(noise, 1)} HU`, ''],
    ['Cortes', fmt(Math.round((b - a) / p.thickness) + 1), ''],
  ].map(([k, v, c]) => `<div class="metric ${c}"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  const warns = [];
  if (!S.range) warns.push(['warnline', 'Aún no hay rango planificado: los valores usan 300 mm.']);
  if (r.limited) warns.push(['errline', `El tubo no alcanza los mAs pedidos (máx. ${SCANNER.maxMa[p.kv]} mA): baje el pitch o la velocidad de rotación, o suba el kV.`]);
  if (p.thickness < COLLIMATIONS[p.coll].minThk) warns.push(['errline', `Con ${COLLIMATIONS[p.coll].label} el grosor mínimo es ${COLLIMATIONS[p.coll].minThk} mm.`]);
  if (S.caseDef.patient.breathHold && r.time > S.caseDef.patient.breathHold && regionKey() !== 'head') warns.push(['warnline', `La adquisición dura ${fmt(r.time, 1)} s y el paciente tolera ~${S.caseDef.patient.breathHold} s de apnea.`]);
  if (p.sfov === 'head' && regionKey() !== 'head') warns.push(['errline', 'El SFOV de cabeza (300 mm) es menor que el cuerpo: habrá truncamiento.']);
  if (practice() && r.ctdi > drl) warns.push(['warnline', `CTDIvol por encima del nivel de referencia orientativo (${drl} mGy).`]);
  if ((p.tilt || 0) !== 0 && p.sfov !== 'head') warns.push(['warnline', 'La inclinación del gantry se usa sobre todo en cráneo (para sacar los cristalinos del haz).']);
  const od = organDoses(p, a, b, r.ctdi, { sex: S.caseDef.patient.sex, shields: S.position.shields });
  const organs = Object.values(od).map((o) => `${o.label}: <b>${fmt(o.dose, 1)} mGy</b>${o.inField ? ' (en el haz' + (o.shielded ? ', con bismuto' : '') + ')' : ''}`).join(' · ');
  $('doseWarn').innerHTML = `<p class="small">Dosis estimada a órganos superficiales — ${organs}</p>` + warns.map(([c, t]) => `<p class="${c}">${t}</p>`).join('');
}

export function renderSeriesPlan() {
  const box = $('seriesPlan');
  box.innerHTML = S.plan.map((s, i) => {
    const t = s.timing || { mode: 'fixed', delay: 70 };
    const timing = s.phase === 'simple' ? '<span class="muted">Sin contraste</span>' : `
      <select data-f="mode" data-i="${i}"><option value="fixed" ${t.mode === 'fixed' ? 'selected' : ''}>Retardo fijo</option><option value="bt" ${t.mode === 'bt' ? 'selected' : ''}>Seguimiento del bolo</option></select>
      ${t.mode === 'bt' ? `nivel <input type="number" data-f="monitorZ" data-i="${i}" value="${fmtTable(t.monitorZ ?? 450)}"> mm · umbral <input type="number" data-f="threshold" data-i="${i}" value="${t.threshold ?? 100}"> HU · +<input type="number" data-f="delay" data-i="${i}" value="${t.delay ?? 5}"> s`
        : `a los <input type="number" data-f="delay" data-i="${i}" value="${t.delay ?? 70}"> s del inicio de la inyección`}`;
    return `<div class="series-row">
      <input type="text" data-f="name" data-i="${i}" value="${escapeHtml(s.name)}">
      <select data-f="phase" data-i="${i}">${['simple', 'arterial', 'portal', 'tardia', 'perfusion'].map((ph) => `<option value="${ph}" ${ph === s.phase ? 'selected' : ''}>${{ simple: 'Simple', arterial: 'Arterial', portal: 'Portal', tardia: 'Tardía / excretora', perfusion: 'Perfusión' }[ph]}</option>`).join('')}</select>
      <div class="timing">${timing}</div>
      <button data-del="${i}" title="Quitar serie" aria-label="Quitar la serie ${i + 1}">✕</button>
    </div>`;
  }).join('') + '<div class="row"><button id="btnAddSeries">+ Añadir serie</button></div>';
  for (const el of box.querySelectorAll('[data-f]')) el.onchange = () => {
    const s = S.plan[+el.dataset.i], f = el.dataset.f;
    if (f === 'name') s.name = el.value;
    else if (f === 'phase') { s.phase = el.value; if (el.value !== 'simple' && !s.timing) s.timing = { mode: 'fixed', delay: el.value === 'arterial' ? 35 : el.value === 'portal' ? 70 : 300 }; }
    else {
      s.timing ||= { mode: 'fixed', delay: 70 };
      if (f === 'mode') { s.timing.mode = el.value; if (el.value === 'bt') Object.assign(s.timing, { comp: 'aorta', monitorZ: s.timing.monitorZ ?? (S.range ? Math.round((S.range[0] + S.range[1]) / 2) : 450), threshold: 100, delay: 6 }); }
      else if (f === 'monitorZ') s.timing.monitorZ = +el.value + S.position.zero;
      else s.timing[f] = +el.value;
    }
    renderSeriesPlan(); renderInjector();
  };
  for (const b of box.querySelectorAll('[data-del]')) b.onclick = () => { S.plan.splice(+b.dataset.del, 1); renderSeriesPlan(); };
  $('btnAddSeries').onclick = () => { S.plan.push({ name: `Serie ${S.plan.length + 1}`, phase: 'simple' }); renderSeriesPlan(); };
}

// ---------------------------------------------------------------------------
// 5. Contraste
// ---------------------------------------------------------------------------

export function renderInjector() {
  if (!S) return;
  const inj = S.injector;
  const defs = [['volume', 'Volumen (mL)', 10, 150, 5], ['flow', 'Caudal (mL/s)', 0.5, 7, 0.5], ['conc', 'Concentración (mgI/mL)', [300, 350, 370]], ['saline', 'Suero (mL)', 0, 80, 5]];
  $('injParams').innerHTML = defs.map(([k, l, a, b, st]) => `<div class="param"><label>${l}</label>${Array.isArray(a) ? `<select data-j="${k}">${a.map((o) => `<option ${o === inj[k] ? 'selected' : ''}>${o}</option>`).join('')}</select>` : `<input type="number" data-j="${k}" min="${a}" max="${b}" step="${st}" value="${inj[k]}">`}</div>`).join('');
  for (const el of $('injParams').querySelectorAll('[data-j]')) el.onchange = () => { S.injector[el.dataset.j] = +el.value; renderInjector(); };
  const sum = injectionSummary(inj);
  const cat = CATHETERS[S.prep.catheter];
  $('injMetrics').innerHTML = [
    ['Duración', `${fmt(sum.duration, 1)} s`],
    ['Yodo total', `${fmt(sum.iodineG, 1)} g`],
    ['Aporte de yodo', `${fmt(sum.iodineDeliveryRate, 2)} gI/s`],
    ['gI/kg', fmt(sum.iodineG / S.caseDef.patient.weight, 2)],
  ].map(([k, v]) => `<div class="metric"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  const w = [];
  if (S.prep.catheter === 'none') w.push('<p class="warnline">Sin acceso venoso: canalice una vena en el paso «Paciente».</p>');
  else if (inj.flow > cat.maxFlow) w.push(`<p class="errline">El caudal supera el máximo recomendado para el catéter ${cat.label} (${cat.maxFlow} mL/s): riesgo de extravasación.</p>`);
  if (S.prep.contrastDecision !== 'apto') w.push('<p class="warnline">El paciente no está registrado como apto para contraste.</p>');
  $('injWarn').innerHTML = w.join('');
  drawCurves();
}

export function drawCurves() {
  const cv = $('curveCanvas');
  if (!cv.clientWidth) return;
  const show = practice();
  $('curveNote').textContent = show ? 'previsión orientativa' : 'oculta en modo evaluación';
  const comps = [['pa', 'Art. pulmonar', '#e5605a'], ['aorta', 'Aorta', '#f2c14e'], ['portal', 'Porta', '#3fb8e6'], ['liver', 'Hígado', '#4cc38a']];
  if (S.caseDef.key === 'higado-trifasico') comps.push(['hcc', 'Nódulo', '#c58af0']);
  const curves = computeCurves(S.injector, S.caseDef.patient);
  const marks = S.plan.filter((s) => s.phase !== 'simple' && s.timing?.mode === 'fixed').map((s) => [s.timing.delay, s.name]);
  plot(cv, show ? comps.map(([k, label, color]) => ({ label, color, f: (t) => (enhancementAt(curves, t)[k] || 0) * HARD_FACTOR.iodine[S.params?.kv || 120] })) : [], 120, 450, marks);
  $('curveLegend').innerHTML = show ? comps.map(([, l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join('') : '';
}

export function plot(cv, lines, tMax, yMax, marks = [], points = null, threshold = null) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const L = 38, B = 22, T = 8, R = 8;
  const X = (t) => L + (t / tMax) * (W - L - R), Y = (v) => H - B - (v / yMax) * (H - B - T);
  ctx.strokeStyle = '#2a3a45'; ctx.fillStyle = '#8399a7'; ctx.font = '10px Segoe UI, sans-serif';
  for (let v = 0; v <= yMax; v += yMax > 300 ? 100 : 50) { ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(W - R, Y(v)); ctx.stroke(); ctx.fillText(String(v), 4, Y(v) + 3); }
  for (let t = 0; t <= tMax; t += tMax > 60 ? 20 : 10) ctx.fillText(`${t} s`, X(t) - 8, H - 6);
  for (const [t, label] of marks) {
    ctx.strokeStyle = '#d8e3ea'; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(X(t), T); ctx.lineTo(X(t), H - B); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#d8e3ea'; ctx.fillText(label, X(t) + 3, T + 10);
  }
  if (threshold != null) { ctx.strokeStyle = '#e5605a'; ctx.setLineDash([6, 3]); ctx.beginPath(); ctx.moveTo(L, Y(threshold)); ctx.lineTo(W - R, Y(threshold)); ctx.stroke(); ctx.setLineDash([]); }
  for (const ln of lines) {
    ctx.strokeStyle = ln.color; ctx.lineWidth = 2; ctx.beginPath();
    for (let t = 0; t <= tMax; t += tMax / 200) { const v = ln.f(t); t === 0 ? ctx.moveTo(X(t), Y(v)) : ctx.lineTo(X(t), Y(Math.min(v, yMax))); }
    ctx.stroke(); ctx.lineWidth = 1;
  }
  if (points) {
    ctx.fillStyle = '#f2c14e';
    for (const [t, v] of points) { ctx.beginPath(); ctx.arc(X(t), Y(Math.min(yMax, Math.max(0, v))), 3, 0, 7); ctx.fill(); }
  }
}

