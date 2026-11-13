// Módulo «viewerstep» de OpenTC Sim (antes parte de main.js).
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
import { S, ask, log, offY } from './core.js';
import { fmtTable } from './planning.js';
import { gatedStart } from './acquisition.js';
import { params } from './start.js';

// ---------------------------------------------------------------------------
// 7. Visor
// ---------------------------------------------------------------------------

export function renderSeriesTabs(sel) {
  const list = S?.series || [];
  if (sel) viewer.setSeries(sel);
  $('seriesTabs').innerHTML = list.map((s, i) => `<button data-i="${i}" class="${viewer.series === s ? 'active' : ''}">${s.recon ? `↻ ${escapeHtml(s.name)}` : `${escapeHtml(s.name)} · ${String(s.params.thickness).replace('.', ',')} mm`}</button>`).join('');
  for (const b of $('seriesTabs').querySelectorAll('button')) b.onclick = () => { const s = list[+b.dataset.i]; viewer.setSeries(s); windowFor(s); renderSeriesTabs(); };
  $('viewEmpty').hidden = list.length > 0;
  if (viewer.series && sel) windowFor(sel);
  syncReconPanel();
}

export function syncReconPanel() {
  const s = viewer.series;
  $('reconPanel').hidden = !s;
  if (!s) return;
  $('rcKernel').innerHTML = Object.entries(KERNELS).map(([k, v]) => `<option value="${k}" ${k === s.params.kernel ? 'selected' : ''}>${v.label}</option>`).join('');
  $('rcThk').value = String(s.params.thickness);
  $('rcDfov').value = s.params.dfov;
  $('rcIr').value = String(s.params.iterative || 0);
  $('rcMar').checked = !!s.params.metalReduction;
  const src = s.deSource || s;
  $('deLbl').hidden = !src.de;
  if (src.de && !$('deOut').options.length) $('deOut').innerHTML = DE_OUTPUTS.map((o) => `<option value="${o.value}">${o.label}</option>`).join('');
  $('reconPanel').querySelector('.recon-row').style.opacity = s.derived ? 0.5 : 1;
  const gated = s.params.ecg === 'prospectivo' || s.params.ecg === 'retrospectivo';
  $('rcPhaseLbl').hidden = !gated;
  if (gated) $('rcPhase').value = String(s.params.phase);
}

export function windowFor(s) {
  if (s.mapWindow) { viewer.setWindow(s.mapWindow.ww, s.mapWindow.wl); for (const b of $('segWindow').querySelectorAll('button')) b.classList.remove('active'); }
  else applyWindow(s.params.window || 'soft');
}

export function applyWindow(k) {
  const w = WINDOWS[k];
  viewer.setWindow(w.ww, w.wl);
  for (const b of $('segWindow').querySelectorAll('button')) b.classList.toggle('active', b.dataset.v === k);
}

$('segWindow').innerHTML = Object.entries(WINDOWS).map(([k, w]) => `<button data-v="${k}">${w.label}</button>`).join('');
for (const b of $('segWindow').querySelectorAll('button')) b.onclick = () => applyWindow(b.dataset.v);
for (const b of $('segView').querySelectorAll('button')) b.onclick = () => {
  if (b.dataset.v === 'curved' && (viewer.curve?.length || 0) < 2) {
    log('Para la reconstrucción curva marque al menos 2 puntos con la herramienta «Trayecto» en la vista axial', 'warn');
    return;
  }
  viewer.setView(b.dataset.v);
  for (const x of $('segView').querySelectorAll('button')) x.classList.toggle('active', x === b);
};
$('btnClearCurve').onclick = () => { viewer.curve = []; viewer.draw(); };

