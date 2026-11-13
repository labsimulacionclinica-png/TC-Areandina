// Módulo «finish» de OpenTC Sim (antes parte de main.js).
import { buildAnatomy, serialize, LANDMARKS, lesion, structureAt, HARD_FACTOR, mulberry32 } from '../phantom.js';
import { COLLIMATIONS, KERNELS, WINDOWS, SCANNER, DRL, K_EFFECTIVE, doseReport, masProfile, dwFromTopogram, expectedNoise, ctdiVol, organDoses, heartDisplacement } from '../ct.js';
import { computeCurves, enhancementAt, CATHETERS, injectionSummary } from '../contrast.js';
import { CASES, caseByKey, allCases, METAL_ITEMS, METAL_Z, loadCustomCases, saveCustomCases } from '../cases.js';
import { PROTOCOLS, PARAM_DEFS } from '../protocols.js';
import { ReconPool } from '../pool.js';
import { Viewer, drawTopogram } from '../viewer.js';
import { evaluate, loadHistory, saveToHistory, exportJson, exportCsv, reportHtml, reportPrintHtml, escapeHtml } from '../evaluation.js';
import { docHeader, docFooter, printDocument } from '../brand.js';
import { ARTIFACT_CASES, ARTIFACT_TYPES, artifactByKey, evaluateArtifact } from '../artifacts.js';
import { dicomSlice, zip, uid } from '../dicom.js';
import { Tour } from '../tour.js';
import { lms } from '../lms.js';
import { tourSteps } from '../tourSteps.js';
import { perfusionMaps, perfusionSummary } from '../perfusion.js';
import { dualEnergyImages, DE_OUTPUTS, parseOutput } from '../dualenergy.js';
import { $, pool, fmt, STEPS, viewer, hooks, emit } from './base.js';
import { xapi } from '../xapi.js';
import { tagsForCase, TOPICS } from '../questions.js';
import { multipartRelated } from '../dicom.js';
import { pacsStatus } from './settings.js';
import { seriesDicom } from './viewerstep.js';
import { S, ask, lastReport, log, offY, renderGuide, renderNav, setLastReport } from './core.js';
import { params } from './start.js';

// ---------------------------------------------------------------------------
// 8. Finalizar
// ---------------------------------------------------------------------------

