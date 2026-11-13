// Física del tomógrafo: geometría, dosis, modulación de corriente, proyección con ruido cuántico,
// endurecimiento del haz y reconstrucción por retroproyección filtrada (geometría paralela rebinada).
import { rasterize, labelMap, structureMu, MU_WATER, mulberry32, section } from './phantom.js';
import { spectralModel, polyProjection, waterLength } from './spectral.js';
import { sartReconstruct } from './sart.js';

export const SCANNER = {
  views: 240,            // proyecciones en 180°
  nDet: 320,             // canales (tras el rebinning)
  sfov: { body: 500, head: 300 },
  recon: 256,            // matriz de reconstrucción
  sod: 570, sid: 1040,   // distancias fuente–isocentro y fuente–detector (mm)
  maxMa: { 80: 700, 100: 800, 120: 800, 140: 700 },
  N0: 1.4e5,             // fotones por canal y proyección por mAs·mm (calibrado: ver tests)
  electronicNoise: 6,
};

export const COLLIMATIONS = {
  '16x0.625': { label: '16 × 0,625 mm (10 mm)', width: 10, minThk: 0.625 },
  '32x0.625': { label: '32 × 0,625 mm (20 mm)', width: 20, minThk: 0.625 },
  '64x0.625': { label: '64 × 0,625 mm (40 mm)', width: 40, minThk: 0.625 },
  '64x1.25': { label: '64 × 1,25 mm (80 mm)', width: 80, minThk: 1.25 },
};

export const KERNELS = {
  soft: { label: 'Blando (B20)', w: (f) => (f < 0.55 ? 0.5 * (1 + Math.cos((Math.PI * f) / 0.55)) : 0) },
  standard: { label: 'Estándar (B30)', w: (f) => (f < 0.8 ? 0.5 * (1 + Math.cos((Math.PI * f) / 0.8)) : 0) },
  brain: { label: 'Cerebro (H31)', w: (f) => (f < 0.7 ? 0.5 * (1 + Math.cos((Math.PI * f) / 0.7)) : 0) },
  lung: { label: 'Pulmón (B60)', w: (f) => (1 + 0.35 * f) * Math.cos((Math.PI * f) / 2.6) },
  bone: { label: 'Hueso (B70)', w: (f) => (1 + 0.8 * f * f) * Math.cos((Math.PI * f) / 2.2) },
};

export const WINDOWS = {
  brain: { label: 'Cerebro', ww: 80, wl: 40 },
  subdural: { label: 'Subdural', ww: 200, wl: 70 },
  soft: { label: 'Partes blandas', ww: 400, wl: 40 },
  liver: { label: 'Hígado', ww: 160, wl: 70 },
  angio: { label: 'Angio', ww: 700, wl: 180 },
  lung: { label: 'Pulmón', ww: 1500, wl: -600 },
  bone: { label: 'Hueso', ww: 2000, wl: 500 },
};

// --- Dosis -------------------------------------------------------------------
// nCTDIw (mGy por 100 mAs) para los maniquíes de 16 cm (cabeza) y 32 cm (cuerpo)
export const NCTDIW_DEFAULT = { head: { 80: 6.4, 100: 11.4, 120: 17.2, 140: 23.4 }, body: { 80: 2.6, 100: 4.8, 120: 7.6, 140: 10.8 } };
const NCTDIW = structuredClone(NCTDIW_DEFAULT);
export const N0_DEFAULT = 1.4e5;

// Perfil del tomógrafo real (calibracion.html): sustituye el CTDIw por kV y ajusta el número de fotones
// para que el ruido simulado coincida con el medido en el maniquí de agua del equipo.
export function applyScannerProfile(profile) {
  SCANNER.N0 = profile?.n0 || N0_DEFAULT;
  for (const ph of ['head', 'body']) for (const kv of [80, 100, 120, 140]) NCTDIW[ph][kv] = +profile?.nctdiw?.[ph]?.[kv] || NCTDIW_DEFAULT[ph][kv];
  SCANNER.profileName = profile?.name || null;
}
export const K_EFFECTIVE = { head: 0.0021, neck: 0.0059, chest: 0.014, abdomen: 0.015 }; // mSv/(mGy·cm)
// Niveles de referencia diagnósticos orientativos (CTDIvol, mGy)
export const DRL = { head: 60, chest: 12, lowdose: 3, ctpa: 15, abdomen: 15, urolith: 10, coronary: 30, stroke: 60, pedHead: 35, obese: 30, aorta: 20, neck: 25, trauma: 20, pelvis: 20 };

export function tubeCurrent(p) { return (p.mas * p.pitch) / p.rot; } // mA para un mAs efectivo

