// Fase C: banco de preguntas, ECOE, turno, STOW y API en vivo / PACS del servidor
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QUESTIONS, TOPICS, pickQuestions, tagsForCase } from '../js/questions.js';
import { configToUrl, configFromParam, summarize, certificateCode, verifyCertificate, b64e, b64d } from '../js/ecoe.js';
import { generateShift, triageScore, waitScore, shiftSummary, nextClock, PRIORITY } from '../js/worklist.js';
import { multipartRelated } from '../js/dicom.js';
import { CASES } from '../js/cases.js';
import { createApp, sanitizeLive } from '../server.mjs';

test('Banco de preguntas: estructura válida, ids únicos y temas conocidos', () => {
  assert.ok(QUESTIONS.length >= 35);
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, QUESTIONS.length);
  for (const q of QUESTIONS) {
    assert.ok(q.options.length >= 2 && q.correct >= 0 && q.correct < q.options.length, q.id);
    assert.ok(q.explanation.length > 20, q.id);
    for (const t of q.tags) assert.ok(TOPICS[t], `${q.id}: ${t}`);
  }
  const a = pickQuestions({ tags: ['contraste'], n: 5, seed: 7 }), b = pickQuestions({ tags: ['contraste'], n: 5, seed: 7 });
  assert.deepEqual(a.map((q) => q.id), b.map((q) => q.id));
  assert.ok(a.every((q) => q.tags.includes('contraste')));
  assert.ok(tagsForCase(CASES.find((c) => c.key === 'angio-tep')).includes('contraste'));
});

test('ECOE: el enlace conserva la configuración y el certificado detecta cambios', async () => {
  const cfg = { title: 'ECOE — Grupo Ñ', stations: [{ key: 'craneo-hic', minutes: 12 }, { key: 'rand-pulmon', minutes: 99 }], quiz: { n: 5, tags: ['dosis'] }, pass: 60, minStation: 40 };
  const back = configFromParam(new URL(configToUrl(cfg), 'http://x/').searchParams.get('ecoe'));
  assert.equal(back.title, 'ECOE — Grupo Ñ');
  assert.equal(back.stations[1].minutes, 60); // recortado al máximo
  assert.equal(back.quiz.n, 5);
  assert.throws(() => configFromParam(b64e({ stations: [] })));

  const results = [{ key: 'a', title: 'A', percent: 80, minutes: 10 }, { key: 'b', title: 'B', percent: 30, minutes: 12 }];
  const s = summarize(back, results);
  assert.equal(s.overall, 55);
  assert.equal(s.passed, false);
  assert.deepEqual(s.weak, ['B']);

  const payload = { v: 1, title: back.title, student: 'José Pérez', date: '2026-11-10T10:00:00Z', results, overall: 55, passed: false, pass: 60, minStation: 40 };
  const code = await certificateCode(payload);
  assert.equal((await verifyCertificate(code)).valid, true);
  const [data, h] = code.split('.');
  const tampered = b64e({ ...b64d(data), overall: 95, passed: true });
  assert.equal((await verifyCertificate(`${tampered}.${h}`)).valid, false);
  assert.equal((await verifyCertificate('basura')).valid, false);
});

test('Turno: reproducible, prioridades y puntuación', () => {
  const a = generateShift(42, 6), b = generateShift(42, 6);
  assert.deepEqual(a, b);
  assert.equal(a.patients.length, 6);
  assert.equal(a.patients.filter((p) => p.arrival === 0).length, 2);
  for (const p of a.patients) assert.equal(p.priority, PRIORITY[p.key]);

  const shift = { patients: [
    { id: 'P1', key: 'torax-nodulo', priority: 3, arrival: 0, done: false },
    { id: 'P2', key: 'ictus-acm', priority: 1, arrival: 0, done: false },
    { id: 'P3', key: 'urolitiasis', priority: 2, arrival: 30, done: false },
  ] };
  assert.equal(triageScore(shift, 'P2', 0).score, 100);
  assert.equal(triageScore(shift, 'P1', 0).score, 0);           // programada antes que un código ictus
  assert.match(triageScore(shift, 'P1', 0).note, /P2/);
  assert.equal(triageScore(shift, 'P3', 0).score, 0);           // todavía no ha llegado
  shift.patients[0].done = shift.patients[1].done = true;
  assert.equal(nextClock(shift, 10), 30);                       // salta a la siguiente llegada
  assert.equal(waitScore(1, 10), 100);
  assert.equal(waitScore(1, 30), 0);
  assert.equal(shiftSummary([{ priority: 1, percent: 80, triage: 100, wait: 5 }]).total, 88);
});

