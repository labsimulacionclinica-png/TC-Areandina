// Biopsia pulmonar percutánea guiada por TC: planificación de la trayectoria, avance de la aguja (con una
// pequeña desviación, como en la realidad), cortes de control, riesgo de neumotórax y evaluación.
import { structureAt, lesion, tube, mulberry32 } from './phantom.js';

// Estructuras que la aguja no debe atravesar
const FORBIDDEN = /^(costilla|escapula|esternon|clavicula|vertebra|arco-posterior|apofisis|aorta|cayado|tronco-pulmonar|arteria-pulmonar|vena-cava|tronco-braquio|vena-subclavia|troncos-supra|miocardio|cavidades|ventriculo|auricula|tabique|traquea|bronquio-principal|esofago|humero|cabeza-humeral)/;
const VESSEL = /^(vaso-pulmonar|arteria-lobar|vena-pulmonar|pared-bronquial|bronquio)/;
const LUNG = /^pulmon-/;
const NAME = (s) => s.replace(/-/g, ' ');

const STEP = 0.5; // mm

// Recorre un segmento en el plano z y devuelve lo que atraviesa
export const tracePath = (structs, a, b, z, nodule) => tracePoints(structs, [a, b], z, nodule);

// Recorre una trayectoria con varios tramos (todos los pases de la aguja) como un único camino
export function tracePoints(structsIn, pts, z, nodule) {
  const structs = structsIn.filter((s) => s.name !== 'aguja' && s.name !== 'neumotorax'); // la propia aguja no cuenta
  const samples = [];
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], l = Math.hypot(b.x - a.x, b.y - a.y);
    for (let t = i ? STEP : 0; t <= l; t += STEP) samples.push([a.x + ((b.x - a.x) * t) / (l || 1), a.y + ((b.y - a.y) * t) / (l || 1)]);
    L += l;
  }
  const hits = new Map(), vessels = new Set();
  let lungLength = 0, pleura = 0, prevLung = false, reachedNodule = false;
  for (const [x, y] of samples) {
    const s = structureAt(structs, x, y, z), name = s?.name || 'aire';
    if (nodule && Math.hypot(x - nodule.x, y - nodule.y, z - nodule.z) <= nodule.r) reachedNodule = true;
    const inLung = LUNG.test(name) || (VESSEL.test(name) && !/^bronquio$/.test(name));
    if (inLung && !prevLung) pleura++;
    if (inLung && !reachedNodule) lungLength += STEP;
    prevLung = inLung || name === 'nodulo';
    if (FORBIDDEN.test(name)) hits.set(name, (hits.get(name) || 0) + STEP);
    if (VESSEL.test(name)) vessels.add(name);
  }
  return { length: L, lungLength, pleura, forbidden: [...hits.keys()].map(NAME), vessels: [...vessels].map(NAME), reachedNodule };
}

export function planReport(structs, entry, target, z, nodule) {
  const tr = tracePath(structs, entry, target, z, nodule);
  const at = structureAt(structs, entry.x, entry.y, z)?.name || 'aire';
  const angle = (Math.atan2(target.y - entry.y, target.x - entry.x) * 180) / Math.PI;
  const warnings = [];
  if (!/^(grasa-subcutanea|aire)$/.test(at) && !/^pared-muscular$/.test(at)) warnings.push(`El punto de entrada está dentro del paciente (${NAME(at)}): márquelo en la piel.`);
  if (tr.forbidden.length) warnings.push(`La trayectoria atraviesa: ${tr.forbidden.join(', ')}.`);
  if (tr.vessels.length) warnings.push(`Pasa por vasos o bronquios (${tr.vessels.join(', ')}): riesgo de hemorragia.`);
  if (tr.pleura > 1) warnings.push(`Atraviesa la pleura ${tr.pleura} veces (más riesgo de neumotórax).`);
  if (tr.lungLength > 30) warnings.push(`Recorre ${Math.round(tr.lungLength)} mm de pulmón aireado antes del nódulo: cuanto más largo, más riesgo de neumotórax.`);
  if (nodule && Math.hypot(target.x - nodule.x, target.y - nodule.y, z - nodule.z) > nodule.r) warnings.push('El objetivo no está dentro del nódulo en este corte.');
  return { ...tr, angle, entryIn: at, warnings, safe: !tr.forbidden.length && !tr.vessels.length };
}

// Estado de la aguja: puntos de la trayectoria real (la punta es el último)
export function newNeedle(entry, target, z, seed) {
  return { z, points: [{ ...entry }], target: { ...target }, rnd: seed, deflections: 0 };
}

// Avanza la aguja d mm hacia el objetivo con una desviación angular pequeña (±4°) que cambia en cada pase
export function advance(needle, d) {
  const tip = needle.points[needle.points.length - 1];
  const rnd = mulberry32((needle.rnd = (needle.rnd * 1103515245 + 12345) >>> 0));
  const dev = ((rnd() - 0.5) * 8 * Math.PI) / 180;
  const ang = Math.atan2(needle.target.y - tip.y, needle.target.x - tip.x) + dev;
  const nt = { x: tip.x + d * Math.cos(ang), y: tip.y + d * Math.sin(ang) };
  needle.points.push(nt);
  needle.deflections += Math.abs(dev);
  return nt;
}