export function ctdiVol(p, masEff = p.mas) {
  const coll = COLLIMATIONS[p.coll];
  const overbeam = (coll.width + 3) / coll.width; // penumbra: las colimaciones estrechas desperdician dosis
  return NCTDIW[p.sfov][p.kv] * (masEff / 100) * overbeam;
}

// Diámetro equivalente en agua → factor SSDE (AAPM 204/220)
export function ssdeFactor(dwMm, sfov) {
  const d = dwMm / 10;
  return sfov === 'head' ? 1.874799 * Math.exp(-0.03871313 * d) : 3.704369 * Math.exp(-0.03671937 * d);
}

// Sincronización con el ECG:
//  - prospectiva («step and shoot»): un disparo axial por latido en la fase elegida y avance de la mesa en el siguiente;
//  - retrospectiva: hélice con pitch muy bajo (0,2) y emisión continua → todas las fases, mucha más dosis.
export const ECG_MODES = { none: 'Sin sincronizar', prospectivo: 'Prospectiva (step and shoot)', retrospectivo: 'Retrospectiva (helicoidal)' };
export const RETRO_PITCH = 0.2;

export function scanTiming(p, lengthMm) {
  const coll = COLLIMATIONS[p.coll];
  if (p.ecg === 'prospectivo') {
    const steps = Math.max(1, Math.ceil(lengthMm / (coll.width * 0.9)));
    const beat = 60 / (p.hr || 70);
    return { speed: lengthMm / Math.max(beat, (steps * 2 - 1) * beat), time: (steps * 2 - 1) * beat, steps };
  }
  const pitch = p.ecg === 'retrospectivo' ? RETRO_PITCH : p.pitch;
  const speed = (coll.width * pitch) / p.rot; // mm/s
  return { speed, time: lengthMm / speed + p.rot * 0.5 };
}

// Factor de dosis por la sincronización (el mAs efectivo de la consola es el de una hélice estándar)
export function ecgDoseFactor(p) {
  if (p.ecg === 'retrospectivo') return p.pitch / RETRO_PITCH * 0.75; // ~25 % ahorrado con modulación por ECG
  if (p.ecg === 'prospectivo') return 1.15; // solapamiento entre disparos
  return 1;
}

// Modulación de corriente (ATCM) según el diámetro equivalente en agua de cada nivel (del topograma)
export function atcmFactor(dw, sfov, strength = 0.5) {
  const ref = sfov === 'head' ? 165 : 300;
  return Math.min(2.6, Math.max(0.3, Math.exp(MU_WATER[120] * (dw - ref) * strength)));
}

// mAs efectivo en cada z (con o sin ATCM) y límite del tubo
export function masProfile(p, zs, dwAt) {
  const maxMas = (SCANNER.maxMa[p.kv] * p.rot) / p.pitch;
  let limited = false;
  const mas = zs.map((z) => {
    let m = p.atcm && dwAt ? p.mas * atcmFactor(dwAt(z), p.sfov) : p.mas;
    if (m > maxMas) { m = maxMas; limited = true; }
    return m;
  });
  return { mas, limited, maxMas };
}

export function doseReport(p, zStart, zEnd, dwAt, region) {
  const len = Math.max(1, zEnd - zStart);
  const zs = [];
  for (let z = zStart; z <= zEnd; z += 10) zs.push(z);
  const { mas, limited } = masProfile(p, zs, dwAt);
  const avgMas = mas.reduce((a, b) => a + b, 0) / mas.length;
  const ctdi = ctdiVol(p, avgMas) * ecgDoseFactor(p);
  const coll = COLLIMATIONS[p.coll];
  const overrange = p.ecg === 'prospectivo' ? 0 : coll.width * (p.ecg === 'retrospectivo' ? RETRO_PITCH : p.pitch) * 0.9;
  const dlp = (ctdi * (len + overrange)) / 10;
  const dw = dwAt ? zs.reduce((a, z) => a + dwAt(z), 0) / zs.length : p.sfov === 'head' ? 165 : 300;
  const timing = scanTiming(p, len);
  return {
    ctdi, dlp, effective: dlp * (K_EFFECTIVE[region] || 0.015), ssde: ctdi * ssdeFactor(dw, p.sfov), dw,
    mA: tubeCurrent({ ...p, mas: avgMas }), avgMas, limited, ...timing, length: len,
  };
}

// Órganos radiosensibles superficiales: posición (z, y) en el paciente y factor de dosis en superficie
export const ORGANS = {
  lens: { label: 'Cristalino', z: 149, y: 90, k: 1.0, shield: 'ojos' },
  thyroid: { label: 'Tiroides', z: 288, y: 30, k: 1.1, shield: 'tiroides' },
  breast: { label: 'Mamas', z: 470, y: 100, k: 1.2, shield: 'mamas', female: true },
};

