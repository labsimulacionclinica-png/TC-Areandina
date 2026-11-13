// Módulo «core» de OpenTC Sim (antes parte de main.js).
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
import { $, pool, fmt, STEPS, viewer, hooks, emit } from './base.js';
import { xapi } from '../xapi.js';
import { renderPatient } from './patient.js';
import { initRoom, renderRoomControls } from './roomstep.js';
import { drawTopo, renderInjector, renderMetrics, renderParams, renderProtocolSelect, renderTopoControls } from './planning.js';
import { renderPreflight, updateDose } from './acquisition.js';
import { renderOverlay, renderSeriesTabs } from './viewerstep.js';
import { renderFinal } from './finish.js';
import { params } from './start.js';



export let S = null;        // estado del examen
export let step = 'paciente';
export let lastReport = null;
export function setLastReport(r) { lastReport = r; }

// ---------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------

export function practice() { return S?.mode === 'practica'; }

export function newExam(caseKey, mode, student, classCode) {
  const c = caseByKey(caseKey);
  const rnd = mulberry32(Date.now() & 0xffff);
  S = {
    caseDef: c, mode, student, classCode, startTime: Date.now(),
    prep: { idAsked: false, idChecked: false, labsReviewed: false, pregnancyChecked: false, consent: false, contrastDecision: null, catheter: 'none', removed: new Set(), companion: 'dentro' },
    position: { orientation: 'head', arms: 'down', headHolder: false, strap: false, lasers: false, tableH: 0, baseOff: -(30 + Math.round(rnd() * 30)), zero: null, landmark: null, atIso: false, shields: new Set() },
    breathInstr: true,
    protocolKey: null, params: null, plan: [], injector: { volume: 80, flow: 3, conc: 350, saline: 30 },
    topos: [], topoIndex: 0, range: null,
    series: [], injected: false, adverse: false, extraSeries: 0,
    dose: { events: [], dlp: 0 },
    answer: null, dispatch: { sent: false, hydration: false, observation: false },
    visited: new Set(['paciente']),
    hr: c.patient.hr || null, betaBlocker: false,
  };
  $('log').innerHTML = '';
  $('biopsyPanel').hidden = true;
  viewer.annotations = null; viewer.pick = null;
  $('scanLog').innerHTML = '';
  viewer.setSeries(null);
  log(`Caso: ${c.title}`, 'ok');
  xapi.record(student, 'launched', { id: `case/${c.key}`, name: c.title }, { context: { extensions: { [`https://opentc-sim.local/xapi/mode`]: mode } } });
  emit('exam', S);
  $('modeBadge').hidden = false;
  $('modeBadge').textContent = mode === 'evaluacion' ? 'EVALUACIÓN' : 'PRÁCTICA';
  $('patientStrip').innerHTML = `<b>${escapeHtml(c.patient.name)}</b> · ${c.patient.age} años · ${c.patient.weight} kg · ${escapeHtml(c.title)}`;
  renderPatient();
  renderRoomControls();
  renderTopoControls();
  renderProtocolSelect();
  renderParams();
  renderInjector();
  renderSeriesTabs();
  renderFinal();
  updateDose();
  goto('paciente');
}

export function offY() { return S.position.baseOff + S.position.tableH; }

// ---------------------------------------------------------------------------
// Navegación y guía
// ---------------------------------------------------------------------------

export function stepDone(k) {
  if (!S) return false;
  switch (k) {
    case 'paciente': return S.prep.idChecked && !!S.prep.contrastDecision;
    case 'sala': return S.position.zero != null && S.position.atIso;
    case 'topograma': return S.topos.length > 0 && !!S.range;
    case 'protocolo': return !!S.params;
    case 'contraste': return S.plan.every((p) => p.phase === 'simple') || S.prep.contrastDecision !== 'apto' || S.visited.has('contraste');
    case 'adquisicion': return S.series.length > 0;
    case 'visor': return S.visited.has('visor') && S.series.length > 0;
    case 'finalizar': return !!lastReport && lastReport.caseKey === S.caseDef.key;
    default: return false;
  }
}