export const tipOf = (needle) => needle.points[needle.points.length - 1];

// Estructuras de la aguja (metal) para el fantasma: un segmento por pase
export function needleExtras(needle) {
  if (!needle) return [];
  const out = [];
  for (let i = 0; i < needle.points.length - 1; i++) {
    const a = needle.points[i], b = needle.points[i + 1];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 0.5) continue;
    const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2], rot = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    out.push({ ...lesion.ell('aguja', [mid[0], mid[1], needle.z], [L / 2, 0.7, 0.7], { hu: 50, bone: 6000 }), shape: { ...tube(needle.z - 0.7, needle.z + 0.7, mid, mid, [L / 2, 0.7], [L / 2, 0.7]), rot } });
  }
  return out;
}

// Neumotórax: aire entre la pared y el pulmón, delante y por fuera (paciente en supino)
export function pneumothoraxExtras(side = -1, z = 430) {
  const cav = tube(345, 560, [0, 0], [0, 2], [140, 84], [146, 92]);
  // Línea de la pleura visceral (borde del pulmón despegado) y aire sin trama vascular por fuera de ella
  return [
    lesion.ell('pleura-visceral', [side * 100, 50, z], [47, 18, 72], { hu: -250 }, { clip: cav }),
    lesion.ell('neumotorax', [side * 100, 51.5, z], [45.5, 16, 70], { hu: -1000 }, { clip: cav }),
  ];
}

// Probabilidad de neumotórax según el pulmón aireado atravesado y el número de punciones pleurales
export function pneumoRisk(lungLength, pleura, passes) {
  return Math.max(0.04, Math.min(0.9, (lungLength - 8) / 55 + 0.12 * Math.max(0, pleura - 1) + 0.04 * Math.max(0, passes - 2)));
}

export function evaluateBiopsy(S, answer) {
  const b = S.biopsy, nod = S.caseDef.nodule, items = [];
  const tip = b.needle ? tipOf(b.needle) : null;
  const dist = tip ? Math.hypot(tip.x - nod.x, tip.y - nod.y, b.needle.z - nod.z) : Infinity;
  const hit = b.sampled && dist <= nod.r;
  items.push({ label: 'Precisión: muestra dentro del nódulo', max: 30, got: hit ? 30 : b.sampled && dist <= nod.r + 4 ? 10 : 0, comment: b.sampled ? `Punta a ${dist.toFixed(1)} mm del centro (radio ${nod.r} mm).` : 'No se tomó la muestra.' });
  const tr = b.finalTrace;
  items.push({ label: 'Trayectoria segura', max: 20, got: tr ? (tr.forbidden.length ? 0 : tr.vessels.length ? 10 : 20) : 0, comment: tr ? (tr.forbidden.length ? `Atravesó ${tr.forbidden.join(', ')}.` : tr.vessels.length ? `Pasó por ${tr.vessels.join(', ')}.` : 'Sin estructuras de riesgo en el trayecto.') : 'Sin trayectoria.' });
  items.push({ label: 'Pleura y pulmón atravesado', max: 15, got: tr ? (tr.pleura <= 1 && tr.lungLength <= 25 ? 15 : tr.pleura <= 1 && tr.lungLength <= 45 ? 8 : 2) : 0, comment: tr ? `${tr.pleura} punción(es) pleural(es), ${Math.round(tr.lungLength)} mm de pulmón aireado.` : '' });
  const pneumoOk = answer === (b.pneumothorax ? 1 : 0);
  items.push({ label: 'Control final: detección de complicaciones', max: 10, got: pneumoOk ? 10 : 0, comment: b.pneumothorax ? (pneumoOk ? 'Detectó el neumotórax del control final.' : 'Había un neumotórax en el control final y no se detectó.') : (pneumoOk ? 'Sin neumotórax, bien valorado.' : 'No había neumotórax.') });
  const n = b.controls;
  items.push({ label: 'Dosis: cortes de control', max: 15, got: n <= 4 ? 15 : n <= 7 ? 8 : 3, comment: `${n} control(es).` });
  const minutes = (Date.now() - S.startTime) / 60000;
  items.push({ label: 'Tiempo', max: 10, got: minutes <= 10 ? 10 : minutes <= 20 ? 5 : 0, comment: `${Math.round(minutes)} min.` });
  const total = items.reduce((s, i) => s + i.got, 0);
  return {
    student: S.student || 'Sin nombre', case: S.caseDef.title, caseKey: S.caseDef.key, date: new Date().toISOString(), realMinutes: Math.round(minutes), total, max: 100, percent: total, items,
    series: [],
    explanation: 'Una buena trayectoria es la más corta por pulmón aireado, perpendicular a la pleura, una sola punción pleural, entre costillas y lejos de vasos, cisuras y bullas. Cada corte de control irradia: se avanza con pocos controles bien elegidos. Tras la biopsia siempre se hace un control para descartar neumotórax o hemorragia.',
  };
}