// Dosis estimada (mGy) a cada órgano: dentro del haz ≈ CTDIvol × k; fuera, solo radiación dispersa (~5 %).
// Con el gantry inclinado, el plano de corte a la altura del órgano se desplaza y·tan(θ).
// Un protector de bismuto sobre un órgano dentro del haz reduce su dosis ~35 %.
export function organDoses(p, z0, z1, ctdi, { sex = 'M', shields = new Set() } = {}) {
  const tn = Math.tan(((p.tilt || 0) * Math.PI) / 180), half = p.thickness / 2 + COLLIMATIONS[p.coll].width * 0.25;
  const out = {};
  for (const [k, o] of Object.entries(ORGANS)) {
    if (o.female && sex !== 'F') continue;
    const zz = o.z - o.y * tn; // posición equivalente en el eje de la mesa
    const inField = zz >= z0 - half && zz <= z1 + half;
    let dose = ctdi * (inField ? o.k : 0.05);
    const shielded = shields.has(o.shield) && inField;
    if (shielded) dose *= 0.65;
    out[k] = { label: o.label, dose, inField, shielded };
  }
  return out;
}

// --- Reconstrucción ---------------------------------------------------------------

function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

const filterCache = new Map();
function filterResponse(kernel, d, M) {
  const key = `${kernel}|${d}|${M}`;
  if (filterCache.has(key)) return filterCache.get(key);
  // Rampa de Ram-Lak en el dominio espacial (sin sesgo de continua) × ventana de apodización del filtro
  const re = new Float64Array(M), im = new Float64Array(M);
  re[0] = 1 / (4 * d * d);
  for (let n = 1; n < M / 2; n += 2) { const v = -1 / (Math.PI * Math.PI * n * n * d * d); re[n] = v; re[M - n] = v; }
  fft(re, im, false);
  const H = new Float64Array(M), w = KERNELS[kernel].w;
  for (let k = 0; k < M; k++) { const f = Math.min(k, M - k) / (M / 2); H[k] = re[k] * Math.max(0, w(f)); }
  filterCache.set(key, H);
  return H;
}

// Simula la adquisición y reconstrucción de un corte.
// job: { structs, kv, z, thickness, enh, mas, kernel, sfov, dfov, offX, offY, motion:{amp,period,phase,head}, t, rot, seed, metalReduction }
export function reconstructSlice(job) {
  const ctx = prepareSlice(job);
  const { ps, ph, pi } = projectCPU(ctx);
  const sino = ctx.adv ? measureAdvanced(ctx, ps, ph, pi) : measure(ctx, ps, ph);
  const img = job.algorithm === 'sart' ? sartReconstruct(ctx, sino) : filterBackprojectCPU(ctx, sino);
  return finishSlice(ctx, img);
}

