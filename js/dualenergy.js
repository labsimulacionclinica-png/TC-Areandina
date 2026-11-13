// TC de doble energía (conmutación rápida 80/140 kV): descomposición en dos materiales (agua + yodo) por píxel.
//   HU(kV) = s + I · f(kV)   →   I = (HU80 − HU140) / (f80 − f140),   s = HU140 − I · f140
// Con s (agua/tejido) e I (yodo, en HU equivalentes a 120 kV) se generan:
//   - imágenes monoenergéticas virtuales (VMI) de 40 a 140 keV: a menos keV más brillo del yodo y más ruido;
//   - mapa de yodo (mg/mL; 1 mg/mL ≈ 26 HU a 120 kV);
//   - imagen sin contraste virtual (VNC).
// El calcio se comporta parecido al yodo en una descomposición de dos materiales: aparece en el mapa de yodo.
import { HARD_FACTOR } from './phantom.js';

const F_LOW = HARD_FACTOR.iodine[80], F_HIGH = HARD_FACTOR.iodine[140];
// Realce relativo del yodo según la energía (1 = 70 keV ≈ 120 kV)
export const KEV_FACTOR = { 40: 2.9, 50: 2.0, 60: 1.4, 70: 1.0, 80: 0.78, 100: 0.52, 140: 0.3 };

export const DE_OUTPUTS = [
  ...Object.keys(KEV_FACTOR).map((k) => ({ value: `vmi:${k}`, label: `VMI ${k} keV` })),
  { value: 'iodine', label: 'Mapa de yodo' },
  { value: 'vnc', label: 'Sin contraste virtual (VNC)' },
];

export function decompose(low, high) {
  const n = low.length, I = new Float32Array(n), s = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    I[p] = (low[p] - high[p]) / (F_LOW - F_HIGH);
    s[p] = high[p] - I[p] * F_HIGH;
  }
  return { I, s };
}

function smooth(a, N, passes) {
  let x = Float32Array.from(a), y = new Float32Array(a.length);
  for (let k = 0; k < passes; k++) {
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      let s = 0, n = 0;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const yy = i + di, xx = j + dj;
        if (yy < 0 || xx < 0 || yy >= N || xx >= N) continue;
        s += x[yy * N + xx]; n++;
      }
      y[i * N + j] = s / n;
    }
    [x, y] = [y, x];
  }
  return x;
}

// de: { low: Int16Array[], high: Int16Array[] }; out: { type: 'vmi'|'iodine'|'vnc', kev }
// Reducción de ruido como en los equipos reales: el yodo es una señal de baja frecuencia (se estima suavizado),
// y las imágenes finales se construyen sobre la mezcla 30 % 80 kV + 70 % 140 kV, que es la de menor ruido.
export function dualEnergyImages(de, out) {
  const W_LOW = 0.3, fMix = W_LOW * F_LOW + (1 - W_LOW) * F_HIGH;
  return de.low.map((low, k) => {
    const high = de.high[k], n = low.length, N = Math.round(Math.sqrt(n));
    const { I } = decompose(low, high);
    const Is = smooth(I, N, 4);
    const img = new Int16Array(n);
    for (let p = 0; p < n; p++) {
      const mix = W_LOW * low[p] + (1 - W_LOW) * high[p];
      const s = mix - Is[p] * fMix;
      let v;
      if (out.type === 'iodine') v = s < -500 ? 0 : Math.max(0, (Is[p] / 26) * 10); // mg/mL × 10
      else if (out.type === 'vnc') v = s;
      else v = mix + Is[p] * (KEV_FACTOR[out.kev] - fMix);
      img[p] = Math.max(-1024, Math.min(3071, Math.round(v)));
    }
    return img;
  });
}

export function parseOutput(v) {
  if (v.startsWith('vmi:')) return { type: 'vmi', kev: +v.slice(4) };
  return { type: v };
}
