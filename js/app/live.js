// Progreso en vivo para el panel docente: si el estudiante entró con un código de clase, cada cambio
// de paso se envía al servidor (sin datos clínicos reales: nombre, caso, paso, dosis acumulada y nota final).
import { STEPS, on } from './base.js';
import { S } from './core.js';

let session = null;
const sid = () => crypto.randomUUID?.() || `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function send(extra = {}) {
  if (!S?.classCode) return;
  const step = extra.step || [...S.visited].pop() || 'paciente';
  const body = {
    session, student: S.student, case: S.caseDef?.title, mode: S.mode, step,
    stepIndex: STEPS.findIndex((s) => s.key === step) + 1, dlp: Math.round(S.dose?.dlp || 0),
    alert: S.adverse ? 'Reacción adversa al contraste' : S.event?.triggered ? 'Evento del paciente' : '', ...extra,
  };
  fetch(`api/classes/${encodeURIComponent(S.classCode)}/live`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
}

on('exam', () => { session = sid(); send({ step: 'paciente' }); });
on('step', (k) => send({ step: k }));
on('report', (r) => send({ step: 'finalizar', percent: r.percent }));