// 1) Geometría, mapas de atenuación (promediando sub-cortes: perfil de corte y volumen parcial) y movimiento por proyección
export function prepareSlice(job) {
  const { views: K, nDet } = SCANNER;
  const sfov = SCANNER.sfov[job.sfov];
  const d = sfov / nDet, px = d;
  // El objeto puede sobresalir del campo de medida (SFOV): se rasteriza un área mayor y los rayos que
  // caen fuera de los detectores se pierden → artefacto de truncamiento.
  const E = objectExtent(job.structs, job.z, job.offX || 0, job.offY || 0, sfov);
  const n = Math.round(E / px);
  // Física estándar: 2 canales en mu (1/mm). Física avanzada: 3 canales (agua equivalente, hueso y yodo en HU·mm)
  const adv = job.physics === 'advanced';
  const nch = adv ? 3 : 2;
  const muOf = (structs) => (adv ? advancedMu(structs, job.enh) : structureMu(structs, job.kv, job.enh));
  const mu = muOf(job.structs);
  const maps = Array.from({ length: nch }, () => new Float32Array(n * n));
  const nSub = Math.max(2, Math.min(6, Math.round(job.thickness / 0.8)));
  const paint = (structs, muArr, out) => {
    for (let s = 0; s < nSub; s++) {
      const z = job.z - job.thickness / 2 + ((s + 0.5) * job.thickness) / nSub;
      const jx = ((s * 0.618) % 1 - 0.5) * px, jy = ((s * 0.382) % 1 - 0.5) * px;
      // Cuadrícula en coordenadas del paciente; el paciente está desplazado (offX, offY) respecto al isocentro.
      const idx = labelMap(structs, z, { n, px, xmin: -E / 2 + px / 2 - (job.offX || 0) + jx, ymin: -E / 2 + px / 2 - (job.offY || 0) + jy, tilt: job.tilt || 0 });
      for (let p = 0; p < n * n; p++) { const k = idx[p]; if (k >= 0) for (let c = 0; c < nch; c++) out[c][p] += muArr[nch * k + c] / nSub; }
    }
  };
  paint(job.structs, mu, maps);
  // Capa móvil (corazón): se proyecta desplazada según la fase cardíaca de cada proyección
  let moving = null;
  if (job.motion?.cardiac) {
    // Capa fija = anatomía sin el corazón; capa móvil = total − fija (el corazón menos lo que tapa)
    const still = job.structs.filter((s) => s.group !== 'heart');
    const fixed = Array.from({ length: nch }, () => new Float32Array(n * n));
    paint(still, muOf(still), fixed);
    const delta = maps.map((m, c) => { const dlt = new Float32Array(n * n); for (let p = 0; p < n * n; p++) { dlt[p] = m[p] - fixed[c][p]; m[p] = fixed[c][p]; } return dlt; });
    moving = { soft: delta[0], hard: delta[1], iod: delta[2] || null };
  }
  // Desplazamiento rígido (mx, my) y del corazón (cx, cy) en cada proyección durante la media vuelta
  const halfRot = (job.rot || 0.5) / 2;
  const motion = new Float32Array(K * 4);
  for (let v = 0; v < K; v++) motionAt(job.motion, (job.t || 0) + (v / K) * halfRot, v / K, motion, 4 * v);
  // Física avanzada: haz en abanico (360° de fuente, detector en arco) que después se reordena en paralelo
  let fan = null;
  if (adv) {
    const gMax = Math.asin(sfov / 2 / SCANNER.sod), dG = gMax / ((nDet - 1) / 2), dB = Math.PI / K;
    const b0 = -gMax - 2 * dB, nV = Math.ceil((Math.PI + 2 * gMax) / dB) + 5;
    const fm = new Float32Array(nV * 4), rot = job.rot || 0.5;
    for (let v = 0; v < nV; v++) motionAt(job.motion, (job.t || 0) + ((v * dB) / (2 * Math.PI)) * rot, v / nV, fm, 4 * v);
    fan = { gMax, dG, dB, b0, nV, motion: fm };
  }
  return { job, K, nDet, sfov, d, px, E, n, soft: maps[0], hard: maps[1], iod: maps[2] || null, moving, motion, fan, adv };
}

// Movimiento en el instante tv: respiración (mx, my), cabeza (aumenta durante la vuelta) y corazón (cx, cy)
function motionAt(m, tv, frac, out, o) {
  if (!m) return;
  if (m.amp) out[o + 1] += m.amp * Math.sin((2 * Math.PI * tv) / (m.period || 4) + (m.phase || 0));
  if (m.head) { out[o] += m.head * Math.sin(tv * 5.3 + 1.1) * frac; out[o + 1] += m.head * 0.6 * Math.cos(tv * 4.1) * frac; }
  if (m.cardiac) { const [cx, cy] = heartDisplacement(tv, m.cardiac.hr, m.cardiac.amp); out[o + 2] = cx; out[o + 3] = cy; }
}

// Física avanzada: [agua equivalente (densidad relativa), exceso de hueso (HU), yodo (HU)] por estructura
export function advancedMu(structs, enh = {}) {
  const out = new Float32Array(structs.length * 3);
  structs.forEach((s, i) => {
    out[3 * i] = Math.max(0, 1 + s.hu / 1000);
    out[3 * i + 1] = s.bone || 0;
    out[3 * i + 2] = s.comp ? enh[s.comp] || 0 : 0;
  });
  return out;
}

// Desplazamiento del corazón (mm) en el instante t según la fase del ciclo y la frecuencia cardíaca.
// La diástasis (meseta quieta hacia el 70–80 %) se acorta al subir la frecuencia.
export function cardiacPhase(t, hr) { return ((t * hr) / 60) % 1; }
export function heartDisplacement(t, hr, amp = 6) {
  const ph = cardiacPhase(t, hr);
  const dia = Math.max(0.02, 0.26 - Math.max(0, hr - 55) * 0.009); // ancho de la diástasis
  const d0 = 0.88 - dia; // inicio de la diástasis
  let k;
  if (ph < 0.3) k = Math.sin((ph / 0.3) * (Math.PI / 2));            // sístole: contracción
  else if (ph < d0) k = 1 - (ph - 0.3) / (d0 - 0.3) * 0.85;        // llenado rápido
  else if (ph < 0.88) k = 0.15;                                     // diástasis
  else k = 0.15 * (1 - (ph - 0.88) / 0.12);                         // contracción auricular
  return [amp * 0.6 * k, -amp * k];
}

