// Panel del docente: resultados de la clase (servidor o archivos importados).
import { mergeResults, filterResults, summarize, toCsv, parseReportFile, PASS_PERCENT } from './classStats.js';
import { reportHtml, escapeHtml } from './evaluation.js';

const $ = (id) => document.getElementById(id);

let serverResults = [];
let importedResults = [];
let session = null; // { code, pin, name }
let timer = null;
let hasServer = false;

const allResults = () => mergeResults(serverResults, importedResults);

// --- Servidor de clase ----------------------------------------------------------

async function detectServer() {
  try {
    const res = await fetch('api/health');
    hasServer = res.ok && (res.headers.get('content-type') || '').includes('application/json');
  } catch {
    hasServer = false;
  }
  $('serverState').textContent = hasServer
    ? 'Servidor disponible. Cree una clase y comparta el código con sus estudiantes; el PIN es solo para usted.'
    : 'Este sitio no tiene servidor de clase (por ejemplo, GitHub Pages). Use «Importar archivos» o ejecute la app con «node server.mjs» en un equipo de la red.';
  for (const f of [$('formCreate'), $('formOpen')]) f.classList.toggle('disabled', !hasServer);
}

async function api(path, opts = {}) {
  const res = await fetch(`api/${path}`, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
  return body;
}

$('formCreate').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const { code, name } = await api('classes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: f.get('name'), pin: f.get('pin') }),
    });
    $('newCode').hidden = false;
    $('newCode').innerHTML = `Código de «${escapeHtml(name)}»<b>${code}</b>Compártalo con los estudiantes.`;
    const open = $('formOpen');
    open.code.value = code;
    open.pin.value = f.get('pin');
    e.target.reset();
    await loadClass(code, open.pin.value);
  } catch (err) {
    $('newCode').hidden = false;
    $('newCode').textContent = err.message;
  }
});

$('formOpen').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  await loadClass(String(f.get('code')).trim().toUpperCase(), String(f.get('pin')));
});

async function loadClass(code, pin) {
  try {
    const data = await api(`classes/${encodeURIComponent(code)}/results`, { headers: { 'X-Teacher-Pin': pin } });
    session = { code, pin, name: data.name };
    serverResults = data.results;
    $('btnRefresh').disabled = false;
    $('serverState').textContent = `Clase «${data.name}» (${code}): ${data.results.length} resultados. Actualizado ${new Date().toLocaleTimeString('es')}.`;
    render();
    startLive();
  } catch (err) {
    $('serverState').textContent = err.message;
  }
}

