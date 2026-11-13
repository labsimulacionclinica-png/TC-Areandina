// Fantasma anatómico matemático de cuerpo entero (vértex → muslos) para TC.
// Coordenadas del paciente en mm: x = izquierda del paciente (+), y = anterior (+), z = desde el vértex hacia los pies.
// Cada estructura es un elipsoide o un tubo (sección elíptica que varía linealmente en z) con un valor HU.
// Se pinta en orden ("pintor"): la última estructura que cubre un punto define su valor.
// HU blando (`hu`) y componente "dura" (`bone`: calcio o metal) se separan porque cambian distinto con el kV
// y porque solo la componente dura produce endurecimiento del haz.

// --- Formas -----------------------------------------------------------------

export const ell = (c, r, o = {}) => ({ type: 'ell', c, r, rot: o.rot || 0, zmin: o.zmin ?? -Infinity, zmax: o.zmax ?? Infinity });
export const tube = (z0, z1, c0, c1, r0, r1 = r0, o = {}) => ({ type: 'tube', z0, z1, c0, c1, r0, r1, rot: o.rot || 0 });

// Sección de una forma en el plano z → { cx, cy, rx, ry, rot } o null
export function section(s, z) {
  if (s.type === 'ell') {
    if (z < s.zmin || z > s.zmax) return null;
    const u = (z - s.c[2]) / s.r[2];
    if (u <= -1 || u >= 1) return null;
    const k = Math.sqrt(1 - u * u);
    return { cx: s.c[0], cy: s.c[1], rx: s.r[0] * k, ry: s.r[1] * k, rot: s.rot };
  }
  if (z < s.z0 || z > s.z1) return null;
  const f = s.z1 === s.z0 ? 0 : (z - s.z0) / (s.z1 - s.z0);
  const L = (a, b) => a + (b - a) * f;
  return { cx: L(s.c0[0], s.c1[0]), cy: L(s.c0[1], s.c1[1]), rx: L(s.r0[0], s.r1[0]), ry: L(s.r0[1], s.r1[1]), rot: s.rot };
}

export function zExtent(s) {
  if (s.type === 'ell') return [Math.max(s.zmin, s.c[2] - s.r[2]), Math.min(s.zmax, s.c[2] + s.r[2])];
  return [s.z0, s.z1];
}

