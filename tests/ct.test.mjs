import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnatomy, serialize, truthHU, lesion, structureAt } from '../js/phantom.js';
import { reconstructSlice, topogram, ctdiVol, doseReport, atcmFactor, ssdeFactor, organDoses, heartDisplacement } from '../js/ct.js';
import { computeCurves, enhancementAt } from '../js/contrast.js';
import { CASES } from '../js/cases.js';

const N = 256;
const pix = (x, y, dfov) => [Math.round(x / (dfov / N) + 127.5), Math.round(127.5 - y / (dfov / N))];
function roi(img, x, y, dfov, r = 5) {
  const [cx, cy] = pix(x, y, dfov), v = [];
  for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (i * i + j * j <= r * r) v.push(img[(cy + i) * N + cx + j]);
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return { mean: m, sd: Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) };
}

const up = serialize(buildAnatomy({ arms: 'up' }));
const down = serialize(buildAnatomy({ arms: 'down' }));
const abdJob = { structs: up, kv: 120, z: 620, thickness: 5, enh: {}, mas: 200, kernel: 'standard', sfov: 'body', dfov: 380, rot: 0.5, seed: 5 };

test('Hígado sin contraste: HU correctos y ruido de un abdomen estándar (200 mAs, 5 mm)', () => {
  const img = reconstructSlice(abdJob);
  const r = roi(img, -70, 10, 380);
  assert.ok(Math.abs(r.mean - 60) < 12, `media ${r.mean}`);
  assert.ok(r.sd > 7 && r.sd < 18, `DE ${r.sd}`);
});

test('El ruido baja con la raíz de los mAs y sube con el filtro de hueso', () => {
  const lo = roi(reconstructSlice({ ...abdJob, mas: 50 }), -70, 10, 380).sd;
  const hi = roi(reconstructSlice({ ...abdJob, mas: 400 }), -70, 10, 380).sd;
  assert.ok(lo / hi > 2.2 && lo / hi < 3.6, `razón ${lo / hi}`); // ideal √8 ≈ 2,8
  const bone = roi(reconstructSlice({ ...abdJob, kernel: 'bone' }), -70, 10, 380).sd;
  assert.ok(bone > 2.5 * roi(reconstructSlice(abdJob), -70, 10, 380).sd);
});

test('Cráneo: contraste sustancia gris/blanca visible y hematoma hiperdenso', () => {
  const c = CASES.find((x) => x.key === 'craneo-hic');
  const s = serialize(buildAnatomy({ arms: 'down', extras: c.extras }));
  const img = reconstructSlice({ structs: s, kv: 120, z: 84, thickness: 5, enh: {}, mas: 280, kernel: 'brain', sfov: 'head', dfov: 230, rot: 1, seed: 2 });
  const wm = roi(img, 30, 10, 230, 4), hem = roi(img, -34, 2, 230, 4);
  assert.ok(wm.sd < 6, `ruido ${wm.sd}`);
  assert.ok(hem.mean - wm.mean > 25, `hematoma ${hem.mean} vs SB ${wm.mean}`);
});

test('El yodo realza más a 80 kV que a 140 kV; el tejido blando no cambia', () => {
  const enh = { aorta: 250 };
  const at = (kv) => roi(reconstructSlice({ ...abdJob, kv, enh, mas: 400 }), 11, -14, 380, 3).mean;
  assert.ok(at(80) - at(140) > 120);
  const soft = (kv) => roi(reconstructSlice({ ...abdJob, kv, mas: 400 }), -70, 10, 380).mean;
  assert.ok(Math.abs(soft(80) - soft(140)) < 15);
});