export function renderNav() {
  $('stepsNav').innerHTML = STEPS.map((s, i) => `<button data-step="${s.key}" class="${s.key === step ? 'active' : ''} ${stepDone(s.key) ? 'done' : ''}" ${s.key === step ? 'aria-current="step"' : ''} aria-label="Paso ${i + 1}: ${s.label}${stepDone(s.key) ? ' (completo)' : ''}"><span class="n">${i + 1}</span>${s.label}</button>`).join('');
  for (const b of $('stepsNav').querySelectorAll('button')) b.onclick = () => goto(b.dataset.step);
}

export function goto(k) {
  if (!S) return;
  step = k;
  if (!S.visited.has(k)) xapi.record(S.student, 'progressed', { id: `case/${S.caseDef.key}/step/${k}`, name: `Paso ${k}` });
  S.visited.add(k);
  emit('step', k);
  for (const sec of document.querySelectorAll('.step')) sec.classList.toggle('active', sec.dataset.step === k);
  if (k === 'sala') initRoom();
  if (k === 'topograma') drawTopo();
  if (k === 'protocolo') renderMetrics();
  if (k === 'contraste') renderInjector();
  if (k === 'adquisicion') renderPreflight();
  if (k === 'visor') { renderSeriesTabs(); viewer.draw(); }
  if (k === 'finalizar') renderFinal();
  renderNav();
  renderGuide();
}

