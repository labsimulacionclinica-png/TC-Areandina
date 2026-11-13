// Ejecución de un ECOE: index.html?ecoe=<configuración>. Encadena estaciones con tiempo límite,
// un cuestionario opcional y emite el certificado al final.
import { $, hooks, on } from './base.js';
import { ask, log } from './core.js';
import { launchCase, params } from './start.js';
import { caseByKey } from '../cases.js';
import { artifactByKey } from '../artifacts.js';
import { RANDOM_TEMPLATES } from '../randomcase.js';
import { configFromParam, summarize, certificateCode, certificateHtml } from '../ecoe.js';
import { pickQuestions } from '../questions.js';
import { escapeHtml } from '../evaluation.js';
import { xapi } from '../xapi.js';

export function stationTitle(key) {
  if (key === 'proc-biopsia') return 'Biopsia pulmonar guiada por TC';
  if (key.startsWith('rand-')) return `Caso aleatorio: ${RANDOM_TEMPLATES[key.slice(5)]?.label || key}`;
  return artifactByKey(key)?.title || caseByKey(key)?.title || key;
}

let run = null; // { cfg, student, idx, results, t0, active, timer }

function bar() {
  let el = $('ecoeBar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ecoeBar'; el.className = 'ecoe-bar'; el.setAttribute('role', 'timer'); el.setAttribute('aria-live', 'off');
    document.querySelector('.topbar').append(el);
  }
  return el;
}

function tick() {
  if (!run?.active) return;
  const total = run.limit * 60, left = Math.max(0, Math.round(total - (Date.now() - run.t0) / 1000));
  const nSt = run.cfg.stations.length + (run.cfg.quiz ? 1 : 0);
  const el = bar();
  el.textContent = `ECOE · estación ${run.idx + 1}/${nSt} · ${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  el.classList.toggle('late', left < 60);
  if (left === 0) timeout();
}

function startTimer(minutes) {
  run.t0 = Date.now(); run.limit = minutes; run.active = true;
  clearInterval(run.timer); run.timer = setInterval(tick, 1000); tick();
}

async function timeout() {
  run.active = false; clearInterval(run.timer);
  if (run.quizOpen) { $('alertBtns').querySelector('button')?.click(); return; }
  if ($('reportDlg').open) $('reportDlg').close();
  run.results.push({ key: run.cfg.stations[run.idx].key, title: stationTitle(run.cfg.stations[run.idx].key), percent: 0, minutes: run.limit, timeout: true });
  log('ECOE: tiempo agotado en la estación', 'err');
  await ask('Tiempo agotado', '<p>Se acabó el tiempo de esta estación. Se registra con 0 puntos y pasa a la siguiente.</p>', [['Continuar', 0, true]], true);
  next();
}

on('report', (r) => {
  if (!run?.active || run.quizOpen) return;
  run.active = false; clearInterval(run.timer);
  const st = run.cfg.stations[run.idx];
  run.results.push({ key: st.key, title: stationTitle(st.key), percent: r.percent, minutes: Math.max(1, Math.round((Date.now() - run.t0) / 60000)), timeout: false });
  $('reportDlg').addEventListener('close', next, { once: true });
});

async function station() {
  const st = run.cfg.stations[run.idx];
  await ask(`Estación ${run.idx + 1}: ${stationTitle(st.key)}`, `<p>Tiene <b>${st.minutes} minutos</b>. La estación termina al pulsar «Finalizar estudio» en el último paso.</p>`, [['Empezar', 0, true]]);
  startTimer(st.minutes);
  await launchCase(st.key, 'evaluacion', run.student, null);
}

async function quiz() {
  const qs = pickQuestions({ tags: run.cfg.quiz.tags, n: run.cfg.quiz.n });
  run.quizOpen = true;
  startTimer(run.cfg.quiz.minutes);
  await ask(`Estación ${run.idx + 1}: cuestionario`, `<p class="small">${qs.length} preguntas · ${run.cfg.quiz.minutes} minutos. Al acabar el tiempo se entrega automáticamente.</p><form id="ecoeQuiz" class="ecoe-quiz">${qs.map((q, i) =>
    `<fieldset><legend>${i + 1}. ${escapeHtml(q.q)}</legend>${q.options.map((o, j) => `<label><input type="radio" name="${q.id}" value="${j}"> ${escapeHtml(o)}</label>`).join('')}</fieldset>`).join('')}</form>`, [['Entregar', 0, true]]);
  const ok = qs.filter((q) => +document.querySelector(`#ecoeQuiz input[name="${q.id}"]:checked`)?.value === q.correct).length;
  run.quizOpen = false; run.active = false; clearInterval(run.timer);
  run.results.push({ key: 'quiz', title: 'Cuestionario teórico', percent: Math.round(100 * ok / qs.length), minutes: Math.max(1, Math.round((Date.now() - run.t0) / 60000)), timeout: Date.now() - run.t0 >= run.limit * 60000 });
  next();
}

