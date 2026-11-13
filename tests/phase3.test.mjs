import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnatomy, serialize, truthHU } from '../js/phantom.js';
import { reconstructSlice } from '../js/ct.js';
import { computeCurves, enhancementAt } from '../js/contrast.js';
import { dualEnergyImages } from '../js/dualenergy.js';
import { perfusionMaps, perfusionSummary } from '../js/perfusion.js';
import { CASES } from '../js/cases.js';

const N = 256;
const roiMean = (img, x, y, dfov, r = 4) => {
  const cx = Math.round(x / (dfov / N) + 127.5), cy = Math.round(127.5 - y / (dfov / N));
  let s = 0, n = 0;
  for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (i * i + j * j <= r * r) { s += img[(cy + i) * N + cx + j]; n++; }
  return s / n;
};

test('Perfusión: el realce del tejido refleja CBV y MTT (penumbra lenta, núcleo bajo)', () => {
  const c = computeCurves({ volume: 40, flow: 5, conc: 370, saline: 30 }, { weight: 66, egfr: 68 });
  const peak = (k) => { let m = 0, at = 0; for (let t = 0; t < 60; t += 0.5) { const v = enhancementAt(c, t)[k]; if (v > m) { m = v; at = t; } } return { m, at }; };
  const gm = peak('perfGM'), pen = peak('penumbra'), core = peak('core'), art = peak('cerebralArt');
  assert.ok(gm.m > 8 && gm.m < 25, `GM ${gm.m}`);
  assert.ok(pen.at - gm.at > 4, 'la penumbra llega tarde (Tmax prolongado)');
  assert.ok(core.m < gm.m / 3, 'el núcleo apenas realza');
  assert.ok(art.at < gm.at);
});

test('Perfusión: mapas con el patrón del ictus (penumbra > núcleo) en el nivel de la ACM', { timeout: 120000 }, () => {
  const c = CASES.find((x) => x.key === 'ictus-acm');
  const S = serialize(buildAnatomy({ arms: 'down', extras: c.extras }));
  const curves = computeCurves({ volume: 40, flow: 5, conc: 370, saline: 30 }, { weight: 66, egfr: 68 });
  const times = Array.from({ length: 30 }, (_, f) => 2 + f * 1.5);
  const frames = times.map((t, f) => reconstructSlice({ structs: S, kv: 80, z: 95, thickness: 5, enh: enhancementAt(curves, t), mas: 120, kernel: 'brain', sfov: 'head', dfov: 230, rot: 1, seed: 100 + f }));
  const m = perfusionMaps(frames, times);
  const s = perfusionSummary([m], 230 / 256, 5);
  assert.ok(s.hypoMl > s.coreMl, `hipoperfusión ${s.hypoMl} vs núcleo ${s.coreMl}`);
  assert.ok(s.coreMl > 0.5);
});

test('Doble energía: VMI de baja energía realza más el yodo; VNC lo quita; el mapa de yodo es positivo en la aorta', () => {
  const S = serialize(buildAnatomy({ arms: 'up' }));
  const job = { structs: S, z: 620, thickness: 5, enh: { aorta: 250 }, mas: 150, kernel: 'standard', sfov: 'body', dfov: 380, rot: 0.5 };
  const low = reconstructSlice({ ...job, kv: 80, seed: 1 }), high = reconstructSlice({ ...job, kv: 140, seed: 2 });
  const [v50] = dualEnergyImages({ low: [low], high: [high] }, { type: 'vmi', kev: 50 });
  const [v70] = dualEnergyImages({ low: [low], high: [high] }, { type: 'vmi', kev: 70 });
  const [vnc] = dualEnergyImages({ low: [low], high: [high] }, { type: 'vnc' });
  const [iod] = dualEnergyImages({ low: [low], high: [high] }, { type: 'iodine' });
  const a50 = roiMean(v50, 11, -14, 380, 2), a70 = roiMean(v70, 11, -14, 380, 2), avnc = roiMean(vnc, 11, -14, 380, 2);
  assert.ok(a50 > a70 + 150, `50 keV ${a50} vs 70 keV ${a70}`);
  assert.ok(Math.abs(avnc - 40) < 60, `VNC aorta ${avnc}`);
  assert.ok(roiMean(iod, 11, -14, 380, 2) > 50, 'yodo > 5 mg/mL en la aorta');
  assert.ok(Math.abs(roiMean(v70, -70, 10, 380) - roiMean(vnc, -70, 10, 380)) < 15, 'el hígado sin realce no cambia');
});

test('Anatomía de los casos nuevos: niño escalado, útero grávido y trombo en la ACM derecha', () => {
  const kid = serialize(buildAnatomy({ scale: 0.86 }));
  assert.ok(truthHU(kid, 0, 0, 130 * 0.86) > 0 && truthHU(kid, 0, 0, 160) < 400);
  const preg = serialize(buildAnatomy({ sex: 'F', pregnantWeeks: 24 }));
  assert.ok(Math.abs(truthHU(preg, 0, 30, 790) - 8) < 2, 'líquido amniótico');
  const c = CASES.find((x) => x.key === 'ictus-acm');
  const s = serialize(buildAnatomy({ extras: c.extras }));
  assert.ok(Math.abs(truthHU(s, -35, 16, 125) - 62) < 1, 'trombo hiperdenso en M1 derecha');
});