test('El metal produce rayas y la reducción de artefactos las atenúa', () => {
  const metal = serialize(buildAnatomy({ arms: 'up', extras: [lesion.ell('protesis', [88, -6, 915], [22, 22, 30], { hu: 50, bone: 9000 })] }));
  const job = { ...abdJob, structs: metal, z: 915, mas: 250 };
  const bad = roi(reconstructSlice(job), 0, 20, 380, 8).sd;
  const mar = roi(reconstructSlice({ ...job, metalReduction: true }), 0, 20, 380, 8).sd;
  const clean = roi(reconstructSlice({ ...abdJob, z: 915, mas: 250 }), 0, 20, 380, 8).sd;
  assert.ok(bad > 2 * clean, `con metal ${bad} vs sin metal ${clean}`);
  assert.ok(mar < bad);
});

test('Inclinación del gantry: saca los cristalinos del haz; el bismuto reduce su dosis', () => {
  const p = { kv: 120, mas: 250, pitch: 0.55, rot: 1, coll: '32x0.625', sfov: 'head', thickness: 5, tilt: 0 };
  assert.equal(organDoses(p, 5, 162, 50).lens.inField, true);
  assert.equal(organDoses({ ...p, tilt: -20 }, 5, 162, 50).lens.inField, false);
  const sh = organDoses(p, 5, 162, 50, { shields: new Set(['ojos']) });
  assert.ok(sh.lens.shielded && sh.lens.dose < 50 * 0.7);
  // El plano inclinado corta los ojos en un corte que sin inclinación no los tocaría
  const s = serialize(buildAnatomy({ arms: 'down' }));
  const job = { structs: s, kv: 120, z: 120, thickness: 5, enh: {}, mas: 280, kernel: 'brain', sfov: 'head', dfov: 230, rot: 1, seed: 2 };
  const flat = roi(reconstructSlice(job), 32, 80, 230, 3).mean, tilted = roi(reconstructSlice({ ...job, tilt: 20 }), 32, 80, 230, 3).mean;
  assert.ok(Math.abs(flat - tilted) > 30, `${flat} vs ${tilted}`);
});

test('Corazón: quieto en diástole con frecuencia baja, en movimiento con frecuencia alta', () => {
  const move = (hr, phase) => {
    const t = ((phase / 100) * 60) / hr, w = 0.14; // media vuelta a 0,28 s
    const [ax, ay] = heartDisplacement(t - w / 2, hr, 5), [bx, by] = heartDisplacement(t + w / 2, hr, 5);
    return Math.hypot(bx - ax, by - ay);
  };
  assert.ok(move(58, 75) < 0.5, `58 lpm: ${move(58, 75)}`);
  assert.ok(move(90, 75) > 1.5, `90 lpm: ${move(90, 75)}`);
  assert.ok(move(58, 20) > 2, 'la sístole siempre se mueve');
  // La capa móvil se proyecta desplazada: con movimiento cardíaco la imagen del corazón cambia
  const job = { structs: up, kv: 100, z: 470, thickness: 1.25, enh: { aorta: 350, pa: 300, heart: 320 }, mas: 400, kernel: 'standard', sfov: 'body', dfov: 200, rot: 0.28, seed: 3 };
  const still = reconstructSlice({ ...job, motion: { cardiac: { hr: 58, amp: 5 } }, t: (0.75 * 60) / 58 - 0.07 });
  const beat = reconstructSlice({ ...job, motion: { cardiac: { hr: 90, amp: 5 } }, t: (0.2 * 60) / 90 });
  let d = 0; for (let p = 0; p < still.length; p++) d += Math.abs(still[p] - beat[p]);
  assert.ok(d / still.length > 3);
});

test('Truncamiento: un abdomen con el SFOV de cabeza produce un borde brillante en el límite del campo', () => {
  const trunc = reconstructSlice({ ...abdJob, sfov: 'head', dfov: 300 });
  const ok = reconstructSlice({ ...abdJob, dfov: 300 });
  // En el borde lateral del campo de 300 mm el valor sube mucho con truncamiento
  const edgeT = roi(trunc, -147, 0, 300, 1).mean, edgeOk = roi(ok, -147, 0, 300, 1).mean;
  assert.ok(edgeT - edgeOk > 300, `truncado ${edgeT} vs correcto ${edgeOk}`);
});

