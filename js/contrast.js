// Farmacocinética simplificada del contraste yodado y del inyector.
// El aporte de yodo I(t) (mgI/s) se convoluciona con una función de tránsito (gamma variada) por compartimento,
// más una fase de equilibrio (recirculación) proporcional al yodo acumulado. Realce en HU a 120 kV.

export const DT = 0.5;       // s
export const T_MAX = 600;    // s
const N = Math.round(T_MAX / DT) + 1;

// Caudal máximo recomendado por calibre del catéter (mL/s)
export const CATHETERS = {
  none: { label: 'Sin acceso venoso', maxFlow: 0 },
  '22G': { label: '22G (azul)', maxFlow: 3 },
  '20G': { label: '20G (rosa)', maxFlow: 5 },
  '18G': { label: '18G (verde)', maxFlow: 7 },
};

export function injectionSummary(inj) {
  const dur = inj.volume / Math.max(inj.flow, 0.1);
  const iodine = (inj.volume * inj.conc) / 1000; // gI
  return { duration: dur, iodineG: iodine, salineDuration: inj.saline / Math.max(inj.flow, 0.1), iodineDeliveryRate: (inj.flow * inj.conc) / 1000 };
}

function gammaKernel(td, tp) {
  // g(τ) = (τ/tp)^3 · e^{3(1−τ/tp)} normalizada a área 1, desplazada td
  const k = new Float64Array(N);
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const tau = i * DT - td;
    if (tau <= 0) continue;
    const u = tau / tp;
    const v = u ** 3 * Math.exp(3 * (1 - u));
    if (u > 12) break;
    k[i] = v;
    sum += v * DT;
  }
  if (sum > 0) for (let i = 0; i < N; i++) k[i] /= sum;
  return k;
}

function convolve(a, k) {
  const out = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    if (!a[i]) continue;
    const ai = a[i] * DT;
    for (let j = 0; i + j < N; j++) if (k[j]) out[i + j] += ai * k[j];
  }
  return out;
}

function lowpass(a, tau) {
  if (!tau) return a;
  const out = new Float64Array(N);
  const alpha = DT / (tau + DT);
  for (let i = 1; i < N; i++) out[i] = out[i - 1] + alpha * (a[i] - out[i - 1]);
  return out;
}

function delay(a, d) {
  const s = Math.round(d / DT), out = new Float64Array(N);
  for (let i = s; i < N; i++) out[i] = a[i - s];
  return out;
}

const lin = (...terms) => {
  const out = new Float64Array(N);
  for (const [w, a] of terms) for (let i = 0; i < N; i++) out[i] += w * a[i];
  return out;
};