// 2) Proyecciones en CPU: geometría paralela (estándar) o en abanico (física avanzada)
export function projectCPU(ctx) {
  const { K, nDet, d, px, E, n, soft, hard, iod, moving, fan } = ctx;
  const nV = fan ? fan.nV : K, motion = fan ? fan.motion : ctx.motion;
  const ps = new Float32Array(nV * nDet), ph = new Float32Array(nV * nDet), pi = iod ? new Float32Array(nV * nDet) : null;
  const R = E / 2, half = (nDet - 1) / 2;
  const acc = new Float64Array(3);
  const line = (S, H, I, th, t, mx, my) => {
    const c = Math.cos(th), s = Math.sin(th);
    let gx = (t * c + R * s - mx + E / 2 - px / 2) / px, gy = (t * s - R * c - my + E / 2 - px / 2) / px;
    let sumS = 0, sumH = 0, sumI = 0;
    for (let k = 0; k < n; k++, gx -= s, gy += c) {
      if (gx < 0 || gy < 0 || gx >= n - 1 || gy >= n - 1) continue;
      const ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy, p = iy * n + ix;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      sumS += S[p] * w00 + S[p + 1] * w10 + S[p + n] * w01 + S[p + n + 1] * w11;
      sumH += H[p] * w00 + H[p + 1] * w10 + H[p + n] * w01 + H[p + n + 1] * w11;
      if (I) sumI += I[p] * w00 + I[p + 1] * w10 + I[p + n] * w01 + I[p + n + 1] * w11;
    }
    acc[0] += sumS * px; acc[1] += sumH * px; acc[2] += sumI * px;
  };
  for (let v = 0; v < nV; v++) {
    const mx = motion[4 * v], my = motion[4 * v + 1];
    const beta = fan ? fan.b0 + v * fan.dB : 0;
    for (let b = 0; b < nDet; b++) {
      let th, t;
      if (fan) { const g = (b - half) * fan.dG; th = beta + g; t = -SCANNER.sod * Math.sin(g); } else { th = (v * Math.PI) / K; t = (b - half) * d; }
      acc.fill(0);
      line(soft, hard, iod, th, t, mx, my);
      if (moving) line(moving.soft, moving.hard, moving.iod, th, t, mx + motion[4 * v + 2], my + motion[4 * v + 3]);
      ps[v * nDet + b] = acc[0]; ph[v * nDet + b] = acc[1]; if (pi) pi[v * nDet + b] = acc[2];
    }
  }
  return { ps, ph, pi };
}

// Ganancia de cada canal del detector (canales defectuosos o mal calibrados → anillos): −ln(g)
function ringOffsets(job, nDet) {
  if (!job.detectorDefects?.length) return null;
  const off = new Float32Array(nDet);
  for (const def of job.detectorDefects) {
    const b = Math.round(def.pos * (nDet - 1));
    // El canal ve el lado opuesto en la otra media vuelta (rayo conjugado): con 360° de datos el anillo es completo
    for (let k = 0; k < (def.width || 1); k++) for (const q of [b + k, nDet - 1 - (b + k)]) if (q >= 0 && q < nDet) off[q] -= Math.log(def.gain);
  }
  return off;
}