test('Reconstrucción iterativa: menos ruido y el mismo valor medio', () => {
  const fbp = roi(reconstructSlice(abdJob), -70, 10, 380, 6);
  const ir = roi(reconstructSlice({ ...abdJob, iterative: 60 }), -70, 10, 380, 6);
  assert.ok(ir.sd < fbp.sd * 0.7, `IR ${ir.sd} vs FBP ${fbp.sd}`);
  assert.ok(Math.abs(ir.mean - fbp.mean) < 5);
});

test('Los brazos a los lados aumentan el ruido en el abdomen', () => {
  const sdUp = roi(reconstructSlice(abdJob), -70, 10, 380).sd;
  const sdDown = roi(reconstructSlice({ ...abdJob, structs: down }), -70, 10, 380).sd;
  assert.ok(sdDown > 1.4 * sdUp, `${sdDown} vs ${sdUp}`);
});

test('Movimiento respiratorio: el contorno del hígado se emborrona', () => {
  const still = reconstructSlice({ ...abdJob, mas: 600 });
  const moved = reconstructSlice({ ...abdJob, mas: 600, motion: { amp: 8, period: 1 }, t: 0 });
  let diff = 0;
  for (let p = 0; p < still.length; p++) diff += Math.abs(still[p] - moved[p]);
  assert.ok(diff / still.length > 5);
});

test('Topograma: diámetro equivalente en agua plausible y magnificación por la altura de la mesa', () => {
  const t = topogram({ structs: up, kv: 120, z0: 600, z1: 640, view: 'AP' });
  const dw = t.dw[10];
  assert.ok(dw > 250 && dw < 340, `Dw ${dw}`);
  const high = topogram({ structs: up, kv: 120, z0: 600, z1: 640, view: 'AP', offY: 50 });
  assert.ok(high.dw[10] > dw * 1.03);
});

test('Dosis: CTDIvol lineal con los mAs, penalización de colimación estrecha, SSDE > CTDIvol en un adulto delgado', () => {
  const p = { kv: 120, mas: 100, pitch: 1, rot: 0.5, coll: '64x0.625', sfov: 'body', atcm: false, thickness: 5 };
  assert.ok(Math.abs(ctdiVol({ ...p, mas: 200 }) / ctdiVol(p) - 2) < 1e-9);
  assert.ok(ctdiVol({ ...p, coll: '16x0.625' }) > ctdiVol(p) * 1.15);
  assert.ok(ssdeFactor(250, 'body') > 1.2);
  const r = doseReport(p, 0, 400, null, 'abdomen');
  assert.ok(r.dlp > r.ctdi * 40 && r.effective > 0);
  assert.ok(atcmFactor(350, 'body') > 1 && atcmFactor(220, 'body') < 1);
});

test('Curvas de realce: arteria pulmonar antes que la aorta, lavado del hepatocarcinoma y fase excretora', () => {
  const c = computeCurves({ volume: 100, flow: 4, conc: 350, saline: 40 }, { weight: 75, egfr: 90 });
  const e = (t) => enhancementAt(c, t);
  assert.ok(e(12).pa > 100 && e(12).aorta < 50);
  assert.ok(e(35).aorta > 220);
  assert.ok(e(35).hcc > e(35).liver + 60, 'nódulo hiperdenso en arterial');
  assert.ok(e(70).hcc < e(70).liver, 'lavado en portal');
  assert.ok(e(70).liver > 40);
  assert.ok(e(300).urine > 500 && e(60).urine < 100);
  // Sin bolo de suero el realce es menor
  const noSaline = computeCurves({ volume: 60, flow: 4, conc: 350, saline: 0 }, { weight: 75, egfr: 90 });
  const withSaline = computeCurves({ volume: 60, flow: 4, conc: 350, saline: 40 }, { weight: 75, egfr: 90 });
  const peak = (cv) => Math.max(...[20, 25, 30, 35, 40].map((t) => enhancementAt(cv, t).aorta));
  assert.ok(peak(withSaline) > peak(noSaline) + 10);
});