export function renderFinal() {
  if (!S) return;
  const art = S.artifact;
  const q = art
    ? { text: '¿Qué artefacto tiene la serie «Original»?', options: Object.values(ARTIFACT_TYPES), keys: Object.keys(ARTIFACT_TYPES) }
    : { ...S.caseDef.question, keys: S.caseDef.question.options.map((_, i) => i) };
  $('qText').textContent = q.text;
  $('qOptions').innerHTML = q.options.map((o, i) => `<label class="case"><input type="radio" name="qa" value="${i}" ${S.answer === q.keys[i] ? 'checked' : ''}><span>${escapeHtml(o)}</span></label>`).join('');
  for (const r of $('qOptions').querySelectorAll('input')) r.onchange = () => { S.answer = q.keys[+r.value]; renderGuide(); };
  $('chkSend').checked = S.dispatch.sent; $('chkHydration').checked = S.dispatch.hydration; $('chkObservation').checked = S.dispatch.observation;
  $('doseTable').innerHTML = `<thead><tr><th>Evento</th><th>CTDIvol</th><th>DLP</th></tr></thead><tbody>${S.dose.events.filter((e) => e.name !== 'Seguimiento').map((e) => `<tr><td>${escapeHtml(e.name)}</td><td>${fmt(e.ctdi, 2)} mGy</td><td>${fmt(e.dlp, 1)} mGy·cm</td></tr>`).join('')}
    ${S.dose.events.some((e) => e.name === 'Seguimiento') ? `<tr><td>Seguimiento del bolo (${S.dose.events.filter((e) => e.name === 'Seguimiento').length} exp.)</td><td></td><td>${fmt(S.dose.events.filter((e) => e.name === 'Seguimiento').reduce((a, e) => a + e.dlp, 0), 1)} mGy·cm</td></tr>` : ''}
    ${S.series.some((s) => s.recon) ? `<tr><td>Reconstrucciones desde datos brutos (${S.series.filter((s) => s.recon).length})</td><td>0</td><td>0 mGy·cm</td></tr>` : ''}</tbody>
    <tfoot><tr><td>Total</td><td></td><td>${fmt(S.dose.dlp, 1)} mGy·cm</td></tr></tfoot>`;
}
// Envío al PACS: real por DICOMweb (STOW-RS, a través del servidor de OpenTC) si está configurado; si no, simulado
$('chkSend').onchange = async (e) => {
  S.dispatch.sent = e.target.checked; renderGuide();
  if (!e.target.checked) return;
  const p = await pacsStatus();
  if (!p.configured) return log('Imágenes enviadas al PACS (simulado)', 'ok');
  const list = S.series.filter((s) => s.slices?.length && s.slices.every(Boolean));
  let stored = 0, failed = 0;
  log(`Enviando ${list.length} serie(s) al PACS ${p.target}…`);
  for (const s of list) {
    const w = s.mapWindow || WINDOWS[s.params.window || 'soft'];
    const { files } = seriesDicom(s, w.ww, w.wl);
    const { body, contentType } = multipartRelated(files.map((f) => f.data));
    try {
      const res = await fetch('api/pacs/stow', { method: 'POST', headers: { 'Content-Type': contentType }, body });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Error ${res.status}`);
      stored += j.stored ?? files.length - (j.failed || 0); failed += j.failed || 0;
    } catch (err) { log(`PACS (${s.name}): ${err.message}`, 'err'); failed += files.length; }
  }
  log(`PACS ${p.target}: ${stored} imágenes guardadas${failed ? `, ${failed} con error` : ''}`, failed ? 'warn' : 'ok');
};
$('chkHydration').onchange = (e) => { S.dispatch.hydration = e.target.checked; };
$('chkObservation').onchange = (e) => { S.dispatch.observation = e.target.checked; };

$('btnFinish').onclick = async () => {
  if (!S) return;
  if (S.answer == null) return ask('Falta la lectura', '<p>Responda la pregunta sobre las imágenes.</p>', [['Entendido', 0, true]]);
  let r;
  if (S.artifact) r = evaluateArtifact(S, S.answer);
  else if (S.biopsy) r = (await import('../biopsy.js')).evaluateBiopsy(S, S.answer);
  else {
    const acquired = S.series.filter((s) => !s.recon);
    const main = acquired.slice(-Math.max(1, S.plan.length));
    const rec = {
      caseDef: S.caseDef, student: S.student, startTime: S.startTime, prep: S.prep, position: { ...S.position, offY: offY() },
      range: acquired.length ? S.range : null, params: acquired[0]?.params, paramsList: S.series.map((s) => s.params), injected: S.injected, injector: S.injectorUsed || S.injector,
      catheterMax: CATHETERS[S.prep.catheter].maxFlow, series: main, maxCtdi: Math.max(0, ...acquired.map((s) => s.dose.ctdi)), totalDlp: S.dose.dlp,
      topograms: S.topos.length, extraSeries: S.extraSeries, answer: S.answer, dispatch: S.dispatch,
      hrAtScan: S.hrAtScan, event: S.event, perfusion: S.perfusion, topoMaxZ: Math.max(0, ...S.topos.map((x) => x.z1)),
      organs: acquired[0] ? organDoses(acquired[0].params, S.range[0], S.range[1], acquired[0].dose.ctdi, { sex: S.caseDef.patient.sex, shields: acquired[0].position?.shields || new Set() }) : null,
    };
    r = evaluate(rec);
  }
  r.mode = S.mode;
  r.totalDlp = +S.dose.dlp.toFixed(1);
  setLastReport(r);
  xapi.record(r.student, 'answered', { id: `case/${r.caseKey}/question`, name: 'Lectura de las imágenes' }, { result: { response: String(S.answer) } });
  xapi.record(r.student, r.percent >= 60 ? 'passed' : 'failed', { id: `case/${r.caseKey}`, name: r.case }, { result: { score: { raw: r.total, min: 0, max: r.max, scaled: +(r.percent / 100).toFixed(2) }, success: r.percent >= 60, completion: true, duration: `PT${Math.max(1, r.realMinutes)}M` } });
  emit('report', r);
  saveToHistory(r);
  if (lms.report(r)) log(`Nota enviada a la plataforma (SCORM ${lms.version === 2004 ? '2004' : '1.2'}): ${r.percent} %`, 'ok');
  const tags = tagsForCase(S.artifact ? { key: 'art-' } : S.caseDef);
  $('reportBody').innerHTML = reportHtml(r) + `<p class="small mt">Repase la teoría relacionada: <a href="preguntas.html?tags=${tags.join(',')}&n=5&student=${encodeURIComponent(r.student || '')}" target="_blank" rel="noopener">5 preguntas sobre ${tags.map((t) => TOPICS[t].toLowerCase()).join(', ')}</a>.</p>`;
  $('reportDlg').showModal();
  renderNav();
  if (S.classCode) {
    try {
      const res = await fetch(`api/classes/${encodeURIComponent(S.classCode)}/results`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) });
      log(res.ok ? `Informe enviado a la clase ${S.classCode}` : 'No se pudo enviar el informe a la clase', res.ok ? 'ok' : 'err');
    } catch { log('Sin conexión con el servidor de clase: descargue el JSON', 'err'); }
  }
};
$('btnJson').onclick = () => lastReport && exportJson(lastReport);
$('btnCsv').onclick = () => lastReport && exportCsv(lastReport);
// Impresión con el encabezado institucional: el informe del caso o, si no, lo que muestra el diálogo (certificado, turno)
$('btnPrint').onclick = () => {
  const title = $('reportDlg').querySelector('h2').textContent;
  if ($('reportBody').querySelector('.rep') && lastReport) printDocument(`Informe · ${lastReport.student} · ${lastReport.case}`, reportPrintHtml(lastReport, { header: docHeader, footer: docFooter }));
  else printDocument(title, docHeader(title) + $('reportBody').innerHTML + docFooter());
};