test('STOW-RS: cuerpo multipart/related con una parte por objeto', () => {
  const objs = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])];
  const { body, contentType } = multipartRelated(objs, 'BOUND');
  assert.equal(contentType, 'multipart/related; type="application/dicom"; boundary=BOUND');
  const text = Buffer.from(body).toString('latin1');
  assert.equal(text.split('--BOUND\r\n').length - 1, 2);
  assert.ok(text.endsWith('--BOUND--\r\n'));
  assert.ok(text.includes('Content-Length: 3\r\n\r\n\x01\x02\x03\r\n'));
});

async function withServers(fn) {
  // PACS falso que imita la respuesta DICOM JSON de Orthanc
  const seen = [];
  const pacs = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    seen.push({ url: req.url, type: req.headers['content-type'], auth: req.headers.authorization, size: Buffer.concat(chunks).length });
    res.writeHead(200, { 'Content-Type': 'application/dicom+json' });
    res.end(JSON.stringify({ '00081199': { vr: 'SQ', Value: [{}, {}] } }));
  });
  await new Promise((r) => pacs.listen(0, r));
  const dataDir = await mkdtemp(join(tmpdir(), 'opentc-c-'));
  const app = createApp({ dataDir, pacsUrl: `http://127.0.0.1:${pacs.address().port}/dicom-web/`, pacsAuth: 'orthanc:orthanc' });
  await new Promise((r) => app.listen(0, r));
  const base = `http://127.0.0.1:${app.address().port}`;
  try { await fn({ base, seen }); } finally { app.close(); pacs.close(); await rm(dataDir, { recursive: true, force: true }); }
}

test('Servidor: progreso en vivo (sin PIN para enviar, con PIN para leer)', async () => {
  await withServers(async ({ base }) => {
    const json = (r) => r.json();
    const { code } = await fetch(`${base}/api/classes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'G', pin: '9999' }) }).then(json);
    const post = (b) => fetch(`${base}/api/classes/${code}/live`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    assert.equal((await post({ session: 'x' })).status, 400); // sesión no válida
    assert.equal((await post({ session: 'sess-123456', student: 'Ana', case: 'TEP', step: 'contraste', stepIndex: 5, dlp: 320, secret: 'no' })).status, 202);
    assert.equal((await post({ session: 'sess-123456', student: 'Ana', case: 'TEP', step: 'finalizar', stepIndex: 8, percent: 91 })).status, 202);
    assert.equal((await fetch(`${base}/api/classes/${code}/live`, { headers: { 'X-Teacher-Pin': 'mal' } })).status, 401);
    const data = await fetch(`${base}/api/classes/${code}/live`, { headers: { 'X-Teacher-Pin': '9999' } }).then(json);
    assert.equal(data.students.length, 1);
    assert.equal(data.students[0].percent, 91);
    assert.equal(data.students[0].secret, undefined);
    assert.equal(sanitizeLive({ session: 'abcdef', percent: 400 }).percent, 100);
  });
});

test('Servidor: proxy STOW-RS hacia el PACS', async () => {
  await withServers(async ({ base, seen }) => {
    const st = await fetch(`${base}/api/pacs/status`).then((r) => r.json());
    assert.deepEqual(st, { configured: true, target: st.target });
    assert.match(st.target, /^127\.0\.0\.1:\d+$/);
    assert.equal((await fetch(`${base}/api/pacs/stow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 415);
    const { body, contentType } = multipartRelated([new Uint8Array(200), new Uint8Array(300)]);
    const r = await fetch(`${base}/api/pacs/stow`, { method: 'POST', headers: { 'Content-Type': contentType }, body });
    const j = await r.json();
    assert.equal(r.status, 200);
    assert.equal(j.stored, 2);
    assert.equal(seen[0].url, '/dicom-web/studies');
    assert.equal(seen[0].type, contentType);
    assert.equal(seen[0].auth, 'Basic ' + Buffer.from('orthanc:orthanc').toString('base64'));
    assert.equal(seen[0].size, body.length);
  });
  // Sin PACS configurado
  const dataDir = await mkdtemp(join(tmpdir(), 'opentc-c-'));
  const app = createApp({ dataDir, pacsUrl: '' });
  await new Promise((r) => app.listen(0, r));
  const base = `http://127.0.0.1:${app.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/pacs/status`).then((r) => r.json())).configured, false);
    assert.equal((await fetch(`${base}/api/pacs/stow`, { method: 'POST', headers: { 'Content-Type': 'multipart/related; type="application/dicom"; boundary=a' }, body: '--a--' })).status, 503);
  } finally { app.close(); await rm(dataDir, { recursive: true, force: true }); }
});
