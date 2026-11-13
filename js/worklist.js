// Modo turno: una lista de trabajo del RIS con pacientes que llegan a lo largo de la jornada.
// El estudiante decide el orden; se puntúa la calidad de cada estudio y el criterio de prioridad.
// Sin DOM (se prueba con node --test).
import { mulberry32 } from './phantom.js';

// Prioridad clínica de cada caso: 1 inmediata, 2 urgente, 3 programada; y tiempo objetivo hasta el estudio (min)
export const PRIORITY = {
  'ictus-acm': 1, 'craneo-hic': 1, 'diseccion-aortica': 1, 'trauma-bazo': 1, 'angio-tep': 1,
  'tep-embarazada': 2, 'pediatrico-tec': 2, 'cuello-absceso': 2, 'urolitiasis': 2,
  'higado-trifasico': 3, 'contraindicacion': 3, 'torax-nodulo': 3, 'protesis-cadera': 3, 'coronario': 3, 'obeso-abdomen': 3,
};
export const PRIORITY_LABEL = { 1: 'Inmediata', 2: 'Urgente', 3: 'Programada' };
export const TARGET_MIN = { 1: 15, 2: 60, 3: 240 };
export const TURNOVER_MIN = 5; // limpieza de la sala y cambio de paciente
const ORIGIN = ['Urgencias', 'Hospitalización', 'Consulta externa'];

export function generateShift(seed = Date.now(), n = 5, keys = Object.keys(PRIORITY)) {
  const rnd = mulberry32(seed >>> 0);
  const pool = keys.filter((k) => PRIORITY[k]);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const pick = pool.slice(0, Math.min(n, pool.length));
  // Al menos dos pacientes esperan al empezar; el resto llega durante el turno
  return {
    seed, startHour: 7,
    patients: pick.map((key, i) => {
      const p = PRIORITY[key];
      return {
        id: `P${i + 1}`, key, priority: p,
        arrival: i < 2 ? 0 : Math.round(10 + rnd() * 50 * i),
        origin: p === 1 ? ORIGIN[0] : p === 2 ? ORIGIN[rnd() < 0.6 ? 0 : 1] : ORIGIN[rnd() < 0.7 ? 2 : 1],
        done: false,
      };
    }).sort((a, b) => a.arrival - b.arrival),
  };
}

export const waiting = (shift, clock) => shift.patients.filter((p) => !p.done && p.arrival <= clock);
export const pending = (shift) => shift.patients.filter((p) => !p.done);
// Si no queda nadie esperando, el reloj salta a la siguiente llegada
export const nextClock = (shift, clock) => (waiting(shift, clock).length ? clock : Math.min(...pending(shift).map((p) => p.arrival)));

// Puntuación de la decisión de prioridad al elegir a un paciente (0–100)
export function triageScore(shift, id, clock) {
  const w = waiting(shift, clock), chosen = w.find((p) => p.id === id);
  if (!chosen) return { score: 0, note: 'Paciente no disponible' };
  const best = Math.min(...w.map((p) => p.priority));
  if (chosen.priority === best) return { score: 100, note: 'Prioridad correcta' };
  const skipped = w.filter((p) => p.priority < chosen.priority);
  return { score: chosen.priority - best >= 2 ? 0 : 40, note: `Dejó esperando a ${skipped.map((p) => `${p.id} (${PRIORITY_LABEL[p.priority].toLowerCase()})`).join(', ')}` };
}

// Puntuación del tiempo de espera respecto al objetivo de su prioridad (0–100)
export function waitScore(priority, waitMin) {
  const t = TARGET_MIN[priority];
  return waitMin <= t ? 100 : Math.max(0, Math.round(100 - 100 * (waitMin - t) / t));
}

// entries: [{ id, priority, percent, triage, wait }]
export function shiftSummary(entries) {
  if (!entries.length) return { quality: 0, triage: 0, timeliness: 0, total: 0 };
  const avg = (f) => Math.round(entries.reduce((a, e) => a + f(e), 0) / entries.length);
  const quality = avg((e) => e.percent), triage = avg((e) => e.triage), timeliness = avg((e) => waitScore(e.priority, e.wait));
  return { quality, triage, timeliness, total: Math.round(0.6 * quality + 0.25 * triage + 0.15 * timeliness) };
}

export const clockLabel = (shift, min) => { const t = shift.startHour * 60 + Math.round(min); return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