const inside = (cs, x, y) => {
  const dx = x - cs.cx, dy = y - cs.cy;
  if (!cs.rot) return (dx * dx) / (cs.rx * cs.rx) + (dy * dy) / (cs.ry * cs.ry) <= 1;
  const a = (cs.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const u = dx * c + dy * s, v = -dx * s + dy * c;
  return (u * u) / (cs.rx * cs.rx) + (v * v) / (cs.ry * cs.ry) <= 1;
};

// --- Materiales -------------------------------------------------------------
// hu: parte blanda (no cambia con el kV); bone: parte cálcica/metálica en HU a 120 kV; comp: compartimento de realce.

const M = {
  air: { hu: -1000 },
  lung: { hu: -860 },
  fat: { hu: -100 },
  fluid: { hu: 8 },
  csf: { hu: 6 },
  muscle: { hu: 50, comp: 'muscle' },
  soft: { hu: 40 },
  blood: { hu: 40 },
  gray: { hu: 38, comp: 'perfGM' },
  white: { hu: 28, comp: 'perfWM' },
  cortical: { hu: 50, bone: 1150 },
  cancellous: { hu: 40, bone: 230 },
  bone: { hu: 50, bone: 600 },
  cartilage: { hu: 110 },
  disc: { hu: 85 },
  metal: { hu: 50, bone: 9000 },
};
const S = (name, shape, mat, extra = {}) => ({ name, shape, hu: mat.hu, bone: mat.bone || 0, comp: mat.comp || null, ...extra });

// Pequeño generador pseudoaleatorio con semilla (anatomía reproducible)
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Puntos de referencia (láser) -------------------------------------------
export const LANDMARKS = {
  vertex: { label: 'Vértex', z: 0 },
  nasion: { label: 'Nasion (línea orbitomeatal)', z: 140 },
  menton: { label: 'Mentón', z: 225 },
  escotadura: { label: 'Escotadura esternal', z: 335 },
  xifoides: { label: 'Apéndice xifoides', z: 545 },
  cresta: { label: 'Crestas ilíacas', z: 790 },
  sinfisis: { label: 'Sínfisis del pubis', z: 940 },
};

// Rangos anatómicos (z) que usan la planificación y la evaluación
export const ANATOMY_Z = {
  head: [5, 162],          // vértex – agujero magno
  neck: [160, 345],
  lungs: [338, 568],       // vértices – recesos costofrénicos
  liver: [548, 710],
  kidneys: [640, 770],
  abdomenPelvis: [545, 950],
  bladder: [870, 945],
  pa: [415, 470],          // tronco y arterias pulmonares principales
};

// --- Construcción de la anatomía ----------------------------------------------

function spine(list, { z0, z1, h, y0, y1, r }) {
  const yAt = (z) => y0 + ((y1 - y0) * (z - z0)) / (z1 - z0);
  for (let z = z0; z < z1 - 4; z += h) {
    const zb = Math.min(z + h - 5, z1), y = yAt(z + h / 2);
    list.push(S('vertebra-cortical', tube(z, zb, [0, y], [0, y], [r[0] + 2, r[1] + 2]), M.cortical));
    list.push(S('vertebra', tube(z + 1, zb - 1, [0, y], [0, y], r), M.cancellous));
    list.push(S('disco', tube(zb, z + h, [0, y], [0, y], [r[0] + 1, r[1] + 1]), M.disc));
    list.push(S('arco-posterior', tube(z, zb, [0, y - r[1] - 12], [0, y - r[1] - 12], [r[0] * 0.95, 12]), M.cortical, { bone: 650 }));
    list.push(S('apofisis-espinosa', tube(z + 2, zb - 2, [0, y - r[1] - 26], [0, y - r[1] - 26], [4, 10]), M.cortical, { bone: 650 }));
    list.push(S('apofisis-transversa', tube(z + 3, zb - 3, [0, y - r[1] - 8], [0, y - r[1] - 8], [r[0] * 2.1, 5]), M.cortical, { bone: 550 }));
  }
  list.push(S('canal-medular', tube(z0, z1, [0, y0 - r[1] - 10], [0, y1 - r[1] - 10], [8, 7]), M.csf));
}

// Capas del tronco: grasa subcutánea → pared muscular → cavidad
function trunk(list, seg, fatMm) {
  const { z0, z1, c0, c1, r0, r1 } = seg;
  const add = (a, d) => [a[0] + d, a[1] + d];
  list.push(S('grasa-subcutanea', tube(z0, z1, c0, c1, add(r0, fatMm), add(r1, fatMm)), M.fat, { outline: true }));
  list.push(S('pared-muscular', tube(z0, z1, c0, c1, r0, r1), M.muscle));
}
const cavityOf = (seg, inset = 12) => tube(seg.z0, seg.z1, seg.c0, seg.c1, [seg.r0[0] - inset, seg.r0[1] - inset], [seg.r1[0] - inset, seg.r1[1] - inset]);

export function buildAnatomy(opts = {}) {
  const { weight = 75, arms = 'down', sex = 'M', extras = [] } = opts;
  const L = [];
  const fat = Math.max(5, Math.min(75, 14 * Math.pow(weight / 75, 2)));
  const rnd = mulberry32(opts.seed || 7);

  // ---------- Cabeza ----------
  L.push(S('cuero-cabelludo', ell([0, 4, 112], [79, 100, 116], { zmin: 0, zmax: 212 }), { hu: 25 }, { outline: true }));
  // Calota: tabla externa, díploe (hueso esponjoso) y tabla interna
  L.push(S('craneo', ell([0, 2, 104], [73, 93, 100], { zmax: 162 }), M.cortical));
  L.push(S('diploe', ell([0, 1.6, 103.4], [71.2, 91, 98.2], { zmax: 158 }), { hu: 40, bone: 420 }));
  L.push(S('tabla-interna', ell([0, 1, 102.4], [69, 88.5, 96], { zmax: 156 }), M.cortical));
  L.push(S('lcr-subaracnoideo', ell([0, 0, 101], [67, 86, 94], { zmax: 152 }), M.csf));
  L.push(S('cerebro', ell([0, 0, 101], [65, 84, 92], { zmax: 151 }), M.gray));
  // Surcos corticales: hendiduras de LCR orientadas hacia el centro (la sustancia blanca se pinta después)
  const brainShape = ell([0, 0, 101], [65, 84, 92]);
  for (let z = 22; z <= 132; z += 9) {
    const cs = section(brainShape, z);
    if (!cs || cs.rx < 25) continue;
    const nS = Math.round(cs.rx / 2.6);
    for (let i = 0; i < nS; i++) {
      const a = ((i + 0.5 + (rnd() - 0.5) * 0.5) / nS) * 2 * Math.PI;
      const depth = 6 + rnd() * 6;
      const x = (cs.rx - depth * 0.7) * Math.cos(a), y = (cs.ry - depth * 0.7) * Math.sin(a);
      const ang = (Math.atan2(y / (cs.ry * cs.ry), x / (cs.rx * cs.rx)) * 180) / Math.PI; // normal al contorno
      L.push(S('surco', ell([x, y, z + (rnd() - 0.5) * 4], [depth, 1.3, 6 + rnd() * 4], { rot: ang }), M.csf));
    }
  }
  L.push(S('cisura-interhemisferica', tube(20, 120, [0, 0], [0, 0], [1.6, 80], [1.6, 78]), M.csf, { clip: brainShape }));
  for (const s of [-1, 1]) {
    L.push(S('sustancia-blanca', ell([s * 28, 4, 84], [25, 58, 40]), M.white));
    L.push(S('nucleos-basales', ell([s * 18, 10, 94], [7, 14, 10]), M.gray));
    L.push(S('ventriculo-lateral', ell([s * 8, 8, 82], [5, 27, 17]), M.csf));
    L.push(S('cisura-silvio', ell([s * 58, 22, 100], [4, 16, 12]), M.csf));
  }
  L.push(S('tercer-ventriculo', ell([0, 0, 97], [2, 12, 8]), M.csf));
  L.push(S('cerebelo', ell([0, -48, 138], [50, 30, 18]), M.gray));
  // Arterias cerebrales: carótidas internas, polígono de Willis, ACM, ACA, ACP, basilar y vertebrales
  const CA = { hu: 40, comp: 'cerebralArt' };
  for (const s of [-1, 1]) {
    L.push(S('carotida-interna', tube(128, 205, [s * 15, 14], [s * 20, 16], [2.4, 2.4]), CA));
    L.push(S('ACM-M1', tube(122, 128, [s * 31, 16], [s * 31, 16], [16, 1.9], [16, 1.9]), CA));
    L.push(S('ACM-M2', tube(78, 124, [s * 54, 8], [s * 46, 18], [1.4, 1.4]), CA));
    L.push(S('ACM-M2', tube(80, 124, [s * 52, 30], [s * 46, 18], [1.3, 1.3]), CA));
    L.push(S('ACA', tube(60, 124, [s * 3, 52], [s * 4, 24], [1.5, 1.5]), CA));
    L.push(S('ACP', tube(126, 131, [s * 22, -14], [s * 22, -14], [15, 1.6], [15, 1.6], { rot: s * 28 }), CA));
    L.push(S('arteria-vertebral', tube(168, 300, [s * 6, -22], [s * 20, -26], [2, 2]), CA));
  }
  L.push(S('comunicante-anterior', tube(123, 126, [0, 26], [0, 26], [5, 1.2], [5, 1.2]), CA));
  L.push(S('basilar', tube(128, 168, [0, -18], [0, -22], [2, 2]), CA));
  // Senos venosos durales: seno sagital superior y senos transversos
  for (let a = 0.15; a < 2.9; a += 0.12) {
    L.push(S('seno-sagital', ell([0, 84.5 * Math.cos(a), 101 - 92 * Math.sin(a)], [4.5, 4.5, 4.5]), { hu: 40, comp: 'venous' }));
  }
  for (const s of [-1, 1]) L.push(S('seno-transverso', tube(128, 134, [s * 40, -68], [s * 40, -68], [24, 3], [24, 3], { rot: s * -35 }), { hu: 40, comp: 'venous' }));
  L.push(S('cuarto-ventriculo', ell([0, -32, 136], [6, 4, 6]), M.csf));
  L.push(S('seno-frontal', ell([0, 89, 120], [17, 5, 11]), M.air));
  for (const s of [-1, 1]) {
    L.push(S('orbita', ell([s * 32, 76, 150], [16, 14, 15]), M.fat));
    L.push(S('globo-ocular', ell([s * 32, 80, 149], [12, 12, 12]), { hu: 12 }));
    L.push(S('penasco', ell([s * 38, -15, 152], [24, 8, 8], { rot: s * 35 }), M.cortical, { bone: 1500 }));
    L.push(S('mastoides', ell([s * 56, -27, 156], [9, 9, 9]), { hu: -600, bone: 250 }));
  }
  L.push(S('maxilar', ell([0, 55, 190], [46, 34, 14]), M.bone));
  for (const s of [-1, 1]) L.push(S('seno-maxilar', ell([s * 28, 58, 180], [15, 17, 17]), M.air));
  L.push(S('fosa-nasal', ell([0, 72, 176], [7, 18, 20]), M.air));
  L.push(S('mandibula', tube(196, 224, [0, 46], [0, 44], [47, 44]), M.cortical, { bone: 900 }));
  L.push(S('cavidad-oral', tube(196, 224, [0, 48], [0, 46], [39, 35]), M.soft));

  // ---------- Cuello ----------
  L.push(S('cuello-grasa', tube(205, 302, [0, -6], [0, -8], [56, 59], [64, 66]), M.fat, { outline: true }));
  L.push(S('cuello-musculo', tube(205, 302, [0, -6], [0, -8], [50, 53], [57, 59]), M.muscle));

  // ---------- Tronco ----------
  const segs = {
    shoulders: { z0: 300, z1: 345, c0: [0, -6], c1: [0, 0], r0: [70, 58], r1: [162, 100] },
    chest: { z0: 345, z1: 560, c0: [0, 0], c1: [0, 2], r0: [162, 100], r1: [156, 104] },
    abdomen: { z0: 560, z1: 800, c0: [0, 4], c1: [0, 2], r0: [156, 104], r1: [150, 98] },
    pelvis: { z0: 800, z1: 990, c0: [0, 2], c1: [0, -2], r0: [150, 98], r1: [140, 92] },
  };
  for (const k of Object.keys(segs)) trunk(L, segs[k], fat);

  // Costillas: arcos oblicuos (la parte anterior queda más baja que la posterior) formados por segmentos cortos.
  // Se pintan antes que la cavidad, que luego respeta la pared.
  for (let k = 0, z = 340; z < 600; k++, z += 21) {
    const seg = z < 560 ? segs.chest : segs.abdomen;
    for (let a = -180; a < 180; a += 9) {
      const ar = (a * Math.PI) / 180, sn = Math.sin(ar);
      if (sn > 0.82) continue; // cartílagos costales junto al esternón
      if (z > 560 && sn > 0.2) continue; // costillas flotantes: solo laterales y posteriores
      const zz = z + 26 * (1 + sn) / 2 + 8;
      const cs = section(tube(seg.z0, seg.z1, seg.c0, seg.c1, seg.r0, seg.r1), Math.min(seg.z1, Math.max(seg.z0, zz)));
      if (!cs) continue;
      L.push(S('costilla', ell([cs.cx + (cs.rx - 5) * Math.cos(ar), cs.cy + (cs.ry - 5) * sn, zz], [6, 6, 5]), M.cortical, { bone: 650 }));
    }
  }
  const chestCav = tube(330, 562, [0, 0], [0, 2], [140, 84], [146, 92]);
  const abdCav = tube(540, 800, [0, 4], [0, 2], [144, 92], [138, 86]);
  const pelCav = tube(800, 990, [0, 2], [0, -2], [138, 86], [128, 80]);
  L.push(S('cavidad-toracica', tube(330, 345, [0, -4], [0, 0], [60, 46], [140, 84]), M.fat));
  L.push(S('cavidad-toracica', tube(345, 560, [0, 0], [0, 2], [140, 84], [146, 92]), M.fat));
  L.push(S('cavidad-abdominal', abdCav, M.fat));
  L.push(S('cavidad-pelvica', pelCav, M.fat));
  L.push(S('esternon', tube(350, 530, [0, 92], [0, 96], [16, 7]), M.cancellous, { bone: 350 }));
  for (const s of [-1, 1]) {
    L.push(S('escapula', tube(325, 440, [s * 105, -78], [s * 95, -80], [36, 5], [26, 5], { rot: s * 22 }), M.cortical, { bone: 700 }));
    L.push(S('clavicula', tube(318, 336, [s * 30, 70], [s * 120, 30], [10, 8]), M.cortical, { bone: 800 }));
  }

  // ---------- Tórax ----------
  for (const s of [-1, 1]) {
    L.push(S(s < 0 ? 'pulmon-derecho' : 'pulmon-izquierdo', ell([s * 74, 0, 455], [84, 100, 128], { zmin: 332, zmax: 568 }), M.lung, { clip: chestCav }));
  }
  // Vasos pulmonares periféricos (trama vascular)
  for (const s of [-1, 1]) {
    for (let i = 0; i < 70; i++) {
      const z = 360 + rnd() * 200, x = s * (25 + rnd() * 100), y = -70 + rnd() * 140;
      const lungCs = section(ell([s * 74, 0, 455], [84, 100, 128]), z), cav = section(chestCav, z);
      if (!lungCs || !cav || !inside(lungCs, x, y) || !inside({ ...cav, rx: cav.rx - 8, ry: cav.ry - 8 }, x, y)) continue;
      const r = 1.2 + rnd() * 2.2 * (1 - Math.abs(x) / 140);
      L.push(S('vaso-pulmonar', ell([x, y, z], [r, r, 6 + rnd() * 14]), M.blood, { comp: rnd() < 0.55 ? 'pa' : 'pv' }));
    }
  }
  L.push(S('mediastino', tube(332, 430, [0, 12], [4, 20], [24, 34], [34, 56]), { hu: -40 }, { clip: chestCav }));
  // Corazón (grupo 'heart': se mueve con el ciclo cardíaco en la TC sincronizada)
  const H = { group: 'heart' };
  L.push(S('grasa-pericardica', ell([12, 30, 488], [68, 61, 68], { zmin: 425, zmax: 556 }), M.fat, { clip: chestCav, ...H }));
  L.push(S('miocardio', ell([12, 30, 488], [62, 55, 62], { zmin: 428, zmax: 554 }), M.muscle, { comp: 'myocardium', clip: chestCav, ...H }));
  L.push(S('ventriculo-derecho', ell([-14, 46, 492], [30, 22, 44], { rot: 20, zmin: 438, zmax: 540 }), M.blood, { comp: 'pa', ...H }));
  L.push(S('ventriculo-izquierdo', ell([26, 22, 490], [30, 28, 46], { rot: -30, zmin: 436, zmax: 545 }), M.blood, { comp: 'aorta', ...H }));
  L.push(S('auriculas', ell([10, 4, 460], [44, 18, 24]), M.blood, { comp: 'heart', ...H }));
  L.push(S('tabique', ell([8, 36, 490], [4, 40, 46], { rot: -40, zmin: 440, zmax: 545 }), M.muscle, { comp: 'myocardium', ...H }));
  // Arterias coronarias en la grasa epicárdica: descendente anterior (DA), circunfleja (Cx) y coronaria derecha (CD)
  const coronary = (name, pts, r) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0, z0] = pts[i], [x1, y1, z1] = pts[i + 1];
      L.push(S(name, tube(z0, z1, [x0, y0], [x1, y1], [r, r]), M.blood, { comp: 'aorta', ...H }));
    }
  };
  coronary('coronaria-DA', [[20, 60, 446], [28, 74, 458], [34, 82, 475], [42, 78, 505], [50, 62, 540]], 1.8);
  coronary('coronaria-Cx', [[24, 50, 448], [52, 34, 462], [66, 12, 480], [62, -10, 505]], 1.6);
  coronary('coronaria-CD', [[2, 54, 450], [-30, 58, 462], [-50, 30, 482], [-48, 0, 505], [-28, -16, 530]], 1.8);
  L.push(S('paravertebral', tube(332, 800, [0, -64], [0, -50], [34, 26], [40, 24]), M.muscle));
  L.push(S('aorta-ascendente', tube(398, 470, [8, 30], [8, 36], [15, 15]), M.blood, { comp: 'aorta' }));
  L.push(S('cayado-aortico', tube(388, 404, [6, 6], [6, 6], [14, 38], [14, 38], { rot: 55 }), M.blood, { comp: 'aorta' }));
  L.push(S('aorta-descendente', tube(396, 560, [26, -32], [14, -24], [13, 13]), M.blood, { comp: 'aorta' }));
  L.push(S('tronco-pulmonar', tube(420, 452, [36, 52], [32, 40], [12, 12]), M.blood, { comp: 'pa' }));
  L.push(S('arteria-pulmonar-derecha', tube(422, 440, [-30, 8], [-34, 6], [32, 9], [32, 9], { rot: 8 }), M.blood, { comp: 'pa' }));
  L.push(S('arteria-pulmonar-izquierda', tube(414, 432, [40, 8], [44, 6], [24, 9], [24, 9], { rot: -35 }), M.blood, { comp: 'pa' }));
  for (const s of [-1, 1]) {
    L.push(S('arteria-lobar-inferior', tube(436, 530, [s * 56, -10], [s * 64, -30], [5.5, 5.5]), M.blood, { comp: 'pa' }));
    L.push(S('arteria-lobar-superior', tube(380, 430, [s * 50, 20], [s * 46, 14], [4.5, 4.5]), M.blood, { comp: 'pa' }));
    L.push(S('vena-pulmonar', tube(460, 500, [s * 46, 0], [s * 30, 6], [5, 5]), M.blood, { comp: 'pv' }));
  }
  L.push(S('vena-cava-superior', tube(372, 462, [-28, 32], [-26, 30], [10, 10]), M.blood, { comp: 'svc' }));
  L.push(S('tronco-braquiocefalico-venoso', tube(350, 372, [24, 40], [-20, 36], [9, 8], [9, 8], { rot: 15 }), M.blood, { comp: 'svc' }));
  L.push(S('vena-subclavia', tube(318, 350, [-130, 34], [-40, 38], [7, 7]), M.blood, { comp: 'svc' }));
  L.push(S('troncos-supraaorticos', tube(300, 390, [-10, 22], [4, 12], [6, 6]), M.blood, { comp: 'aorta' }));
  L.push(S('esofago', tube(230, 340, [4, 8], [4, -14], [7, 7]), M.soft));
  L.push(S('esofago', tube(340, 560, [4, -14], [-4, -14], [7, 7]), M.soft));
  L.push(S('traquea', tube(218, 420, [0, 26], [0, 4], [9, 9]), M.air));
  L.push(S('cartilago-tiroides', ell([0, 34, 236], [19, 14, 12]), M.cartilage));
  L.push(S('laringe', tube(222, 250, [0, 30], [0, 28], [8, 6]), M.air));
  // Árbol bronquial: bronquios lobares y segmentarios con pared
  const bronchus = (z0, z1, c0, c1, r) => {
    L.push(S('pared-bronquial', tube(z0, z1, c0, c1, [r + 1.2, r + 1.2]), M.soft));
    L.push(S('bronquio', tube(z0, z1, c0, c1, [r, r]), M.air));
  };
  for (const s of [-1, 1]) {
    bronchus(446, 520, [s * 34, -6], [s * 58, -28], 4);          // lobar inferior
    bronchus(470, 540, [s * 50, -18], [s * 80, -10], 2.6);       // segmentario lateral basal
    bronchus(470, 545, [s * 46, -20], [s * 40, -52], 2.6);       // segmentario posterior basal
    bronchus(400, 446, [s * 32, -4], [s * 50, 10], 3.5);         // lobar superior
    bronchus(365, 405, [s * 48, 10], [s * 44, 40], 2.4);         // segmentario anterior
    bronchus(360, 405, [s * 48, 10], [s * 56, -30], 2.4);        // segmentario posterior
  }
  bronchus(450, 495, [-40, -8], [-62, 26], 3);                   // lóbulo medio
  bronchus(450, 495, [40, -8], [58, 24], 3);                     // língula
  for (const s of [-1, 1]) {
    L.push(S('bronquio-principal', tube(420, 452, [s * 10, 4], [s * 34, -6], [6, 6]), M.air));
    L.push(S('carotida', tube(205, 305, [s * 22, 16], [s * 14, 18], [4, 4]), M.blood, { comp: 'aorta' }));
    L.push(S('yugular', tube(200, 318, [s * 32, 8], [s * 30, 20], [6, 6]), M.blood, { comp: 'jugular' }));
    L.push(S('tiroides', ell([s * 16, 28, 288], [9, 8, 18]), { hu: 90 }, { comp: 'thyroid' }));
  }

  // ---------- Abdomen ----------
  L.push(S('higado', ell([-56, 12, 610], [100, 98, 85], { zmin: 540, zmax: 712 }), { hu: 60 }, { comp: 'liver', clip: abdCav }));
  for (let i = 0; i < 4; i++) L.push(S('vena-hepatica', tube(552, 600, [-15 - i * 22, 6 + i * 4], [-40 - i * 26, 24 - i * 6], [4, 4]), M.blood, { comp: 'hepvein' }));
  L.push(S('vena-porta', tube(625, 652, [-34, 10], [-8, 6], [8, 7]), M.blood, { comp: 'portal' }));
  for (let i = 0; i < 4; i++) L.push(S('rama-portal', tube(600, 628, [-40 - i * 15, 10 + (i % 2) * 14], [-36 - i * 6, 10], [3.5, 3.5]), M.blood, { comp: 'portal' }));
  L.push(S('vesicula', ell([-48, 56, 650], [15, 20, 26]), { hu: 10 }));
  L.push(S('bazo', ell([92, -38, 605], [36, 56, 55], { zmin: 548 }), { hu: 48 }, { comp: 'spleen', clip: abdCav }));
  L.push(S('estomago', ell([52, 34, 592], [50, 40, 42]), { hu: 25 }, { comp: 'bowel', clip: abdCav }));
  L.push(S('aire-gastrico', ell([52, 52, 590], [40, 16, 30]), M.air));
  L.push(S('pancreas', tube(640, 658, [14, 12], [14, 12], [58, 11], [58, 11], { rot: -12 }), { hu: 45 }, { comp: 'pancreas' }));
  L.push(S('aorta-abdominal', tube(560, 792, [12, -18], [8, -4], [12, 12], [10, 10]), M.blood, { comp: 'aorta' }));
  L.push(S('tronco-celiaco', tube(626, 640, [11, -8], [10, 8], [4, 4]), M.blood, { comp: 'aorta' }));
  L.push(S('arteria-mesenterica', tube(650, 760, [10, -6], [12, 20], [4, 4]), M.blood, { comp: 'aorta' }));
  L.push(S('vena-mesenterica', tube(655, 760, [-2, 14], [0, 30], [5.5, 5.5]), M.blood, { comp: 'portal' }));
  L.push(S('vena-cava-inferior', tube(545, 792, [-26, -14], [-20, -6], [12, 10]), M.blood, { comp: 'ivc' }));
  for (const s of [-1, 1]) {
    const zc = s < 0 ? 712 : 696;
    L.push(S('grasa-perirrenal', ell([s * 76, -52, zc], [36, 31, 62]), M.fat));
    L.push(S('corteza-renal', ell([s * 76, -52, zc], [30, 25, 55], { rot: s * -20 }), { hu: 35 }, { comp: 'kcortex' }));
    L.push(S('medula-renal', ell([s * 76, -52, zc], [19, 14, 40], { rot: s * -20 }), { hu: 32 }, { comp: 'kmedulla' }));
    L.push(S('seno-renal', ell([s * 64, -46, zc], [9, 8, 22]), M.fat));
    L.push(S('pelvis-renal', ell([s * 60, -44, zc], [6, 5, 12]), M.fluid, { comp: 'urine' }));
    L.push(S('arteria-renal', tube(zc - 6, zc + 2, [s * 10 + 10, -14], [s * 50, -42], [3, 3]), M.blood, { comp: 'aorta' }));
    L.push(S('vena-renal', tube(zc + 2, zc + 10, [-20, -8], [s * 50, -40], [4, 4]), M.blood, { comp: 'ivc' }));
    L.push(S('ureter', tube(zc + 14, 840, [s * 58, -44], [s * 48, -36], [3, 3]), M.fluid, { comp: 'urine' }));
    L.push(S('ureter', tube(840, 905, [s * 48, -36], [s * 26, 22], [3, 3]), M.fluid, { comp: 'urine' }));
    L.push(S('psoas', tube(690, 860, [s * 38, -50], [s * 58, -36], [10, 10], [22, 20]), M.muscle));
  }
  // Colon
  const colon = (name, shape, wall) => {
    L.push(S(name, shape, { hu: 35 }, { comp: 'bowel' }));
    const inner = shape.type === 'tube' ? { ...shape, r0: [shape.r0[0] - wall, shape.r0[1] - wall], r1: [shape.r1[0] - wall, shape.r1[1] - wall] } : { ...shape, r: [shape.r[0] - wall, shape.r[1] - wall, shape.r[2] - wall] };
    L.push(S(name + '-luz', inner, M.air));
  };
  colon('colon-ascendente', tube(700, 830, [-112, 4], [-108, 10], [22, 22]), 4);
  colon('colon-transverso', tube(668, 690, [0, 62], [0, 64], [112, 20], [112, 20]), 4);
  colon('colon-descendente', tube(640, 840, [112, -18], [104, -6], [17, 17]), 4);
  colon('sigma', ell([34, 6, 878], [32, 22, 26]), 4);
  for (const z of [715, 750, 785, 820]) {
    for (const x of [-62, -22, 20, 60]) {
      const xx = x + (rnd() - 0.5) * 10, yy = 30 + (rnd() - 0.5) * 30, zz = z + (rnd() - 0.5) * 10;
      L.push(S('asa-intestinal', ell([xx, yy, zz], [17, 15, 14]), { hu: 35 }, { comp: 'bowel', clip: abdCav }));
      L.push(S('asa-intestinal-luz', ell([xx, yy, zz], [12, 10, 10]), { hu: rnd() < 0.3 ? -1000 : 15 }));
    }
  }

  // ---------- Pelvis ----------
  for (const s of [-1, 1]) {
    L.push(S('ala-iliaca', ell([s * 104, -42, 832], [52, 13, 46], { rot: s * 40 }), M.cortical, { bone: 600, clip: tube(780, 990, [0, 2], [0, -2], [150, 98], [140, 92]) }));
    L.push(S('cabeza-femoral-cortical', ell([s * 88, -6, 915], [27, 27, 27]), M.cortical, { bone: 900 }));
    L.push(S('cabeza-femoral', ell([s * 88, -6, 915], [24, 24, 24]), M.cancellous, { bone: 260 }));
    L.push(S('cuello-femoral', tube(918, 990, [s * 94, -6], [s * 104, -4], [17, 17]), M.cortical, { bone: 1000 }));
    L.push(S('medula-femoral', tube(925, 990, [s * 95, -6], [s * 104, -4], [10, 10]), { hu: -40 }));
    L.push(S('pubis', ell([s * 26, 58, 938], [24, 10, 12]), M.cortical, { bone: 600 }));
    L.push(S('arteria-iliaca', tube(792, 905, [8 + s * 6, -6], [s * 60, -8], [7, 7], [6, 6]), M.blood, { comp: 'aorta' }));
    L.push(S('vena-iliaca', tube(792, 905, [-18 + s * 8, -10], [s * 54, -16], [8, 8]), M.blood, { comp: 'ivc' }));
  }
  L.push(S('vejiga', ell([0, 38, 905], [46, 38, 36]), M.fluid, { comp: 'bladder' }));
  L.push(S('recto', tube(862, 990, [0, -58], [0, -46], [16, 16]), { hu: 35 }, { comp: 'bowel' }));
  L.push(S('recto-luz', tube(866, 990, [0, -56], [0, -44], [7, 5]), M.air));
  if (sex === 'M') L.push(S('prostata', ell([0, 20, 960], [18, 16, 18]), { hu: 40 }, { comp: 'bowel' }));
  else L.push(S('utero', ell([0, 6, 880], [30, 22, 36]), { hu: 45 }, { comp: 'uterus' }));

  // ---------- Columna ----------
  spine(L, { z0: 162, z1: 336, h: 18, y0: -18, y1: -42, r: [11, 10] });
  spine(L, { z0: 336, z1: 560, h: 22, y0: -58, y1: -62, r: [14, 13] });
  spine(L, { z0: 560, z1: 800, h: 34, y0: -52, y1: -42, r: [20, 16] });
  L.push(S('sacro-cortical', tube(800, 905, [0, -50], [0, -78], [42, 16], [24, 10]), M.cortical, { bone: 700 }));
  L.push(S('sacro', tube(802, 900, [0, -50], [0, -78], [38, 13], [21, 8]), M.cancellous));

  // ---------- Brazos ----------
  for (const s of [-1, 1]) {
    if (arms === 'down') {
      L.push(S('brazo', tube(300, 800, [s * 212, -6], [s * 214, 0], [40 + fat * 0.6, 42 + fat * 0.6], [34 + fat * 0.6, 36 + fat * 0.6]), M.fat, { outline: true, group: 'arm' }));
      L.push(S('brazo-musculo', tube(300, 800, [s * 212, -6], [s * 214, 0], [36, 38], [30, 32]), M.muscle, { group: 'arm' }));
      L.push(S('humero', tube(330, 600, [s * 212, -6], [s * 214, -4], [13, 13]), M.cortical, { bone: 1150, group: 'arm' }));
      L.push(S('cabeza-humeral', ell([s * 196, -6, 330], [26, 26, 26]), M.cancellous, { bone: 300, group: 'arm' }));
      L.push(S('radio-cubito', tube(620, 800, [s * 206, 6], [s * 206, 10], [8, 8]), M.cortical, { bone: 1100, group: 'arm' }));
      L.push(S('radio-cubito', tube(620, 800, [s * 222, -10], [s * 222, -10], [7, 7]), M.cortical, { bone: 1100, group: 'arm' }));
    } else {
      // Brazos por encima de la cabeza: quedan junto al cráneo
      L.push(S('brazo', tube(-420, 120, [s * 118, -8], [s * 112, -12], [38, 38], [34, 34]), M.muscle, { outline: true, group: 'arm' }));
      L.push(S('humero', tube(-150, 110, [s * 118, -8], [s * 112, -12], [12, 12]), M.cortical, { bone: 1150, group: 'arm' }));
      L.push(S('radio-cubito', tube(-420, -170, [s * 118, -8], [s * 116, -8], [9, 9]), M.cortical, { bone: 1100, group: 'arm' }));
    }
  }

  // ---------- Embarazo: útero grávido con feto ----------
  if (opts.pregnantWeeks) {
    const k = Math.min(1, opts.pregnantWeeks / 36);
    const uterusCav = tube(560, 990, [0, 4], [0, -2], [140, 90], [128, 80]);
    const fz = 880 - 160 * k; // fondo uterino más alto según las semanas
    L.push(S('utero-gravido', ell([0, 30, (fz + 900) / 2], [40 + 60 * k, 30 + 45 * k, (900 - fz) / 2 + 20]), { hu: 45 }, { comp: 'uterus', clip: uterusCav }));
    L.push(S('liquido-amniotico', ell([0, 32, (fz + 900) / 2], [34 + 54 * k, 25 + 40 * k, (900 - fz) / 2 + 12]), M.fluid, { clip: uterusCav }));
    L.push(S('craneo-fetal', ell([12, 40, fz + 40 * k + 18], [26 * k + 8, 22 * k + 7, 24 * k + 8]), M.cortical, { bone: 350 }));
    L.push(S('cerebro-fetal', ell([12, 40, fz + 40 * k + 18], [24 * k + 7, 20 * k + 6, 22 * k + 7]), { hu: 25 }));
    L.push(S('columna-fetal', tube(fz + 60 * k + 30, fz + 150 * k + 40, [-10, 28], [-18, 34], [3 + 2 * k, 3 + 2 * k]), M.cortical, { bone: 300 }));
  }

  // ---------- Patología y objetos del caso ----------
  for (const e of extras) L.push(e);
  // Niños: todo el modelo se escala (desde el vértex)
  if (opts.scale && opts.scale !== 1) return L.map((s) => ({ ...s, shape: scaleShape(s.shape, opts.scale), clip: s.clip ? scaleShape(s.clip, opts.scale) : s.clip }));
  return L;
}

