// Modo turno: lista de trabajo del RIS. index.html?turno=5 o «Empezar un turno» en el diálogo inicial.
import { $, hooks, on } from './base.js';
import { ask, log } from './core.js';
import { launchCase, params, startMode } from './start.js';
import { caseByKey } from '../cases.js';
import { escapeHtml } from '../evaluation.js';
import { xapi } from '../xapi.js';
import { generateShift, waiting, pending, nextClock, triageScore, shiftSummary, clockLabel, PRIORITY_LABEL, TURNOVER_MIN } from '../worklist.js';

let shift = null; // { ...generateShift, clock, student, mode, entries, current }

function bar() {
  let el = $('wlBar');
  if (!el) {
    el = document.createElement('div'); el.id = 'wlBar'; el.className = 'wl-bar';
    el.innerHTML = '<span id="wlInfo"></span><button id="wlShow">Lista de trabajo</button>';
    document.querySelector('.topbar').append(el);
    $('wlShow').onclick = () => showList(true);
  }
  const w = waiting(shift, shift.clock).length;
  $('wlInfo').textContent = `Turno · ${clockLabel(shift, shift.clock)} · ${w} en espera · ${pending(shift).length} pendientes`;
  return el;
}

const row = (p, clock, selectable) => {
  const c = caseByKey(p.key), arrived = p.arrival <= clock;
  return `<tr${arrived ? '' : ' class="muted"'}><td>${selectable && arrived && !p.done ? `<input type="radio" name="wl" value="${p.id}" aria-label="Elegir ${p.id}">` : p.done ? '✓' : ''}</td>
    <td><b>${p.id}</b></td><td><span class="prio p${p.priority}">${PRIORITY_LABEL[p.priority]}</span></td>
    <td>${escapeHtml(c.patient.name)}, ${c.patient.age} a<br><span class="small">${escapeHtml(p.origin)} · ${arrived ? `llegó ${clockLabel(shift, p.arrival)}` : `llega ${clockLabel(shift, p.arrival)}`}</span></td>
    <td class="small">${escapeHtml(c.order)}</td></tr>`;
};

async function showList(viewOnly = false) {
  shift.clock = nextClock(shift, shift.clock);
  bar();
  const html = `<p class="small">Hora del turno: <b>${clockLabel(shift, shift.clock)}</b>. ${viewOnly ? '' : 'Elija al siguiente paciente según la prioridad clínica y el tiempo de espera.'}</p>
    <table class="wl-table"><thead><tr><th></th><th>ID</th><th>Prioridad</th><th>Paciente</th><th>Solicitud</th></tr></thead>
    <tbody>${shift.patients.map((p) => row(p, shift.clock, !viewOnly)).join('')}</tbody></table>`;
  if (viewOnly) return ask('Lista de trabajo', html, [['Cerrar', 0, true]]);
  await ask('Lista de trabajo', html, [['Llamar al paciente', 0, true]]);
  const id = document.querySelector('#alertBody input[name=wl]:checked')?.value || waiting(shift, shift.clock)[0].id;
  const p = shift.patients.find((x) => x.id === id);
  const t = triageScore(shift, id, shift.clock);
  shift.current = { id, priority: p.priority, triage: t.score, triageNote: t.note, wait: shift.clock - p.arrival, t0: Date.now() };
  log(`Turno: ${id} (${PRIORITY_LABEL[p.priority].toLowerCase()}). ${t.note}`, t.score === 100 ? 'ok' : 'warn');
  await launchCase(p.key, shift.mode, shift.student, null);
}

on('report', (r) => {
  if (!shift?.current) return;
  const cur = shift.current, p = shift.patients.find((x) => x.id === cur.id);
  p.done = true;
  // El estudio ocupa la sala el tiempo real empleado (mínimo 8 min de turno) más la rotación
  shift.clock += Math.max(8, r.realMinutes || 0) + TURNOVER_MIN;
  shift.entries.push({ ...cur, percent: r.percent, title: r.case });
  shift.current = null;
  bar();
  $('reportDlg').addEventListener('close', () => (pending(shift).length ? showList() : finish()), { once: true });
});

function finish() {
  const s = shiftSummary(shift.entries);
  $('wlBar')?.remove();
  xapi.record(shift.student, 'completed', { id: `shift/${shift.seed}`, name: 'Turno en el servicio de TC' }, { result: { score: { scaled: s.total / 100 }, completion: true } });
  $('reportBody').innerHTML = `<h3>Resumen del turno</h3>
    <div class="metrics five"><div><span>Total</span><b>${s.total} %</b></div><div><span>Calidad de los estudios</span><b>${s.quality} %</b></div><div><span>Prioridad</span><b>${s.triage} %</b></div><div><span>Tiempos de espera</span><b>${s.timeliness} %</b></div><div><span>Pacientes</span><b>${shift.entries.length}</b></div></div>
    <table class="wl-table mt"><thead><tr><th>Orden</th><th>Paciente</th><th>Prioridad</th><th>Espera</th><th>Nota</th><th>Decisión</th></tr></thead><tbody>
    ${shift.entries.map((e, i) => `<tr><td>${i + 1}</td><td>${e.id} · ${escapeHtml(e.title)}</td><td><span class="prio p${e.priority}">${PRIORITY_LABEL[e.priority]}</span></td><td>${Math.round(e.wait)} min</td><td>${e.percent} %</td><td class="small">${escapeHtml(e.triageNote)}</td></tr>`).join('')}
    </tbody></table>
    <p class="small">Ponderación: 60 % calidad de cada estudio, 25 % orden de prioridad y 15 % tiempos de espera frente al objetivo (inmediata 15 min, urgente 60 min, programada 4 h). Turno nº ${shift.seed} (repetible con ?turno=${shift.patients.length}&semilla=${shift.seed}).</p>`;
  $('reportDlg').showModal();
  shift = null;
  $('btnNew').hidden = false;
}

export function startShift(n, student, mode = 'practica', seed = (Date.now() & 0x7fffffff)) {
  shift = { ...generateShift(seed, n), clock: 0, student, mode, entries: [], current: null };
  $('btnNew').hidden = true;
  if ($('startDlg').open) $('startDlg').close();
  ask('Turno en el servicio de TC', `<p>Comienza su turno a las ${clockLabel(shift, 0)}. Hay ${shift.patients.length} solicitudes; algunas llegarán durante la jornada.</p>
    <ul><li>Atienda primero lo <b>inmediato</b> (código ictus, trauma grave, sospecha de disección o TEP).</li><li>Cada estudio ocupa la sala el tiempo que usted tarde, más ${TURNOVER_MIN} min de rotación.</li><li>Se puntúa la calidad de cada estudio, el orden elegido y los tiempos de espera.</li></ul>`, [['Ver la lista de trabajo', 0, true]])
    .then(() => showList());
}

$('btnShift').onclick = () => startShift(Math.max(3, Math.min(10, +$('shiftN').value || 5)), $('studentName').value.trim() || 'Sin nombre', startMode);

const prevBoot = hooks.bootOverride;
hooks.bootOverride = () => {
  if (prevBoot?.()) return true;
  if (!params.get('turno')) return false;
  startShift(Math.max(3, Math.min(10, +params.get('turno') || 5)), params.get('student') || 'Sin nombre', params.get('mode') === 'evaluacion' ? 'evaluacion' : 'practica', +params.get('semilla') || undefined);
  return true;
};
