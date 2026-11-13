// Física espectral: espectro del tubo de rayos X, atenuación dependiente de la energía y
// corrección del endurecimiento del haz con agua (como la calibración de un tomógrafo real).
//
// Modelo de cada rayo: A(E) = fw(E)·Lw + cb·Hb·fb(E) + ci·Hi·fi(E)
//   Lw  longitud equivalente de agua (mm, ponderada por la densidad de los tejidos blandos)
//   Hb  integral del exceso de hueso (HU·mm a 120 kV); Hi  integral del yodo (HU·mm a 120 kV)
//   f   coeficiente másico (cm²/g) × 0,1 → atenuación por mm a densidad 1 g/cm³
//   cb, ci  densidad equivalente por HU, calibrada para que a 120 kV las HU coincidan con las del fantoma.
// El detector integra energía: la señal pesa cada fotón por su energía.

// Coeficientes de atenuación másica (cm²/g), valores aproximados de NIST XCOM
const TAB = {
  water: [[15, 1.673], [20, 0.8096], [30, 0.3756], [40, 0.2683], [50, 0.2269], [60, 0.2059], [80, 0.1837], [100, 0.1707], [150, 0.1505]],
  bone: [[15, 9.032], [20, 4.001], [30, 1.331], [40, 0.6655], [50, 0.4242], [60, 0.3148], [80, 0.2229], [100, 0.1855], [150, 0.148]], // hueso cortical ICRU
  iodine: [[15, 50.0], [20, 22.1], [30, 8.0], [33.16, 6.55], [33.17, 36.0], [40, 22.1], [50, 12.3], [60, 7.61], [80, 3.51], [100, 1.94], [150, 0.69]], // borde K a 33,17 keV
  aluminum: [[15, 7.955], [20, 3.441], [30, 1.128], [40, 0.5685], [50, 0.3681], [60, 0.2778], [80, 0.2018], [100, 0.1704], [150, 0.1378]],
};

// Interpolación log-log en la tabla
export function massAtten(material, E) {
  const t = TAB[material];
  if (E <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (E <= t[i][0]) {
      const [e0, m0] = t[i - 1], [e1, m1] = t[i];
      return Math.exp(Math.log(m0) + (Math.log(m1) - Math.log(m0)) * (Math.log(E) - Math.log(e0)) / (Math.log(e1) - Math.log(e0)));
    }
  }
  return t[t.length - 1][1];
}

export const FILTER_AL_MM = 7; // filtración total equivalente (inherente + añadida)

// Espectro de fotones (número relativo por intervalo) para un kVp: ley de Kramers, líneas K del wolframio y filtración
export function spectrum(kVp, { step = 2, filterAl = FILTER_AL_MM } = {}) {
  const E = [], n = [];
  for (let e = 15 + step / 2; e < kVp; e += step) {
    let v = (kVp - e) / e;                                   // Kramers (fotones)
    if (kVp > 69.5) {                                         // líneas características K (Kα ≈ 59 keV, Kβ ≈ 67 keV)
      const amp = 0.9 * Math.pow(kVp / 69.5 - 1, 1.6);
      for (const [ek, rel] of [[58.0, 0.58], [59.3, 1], [67.2, 0.34]]) if (Math.abs(e - ek) < step / 2) v += amp * rel * (kVp - 69.5) / ek;
    }
    v *= Math.exp(-massAtten('aluminum', e) * 2.699 * filterAl / 10);
    E.push(e); n.push(v);
  }
  const sum = n.reduce((a, b) => a + b, 0);
  return { E: Float64Array.from(E), n: Float64Array.from(n, (v) => v / sum) };
}

export function meanEnergy(sp, waterMm = 0) {
  let a = 0, b = 0;
  sp.E.forEach((e, i) => { const w = sp.n[i] * Math.exp(-massAtten('water', e) * waterMm / 10); a += w * e; b += w; });
  return a / b;
}