// Puntuación de calcio de Agatston en la serie visible
$('btnCalcium').onclick = async () => {
  const s = viewer.series;
  if (!s || s.slices.some((x) => !x)) return;
  const { agatston } = await import('../calcium.js');
  const warn = [];
  if (s.phase !== 'simple') warn.push('La serie tiene contraste: el yodo de las cavidades y las coronarias se cuenta como calcio. El método se aplica sobre una serie SIN contraste.');
  if (Math.abs(s.params.thickness - 3) > 0.01) warn.push(`El método de Agatston está definido para cortes de 3 mm (esta serie: ${s.params.thickness} mm); la puntuación se escala, pero no es comparable con la estándar.`);
  if (s.params.kv !== 120) warn.push(`El umbral de 130 HU está definido a 120 kV (esta serie: ${s.params.kv} kV).`);
  const r = agatston(s, { offY: s.acq?.offY || 0 });
  const rows = r.lesions.map((l) => `<tr><td>${fmtTable(l.z)} mm</td><td>${fmt(l.area, 1)} mm²</td><td>${Math.round(l.peak)} HU</td><td>×${l.factor}</td><td>${fmt(l.score, 1)}</td></tr>`).join('');
  log(`Agatston: ${fmt(r.total)} (${r.category.label})`, 'ok');
  await ask('Puntuación de calcio (Agatston)', `
    <p class="score ${r.total > 100 ? 'warn' : 'ok'}" style="font-size:32px;margin:4px 0">${fmt(r.total)}</p>
    <p><b>${r.category.label}</b> · riesgo ${r.category.risk}</p>
    ${warn.map((w) => `<p class="warnline">${escapeHtml(w)}</p>`).join('')}
    ${r.lesions.length ? `<table class="rubric"><thead><tr><th>Corte</th><th>Área</th><th>Pico</th><th>Factor</th><th>Puntos</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">No hay lesiones ≥ 130 HU y ≥ 1 mm² en la región cardíaca.</p>'}
    <p class="small">Cada lesión: área × factor según su píxel más denso (130–199 → 1, 200–299 → 2, 300–399 → 3, ≥ 400 → 4), sumado en todos los cortes.</p>`, [['Cerrar', 0, true]]);
};
viewer.onCurve = (n) => { if (n === 2) log('Trayecto con 2 puntos: ya puede abrir la vista «Curva» (añada más puntos para seguir el vaso)', 'ok'); };
$('segView').querySelector('button').classList.add('active');
for (const b of $('segTool').querySelectorAll('button')) b.onclick = () => { viewer.tool = b.dataset.v; for (const x of $('segTool').querySelectorAll('button')) x.classList.toggle('active', x === b); };
$('segTool').querySelector('button').classList.add('active');
viewer.onWindowChange = () => { for (const b of $('segWindow').querySelectorAll('button')) b.classList.remove('active'); };
$('rngSlice').oninput = (e) => {
  if (viewer.view === 'axial') viewer.index = +e.target.value; else viewer.mprRow = +e.target.value;
  viewer.roi = null; viewer.line = null; viewer.draw();
};
$('selSlab').onchange = (e) => { viewer.slab = +e.target.value; viewer.draw(); };
// Paleta de los mapas de color (viridis es apta para daltonismo); se recuerda en este navegador
try { Viewer.palette = localStorage.getItem('opentc-palette') || 'rainbow'; } catch { Viewer.palette = 'rainbow'; }
$('selPalette').value = Viewer.palette;
$('selPalette').onchange = (e) => { Viewer.palette = e.target.value; try { localStorage.setItem('opentc-palette', e.target.value); } catch { /* sin almacenamiento */ } viewer.draw(); };

hooks.renderOverlay = (info) => renderOverlay(info);
export function renderOverlay(info) {
  const s = viewer.series;
  if (!info || !s) { for (const id of ['ovTL', 'ovTR', 'ovBL', 'ovBR']) $(id).textContent = ''; return; }
  const p = s.params;
  $('ovTL').textContent = `${S.caseDef.patient.name}\n${s.name}\n${p.kv} kV · ${Math.round(s.dose.avgMas)} mAs ef. · pitch ${p.pitch}`;
  $('ovTR').textContent = (info.view === 'axial' ? (s.frameTimes ? `Tiempo ${info.index + 1}/${info.n}\nt = ${fmt(s.frameTimes[info.index], 1)} s · mesa ${fmtTable(info.z)} mm` : `Corte ${info.index + 1}/${info.n}\nMesa ${fmtTable(info.z)} mm`) : `${{ coronal: 'Coronal', sagittal: 'Sagital', oblique: `Oblicua ${Math.round(viewer.oblique?.angle ?? 30)}°`, curved: `Curva enderezada (${viewer.curve?.length || 0} puntos)`, mip3d: '3D · MIP', vr3d: '3D · volumen' }[info.view]}\n${info.n} cortes`) + (viewer.slab ? `\nMIP ${viewer.slab} mm` : '');
  $('ovBL').textContent = `${p.thickness} mm · ${KERNELS[p.kernel].label}${p.iterative ? ` · IR ${p.iterative} %` : ''}${p.metalReduction ? ' · MAR' : ''}\nDFOV ${p.dfov} mm · CTDIvol ${fmt(s.dose.ctdi, 1)} mGy`;
  $('ovBR').textContent = `V ${Math.round(info.ww)} / N ${Math.round(info.wl)}${info.hover ? `\n${s.unit ? `= ${fmt(info.hover.hu / (s.unitScale || 1), 1)} ${s.unit.replace(/ ×10/, '')}` : `= ${info.hover.hu} HU`}` : ''}`;
  const r = $('rngSlice');
  r.max = info.view === 'axial' ? info.n - 1 : 255;
  r.value = info.view === 'axial' ? info.index : viewer.mprRow;
}

// Reconstrucción desde los datos brutos: mismo ruido de adquisición, sin dosis adicional
$('btnRecon').onclick = async () => {
  const base = viewer.series;
  if (!base?.acq) return;
  const src = base.recon ? base.source : base;
  const p = { ...src.params, kernel: $('rcKernel').value, thickness: +$('rcThk').value, dfov: Math.max(150, Math.min(500, +$('rcDfov').value)), iterative: +$('rcIr').value, metalReduction: $('rcMar').checked, algorithm: $('rcAlg').value };
  const minT = COLLIMATIONS[p.coll].minThk;
  if (p.thickness < minT) { $('rcMsg').textContent = `Con ${COLLIMATIONS[p.coll].label} el grosor mínimo es ${minT} mm.`; return; }
  if (p.dfov > SCANNER.sfov[p.sfov]) { $('rcMsg').textContent = `El DFOV no puede superar el campo de medida (${SCANNER.sfov[p.sfov]} mm).`; return; }
  const a = src.acq, zs = [];
  // Fase cardíaca: la retrospectiva tiene datos de todo el ciclo; la prospectiva solo de un margen de ±5 %
  if (src.params.ecg === 'prospectivo' || src.params.ecg === 'retrospectivo') {
    p.phase = +$('rcPhase').value;
    if (src.params.ecg === 'prospectivo' && Math.abs(p.phase - src.params.phase) > 5) { $('rcMsg').textContent = `En prospectiva solo hay datos alrededor del ${src.params.phase} % (±5 %). Para elegir cualquier fase hace falta la retrospectiva.`; return; }
  }
  for (let z = a.z0; z <= a.z1 + 1e-6; z += p.thickness) zs.push(z);
  const times = zs.map((z) => gatedStart(a.startT + (z - a.z0) / a.speed, { ...a.p, phase: p.phase }, p.phase));
  const short = KERNELS[p.kernel].label.replace(/ \(.*\)/, '');
  const series = {
    name: `${src.name} · ${short} ${String(p.thickness).replace('.', ',')} mm${p.iterative ? ` · IR ${p.iterative} %` : ''}${p.metalReduction && !src.params.metalReduction ? ' · MAR' : ''}${p.phase !== src.params.phase ? ` · fase ${p.phase} %` : ''}${p.algorithm === 'sart' ? ' · SART' : ''}`,
    phase: src.phase, params: p, zs, interval: p.thickness, dfov: p.dfov, slices: new Array(zs.length).fill(null),
    dose: src.dose, times, startT: a.startT, recon: true, source: src, acq: a, position: src.position, measured: src.measured,
  };
  S.series.push(series);
  renderSeriesTabs(series);
  applyWindow(p.kernel === 'lung' ? 'lung' : p.kernel === 'bone' ? 'bone' : src.params.window || 'soft');
  $('btnRecon').disabled = true;
  let done = 0;
  await Promise.all(zs.map((z, k) => {
    const t = times[k];
    return pool.slice({
      anatomyId: a.anatomyId, kv: p.kv, z, thickness: p.thickness, enh: a.enhAt ? a.enhAt(t) : {}, mas: a.masAt(z), kernel: p.kernel,
      sfov: p.sfov, dfov: p.dfov, offX: 0, offY: a.offY, motion: a.motionFor(t), t, rot: p.rot, seed: a.seedBase + Math.round(z * 7) + 1, metalReduction: p.metalReduction, iterative: p.iterative, tilt: p.tilt || 0, algorithm: p.algorithm, ...(a.raw || {}),
    }).then((img) => {
      series.slices[k] = img;
      done++;
      $('rcMsg').textContent = `Reconstruyendo ${done}/${zs.length}…`;
      if (done % 8 === 0 && viewer.series === series) viewer.draw();
    });
  }));
  $('btnRecon').disabled = false;
  $('rcMsg').textContent = 'Listo: sin dosis adicional.';
  log(`Reconstrucción desde datos brutos: ${series.name}`, 'ok');
  viewer.draw();
};

// Doble energía: imágenes derivadas de los dos juegos (80 y 140 kV) sin nueva adquisición
$('btnDe').onclick = () => {
  const s = viewer.series, src = s?.deSource || s;
  if (!src?.de) return;
  const v = $('deOut').value, out = parseOutput(v), label = DE_OUTPUTS.find((o) => o.value === v).label;
  const ser = {
    ...src, name: `${src.name.replace(/ · VMI 70 keV$/, '')} · ${label}`, slices: dualEnergyImages(src.de, out), deSource: src, recon: true, derived: true, de: null,
    colormap: out.type === 'iodine', mapWindow: out.type === 'iodine' ? { ww: 100, wl: 50 } : null, unit: out.type === 'iodine' ? 'mg/mL ×10' : null, unitScale: out.type === 'iodine' ? 10 : 1,
  };
  S.series.push(ser);
  renderSeriesTabs(ser);
  log(`Doble energía: ${label}`, 'ok');
};

// Exportación DICOM de la serie visible
$('btnDicom').onclick = () => {
  const s = viewer.series;
  if (!s || s.slices.some((x) => !x)) return;
  const { meta, files } = seriesDicom(s, viewer.ww, viewer.wl);
  const url = URL.createObjectURL(zip(files));
  const a = document.createElement('a');
  a.href = url; a.download = `opentc-${S.caseDef.key}-serie${meta.seriesNumber}.zip`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  log(`Serie exportada en DICOM (${files.length} imágenes)`, 'ok');
};

// Objetos DICOM de una serie (los usan la exportación ZIP y el envío al PACS)
export function seriesDicom(s, ww, wl) {
  const pat = S.caseDef.patient;
  S.studyUid ||= uid(); S.frameUid ||= uid();
  s.uid ||= uid();
  const ascii = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const meta = {
    patientName: ascii(pat.name).replace(/ /g, '^'), patientId: ascii(pat.id).replace(/\s/g, ''), birth: pat.dob, sex: pat.sex,
    studyUid: S.studyUid, seriesUid: s.uid, frameUid: S.frameUid, seriesNumber: S.series.indexOf(s) + 1, seriesDesc: ascii(s.name),
    date: new Date(S.startTime), kv: s.params.kv, mas: s.dose.avgMas, kernel: ascii(KERNELS[s.params.kernel].label), thickness: s.params.thickness, dfov: s.dfov, ww, wl,
  };
  const files = s.slices.map((img, i) => ({ name: `OpenTC/S${String(meta.seriesNumber).padStart(2, '0')}/IM${String(i + 1).padStart(4, '0')}.dcm`, data: dicomSlice(img, s.zs[i], i, meta) }));
  return { meta, files };
}

