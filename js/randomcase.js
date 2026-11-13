// Casos aleatorios: cada estudiante recibe un paciente y una lesión distintos (posición, tamaño, lado),
// pero el caso es reproducible con su número: «rand-<plantilla>-<semilla>» (sirve para enlaces y para Moodle).
import { buildAnatomy, serialize, structureAt, mulberry32 } from './phantom.js';

const NAMES = {
  F: ['Ana Lucía', 'Carolina', 'Diana Marcela', 'Gloria Patricia', 'Juliana', 'Luz Dary', 'María José', 'Natalia', 'Paola Andrea', 'Sandra Milena', 'Valeria', 'Yolanda'],
  M: ['Andrés Felipe', 'Carlos Alberto', 'Diego', 'Fabio', 'Hernán', 'Jhon Jairo', 'Juan Camilo', 'Luis Fernando', 'Mauricio', 'Óscar', 'Santiago', 'William'],
};
const SURNAMES = ['Agudelo', 'Bermúdez', 'Cárdenas', 'Duque', 'Echeverri', 'Franco', 'Gaviria', 'Henao', 'Jaramillo', 'Londoño', 'Mejía', 'Naranjo', 'Ospina', 'Patiño', 'Quintero', 'Restrepo', 'Salazar', 'Tobón', 'Uribe', 'Villa', 'Zuluaga'];

export const RANDOM_TEMPLATES = {
  higado: { label: 'Abdomen contrastado — lesión hepática aleatoria', protocolKey: 'abdomen', contrast: 'si' },
  pulmon: { label: 'Tórax de baja dosis — nódulo pulmonar aleatorio', protocolKey: 'lowdose', contrast: 'no' },
  rinon: { label: 'Urotomografía — litiasis aleatoria', protocolKey: 'urolith', contrast: 'no' },
  cerebro: { label: 'Cráneo simple — hemorragia aleatoria', protocolKey: 'head', contrast: 'no' },
  tep: { label: 'Angio-TC pulmonar — TEP aleatorio (o sin TEP)', protocolKey: 'ctpa', contrast: 'si' },
};

let anatomy = null;
const base = () => (anatomy ||= serialize(buildAnatomy({ arms: 'up' })));

// Punto aleatorio cuyo centro y alrededores (radio r) caen dentro de un órgano
function pointIn(rnd, organ, box, r) {
  const S = base();
  for (let i = 0; i < 4000; i++) {
    const x = box.x[0] + rnd() * (box.x[1] - box.x[0]), y = box.y[0] + rnd() * (box.y[1] - box.y[0]), z = box.z[0] + rnd() * (box.z[1] - box.z[0]);
    const ok = [[0, 0, 0], [r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]].every(([a, b, c]) => organ.test(structureAt(S, x + a, y + b, z + c)?.name || ''));
    if (ok) return { x: Math.round(x), y: Math.round(y), z: Math.round(z) };
  }
  throw new Error('No se encontró una posición válida');
}

function shuffleOptions(rnd, correct, distractors) {
  const opts = [correct, ...distractors.filter((d) => d !== correct)].slice(0, 4);
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  return { options: opts, correct: opts.indexOf(correct) };
}