const models = new Map();
// Modelo precalculado para un kV: tablas por energía, constantes de calibración y corrección de agua
export function spectralModel(kv) {
  if (models.has(kv)) return models.get(kv);
  const sp = spectrum(kv);
  const nE = sp.E.length;
  const fw = new Float64Array(nE), fb = new Float64Array(nE), fi = new Float64Array(nE), wE = new Float64Array(nE), wN = new Float64Array(nE);
  let sE = 0;
  for (let i = 0; i < nE; i++) {
    const e = sp.E[i];
    fw[i] = massAtten('water', e) / 10; fb[i] = massAtten('bone', e) / 10; fi[i] = massAtten('iodine', e) / 10;
    wE[i] = sp.n[i] * e; sE += wE[i]; wN[i] = sp.n[i];
  }
  for (let i = 0; i < nE; i++) wE[i] /= sE;
  // Calibración a 120 kV tras 200 mm de agua (independiente del kV del examen: es una propiedad del material)
  const cal = calibration();
  const m = { kv, sp, nE, fw, fb, fi, wE, wN, cb: cal.cb, ci: cal.ci };
  // Corrección del endurecimiento con agua: proyección policromática → longitud de agua (tabla monótona)
  const step = 2, maxL = 900, tab = new Float64Array(maxL / step + 1);
  for (let k = 0; k < tab.length; k++) tab[k] = polyProjection(m, k * step, 0, 0).p;
  m.waterTab = tab; m.waterStep = step;
  // Contribución lineal (señal pequeña) de 1000 HU·mm de hueso, en mm de agua: la «verdad» de la corrección de hueso
  m.boneLin = waterLength(m, polyProjection(m, 200, 1000, 0).p) - waterLength(m, polyProjection(m, 200, 0, 0).p);
  models.set(kv, m);
  return m;
}

let calCache = null;
function calibration() {
  if (calCache) return calCache;
  const sp = spectrum(120);
  let sw = 0, sb = 0, si = 0;
  sp.E.forEach((e, i) => {
    const w = sp.n[i] * e * Math.exp(-massAtten('water', e) * 200 / 10);
    sw += w * massAtten('water', e); sb += w * massAtten('bone', e); si += w * massAtten('iodine', e);
  });
  // ΔHU = 1000·c·⟨f_m⟩/⟨f_w⟩·H → c = ⟨f_w⟩ / (1000·⟨f_m⟩)
  calCache = { cb: sw / (1000 * sb), ci: sw / (1000 * si) };
  return calCache;
}

// Proyección policromática de un rayo. Devuelve p = −ln(I/I0) del detector integrador de energía
// y la transmisión en número de fotones (para el ruido cuántico).
export function polyProjection(m, Lw, Hb, Hi) {
  let I = 0, N = 0;
  const b = m.cb * Hb, c = m.ci * Hi;
  for (let i = 0; i < m.nE; i++) {
    const t = Math.exp(-(m.fw[i] * Lw + b * m.fb[i] + c * m.fi[i]));
    I += m.wE[i] * t; N += m.wN[i] * t;
  }
  return { p: -Math.log(Math.max(I, 1e-30)), T: N };
}

// Linealización con agua: p policromática → longitud de agua equivalente (mm)
export function waterLength(m, p) {
  const tab = m.waterTab;
  if (p <= 0) return 0;
  let lo = 0, hi = tab.length - 1;
  if (p >= tab[hi]) return hi * m.waterStep + (p - tab[hi]) / (m.fw[m.nE - 1] || 0.017);
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tab[mid] < p) lo = mid; else hi = mid; }
  return (lo + (p - tab[lo]) / (tab[hi] - tab[lo])) * m.waterStep;
}

// HU efectivas de un material puro con densidad ρ (para comprobaciones y para el atlas)
export function effectiveHU(kv, material, rho, waterMm = 200) {
  const m = spectralModel(kv);
  const p0 = polyProjection(m, waterMm, 0, 0).p;
  // 1 mm de material en lugar de 1 mm de agua; el yodo va disuelto en agua (ρ = concentración en g/cm³)
  const tab = { water: m.fw, bone: m.fb, iodine: m.fi }[material];
  const keepWater = material === 'iodine' ? 1 : 0;
  let I = 0;
  for (let i = 0; i < m.nE; i++) I += m.wE[i] * Math.exp(-(m.fw[i] * (waterMm - 1 + keepWater) + rho * tab[i]));
  const dL = waterLength(m, -Math.log(I)) - waterLength(m, p0);
  return 1000 * dL; // ΔL = (μ − μagua)/μagua en mm de agua por mm de material

}
