// Utilidades compartidas por todos los pasos. No importa otros módulos de js/app/,
// así siempre se inicializa primero y se puede usar desde el código de nivel superior de los demás.
import { ReconPool } from '../pool.js';
import { Viewer } from '../viewer.js';
import { applyScannerProfile } from '../ct.js';

export const $ = (id) => document.getElementById(id);
export const pool = new ReconPool();

// Perfil de calibración del tomógrafo real (si el docente lo configuró en calibracion.html)
export const PROFILE_KEY = 'opentc-scanner-profile';
export let scannerProfile = null;
try { scannerProfile = JSON.parse(localStorage.getItem(PROFILE_KEY)); } catch { scannerProfile = null; }
applyScannerProfile(scannerProfile);
pool.n0 = scannerProfile?.n0 || null;
export const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');

export const STEPS = [
  { key: 'paciente', label: 'Paciente' },
  { key: 'sala', label: 'Sala y posición' },
  { key: 'topograma', label: 'Topograma y rango' },
  { key: 'protocolo', label: 'Protocolo' },
  { key: 'contraste', label: 'Contraste' },
  { key: 'adquisicion', label: 'Adquisición' },
  { key: 'visor', label: 'Visor' },
  { key: 'finalizar', label: 'Finalizar' },
];

// Ganchos que rellenan los módulos de cada paso (evitan importaciones circulares al arrancar)
export const hooks = {};
// Eventos con varios oyentes: 'step' (clave del paso), 'report' (informe final), 'exam' (examen nuevo)
const listeners = {};
export const on = (name, f) => (listeners[name] ||= []).push(f);
export const emit = (name, ...args) => { for (const f of listeners[name] || []) { try { f(...args); } catch (e) { console.error(e); } } };
export const viewer = new Viewer($('viewCanvas'), { onInfo: (info) => hooks.renderOverlay?.(info) });