export function renderGuide() {
  if (!S) return;
  const c = S.caseDef, e = c.expected, p = c.patient;
  $('guideMode').textContent = practice() ? 'práctica: con pistas' : 'evaluación: sin pistas';
  const tips = [];
  const L = [];
  const ok = (cond, text) => L.push(`<li class="${cond ? 'ok' : ''}">${text}</li>`);
  switch (step) {
    case 'paciente':
      ok(S.prep.idChecked, 'Verifique dos identificadores (nombre y fecha de nacimiento).');
      ok(S.prep.labsReviewed, 'Revise función renal, alergias, metformina y embarazo.');
      ok(!!S.prep.contrastDecision, 'Registre la decisión sobre el contraste.');
      ok(S.prep.removed.size > 0, 'Retire los objetos metálicos de la zona a explorar.');
      ok(S.prep.companion !== 'dentro', 'Decida dónde queda el acompañante.');
      if (practice()) {
        if (c.contrast === 'contraindicado' && S.prep.labsReviewed) tips.push(['warn', 'FG < 30 mL/min/1,73 m² y reacción alérgica previa moderada-grave: el técnico no inyecta, consulta al radiólogo.']);
        if (c.contrast === 'si') tips.push(['', `Para ${e.maxFlow >= 5 ? 'caudales de 4–5 mL/s' : 'este estudio'} hace falta un catéter de 20G o mayor en la fosa antecubital.`]);
        if (c.contrast === 'no') tips.push(['', 'La orden es de un estudio simple: no se canaliza vía para contraste.']);
        if (p.sex === 'F' && p.age < 50) tips.push(['', 'Mujer en edad fértil: confirme la prueba de embarazo antes de irradiar.']);
      }
      break;
    case 'sala':
      ok(S.position.orientation === 'head', 'Paciente en decúbito supino, cabeza primero.');
      ok(e.armsDown ? S.position.arms === 'down' : S.position.arms === 'up', 'Brazos fuera del campo.');
      ok(Math.abs(offY()) <= 15, 'Centre la altura de la mesa con el láser coronal en la línea medioaxilar.');
      ok(S.position.zero != null, 'Marque el cero en el punto de referencia anatómico.');
      ok(S.position.atIso, 'Lleve al paciente al isocentro.');
      if (practice()) {
        tips.push(['', c.positionTip || (c.region === 'head' ?'Cráneo: brazos a los lados, cabeza en el soporte, cero en la línea orbitomeatal (nasion).' : c.region === 'chest' ? 'Tórax: brazos sobre la cabeza, cero en la escotadura esternal.' : 'Abdomen: brazos sobre la cabeza, cero en el apéndice xifoides.')]);
        if (!p.cooperative) tips.push(['warn', 'Paciente agitado: use soporte y cinta de sujeción para evitar el movimiento.']);
        if (p.breathHold && p.breathHold < 15) tips.push(['warn', `El paciente solo tolera una apnea de ~${p.breathHold} s.`]);
      }
      break;
    case 'topograma':
      ok(S.topos.length > 0, 'Adquiera el topograma.');
      ok(!!S.range, 'Planifique el rango sobre el topograma.');
      if (practice()) tips.push(['', `Debe cubrir: ${coverageText(e.coverage)}. Evite explorar de más: cada centímetro suma dosis.`]);
      break;
    case 'protocolo':
      ok(!!S.params, 'Cargue un protocolo y ajústelo.');
      if (practice()) {
        tips.push(['', `Protocolo sugerido: ${PROTOCOLS[e.protocolKey].label}. Nivel de referencia de dosis: CTDIvol ≤ ${DRL[e.drl]} mGy.`]);
        tips.push(['', 'Menos kV realza más el yodo (útil en angio) pero aumenta el ruido; el pitch alto acorta la apnea; el ATCM ajusta los mAs a cada nivel del paciente.']);
      }
      break;
    case 'contraste':
      if (practice()) tips.push(['', 'El realce depende del caudal de yodo (mL/s × mgI/mL), de la duración de la inyección y del peso. El bolo de suero empuja el contraste que queda en la vía.']);
      break;
    case 'adquisicion':
      if (practice()) tips.push(['', 'Con seguimiento del bolo, coloque la ROI dentro del vaso de referencia. Si la pone fuera, el disparo llegará tarde o no llegará.']);
      break;
    case 'visor':
      L.push('<li>Rueda: cortes. Arrastrar: ventana/nivel. Herramienta ROI: media y DE en HU.</li>');
      if (practice()) tips.push(['', 'Mida el ruido (DE) en una ROI homogénea y el realce en los vasos. Revise las reconstrucciones coronal y sagital.']);
      break;
    case 'finalizar':
      ok(S.answer != null, 'Responda la pregunta sobre las imágenes.');
      ok(S.dispatch.sent, 'Envíe las imágenes al PACS.');
      break;
  }
  $('guide').innerHTML = `<ul>${L.join('')}</ul>${tips.map(([cls, t]) => `<div class="tip ${cls}">${t}</div>`).join('')}`;
}

export const coverageText = ([a, b]) => `de z ≈ ${a} a ${b} mm del paciente (${((b - a) / 10).toFixed(0)} cm)`;

export function log(text, cls = '') {
  const li = document.createElement('li');
  li.className = cls;
  const t = S ? Math.round((Date.now() - S.startTime) / 1000) : 0;
  li.innerHTML = `<time>${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}</time>${escapeHtml(text)}`;
  $('log').prepend(li);
}

export function ask(title, html, buttons, danger = false) {
  return new Promise((resolve) => {
    const d = $('alertDlg');
    d.classList.toggle('danger', danger);
    $('alertTitle').textContent = title;
    $('alertBody').innerHTML = html;
    $('alertBtns').innerHTML = '';
    buttons.forEach(([label, value, primary]) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (primary) b.className = 'primary';
      b.onclick = () => { d.close(); resolve(value); };
      $('alertBtns').append(b);
    });
    d.showModal();
  });
}

export function bindSeg(id, get, set) {
  const el = $(id);
  const paint = () => { for (const b of el.querySelectorAll('button')) b.classList.toggle('active', b.dataset.v === String(get())); };
  for (const b of el.querySelectorAll('button')) b.onclick = () => { set(b.dataset.v); paint(); renderNav(); renderGuide(); };
  paint();
  return paint;
}