// 3b) Medida con física avanzada: espectro policromático, dispersión, anillos, ruido, corrección con agua
// y reordenamiento del abanico a proyecciones paralelas.
export function measureAdvanced(ctx, ps, ph, pi) {
  const { job, K, nDet, d, fan } = ctx;
  const m = spectralModel(job.kv), mw = MU_WATER[job.kv];
  const rand = mulberry32(job.seed || 1);
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = rand(); v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const kvf = Math.pow(job.kv / 120, 2.5);
  const N0base = ((job.n0 || SCANNER.N0) * job.mas * job.thickness * kvf) / K;
  const bowW = job.sfov === 'head' ? 95 : 165;
  const nV = fan.nV, half = (nDet - 1) / 2;
  const rings = ringOffsets(job, nDet);
  // Dispersión: núcleo gaussiano ancho a lo largo del detector; amplitud según la colimación y la rejilla antidifusora
  const sc = job.scatter || {};
  const A = sc.off ? 0 : 0.035 * ((job.beamWidth || 40) / 40) * (sc.noGrid ? 3.5 : 1);
  const residual = sc.noCorrection ? 1 : 0.03; // el equipo resta su estimación de la dispersión (queda ≈ 3 %)
  // Corrección del endurecimiento por hueso en dos pasadas (segmenta el hueso y corrige su proyección); 90 % eficaz
  const boneCorr = job.boneBH === false ? 0 : 0.9;
  const BC = new Float64Array(nDet);
  const sig = 45 / d, kr = Math.ceil(3 * sig), ker = new Float32Array(2 * kr + 1);
  let ks = 0; for (let k = -kr; k <= kr; k++) { ker[k + kr] = Math.exp(-0.5 * (k / sig) ** 2); ks += ker[k + kr]; }
  for (let k = 0; k < ker.length; k++) ker[k] /= ks;
  const fanSino = new Float32Array(nV * nDet), metal = new Uint8Array(nV * nDet);
  const Ip = new Float64Array(nDet), Tn = new Float64Array(nDet), pp = new Float64Array(nDet), S = new Float64Array(nDet), N0b = new Float64Array(nDet);
  for (let b = 0; b < nDet; b++) { const t = SCANNER.sod * Math.sin((b - half) * fan.dG); N0b[b] = N0base * Math.exp(-1.2 * (t / bowW) ** 2); }
  for (let v = 0; v < nV; v++) {
    const row = v * nDet;
    for (let b = 0; b < nDet; b++) {
      const a = Math.max(0, b - 1), e = Math.min(nDet - 1, b + 1);
      const sm = (arr) => (arr ? 0.25 * arr[row + a] + 0.5 * arr[row + b] + 0.25 * arr[row + e] : 0); // apertura del detector
      const Lw = sm(ps), Hb = sm(ph), Hi = sm(pi);
      const r = polyProjection(m, Lw, Hb, Hi);
      pp[b] = r.p; Ip[b] = Math.exp(-r.p); Tn[b] = r.T;
      BC[b] = boneCorr && Hb > 0 ? boneCorr * ((Hb / 1000) * m.boneLin - (waterLength(m, r.p) - waterLength(m, polyProjection(m, Lw, 0, Hi).p))) : 0;
      if ((Hb * mw) / 1000 > 2.2) metal[row + b] = 1;
    }
    // Potencial de dispersión I·p convolucionado con el núcleo ancho
    for (let b = 0; b < nDet; b++) {
      let s = 0;
      if (A) for (let k = -kr; k <= kr; k++) { const q = b + k; if (q >= 0 && q < nDet) s += ker[k + kr] * Ip[q] * pp[q] * (N0b[q] / N0b[b]); }
      S[b] = A * s;
    }
    for (let b = 0; b < nDet; b++) {
      const Nt = N0b[b] * (Tn[b] + S[b]);                       // fotones detectados (primarios + dispersos)
      let Nm = Nt + Math.sqrt(Nt + SCANNER.electronicNoise ** 2) * gauss();
      if (Nm < 1) Nm = 1;
      let I = ((Ip[b] + S[b]) * Nm) / Math.max(Nt, 1e-9) - (1 - residual) * S[b];
      I = Math.max(I, 1 / N0b[b]);
      let p = -Math.log(I);
      if (rings) p += rings[b];
      fanSino[row + b] = mw * (waterLength(m, p) + BC[b]);     // linealización con agua (calibración del equipo)
    }
  }
  if (job.metalReduction) interpolateMetal(fanSino, metal, nV, nDet);
  // Reordenamiento (rebinning) abanico → paralelo
  const sino = new Float32Array(K * nDet);
  for (let v = 0; v < K; v++) {
    const th = (v * Math.PI) / K;
    for (let b = 0; b < nDet; b++) {
      const t = (b - half) * d;
      if (Math.abs(t) >= SCANNER.sod) continue;
      const g = -Math.asin(t / SCANNER.sod), beta = th - g;
      const fb = (beta - fan.b0) / fan.dB, fg = g / fan.dG + half;
      const ib = Math.floor(fb), ig = Math.floor(fg);
      if (ib < 0 || ib >= nV - 1 || ig < 0 || ig >= nDet - 1) continue;
      const wb = fb - ib, wg = fg - ig, p = ib * nDet + ig;
      sino[v * nDet + b] = (fanSino[p] * (1 - wg) + fanSino[p + 1] * wg) * (1 - wb) + (fanSino[p + nDet] * (1 - wg) + fanSino[p + nDet + 1] * wg) * wb;
    }
  }
  return sino;
}

function interpolateMetal(sino, metal, nV, nDet) {
  for (let v = 0; v < nV; v++) {
    const row = v * nDet;
    for (let b = 0; b < nDet; b++) {
      if (!metal[row + b]) continue;
      let e = b; while (e < nDet && metal[row + e]) e++;
      const lft = b > 0 ? sino[row + b - 1] : 0, rgt = e < nDet ? sino[row + e] : lft;
      for (let q = b; q < e; q++) sino[row + q] = lft + ((rgt - lft) * (q - b + 1)) / (e - b + 1);
      b = e;
    }
  }
}