function scaleShape(s, k) {
  if (s.type === 'ell') return { ...s, c: s.c.map((v) => v * k), r: s.r.map((v) => v * k), zmin: s.zmin * k, zmax: s.zmax * k };
  return { ...s, z0: s.z0 * k, z1: s.z1 * k, c0: s.c0.map((v) => v * k), c1: s.c1.map((v) => v * k), r0: s.r0.map((v) => v * k), r1: s.r1.map((v) => v * k) };
}

// Valores de cada estructura en mu (1/mm) para un kV y un instante (realce en HU a 120 kV)
export const MU_WATER = { 80: 0.02265, 100: 0.02145, 120: 0.02045, 140: 0.01975 }; // 1/mm (energías efectivas)
export const HARD_FACTOR = { bone: { 80: 1.28, 100: 1.12, 120: 1, 140: 0.92 }, iodine: { 80: 1.62, 100: 1.27, 120: 1, 140: 0.86 } };

export function structureMu(structs, kV, enh = {}) {
  const mw = MU_WATER[kV], fb = HARD_FACTOR.bone[kV], fi = HARD_FACTOR.iodine[kV];
  const out = new Float32Array(structs.length * 2);
  structs.forEach((s, i) => {
    const iod = s.comp ? enh[s.comp] || 0 : 0;
    out[2 * i] = Math.max(0, mw * (1 + s.hu / 1000));
    out[2 * i + 1] = mw * (s.bone * fb + iod * fi) / 1000;
  });
  return out;
}

