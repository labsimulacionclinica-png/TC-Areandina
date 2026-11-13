// Módulo «patient» de OpenTC Sim (antes parte de main.js).
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
import { S, bindSeg, log, renderGuide, renderNav } from './core.js';
import { room } from './roomstep.js';
import { renderInjector, renderMetrics } from './planning.js';

// ---------------------------------------------------------------------------
// 1. Paciente
// ---------------------------------------------------------------------------

export function renderPatient() {
  const c = S.caseDef, p = c.patient;
  $('orderCard').innerHTML = `<b>${escapeHtml(c.title)}</b><br>${escapeHtml(c.order)}<br><span class="muted">${escapeHtml(c.history)}</span><br><span class="muted">Paciente: ${escapeHtml(p.name)} · ${escapeHtml(p.id)} · nac. ${p.dob}</span>`;
  $('idCard').hidden = true;
  $('chkId').checked = false; $('chkId').disabled = true;
  $('labsCard').hidden = true;
  $('pregRow').hidden = true;
  $('chkPreg').checked = false;
  $('chkConsent').checked = false;
  $('selCatheter').innerHTML = Object.entries(CATHETERS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  $('selCatheter').value = 'none';
  $('metalList').innerHTML = c.items.map((k) => `<li><label><input type="checkbox" data-item="${k}"> Retirar ${METAL_ITEMS[k].toLowerCase()}</label></li>`).join('');
  for (const cb of $('metalList').querySelectorAll('input')) cb.onchange = () => {
    if (cb.checked) S.prep.removed.add(cb.dataset.item); else S.prep.removed.delete(cb.dataset.item);
    log(`${cb.checked ? 'Retiró' : 'Dejó'}: ${METAL_ITEMS[cb.dataset.item]}`);
    renderGuide();
  };
  bindSeg('segContrast', () => S.prep.contrastDecision, (v) => { S.prep.contrastDecision = v; log(`Decisión sobre el contraste: ${{ apto: 'apto', no: 'no requiere', consultar: 'suspender y consultar' }[v]}`, v === 'consultar' ? 'warn' : ''); });
  bindSeg('segCompanion', () => S.prep.companion, (v) => { S.prep.companion = v; room?.update({ companion: v }); });
}

$('btnAskId').onclick = () => {
  if (!S) return;
  const c = S.caseDef, p = c.patient;
  S.prep.idAsked = true;
  $('idCard').hidden = false;
  $('idCard').innerHTML = `Paciente: «Me llamo ${escapeHtml(p.name)}, nací el ${new Date(p.dob + 'T12:00').toLocaleDateString('es', { dateStyle: 'long' })}».<br>Brazalete: <span class="band">${escapeHtml(c.wristband.name)} · ${c.wristband.dob}</span>`;
  $('chkId').disabled = false;
  log('Preguntó nombre y fecha de nacimiento');
};
$('chkId').onchange = (e) => { S.prep.idChecked = e.target.checked; if (e.target.checked) log('Identidad verificada', 'ok'); renderNav(); renderGuide(); };
$('btnLabs').onclick = () => {
  if (!S) return;
  const p = S.caseDef.patient;
  S.prep.labsReviewed = true;
  const egfrCls = p.egfr < 30 ? 'alert' : p.egfr < 45 ? 'warn' : '';
  const allergyCls = /contraste/i.test(p.allergies) ? 'alert' : '';
  $('labsCard').hidden = false;
  $('labsCard').innerHTML = `Creatinina: <b>${p.creatinine} mg/dL</b> · FG estimado: <b class="${egfrCls}">${p.egfr} mL/min/1,73 m²</b><br>
    Alergias: <span class="${allergyCls}">${escapeHtml(p.allergies)}</span><br>
    Metformina: ${p.metformin ? '<span class="warn">Sí</span>' : 'No'} · Peso: ${p.weight} kg · Talla: ${p.height} cm<br>
    ${p.pregnancy ? `Embarazo: ${escapeHtml(p.pregnancy)}<br>` : ''}
    Capacidad de apnea: ${p.breathHold ? `≈ ${p.breathHold} s` : 'no aplica'} · ${p.cooperative ? 'Colaborador' : '<span class="warn">Poco colaborador / agitado</span>'}
    ${p.hr ? `<br>Frecuencia cardíaca: <b id="hrNow" class="${S.hr > 65 ? 'warn' : ''}">${S.hr} lpm</b> <button id="btnBeta" ${S.betaBlocker ? 'disabled' : ''}>Administrar betabloqueador (metoprolol)</button>` : ''}`;
  $('pregRow').hidden = !(p.sex === 'F' && p.age < 50);
  if ($('btnBeta')) $('btnBeta').onclick = () => {
    S.betaBlocker = true;
    S.hr = 58;
    $('hrNow').textContent = '58 lpm'; $('hrNow').className = '';
    $('btnBeta').disabled = true;
    log('Metoprolol administrado: frecuencia cardíaca 58 lpm', 'ok');
    renderMetrics(); renderGuide();
  };
  log('Revisó historia clínica y laboratorios');
  renderGuide();
};
$('chkPreg').onchange = (e) => { S.prep.pregnancyChecked = e.target.checked; renderGuide(); };
$('chkConsent').onchange = (e) => { S.prep.consent = e.target.checked; };
$('selCatheter').onchange = (e) => { S.prep.catheter = e.target.value; log(`Acceso venoso: ${CATHETERS[e.target.value].label}`); renderInjector(); };

