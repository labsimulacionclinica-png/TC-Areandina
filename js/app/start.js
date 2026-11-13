// Módulo «start» de OpenTC Sim (antes parte de main.js).
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
import { S, ask, goto, lastReport, log, newExam, offY, renderNav, setLastReport, step } from './core.js';
import { renderPatient } from './patient.js';
import { renderLaser, renderRoomControls, syncRoom } from './roomstep.js';
import { acquireTopogram, drawCurves, drawTopo, renderParams, renderRangeInputs, renderTopoControls } from './planning.js';
import { runScan } from './acquisition.js';
import { generateRandomCase, RANDOM_TEMPLATES, newRandomKey } from '../randomcase.js';
import { setRandomGenerator } from '../cases.js';

setRandomGenerator(generateRandomCase);

// ---------------------------------------------------------------------------
// Casos de artefactos
// ---------------------------------------------------------------------------

// Examen con el paciente ya preparado, centrado y con el protocolo cargado (artefactos y procedimientos)
export async function readyExam({ caseKey, protocolKey, mode, student, classCode, title, weight, setup, range, seriesName, logText }) {
  newExam(caseKey, mode, student, classCode);
  const c = weight ? { ...S.caseDef, patient: { ...S.caseDef.patient, weight } } : S.caseDef;
  S.caseDef = c;
  $('patientStrip').innerHTML = `<b>${escapeHtml(c.patient.name)}</b> · ${c.patient.age} años · ${c.patient.weight} kg · ${escapeHtml(title)}`;
  Object.assign(S.prep, { idAsked: true, idChecked: true, labsReviewed: true, pregnancyChecked: true, consent: true, contrastDecision: 'no', companion: 'fuera', removed: new Set(c.items) });
  const pr = PROTOCOLS[protocolKey];
  Object.assign(S.position, { orientation: 'head', arms: c.expected.armsDown ? 'down' : 'up', headHolder: c.region === 'head', strap: c.region === 'head', lasers: true, tableH: -S.position.baseOff, zero: LANDMARKS[pr.landmark].z, landmark: pr.landmark, atIso: true });
  S.protocolKey = protocolKey;
  S.params = { ...pr.params, sfov: pr.sfov };
  S.region = pr.region;
  S.plan = [{ name: seriesName, phase: 'simple' }];
  setup?.(S);
  renderPatient();
  $('chkId').disabled = false; $('chkId').checked = true;
  for (const cb of $('metalList').querySelectorAll('input')) cb.checked = true;
  renderRoomControls();
  Object.assign($('chkHolder'), { checked: S.position.headHolder });
  Object.assign($('chkStrap'), { checked: S.position.strap });
  Object.assign($('chkLasers'), { checked: true });
  Object.assign($('chkBreath'), { checked: S.breathInstr });
  $('rngHeight').value = S.position.tableH;
  $('selLandmark').value = pr.landmark;
  $('zeroState').textContent = `Cero en: ${LANDMARKS[pr.landmark].label}.`;
  renderLaser(); syncRoom();
  $('selProtocol').value = protocolKey;
  renderParams(); renderTopoControls();
  log(logText, 'warn');
  goto('adquisicion');
  await acquireTopogram(pr.topo.view, pr.topo.start, pr.topo.length);
  S.range = [...(range || c.expected.coverage)];
  renderRangeInputs(); drawTopo();
  await runScan();
  renderNav();
}

export async function newArtifactExam(key, mode, student, classCode) {
  const a = artifactByKey(key);
  await readyExam({ caseKey: a.baseCase, protocolKey: a.protocol, mode, student, classCode, title: a.title, weight: a.weight, seriesName: 'Original', logText: `Caso de artefacto: ${a.title}`, setup: (st) => { st.artifact = a; a.setup(st); } });
  S.originalSeries = S.series[0];
  S.plan[0].name = 'Repetición';
  await ask('Serie con artefacto', `<p>${escapeHtml(a.brief)}</p><ol><li>Revise las imágenes (también en coronal y sagital).</li><li>Corrija la causa: sala, protocolo o reconstrucción desde los datos brutos.</li><li>Repita la adquisición solo si hace falta.</li><li>En «Finalizar», identifique el artefacto.</li></ol>`, [['Empezar', 0, true]]);
}

// ---------------------------------------------------------------------------
// Tutorial
// ---------------------------------------------------------------------------

export let tour = null;
export function startTour() {
  if ($('startDlg').open) $('startDlg').close();
  tour?.stop();
  setLastReport(null);
  newExam('craneo-hic', 'practica', $('studentName').value.trim() || 'Tutorial', null);
  tour = new Tour(tourSteps({ S: () => S, step: () => step, offY, lastReport: () => (lastReport?.caseKey === 'craneo-hic' ? lastReport : null) }));
  tour.start();
}
$('btnTour').onclick = startTour;
$('btnStartTour').onclick = startTour;

// ---------------------------------------------------------------------------
// Diálogo inicial
// ---------------------------------------------------------------------------