// HU "verdadero" de un punto (para pruebas y para la ROI de seguimiento del bolo)
export function truthHU(structs, x, y, z, kV = 120, enh = {}) {
  let hit = -1;
  for (let i = 0; i < structs.length; i++) {
    const s = structs[i];
    const cs = section(s.shape, z);
    if (!cs || !inside(cs, x, y)) continue;
    if (s.clip) { const cc = section(s.clip, z); if (!cc || !inside(cc, x, y)) continue; }
    hit = i;
  }
  if (hit < 0) return -1000;
  const s = structs[hit];
  const iod = s.comp ? enh[s.comp] || 0 : 0;
  return s.hu + s.bone * HARD_FACTOR.bone[kV] + iod * HARD_FACTOR.iodine[kV];
}

export function structureAt(structs, x, y, z) {
  let hit = null;
  for (const s of structs) {
    const cs = section(s.shape, z);
    if (!cs || !inside(cs, x, y)) continue;
    if (s.clip) { const cc = section(s.clip, z); if (!cc || !inside(cc, x, y)) continue; }
    hit = s;
  }
  return hit;
}

// Rasteriza un corte z en dos mapas (mu blando y mu duro) sobre una cuadrícula cuadrada.
// grid: { n, px, xmin, ymin } con x = xmin + i·px (columnas), y = ymin + j·px (filas, y creciente).
// acc: si se pasa, suma (para promediar varios sub-cortes) en lugar de escribir.
export function rasterize(structs, mu, z, grid, soft, hard, weight = 1) {
  const idx = labelMap(structs, z, grid), n = grid.n;
  for (let p = 0; p < n * n; p++) {
    const k = idx[p];
    if (k < 0) continue;
    soft[p] += weight * mu[2 * k];
    hard[p] += weight * mu[2 * k + 1];
  }
}

