import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnatomy, serialize } from '../js/phantom.js';
import { reconstructSlice } from '../js/ct.js';
import { agatston, densityFactor, category } from '../js/calcium.js';
import { CASES, caseByKey, setRandomGenerator } from '../js/cases.js';
import { generateRandomCase, RANDOM_TEMPLATES } from '../js/randomcase.js';
import { truthHU } from '../js/phantom.js';

test('Casos aleatorios: reproducibles por semilla, variados y con la lesión en el órgano correcto', () => {
  setRandomGenerator(generateRandomCase);
  for (const tpl of Object.keys(RANDOM_TEMPLATES)) {
    const seen = new Set();
    for (let seed = 1; seed <= 12; seed++) {
      const key = `rand-${tpl}-${seed}`;
      const a = generateRandomCase(key), b = generateRandomCase(key);
      assert.deepEqual(a, b, 'misma semilla, mismo caso');
      const c = caseByKey(key);
      assert.ok(c && c.question.options[c.question.correct], `${key}: pregunta válida`);
      assert.equal(c.question.options.length, new Set(c.question.options).size, `${key}: opciones sin repetir`);
      if (a.lesions[0]) {
        const l = a.lesions[0];
        seen.add(`${l.x},${l.y},${l.z}`);
        const s = serialize(buildAnatomy({ extras: c.extras }));
        const hu = truthHU(s, l.x, l.y, l.z);
        assert.ok(Math.abs(hu - { hipodensa: 20, hipervascular: 45, trombo: 38, calculo: 1000, hemorragia: 68 }[l.type]) < 2, `${key}: HU en el centro ${hu}`);
      }
    }
    assert.ok(seen.size >= 6, `${tpl}: posiciones variadas (${seen.size})`);
  }
});

test('Biopsia: trayectoria anterior segura, trayectoria por el corazón peligrosa, desviación y evaluación', async () => {
  const { planReport, newNeedle, advance, tipOf, pneumoRisk, evaluateBiopsy } = await import('../js/biopsy.js');
  const c = CASES.find((x) => x.key === 'biopsia-pulmon');
  const s = serialize(buildAnatomy({ arms: 'up', extras: c.extras }));
  const n = c.nodule, target = { x: n.x, y: n.y };
  const anterior = planReport(s, { x: -95, y: 99 }, target, n.z, n);
  const lateral = planReport(s, { x: -172, y: 30 }, target, n.z, n);
  const heart = planReport(s, { x: 30, y: 110 }, target, n.z, n);
  assert.ok(anterior.safe, anterior.warnings.join(' '));
  assert.ok(anterior.lungLength < lateral.lungLength, `${anterior.lungLength} vs ${lateral.lungLength}`);
  assert.equal(anterior.pleura, 1);
  assert.ok(!heart.safe && heart.forbidden.length, 'atravesar el mediastino no es seguro');
  assert.ok(pneumoRisk(60, 2, 4) > pneumoRisk(15, 1, 2));
  // La aguja se desvía un poco pero llega cerca del objetivo
  const nd = newNeedle({ x: -95, y: 99 }, target, n.z, 123);
  for (let i = 0; i < 4; i++) advance(nd, Math.min(20, Math.hypot(target.x - tipOf(nd).x, target.y - tipOf(nd).y) + 1));
  const tip = tipOf(nd);
  assert.ok(Math.hypot(tip.x - n.x, tip.y - n.y) < 8, `punta a ${Math.hypot(tip.x - n.x, tip.y - n.y)} mm`);
  const { tracePoints } = await import('../js/biopsy.js');
  const whole = tracePoints(s, nd.points, n.z, n);
  assert.equal(whole.pleura, 1, 'varios pases: una sola punción pleural');
  assert.ok(Math.abs(whole.lungLength - anterior.lungLength) < 6, `pulmón ${whole.lungLength} vs plan ${anterior.lungLength}`);
  const S = { caseDef: c, student: 'A', startTime: Date.now(), biopsy: { needle: nd, sampled: true, controls: 3, finalTrace: whole, pneumothorax: false } };
  const r = evaluateBiopsy(S, 0);
  assert.ok(r.percent >= 80, JSON.stringify(r.items));
});

test('Agatston: factores de densidad y categorías', () => {
  assert.deepEqual([129, 130, 199, 200, 300, 400, 900].map(densityFactor), [0, 1, 1, 2, 3, 4, 4]);
  assert.match(category(0).label, /^0/);
  assert.match(category(55).label, /11–100/);
  assert.match(category(450).label, /> 400/);
});

test('Agatston: detecta la placa calcificada de la DA y nada en un corazón sin calcio', { timeout: 120000 }, () => {
  const c = CASES.find((x) => x.key === 'coronario');
  const withPlaque = serialize(buildAnatomy({ arms: 'up', extras: c.extras }));
  const clean = serialize(buildAnatomy({ arms: 'up' }));
  const zs = [450, 453, 456, 459, 462];
  const mk = (structs) => ({ params: { thickness: 3, kv: 120 }, dfov: 200, zs, phase: 'simple',
    slices: zs.map((z, i) => reconstructSlice({ structs, kv: 120, z, thickness: 3, enh: {}, mas: 150, kernel: 'standard', sfov: 'body', dfov: 200, rot: 0.28, seed: 40 + i })) });
  const r = agatston(mk(withPlaque));
  assert.ok(r.total > 10, `puntuación ${r.total}`);
  assert.ok(r.lesions.every((l) => Math.hypot(l.x - 27, l.y - 72) < 12), 'las lesiones están en la DA proximal');
  assert.ok(agatston(mk(clean)).total < 5, 'sin placas no hay puntuación (el ruido no cuenta)');
});
