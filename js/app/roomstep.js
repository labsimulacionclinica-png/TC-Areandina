// Módulo «room» de OpenTC Sim (antes parte de main.js).
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
import { S, ask, bindSeg, log, offY, renderGuide, renderNav } from './core.js';
import { renderMetrics, renderTopoControls } from './planning.js';

// ---------------------------------------------------------------------------
// 2. Sala
// ---------------------------------------------------------------------------

export let room = null;

export async function initRoom() {
  if (room) { room.resize(); syncRoom(); return; }
  try {
    const { Room } = await import('../room.js');
    room = new Room($('roomCanvas'));
    syncRoom();
  } catch (err) {
    $('roomCanvas').innerHTML = `<p class="empty">No se pudo iniciar la vista 3D (${escapeHtml(err.message)}). Use los controles de la derecha.</p>`;
  }
}

export function syncRoom() {
  room?.update({
    arms: S.position.arms, orientation: S.position.orientation, headHolder: S.position.headHolder, strap: S.position.strap,
    companion: S.prep.companion, lasers: S.position.lasers, tableHeight: offY() / 1000,
    tableTravel: S.position.atIso ? 0.75 : 0,
  });
}

export function renderRoomControls() {
  bindSeg('segOrient', () => S.position.orientation, (v) => { S.position.orientation = v; log(v === 'head' ? 'Cabeza primero' : 'Pies primero'); syncRoom(); });
  bindSeg('segArms', () => S.position.arms, (v) => { S.position.arms = v; log(v === 'up' ? 'Brazos sobre la cabeza' : 'Brazos a los lados'); syncRoom(); });
  $('chkHolder').checked = false; $('chkStrap').checked = false; $('chkLasers').checked = false; $('chkBreath').checked = true;
  for (const cb of $('shieldRow').querySelectorAll('input')) {
    cb.checked = S.position.shields.has(cb.dataset.shield);
    cb.onchange = () => {
      if (cb.checked) S.position.shields.add(cb.dataset.shield); else S.position.shields.delete(cb.dataset.shield);
      log(`Protector de bismuto (${cb.dataset.shield}): ${cb.checked ? 'colocado' : 'retirado'}`);
      renderMetrics();
    };
  }
  $('rngHeight').value = 0;
  $('selLandmark').innerHTML = '<option value="">Punto de referencia…</option>' + Object.entries(LANDMARKS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  $('zeroState').textContent = 'Sin cero marcado.';
  renderLaser();
}

export function renderLaser() {
  const o = Math.round(offY());
  $('lblHeight').textContent = `${S.position.tableH > 0 ? '+' : ''}${S.position.tableH} mm`;
  const st = $('laserState');
  if (!S.position.lasers) { st.textContent = 'Láseres apagados'; st.className = 'laser-state off'; return; }
  if (Math.abs(o) <= 5) { st.textContent = 'Láser coronal en la línea medioaxilar'; st.className = 'laser-state ok'; }
  else { st.textContent = `Láser coronal ${Math.abs(o)} mm por ${o < 0 ? 'ENCIMA' : 'DEBAJO'} de la línea medioaxilar`; st.className = 'laser-state'; }
}

$('chkHolder').onchange = (e) => { S.position.headHolder = e.target.checked; syncRoom(); renderGuide(); };
$('chkStrap').onchange = (e) => { S.position.strap = e.target.checked; syncRoom(); renderGuide(); };
$('chkBreath').onchange = (e) => { S.breathInstr = e.target.checked; };
$('chkLasers').onchange = (e) => { S.position.lasers = e.target.checked; renderLaser(); syncRoom(); };
$('rngHeight').oninput = (e) => { S.position.tableH = +e.target.value; renderLaser(); syncRoom(); renderGuide(); };
$('btnZero').onclick = () => {
  if (!S) return;
  const k = $('selLandmark').value;
  if (!S.position.lasers) return ask('Láseres apagados', '<p>Encienda los láseres para marcar el cero sobre el punto de referencia.</p>', [['Entendido', 0, true]]);
  if (!k) return;
  S.position.zero = Math.round(LANDMARKS[k].z * (S.caseDef.patient.scale || 1)); S.position.landmark = k;
  $('zeroState').textContent = `Cero en: ${LANDMARKS[k].label}.`;
  log(`Cero marcado en ${LANDMARKS[k].label}`);
  renderNav(); renderGuide(); renderTopoControls();
};
$('btnIso').onclick = () => {
  if (!S) return;
  if (S.position.zero == null) return ask('Falta el cero', '<p>Marque primero el cero con el láser.</p>', [['Entendido', 0, true]]);
  S.position.atIso = true;
  log('Paciente en el isocentro', 'ok');
  syncRoom(); renderNav(); renderGuide();
};

// ---------------------------------------------------------------------------
// Anatomía del paciente (según brazos y objetos no retirados)
// ---------------------------------------------------------------------------

export function metalExtras() {
  const M = lesion.M, out = [];
  const add = (name, c, r, mat = M.metal) => out.push(lesion.ell(name, c, r, mat));
  const keep = S.caseDef.items.filter((k) => !S.prep.removed.has(k));
  for (const k of keep) {
    if (k === 'aretes') for (const s of [-1, 1]) add('arete', [s * 77, -4, 160], [2.5, 2.5, 4]);
    if (k === 'gafas') for (const s of [-1, 1]) add('gafas', [s * 32, 99, 146], [15, 1.5, 2], { hu: 50, bone: 3000 });
    if (k === 'protesisDental') for (let a = 20; a <= 160; a += 20) add('protesis', [38 * Math.cos((a * Math.PI) / 180), 44 + 30 * Math.sin((a * Math.PI) / 180), 207], [2.5, 2.5, 3]);
    if (k === 'horquillas') for (const s of [-1, 1]) add('horquilla', [s * 22, -84, 40], [1.2, 5, 1.2]);
    if (k === 'collar') for (let a = 0; a < 360; a += 30) add('collar', [62 * Math.cos((a * Math.PI) / 180), -4 + 62 * Math.sin((a * Math.PI) / 180), 300], [2, 2, 2]);
    if (k === 'brasier') for (const s of [-1, 1]) for (let x = 30; x <= 110; x += 10) add('aro', [s * x, 100 - Math.abs(x - 70) * 0.4, 500], [2, 2, 2]);
    if (k === 'cinturon') add('hebilla', [0, 106, 800], [18, 3, 12]);
    if (k === 'monedas') add('monedas', [100, 40, 925], [12, 2, 12]);
    if (k === 'piercing') add('piercing', [0, 110, 750], [3, 3, 3]);
    if (k === 'reloj' && S.position.arms === 'down') add('reloj', [214, -6, 790], [16, 16, 6]);
  }
  return out;
}

// Protectores de bismuto: láminas finas muy atenuantes sobre la piel (dan rayas y ruido en la parte anterior)
export function shieldExtras() {
  const bi = { hu: 0, bone: 3500 }, out = [];
  if (S.position.shields.has('ojos')) out.push(lesion.ell('bismuto-ojos', [0, 101, 148], [44, 1.2, 14], bi));
  if (S.position.shields.has('tiroides')) out.push(lesion.ell('bismuto-tiroides', [0, 64, 285], [36, 1.2, 26], bi));
  if (S.position.shields.has('mamas') && S.caseDef.patient.sex === 'F') out.push(lesion.tube('bismuto-mamas', 420, 530, [0, 119], [0, 121], [105, 1.2], [105, 1.2], bi));
  return out;
}

export let anatomyCache = { key: null, id: 0, structs: null };
export async function ensureAnatomy() {
  const key = JSON.stringify([S.caseDef.key, S.position.arms, [...S.prep.removed].sort(), [...S.position.shields].sort(), S.caseDef.patient.weight, S.betaBlocker || false, hooks.biopsyKey?.() || null]);
  if (anatomyCache.key === key) return anatomyCache;
  const c = S.caseDef;
  const structs = serialize(buildAnatomy({ weight: c.patient.weight, sex: c.patient.sex, scale: c.patient.scale || 1, pregnantWeeks: c.patient.pregnantWeeks || 0, arms: S.position.arms, extras: [...c.extras, ...metalExtras(), ...shieldExtras(), ...(hooks.biopsyExtras?.() || [])] }));
  const id = anatomyCache.id + 1;
  await pool.setAnatomy(id, structs);
  anatomyCache = { key, id, structs };
  return anatomyCache;
}