// Monitor en vivo: progreso de los estudiantes que están trabajando con el código de la clase
let liveTimer = null;
const STEP_NAMES = { paciente: 'Paciente', sala: 'Sala y posición', topograma: 'Topograma', protocolo: 'Protocolo', contraste: 'Contraste', adquisicion: 'Adquisición', visor: 'Visor', finalizar: 'Finalizar' };
const ago = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`; };
async function refreshLive() {
  if (!session) return;
  try {
    const data = await api(`classes/${encodeURIComponent(session.code)}/live`, { headers: { 'X-Teacher-Pin': session.pin } });
    $('livePanel').hidden = false;
    const active = data.students.filter((s) => data.now - s.updated < 10 * 60000).length;
    $('liveInfo').textContent = `${active} activos · ${data.students.length} en las últimas 2 h`;
    $('liveRows').innerHTML = data.students.length ? data.students.map((s) => `<tr${data.now - s.updated > 10 * 60000 ? ' class="muted"' : ''}>
      <td>${escapeHtml(s.student)}${s.mode === 'evaluacion' ? ' <span class="small">(evaluación)</span>' : ''}</td><td>${escapeHtml(s.case)}</td>
      <td><progress max="8" value="${s.stepIndex}" aria-label="Paso ${s.stepIndex} de 8"></progress> ${escapeHtml(STEP_NAMES[s.step] || s.step)}</td>
      <td class="num">${s.dlp} mGy·cm</td><td>${s.alert ? `<span class="t-alert">${escapeHtml(s.alert)}</span>` : ''}</td>
      <td class="num">${s.percent == null ? '—' : `${s.percent} %`}</td><td>${ago(data.now - s.updated)}</td></tr>`).join('')
      : '<tr><td colspan="7" class="muted">Nadie conectado todavía. Los estudiantes deben escribir el código de la clase al empezar.</td></tr>';
  } catch { /* servidor antiguo o sin conexión: se reintenta */ }
}
function startLive() {
  clearInterval(liveTimer);
  refreshLive();
  liveTimer = setInterval(() => { if (!document.hidden) refreshLive(); }, 5000);
}

$('btnRefresh').addEventListener('click', () => session && loadClass(session.code, session.pin));
$('autoRefresh').addEventListener('change', (e) => {
  clearInterval(timer);
  if (e.target.checked) timer = setInterval(() => session && loadClass(session.code, session.pin), 30000);
});

// --- Importar archivos ----------------------------------------------------------

async function importFiles(files) {
  let ok = 0, bad = 0;
  for (const file of files) {
    try {
      const list = parseReportFile(await file.text());
      importedResults = mergeResults(importedResults, list);
      ok += list.length;
      if (!list.length) bad++;
    } catch {
      bad++;
    }
  }
  $('importMsg').textContent = `${ok} informe(s) importado(s)${bad ? `, ${bad} archivo(s) no válido(s)` : ''}.`;
  render();
}

$('files').addEventListener('change', (e) => importFiles([...e.target.files]));
const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  importFiles([...e.dataTransfer.files]);
});

// --- Vista ------------------------------------------------------------------

function filters() {
  return { caseKey: $('fCase').value, student: $('fStudent').value };
}

function bars(el, rows, labelOf, tipOf) {
  if (!rows.length) { el.innerHTML = '<p class="t-empty">Sin datos.</p>'; return; }
  el.innerHTML = rows.map((r, i) => `
    <div class="t-bar" data-i="${i}">
      <span class="lbl">${escapeHtml(labelOf(r))}</span>
      <span class="track"><span class="fill" style="width:${Math.max(0, Math.min(100, r.average))}%"></span></span>
      <span class="val">${r.average} %</span>
    </div>`).join('');
  for (const b of el.querySelectorAll('.t-bar')) {
    const r = rows[+b.dataset.i];
    b.addEventListener('mousemove', (e) => showTip(e, tipOf(r)));
    b.addEventListener('mouseleave', hideTip);
  }
}

function showTip(e, text) {
  const tip = $('tip');
  tip.hidden = false;
  tip.textContent = text;
  tip.style.left = `${Math.min(e.clientX + 12, innerWidth - tip.offsetWidth - 8)}px`;
  tip.style.top = `${e.clientY + 14}px`;
}
const hideTip = () => { $('tip').hidden = true; };

function render() {
  const all = allResults();
  // Opciones de caso según los datos cargados
  const sel = $('fCase'), current = sel.value;
  const cases = [...new Map(all.map((r) => [r.caseKey || r.case, r.case])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'es', { numeric: true }));
  sel.innerHTML = '<option value="">Todos</option>' + cases.map(([k, t]) => `<option value="${escapeHtml(k)}">${escapeHtml(t)}</option>`).join('');
  sel.value = cases.some(([k]) => k === current) ? current : '';

  const list = filterResults(all, filters());
  const s = summarize(list);
  $('sourceStrip').innerHTML = [
    session ? `<b>Clase ${escapeHtml(session.name)}</b> (${session.code}): ${serverResults.length}` : '',
    importedResults.length ? `Importados: ${importedResults.length}` : '',
  ].filter(Boolean).join(' · ') || 'Sin datos cargados';

  $('tiles').innerHTML = [
    ['Intentos', s.attempts, ''],
    ['Estudiantes', s.students, ''],
    ['Promedio', s.attempts ? s.average : '—', s.attempts ? '<small>%</small>' : ''],
    [`Aprobados (≥ ${PASS_PERCENT} %)`, s.attempts ? s.passRate : '—', s.attempts ? '<small>%</small>' : ''],
  ].map(([k, v, unit]) => `<div class="t-tile"><div class="k">${k}</div><div class="v">${v}${unit}</div></div>`).join('');

  bars($('chartCases'), s.byCase, (c) => c.title, (c) => `${c.title}: ${c.average} % · ${c.n} intento(s)`);
  bars($('chartCriteria'), s.byCriterion.slice(0, 10), (c) => c.label, (c) => `${c.label}: ${c.average} % de los puntos · ${c.n} intento(s)`);

  $('countLabel').textContent = `${list.length} de ${all.length}`;
  $('rows').innerHTML = list.length ? list.map((r, i) => `
    <tr>
      <td>${escapeHtml(r.student)}</td>
      <td>${escapeHtml(r.case)}</td>
      <td>${escapeHtml(new Date(r.date).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }))}</td>
      <td class="num"><span class="t-score">${r.percent} %<i class="${r.percent >= PASS_PERCENT ? 'ok' : 'err'}">${r.percent >= PASS_PERCENT ? 'Aprobado' : 'No aprobado'}</i></span></td>
      <td><button data-i="${i}">Ver</button></td>
    </tr>`).join('') : '<tr><td colspan="5" class="t-empty">Sin intentos.</td></tr>';
  for (const b of $('rows').querySelectorAll('button')) {
    b.addEventListener('click', () => {
      $('detailBody').innerHTML = reportHtml(list[+b.dataset.i]);
      $('detail').showModal();
    });
  }
  $('btnCsv').disabled = !list.length;
  $('btnClear').disabled = !all.length;
}

$('fCase').addEventListener('change', render);
$('fStudent').addEventListener('input', render);
$('btnCsv').addEventListener('click', () => {
  const list = filterResults(allResults(), filters());
  const url = URL.createObjectURL(new Blob([toCsv(list)], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `opentc-clase-${session?.code || 'importada'}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('btnClear').addEventListener('click', () => {
  serverResults = []; importedResults = []; session = null;
  clearInterval(timer); $('autoRefresh').checked = false; $('btnRefresh').disabled = true;
  render();
});

detectServer();
render();