// Mapa de etiquetas: índice de la estructura visible en cada píxel (-1 = aire). Pintor: la última gana.
export function labelMap(structs, z, grid) {
  const { n, px, xmin, ymin } = grid;
  const idx = new Int32Array(n * n).fill(-1);
  if (grid.tilt) {
    // Gantry inclinado: el plano del corte es z(y) = z + y·tan(θ) (θ < 0: la parte anterior sube hacia la cabeza)
    const tn = Math.tan((grid.tilt * Math.PI) / 180);
    for (let k = 0; k < structs.length; k++) {
      const s = structs[k];
      const [zlo, zhi] = zExtent(s.shape);
      let ya = (zlo - z) / tn, yb = (zhi - z) / tn;
      if (ya > yb) [ya, yb] = [yb, ya];
      const j0 = Math.max(0, Math.floor((ya - ymin) / px)), j1 = Math.min(n - 1, Math.ceil((yb - ymin) / px));
      for (let j = j0; j <= j1; j++) {
        const y = ymin + j * px, zz = z + y * tn;
        const cs = section(s.shape, zz);
        if (!cs || cs.rx <= 0.05 || cs.ry <= 0.05) continue;
        const cc = s.clip ? section(s.clip, zz) : null;
        if (s.clip && !cc) continue;
        const wx = Math.max(cs.rx, cs.ry);
        const i0 = Math.max(0, Math.floor((cs.cx - wx - xmin) / px)), i1 = Math.min(n - 1, Math.ceil((cs.cx + wx - xmin) / px));
        for (let i = i0; i <= i1; i++) {
          const x = xmin + i * px;
          if (!inside(cs, x, y) || (cc && !inside(cc, x, y))) continue;
          idx[j * n + i] = k;
        }
      }
    }
  } else for (let k = 0; k < structs.length; k++) {
    const s = structs[k];
    const cs = section(s.shape, z);
    if (!cs || cs.rx <= 0.05 || cs.ry <= 0.05) continue;
    let cc = null;
    if (s.clip) { cc = section(s.clip, z); if (!cc) continue; }
    const a = (cs.rot * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const wx = Math.hypot(cs.rx * ca, cs.ry * sa), wy = Math.hypot(cs.rx * sa, cs.ry * ca);
    const i0 = Math.max(0, Math.floor((cs.cx - wx - xmin) / px)), i1 = Math.min(n - 1, Math.ceil((cs.cx + wx - xmin) / px));
    const j0 = Math.max(0, Math.floor((cs.cy - wy - ymin) / px)), j1 = Math.min(n - 1, Math.ceil((cs.cy + wy - ymin) / px));
    const irx2 = 1 / (cs.rx * cs.rx), iry2 = 1 / (cs.ry * cs.ry);
    let cca = 1, csa = 0, cirx2 = 0, ciry2 = 0;
    if (cc) { const b = (cc.rot * Math.PI) / 180; cca = Math.cos(b); csa = Math.sin(b); cirx2 = 1 / (cc.rx * cc.rx); ciry2 = 1 / (cc.ry * cc.ry); }
    for (let j = j0; j <= j1; j++) {
      const dy = ymin + j * px - cs.cy;
      for (let i = i0; i <= i1; i++) {
        const dx = xmin + i * px - cs.cx;
        const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
        if (u * u * irx2 + v * v * iry2 > 1) continue;
        if (cc) {
          const ex = xmin + i * px - cc.cx, ey = ymin + j * px - cc.cy;
          const p = ex * cca + ey * csa, q = -ex * csa + ey * cca;
          if (p * p * cirx2 + q * q * ciry2 > 1) continue;
        }
        idx[j * n + i] = k;
      }
    }
  }
  return idx;
}

// Estructuras serializables (para enviarlas a los workers)
export const serialize = (structs) => structs.map((s) => ({ name: s.name, shape: s.shape, hu: s.hu, bone: s.bone, comp: s.comp, clip: s.clip || null, group: s.group || null, outline: !!s.outline }));

// Fábrica de lesiones y objetos que usan los casos
export const lesion = {
  ell: (name, c, r, mat, extra = {}) => S(name, ell(c, r, extra.shapeOpts || {}), mat, extra),
  tube: (name, z0, z1, c0, c1, r0, r1, mat, extra = {}) => S(name, tube(z0, z1, c0, c1, r0, r1), mat, extra),
  M,
};