async function next() {
  run.idx++;
  if (run.idx < run.cfg.stations.length) return station();
  if (run.cfg.quiz && !run.results.some((r) => r.key === 'quiz')) return quiz();
  finish();
}

async function finish() {
  bar().remove();
  $('btnNew').hidden = false;
  const s = summarize(run.cfg, run.results);
  const payload = { v: 1, title: run.cfg.title, student: run.student, date: new Date().toISOString(), results: run.results, overall: s.overall, passed: s.passed, pass: run.cfg.pass, minStation: run.cfg.minStation };
  const code = await certificateCode(payload);
  try { const h = JSON.parse(localStorage.getItem('opentc-ecoe-certs')) || []; h.unshift({ code, ...payload }); localStorage.setItem('opentc-ecoe-certs', JSON.stringify(h.slice(0, 50))); } catch { /* sin almacenamiento */ }
  xapi.record(run.student, s.passed ? 'passed' : 'failed', { id: `ecoe/${encodeURIComponent(run.cfg.title)}`, name: run.cfg.title, type: 'http://adlnet.gov/expapi/activities/assessment' },
    { result: { score: { scaled: s.overall / 100 }, success: s.passed, completion: true } });
  $('reportBody').innerHTML = certificateHtml(payload, code) + (s.weak.length ? `<p class="small err">Estaciones por debajo del mínimo: ${s.weak.map(escapeHtml).join(', ')}.</p>` : '');
  const h2 = $('reportDlg').querySelector('h2'), old = h2.textContent;
  h2.textContent = 'Certificado del ECOE';
  $('reportDlg').addEventListener('close', () => { h2.textContent = old; }, { once: true });
  $('reportDlg').showModal();
  run = null;
}

hooks.bootOverride = () => {
  if (!params.get('ecoe')) return false;
  let cfg;
  try { cfg = configFromParam(params.get('ecoe')); } catch { ask('Enlace de ECOE no válido', '<p>Pida a su docente un enlace nuevo.</p>', [['Entendido', 0, true]]); return true; }
  (async () => {
    const nSt = cfg.stations.length + (cfg.quiz ? 1 : 0);
    await ask(cfg.title, `<p>Evaluación con <b>${nSt} estaciones</b>. Aprueba con ${cfg.pass} % de media${cfg.minStation ? ` y al menos ${cfg.minStation} % en cada estación` : ''}.</p>
      <ol>${cfg.stations.map((s) => `<li>${escapeHtml(stationTitle(s.key))} · ${s.minutes} min</li>`).join('')}${cfg.quiz ? `<li>Cuestionario de ${cfg.quiz.n} preguntas · ${cfg.quiz.minutes} min</li>` : ''}</ol>
      <label class="muted">Nombre completo <input type="text" id="ecoeName" maxlength="60" value="${escapeHtml(params.get('student') || '')}"></label>`, [['Comenzar el ECOE', 0, true]]);
    run = { cfg, student: $('ecoeName')?.value.trim() || 'Sin nombre', idx: 0, results: [] };
    $('btnNew').hidden = true;
    station();
  })();
  return true;
};