export let startMode = 'practica';
export function openStart() {
  $('caseList').innerHTML = allCases().filter((c) => !c.procedure).map((c, i) => `<label class="case"><input type="radio" name="case" value="${c.key}" ${i === 0 ? 'checked' : ''}><span><b>${escapeHtml(c.title)}</b>${c.custom ? ' <span class="badge">caso del docente</span>' : ''}<br><span class="muted">${escapeHtml(c.order)}</span></span></label>`).join('');
  $('randomList').innerHTML = Object.entries(RANDOM_TEMPLATES).map(([k, t]) => `<label class="case"><input type="radio" name="case" value="rand-${k}"><span><b>${escapeHtml(t.label)}</b></span></label>`).join('');
  $('artifactList').innerHTML = ARTIFACT_CASES.map((a) => `<label class="case"><input type="radio" name="case" value="${a.key}"><span><b>${escapeHtml(a.title)}</b><br><span class="muted">${escapeHtml(a.brief)}</span></span></label>`).join('');
  const hist = loadHistory();
  $('history').innerHTML = hist.length ? hist.slice(0, 8).map((r, i) => `<li><span>${new Date(r.date).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })} · ${escapeHtml(r.student)} · ${escapeHtml(r.case)}</span><b>${r.percent} %</b><button data-h="${i}">Ver</button></li>`).join('') : '<li class="muted">Sin intentos todavía.</li>';
  for (const b of $('history').querySelectorAll('button')) b.onclick = () => { setLastReport(hist[+b.dataset.h]); $('reportBody').innerHTML = reportHtml(lastReport); $('reportDlg').showModal(); };
  $('startDlg').showModal();
}
for (const b of $('segMode').querySelectorAll('button')) b.onclick = () => { startMode = b.dataset.v; for (const x of $('segMode').querySelectorAll('button')) x.classList.toggle('active', x === b); };
$('btnStart').onclick = async () => {
  let key = document.querySelector('input[name=case]:checked')?.value;
  if (/^rand-\w+$/.test(key)) key = newRandomKey(key.slice(5)); // nueva semilla
  const code = $('classCode').value.trim().toUpperCase();
  if (code) {
    try {
      const res = await fetch(`api/classes/${encodeURIComponent(code)}`);
      if (!res.ok) throw new Error();
      $('classMsg').textContent = '';
    } catch {
      $('classMsg').textContent = 'No se encontró esa clase en el servidor. Deje el campo vacío para practicar sin enviar resultados.';
      return;
    }
  }
  $('startDlg').close();
  launchCase(key, startMode, $('studentName').value.trim() || 'Sin nombre', code || null);
};

// Abre cualquier tipo de caso (clínico, aleatorio, artefacto o procedimiento). Lo usan también el ECOE y el turno.
export async function launchCase(key, mode, student, classCode = null) {
  if (/^rand-\w+$/.test(key)) key = newRandomKey(key.slice(5));
  try {
    if (key === 'proc-biopsia') await (await import('./biopsystep.js')).startBiopsy(mode, student, classCode);
    else if (artifactByKey(key)) await newArtifactExam(key, mode, student, classCode);
    else newExam(key, mode, student, classCode);
  } catch (err) { console.error(err); log(`Error: ${err.message}`, 'err'); }
}
$('btnNew').onclick = openStart;
$('importCases').onchange = async (e) => {
  try {
    const data = JSON.parse(await e.target.files[0].text());
    const incoming = (Array.isArray(data) ? data : [data]).filter((d) => d?.key && d.patient && d.question && Array.isArray(d.lesions));
    const list = loadCustomCases();
    for (const d of incoming) { const i = list.findIndex((x) => x.key === d.key); if (i >= 0) list[i] = d; else list.push(d); }
    saveCustomCases(list);
    $('classMsg').textContent = `${incoming.length} caso(s) del docente importado(s).`;
    openStart();
  } catch { $('classMsg').textContent = 'El archivo no contiene casos válidos.'; }
  e.target.value = '';
};

// Enlaces directos: index.html?case=clave&mode=evaluacion&student=Nombre&class=ABC234 (útil desde Moodle)
export const params = new URLSearchParams(location.search);
export function startFromUrl() {
  const key = params.get('case');
  if (!key) return false;
  const mode = params.get('mode') === 'evaluacion' ? 'evaluacion' : 'practica';
  const student = params.get('student') || lms.studentName() || 'Sin nombre';
  if (key === 'proc-biopsia') { import('./biopsystep.js').then((m) => m.startBiopsy(mode, student, params.get('class'))); return true; }
  if (artifactByKey(key)) { newArtifactExam(key, mode, student, params.get('class')); return true; }
  if (!caseByKey(key)) return false;
  newExam(key, mode, student, params.get('class'));
  return true;
}

// Arranque: lo llama main.js cuando todos los módulos ya están inicializados
export function boot() {
  window.addEventListener('resize', () => { if (step === 'contraste') drawCurves(); });
  if ('serviceWorker' in navigator && !lms.active && location.protocol !== 'file:' && !location.hostname.match(/^(localhost|127\.)/)) navigator.serviceWorker.register('sw.js').catch(() => {});
  renderNav();
  if (hooks.bootOverride?.()) return;
  if (!startFromUrl()) openStart();
}