test('Las lesiones de cada caso quedan dentro del órgano esperado', () => {
  const at = (key, x, y, z) => truthHU(serialize(buildAnatomy({ extras: CASES.find((c) => c.key === key).extras })), x, y, z);
  assert.ok(Math.abs(at('angio-tep', -36, 8, 431) - 38) < 1);
  assert.ok(at('urolitiasis', 52, -40, 793) > 900);
  assert.ok(Math.abs(at('torax-nodulo', -62, 34, 398) - 35) < 1);
  assert.ok(Math.abs(truthHU(up, -62, 34, 398) + 860) < 1, 'el nódulo está en el pulmón derecho');
  // Nuevos casos: la lesión cae dentro del órgano esperado
  const organ = (x, y, z) => structureAt(up, x, y, z)?.name;
  assert.equal(organ(24, -28, 480), 'aorta-descendente');
  assert.equal(organ(16, -14, 650), 'aorta-abdominal');
  // La falsa luz de la disección no se sale de la aorta
  const dis = serialize(buildAnatomy({ extras: CASES.find((c) => c.key === 'diseccion-aortica').extras }));
  for (let z = 405; z < 760; z += 15) for (let a = 0; a < 360; a += 20) {
    for (const s of dis.filter((x) => x.name === 'falsa-luz')) {
      const z0 = s.shape.z0, z1 = s.shape.z1;
      if (z < z0 || z > z1) continue;
      const f = (z - z0) / (z1 - z0), cx = s.shape.c0[0] + (s.shape.c1[0] - s.shape.c0[0]) * f, cy = s.shape.c0[1] + (s.shape.c1[1] - s.shape.c0[1]) * f;
      const rx = s.shape.r0[0] + (s.shape.r1[0] - s.shape.r0[0]) * f, ry = s.shape.r0[1] + (s.shape.r1[1] - s.shape.r0[1]) * f;
      const x = cx + 0.95 * rx * Math.cos((a * Math.PI) / 180), y = cy + 0.95 * ry * Math.sin((a * Math.PI) / 180);
      assert.match(organ(x, y, z), /^(aorta|arteria-|tronco-celiaco)/, `z ${z}, ángulo ${a}`); // las ramas nacen de la aorta
    }
  }
  assert.equal(organ(100, -32, 602), 'bazo');
  assert.equal(organ(36, -22, 232), 'cuello-musculo');
  assert.ok(at('protesis-cadera', -88, -6, 915) > 8000);
  assert.ok(Math.abs(at('cuello-absceso', 36, -22, 232) - 18) < 1);
});

test('Disección: la falsa luz realza más tarde que la luz verdadera; el absceso tiene pared que capta', () => {
  const c = computeCurves({ volume: 80, flow: 4.5, conc: 350, saline: 40 }, { weight: 84, egfr: 70 });
  const e = (t) => enhancementAt(c, t);
  assert.ok(e(25).aorta - e(25).falselumen > 80);
  assert.ok(e(65).rim > 30);
});

test('MAR: la colección periprotésica se mide mejor con reducción de metal', () => {
  const c = CASES.find((x) => x.key === 'protesis-cadera');
  const s = serialize(buildAnatomy({ arms: 'up', sex: 'F', extras: c.extras }));
  const job = { structs: s, kv: 120, z: 930, thickness: 3, enh: {}, mas: 250, kernel: 'standard', sfov: 'body', dfov: 380, rot: 0.5, seed: 4 };
  const bad = roi(reconstructSlice(job), -122, 6, 380, 4), mar = roi(reconstructSlice({ ...job, metalReduction: true }), -122, 6, 380, 4);
  assert.ok(Math.abs(mar.mean - 16) < Math.abs(bad.mean - 16) || mar.sd < bad.sd, `sin MAR ${bad.mean}±${bad.sd}, con MAR ${mar.mean}±${mar.sd}`);
});