// 3) Medida: apertura del detector, bowtie, endurecimiento del haz, ruido cuántico y electrónico, MAR
export function measure(ctx, ps, ph) {
  const { job, K, nDet, d } = ctx;
  const rand = mulberry32(job.seed || 1);
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = rand(); v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const kvf = Math.pow(job.kv / 120, 2.5);
  const N0base = ((job.n0 || SCANNER.N0) * job.mas * job.thickness * kvf) / K;
  const beta = 0.06 * Math.pow(120 / job.kv, 1.2);
  const bowW = job.sfov === 'head' ? 95 : 165;
  const sino = new Float32Array(K * nDet);
  const metal = new Uint8Array(K * nDet);
  const rings = ringOffsets(job, nDet);
  for (let v = 0; v < K; v++) {
    const row = v * nDet;
    for (let b = 0; b < nDet; b++) {
      const a = Math.max(0, b - 1), e = Math.min(nDet - 1, b + 1);
      const pS = 0.25 * ps[row + a] + 0.5 * ps[row + b] + 0.25 * ps[row + e], pH = 0.25 * ph[row + a] + 0.5 * ph[row + b] + 0.25 * ph[row + e];
      const t = (b - (nDet - 1) / 2) * d;
      const N0 = N0base * Math.exp(-1.2 * (t / bowW) ** 2);
      const pMeas = pS + pH - beta * pH * pH;
      const Nexp = N0 * Math.exp(-pMeas);
      let Nm = Nexp + Math.sqrt(Nexp + SCANNER.electronicNoise ** 2) * gauss();
      if (Nm < 1) Nm = 1;
      sino[row + b] = Math.log(N0 / Nm) + (rings ? rings[b] : 0);
      if (pH > 2.2) metal[row + b] = 1;
    }
  }
  if (job.metalReduction) interpolateMetal(sino, metal, K, nDet);
  return sino;
}

// Núcleo espacial del filtro (rampa × apodización) para convolución lineal de longitud 2·nDet − 1
const spatialCache = new Map();
export function spatialFilter(kernel, d, nDet) {
  const key = `${kernel}|${d}|${nDet}`;
  if (spatialCache.has(key)) return spatialCache.get(key);
  let M = 1; while (M < 2 * nDet) M <<= 1;
  const H = filterResponse(kernel, d, M);
  const re = Float64Array.from(H), im = new Float64Array(M);
  fft(re, im, true);
  const h = new Float32Array(2 * nDet - 1);
  for (let j = -(nDet - 1); j <= nDet - 1; j++) h[j + nDet - 1] = re[(j + M) % M];
  spatialCache.set(key, h);
  return h;
}

// 4) Filtrado por FFT y 5) retroproyección sobre el DFOV, en CPU. Devuelve HU (Float32).
export function filterBackprojectCPU(ctx, sino) {
  const { job, K, nDet, d } = ctx;
  let M = 1; while (M < 2 * nDet) M <<= 1;
  const H = filterResponse(job.kernel, d, M);
  const re = new Float64Array(M), im = new Float64Array(M);
  const q = new Float32Array(K * nDet);
  for (let v = 0; v < K; v++) {
    re.fill(0); im.fill(0);
    for (let b = 0; b < nDet; b++) re[b] = sino[v * nDet + b];
    fft(re, im, false);
    for (let k = 0; k < M; k++) { re[k] *= H[k]; im[k] *= H[k]; }
    fft(re, im, true);
    for (let b = 0; b < nDet; b++) q[v * nDet + b] = re[b] * d;
  }
  const NR = SCANNER.recon, rpx = job.dfov / NR;
  const img = new Float32Array(NR * NR);
  const half = (nDet - 1) / 2;
  for (let v = 0; v < K; v++) {
    const th = (v * Math.PI) / K, c = Math.cos(th), s = Math.sin(th);
    const row = v * nDet;
    for (let i = 0; i < NR; i++) {
      const y = ((NR - 1) / 2 - i) * rpx;
      let tb = ((-(NR - 1) / 2) * rpx * c + y * s) / d + half;
      const dtb = (rpx * c) / d;
      const o = i * NR;
      for (let j = 0; j < NR; j++, tb += dtb) {
        if (tb < 0 || tb >= nDet - 1) continue;
        const b0 = tb | 0, f = tb - b0;
        img[o + j] += q[row + b0] * (1 - f) + q[row + b0 + 1] * f;
      }
    }
  }
  const mw = MU_WATER[job.kv], scale = Math.PI / K;
  for (let p = 0; p < NR * NR; p++) img[p] = 1000 * ((img[p] * scale) / mw - 1);
  return img;
}

// 6) Reconstrucción iterativa (aproximación) y cuantización a enteros
export function finishSlice(ctx, img) {
  const NR = SCANNER.recon;
  if (ctx.job.iterative > 0) iterativeDenoise(img, NR, ctx.job.iterative);
  const out = new Int16Array(NR * NR);
  for (let p = 0; p < NR * NR; p++) out[p] = Math.max(-1024, Math.min(3071, Math.round(img[p])));
  return out;
}