export function generateRandomCase(key) {
  const m = key.match(/^rand-(\w+)-(\d+)$/);
  if (!m || !RANDOM_TEMPLATES[m[1]]) return null;
  const [, tpl, seedStr] = m, seed = +seedStr, rnd = mulberry32(seed * 7919 + 13);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const sex = tpl === 'tep' || rnd() < 0.5 ? (rnd() < 0.5 ? 'F' : 'M') : 'M';
  const age = 25 + Math.floor(rnd() * 55);
  const name = `${pick(NAMES[sex])} ${pick(SURNAMES)} ${pick(SURNAMES)}`;
  const dob = `${2026 - age}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`;
  const patient = {
    name, id: `CC ${Math.floor(10 + rnd() * 89)}.${Math.floor(100 + rnd() * 899)}.${Math.floor(100 + rnd() * 899)}`, dob, age, sex,
    weight: 55 + Math.floor(rnd() * 40), height: 155 + Math.floor(rnd() * 30), creatinine: +(0.6 + rnd() * 0.5).toFixed(1), egfr: 70 + Math.floor(rnd() * 40),
    allergies: 'Ninguna conocida', metformin: false, breathHold: 15, cooperative: true,
    pregnancy: sex === 'F' && age < 50 ? 'Prueba de embarazo: NEGATIVA (hoy)' : null,
  };
  const T = RANDOM_TEMPLATES[tpl];
  const lesions = [];
  let order, question, explanation;
  if (tpl === 'higado') {
    const r = 7 + Math.floor(rnd() * 8), type = rnd() < 0.7 ? 'hipodensa' : 'hipervascular';
    const p = pointIn(rnd, /^higado$/, { x: [-140, 40], y: [-60, 90], z: [565, 700] }, r + 3);
    lesions.push({ type, ...p, rx: r, ry: r, rz: r });
    const lobe = p.x < -15 ? 'DERECHO' : 'IZQUIERDO';
    order = 'TC de abdomen y pelvis con contraste. Dolor en hipocondrio y alteración de pruebas hepáticas.';
    question = { text: '¿Dónde está la lesión hepática?', ...shuffleOptions(rnd, `Lesión focal en el lóbulo hepático ${lobe} (~${2 * r} mm)`, [`Lesión focal en el lóbulo hepático ${lobe === 'DERECHO' ? 'IZQUIERDO' : 'DERECHO'}`, 'Hígado sin lesiones focales', 'Lesión en el bazo']) };
    explanation = `Lesión ${type === 'hipodensa' ? 'hipodensa' : 'con realce arterial y lavado'} de ~${2 * r} mm en el lóbulo hepático ${lobe.toLowerCase()} (x = ${p.x} mm, y = ${p.y} mm, z = ${p.z} mm del vértex).`;
  } else if (tpl === 'pulmon') {
    const right = rnd() < 0.5, r = 3 + Math.floor(rnd() * 5);
    const p = pointIn(rnd, right ? /^pulmon-derecho$/ : /^pulmon-izquierdo$/, { x: right ? [-140, -20] : [20, 140], y: [-80, 80], z: [360, 545] }, r + 4);
    lesions.push({ type: 'trombo', ...p, rx: r, ry: r, rz: r }); // nódulo sólido (~38 HU)
    const lobe = `${p.z < 445 ? 'superior' : 'inferior'} ${right ? 'DERECHO' : 'IZQUIERDO'}`;
    order = 'TC de tórax de baja dosis. Fumador, control de nódulo pulmonar.';
    question = { text: '¿Dónde está el nódulo?', ...shuffleOptions(rnd, `Lóbulo ${lobe}`, ['Lóbulo superior DERECHO', 'Lóbulo inferior DERECHO', 'Lóbulo superior IZQUIERDO', 'Lóbulo inferior IZQUIERDO', 'No hay nódulos'].filter((o) => o !== `Lóbulo ${lobe}`)) };
    explanation = `Nódulo sólido de ~${2 * r} mm en el lóbulo ${lobe.toLowerCase()} (aproximación: por encima de la cisura ~ z 445 mm se considera lóbulo superior). Se busca mejor con cortes finos, filtro de pulmón y MIP.`;
  } else if (tpl === 'rinon') {
    const s = rnd() < 0.5 ? -1 : 1, z = 725 + Math.floor(rnd() * 160), f = Math.min(1, (z - 710) / 130);
    const x = z < 840 ? s * (58 - 10 * f) : s * (48 - 22 * ((z - 840) / 65)), y = z < 840 ? -44 + 8 * f : -36 + 58 * ((z - 840) / 65);
    const r = 2 + rnd() * 2.5;
    lesions.push({ type: 'calculo', x: Math.round(x), y: Math.round(y), z, rx: +r.toFixed(1), ry: +r.toFixed(1), rz: +(r + 0.5).toFixed(1) });
    const side = s < 0 ? 'DERECHO' : 'IZQUIERDO';
    order = 'Urotomografía SIMPLE de baja dosis. Cólico renal y hematuria.';
    question = { text: '¿Cuál es el hallazgo?', ...shuffleOptions(rnd, `Litiasis ureteral ${side}`, [`Litiasis ureteral ${side === 'DERECHO' ? 'IZQUIERDO' : 'DERECHO'}`, 'Sin litiasis', 'Colelitiasis']) };
    explanation = `Cálculo de ~${(2 * r).toFixed(0)} mm en el uréter ${side.toLowerCase()} a z = ${z} mm. Los cálculos se ven sin contraste; siga el uréter en coronal o con la reconstrucción curva.`;
  } else if (tpl === 'cerebro') {
    const right = rnd() < 0.5, r = 8 + Math.floor(rnd() * 8);
    const p = pointIn(rnd, /^(sustancia-blanca|cerebro|nucleos-basales)$/, { x: right ? [-58, -12] : [12, 58], y: [-70, 70], z: [50, 115] }, r);
    lesions.push({ type: 'hemorragia', ...p, rx: r, ry: r * 1.2, rz: r });
    const lobe = p.y > 25 ? 'frontal' : p.y < -35 ? 'occipital' : 'parietal';
    const side = right ? 'DERECHO' : 'IZQUIERDO';
    order = 'TC de cráneo SIMPLE urgente. Cefalea súbita y déficit neurológico.';
    question = { text: '¿Cuál es el hallazgo principal?', ...shuffleOptions(rnd, `Hematoma intraparenquimatoso ${lobe} ${side}`, [`Hematoma intraparenquimatoso ${lobe} ${side === 'DERECHO' ? 'IZQUIERDO' : 'DERECHO'}`, `Hematoma intraparenquimatoso ${lobe === 'frontal' ? 'occipital' : 'frontal'} ${side}`, 'Estudio sin alteraciones agudas']) };
    explanation = `Hematoma hiperdenso de ~${2 * r} mm en el lóbulo ${lobe} ${side.toLowerCase()} (recuerde: la derecha del paciente se ve a la izquierda de la imagen).`;
  } else {
    const none = rnd() < 0.2, side = rnd() < 0.5 ? 'DERECHA' : 'IZQUIERDA', s = side === 'DERECHA' ? -1 : 1;
    if (!none) lesions.push({ type: 'trombo', x: s * (57 + Math.floor(rnd() * 5)), y: -16 - Math.floor(rnd() * 8), z: 450 + Math.floor(rnd() * 50), rx: 4.2, ry: 4.2, rz: 12 });
    order = 'Angio-TC de arterias pulmonares. Disnea súbita, dímero D elevado.';
    const correct = none ? 'Sin defectos de llenado (no hay TEP)' : `TEP en la arteria lobar inferior ${side}`;
    question = { text: '¿Qué muestra el estudio?', ...shuffleOptions(rnd, correct, ['Sin defectos de llenado (no hay TEP)', 'TEP en la arteria lobar inferior DERECHA', 'TEP en la arteria lobar inferior IZQUIERDA', 'Disección de aorta']) };
    explanation = none ? 'Las arterias pulmonares realzan bien y no hay defectos de llenado: no hay TEP. Descartar también forma parte del trabajo.' : `Defecto de llenado en la arteria lobar inferior ${side.toLowerCase()} rodeado de contraste.`;
  }
  return {
    key, random: true, title: `${T.label} · n.º ${seed}`, protocolKey: T.protocolKey, contrast: T.contrast, companion: false,
    order, history: 'Caso generado aleatoriamente.', positionTip: '', patient, items: pickItems(rnd, tpl), lesions,
    question: { text: question.text, options: question.options, correct: question.correct, explanation },
  };
}

function pickItems(rnd, tpl) {
  const byRegion = { cerebro: ['aretes', 'gafas', 'horquillas', 'protesisDental'], pulmon: ['collar', 'brasier', 'reloj'], tep: ['collar', 'brasier', 'aretes'], higado: ['cinturon', 'monedas', 'piercing'], rinon: ['cinturon', 'monedas', 'piercing'] }[tpl];
  return byRegion.filter(() => rnd() < 0.6);
}

export const newRandomKey = (tpl) => `rand-${tpl}-${1 + Math.floor(Math.random() * 99999)}`;