// inj: { volume, flow, conc, saline }  patient: { weight, cardiacOutput (1 = normal), egfr }
export function computeCurves(inj, patient) {
  const comps = {};
  const zero = new Float64Array(N);
  if (!inj || !inj.volume || !inj.flow) {
    return { comps: new Proxy({}, { get: () => zero }), injDuration: 0 };
  }
  const W = patient.weight || 75, co = patient.cardiacOutput || 1;
  const dur = inj.volume / inj.flow;
  // Espacio muerto: sin bolo de suero se pierden ~15 mL de contraste en la vía y las venas del brazo
  const wasted = 15 * (1 - Math.min(1, (inj.saline || 0) / 30));
  const effDur = Math.max(0, (inj.volume - wasted) / inj.flow);
  const I = new Float64Array(N);
  for (let i = 0; i < N; i++) if (i * DT < effDur) I[i] = inj.flow * inj.conc; // mgI/s
  const D = new Float64Array(N); // yodo acumulado (mg)
  for (let i = 1; i < N; i++) D[i] = D[i - 1] + I[i - 1] * DT;

  const scale = (70 / W) / co;
  const fp = (td, tp, k) => { const c = convolve(I, gammaKernel(td / co, tp / Math.sqrt(co))); for (let i = 0; i < N; i++) c[i] *= k * scale; return c; };
  const eqRaw = lowpass(delay(D, 14 / co), 25);
  const eq = new Float64Array(N);
  for (let i = 0; i < N; i++) eq[i] = 0.0034 * eqRaw[i] * (70 / W) * Math.exp(-Math.max(0, i * DT - 90) / 1500);

  const aortaFP = fp(14, 5, 0.24);
  const paFP = fp(7, 3, 0.27);
  const portalFP = fp(27, 11, 0.105);
  comps.aorta = lin([1, aortaFP], [1, eq]);
  comps.pa = lin([1, paFP], [1, eq]);
  comps.pv = lin([1, delay(lowpass(paFP, 2), 3)], [1, eq]);
  comps.heart = lin([0.55, lowpass(paFP, 2)], [0.45, aortaFP], [1, eq]);
  comps.myocardium = lin([0.22, lowpass(aortaFP, 4)], [0.35, eq]);
  comps.portal = lin([1, portalFP], [1, eq]);
  comps.liver = lin([0.08, lowpass(aortaFP, 5)], [0.28, lowpass(portalFP, 12)], [0.42, eq]);
  comps.spleen = lin([0.45, lowpass(aortaFP, 5)], [0.75, eq]);
  comps.pancreas = lin([0.42, lowpass(aortaFP, 5)], [0.45, eq]);
  comps.kcortex = lin([0.6, lowpass(aortaFP, 4)], [0.9, eq]);
  comps.kmedulla = lin([0.55, lowpass(delay(aortaFP, 8), 35)], [0.9, eq]);
  comps.bowel = lin([0.2, lowpass(aortaFP, 8)], [0.5, eq]);
  comps.muscle = lin([0.04, lowpass(aortaFP, 10)], [0.22, eq]);
  comps.uterus = lin([0.35, lowpass(aortaFP, 8)], [0.6, eq]);
  comps.thyroid = lin([0.35, lowpass(aortaFP, 5)], [0.6, eq]);
  comps.brain = lin([0.02, aortaFP], [0.04, eq]);
  comps.ivc = lin([0.45, lowpass(delay(aortaFP, 14), 18)], [1, eq]);
  comps.hepvein = lin([0.75, lowpass(delay(portalFP, 4), 12)], [1, eq]);
  comps.jugular = lin([0.7, lowpass(delay(aortaFP, 6), 8)], [1, eq]);
  // Hepatocarcinoma: realce arterial intenso y lavado en fase portal
  comps.hcc = lin([0.62, lowpass(aortaFP, 4)], [0.22, eq]);
  // Circulación cerebral. Las arterias reciben el bolo ~1,5 s después que la aorta; los senos venosos ~6 s después.
  // El parénquima solo realza por la sangre intravascular (barrera hematoencefálica intacta):
  //   tejido(t) = CBV · [AIF ⊛ (1/MTT)·e^(−t/MTT)](t − retraso)
  // Valores típicos: sustancia gris CBV 4,5 % y MTT 4 s; blanca 2,2 % y 5 s;
  // penumbra CBV conservado con MTT y Tmax prolongados; núcleo del infarto con CBV y CBF muy bajos.
  comps.cerebralArt = delay(comps.aorta, 1.5);
  comps.venous = lin([0.9, lowpass(delay(aortaFP, 6), 4)], [1, eq]);
  const tissue = (cbv, mtt, del) => { const c = lowpass(delay(comps.aorta, 1.5 + del), mtt); for (let i = 0; i < N; i++) c[i] *= cbv; return c; };
  comps.perfGM = tissue(0.045, 4, 0.3);
  comps.perfWM = tissue(0.022, 5, 0.5);
  comps.penumbra = tissue(0.042, 11, 4.5);
  comps.core = tissue(0.011, 9, 5);
  comps.collateral = lin([0.65, lowpass(delay(comps.aorta, 5), 3)]);
  // Falsa luz de una disección: se llena más tarde y con menos contraste
  comps.falselumen = lin([0.7, lowpass(delay(aortaFP, 5), 9)], [1, eq]);
  // Pared inflamatoria de un absceso
  comps.rim = lin([0.3, lowpass(aortaFP, 8)], [1.1, eq]);
  comps.metastasis =lin([0.05, lowpass(aortaFP, 6)], [0.2, eq]);
  comps.clot = zero;

  // Vena cava superior / subclavia (brazo de la inyección): contraste casi puro durante la inyección
  const svc = new Float64Array(N);
  const salineDur = (inj.saline || 0) / inj.flow;
  for (let i = 0; i < N; i++) {
    const t = i * DT;
    if (t >= 1 && t < dur + 1) svc[i] = 26 * inj.conc * (inj.flow / (inj.flow + 22));
    else if (t >= dur + 1) {
      const level = 26 * inj.conc * (inj.flow / (inj.flow + 22));
      svc[i] = salineDur > 3 ? level * Math.exp(-(t - dur - 1) / 1.2) : level * 0.55 * Math.exp(-(t - dur - 1) / 9);
    }
  }
  comps.svc = lin([1, svc], [1, eq]);

  // Eliminación renal: el sistema colector se opacifica en la fase excretora (más tarde si el FG es bajo)
  const egfr = patient.egfr ?? 90;
  const tEx = 150 + Math.max(0, 90 - egfr) * 3;
  const urine = new Float64Array(N), bladder = new Float64Array(N);
  const dose = (inj.volume * inj.conc) / 35000;
  for (let i = 0; i < N; i++) {
    const t = i * DT;
    urine[i] = 1800 * dose * (Math.min(egfr, 100) / 90) / (1 + Math.exp(-(t - tEx) / 22));
    bladder[i] = 0.18 * 1800 * dose * (Math.min(egfr, 100) / 90) / (1 + Math.exp(-(t - tEx - 90) / 40));
  }
  comps.urine = urine;
  comps.bladder = bladder;
  return { comps, injDuration: dur };
}

// Realce de todos los compartimentos en el instante t (s desde el inicio de la inyección)
export function enhancementAt(curves, t) {
  const out = {};
  if (t == null || t < 0) return out;
  const f = t / DT, i = Math.floor(f), w = f - i;
  for (const k of Object.keys(curves.comps)) {
    const a = curves.comps[k];
    if (i >= N - 1) out[k] = a[N - 1];
    else out[k] = a[i] * (1 - w) + a[i + 1] * w;
  }
  return out;
}

export const COMP_LABELS = { pa: 'Arteria pulmonar', aorta: 'Aorta', portal: 'Vena porta', liver: 'Hígado', kcortex: 'Corteza renal', urine: 'Vía excretora', hcc: 'Lesión hepática' };