// Extensión (mm, lado del cuadrado) que hay que rasterizar para incluir todo el objeto en el corte z
function objectExtent(structs, z, offX, offY, sfov) {
  let r = 0;
  for (const s of structs) {
    if (!s.outline) continue;
    const cs = section(s.shape, z);
    if (!cs) continue;
    const w = Math.max(cs.rx, cs.ry);
    r = Math.max(r, Math.abs(cs.cx + offX) + w, Math.abs(cs.cy + offY) + w);
  }
  return Math.min(600, Math.max(sfov, 2 * r + 8));
}

// Difusión de Perona-Malik: reduce el ruido en zonas homogéneas y respeta los bordes.
// strength 0–100 % (como el porcentaje de mezcla de ASIR/ADMIRE). A % altos la textura se vuelve "plástica".
export function iterativeDenoise(img, N, strength) {
  const iters = Math.round(strength / 10);
  const k2 = 30 * 30, lambda = 0.2;
  const orig = Float32Array.from(img);
  let a = img, b = new Float32Array(N * N);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const p = i * N + j, v = a[p];
      const n = i > 0 ? a[p - N] - v : 0, s = i < N - 1 ? a[p + N] - v : 0;
      const w = j > 0 ? a[p - 1] - v : 0, e = j < N - 1 ? a[p + 1] - v : 0;
      const g = (d) => d / (1 + (d * d) / k2);
      b[p] = v + lambda * (g(n) + g(s) + g(w) + g(e));
    }
    [a, b] = [b, a];
  }
  const f = Math.min(1, strength / 100) * 0.9 + 0.1 * (strength > 0);
  for (let p = 0; p < N * N; p++) img[p] = orig[p] * (1 - f) + a[p] * f;
}

// --- Topograma ---------------------------------------------------------------
// Proyección a lo largo de y (AP) o de x (lateral) con magnificación por el centrado vertical.
export function topogram(job) {
  const { structs, kv, z0, z1, view, offX = 0, offY = 0, sfov: sf = 'body', seed = 3 } = job;
  const sfov = 520, n = 260, px = sfov / n, dz = 2;
  const rows = Math.max(1, Math.round((z1 - z0) / dz));
  const img = new Float32Array(rows * n);
  const mu = structureMu(structs, kv, {});
  const soft = new Float32Array(n * n), hard = new Float32Array(n * n);
  const rand = mulberry32(seed);
  // Tubo arriba (AP) o a la derecha del paciente (lateral): un paciente más cerca del tubo se ve más grande.
  const shift = view === 'AP' ? offY : offX;
  const mag = SCANNER.sod / (SCANNER.sod - shift);
  const dw = new Float32Array(rows);
  for (let r = 0; r < rows; r++) {
    soft.fill(0); hard.fill(0);
    const z = z0 + (r + 0.5) * dz;
    rasterize(structs, mu, z, { n, px, xmin: -sfov / 2 + px / 2 - offX, ymin: -sfov / 2 + px / 2 - offY }, soft, hard, 1);
    const line = new Float32Array(n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const p = view === 'AP' ? j * n + i : i * n + j; // AP: suma en y (filas) por columna; lateral: suma en x por fila
      line[i] += (soft[p] + hard[p]) * px;
    }
    // magnificación respecto al isocentro y ruido leve
    let area = 0;
    for (let i = 0; i < n; i++) {
      const src = (i - n / 2 + 0.5) / mag + n / 2 - 0.5;
      const i0 = Math.floor(src), f = src - i0;
      const v = i0 >= 0 && i0 < n - 1 ? line[i0] * (1 - f) + line[i0 + 1] * f : 0;
      const val = v + (rand() - 0.5) * 0.03;
      img[r * n + i] = val;
      area += (val / MU_WATER[kv]) * px; // mm² equivalentes en agua (con el error de magnificación)
    }
    dw[r] = 2 * Math.sqrt(Math.max(0, area) / Math.PI);
  }
  return { img, rows, cols: n, px, dz, z0, z1: z0 + rows * dz, view, mag, dw, sfov };
}

// Diámetro equivalente en agua a partir de un topograma (para ATCM y SSDE)
export function dwFromTopogram(topo) {
  return (z) => {
    const r = Math.max(0, Math.min(topo.rows - 1, Math.round((z - topo.z0) / topo.dz - 0.5)));
    return topo.dw[r];
  };
}

// Índice de ruido esperado (aproximado, para orientar en la consola)
export function expectedNoise(p, dw) {
  const ref = 11 * Math.sqrt((200 * 5) / (p.mas * p.thickness)) * Math.exp(MU_WATER[120] * ((dw || 300) - 300) / 2);
  const kf = { soft: 0.7, standard: 1, brain: 0.85, lung: 2.6, bone: 4.2 }[p.kernel] || 1;
  return ref * kf * Math.pow(120 / p.kv, 1.25);
}

export { mulberry32 };
