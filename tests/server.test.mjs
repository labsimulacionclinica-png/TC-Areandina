import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, sanitizeReport } from '../server.mjs';

const report = (over = {}) => ({
  student: 'Ana', case: 'Caso 1 · Ictus', caseKey: 'ictus', date: '2026-11-03T10:00:00.000Z', percent: 85, total: 93.5, max: 110, realMinutes: 7,
  items: [{ label: 'Hoja de seguridad', got: 20, max: 20, comment: 'ok' }], series: [], ...over,
});

async function withServer(fn) {
  const dataDir = await mkdtemp(join(tmpdir(), 'opentc-'));
  const server = createApp({ dataDir });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, opts = {}) => {
    const res = await fetch(base + path, opts);
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body };
  };
  const post = (path, data) => call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  try { await fn({ call, post, dataDir }); } finally { server.close(); await rm(dataDir, { recursive: true, force: true }); }
}

test('Crear clase, enviar resultados y leerlos con el PIN', async () => {
  await withServer(async ({ call, post, dataDir }) => {
    assert.equal((await post('/api/classes', { name: 'Grupo A', pin: '12' })).status, 400); // PIN corto
    const { status, body } = await post('/api/classes', { name: 'Grupo A', pin: '4321' });
    assert.equal(status, 201);
    assert.match(body.code, /^[A-Z2-9]{6}$/);
    const code = body.code;

    assert.equal((await call(`/api/classes/${code}`)).body.name, 'Grupo A');
    assert.equal((await call('/api/classes/ZZZZZZ')).status, 404);

    assert.equal((await post(`/api/classes/${code}/results`, report())).status, 201);
    assert.equal((await post(`/api/classes/${code}/results`, report({ student: 'Luis', percent: 40 }))).status, 201);
    assert.equal((await post(`/api/classes/${code}/results`, { hola: 1 })).status, 400);

    assert.equal((await call(`/api/classes/${code}/results`, { headers: { 'X-Teacher-Pin': '0000' } })).status, 401);
    const ok = await call(`/api/classes/${code}/results`, { headers: { 'X-Teacher-Pin': '4321' } });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.results.map((r) => r.student), ['Ana', 'Luis']);

    // El PIN se guarda como hash, nunca en claro
    const stored = await readFile(join(dataDir, 'classes.json'), 'utf8');
    assert.ok(!stored.includes('4321'));
  });
});

test('Bloqueo tras 10 PIN incorrectos', async () => {
  await withServer(async ({ call, post }) => {
    const { body: { code } } = await post('/api/classes', { name: 'B', pin: 'abcd' });
    for (let i = 0; i < 10; i++) await call(`/api/classes/${code}/results`, { headers: { 'X-Teacher-Pin': 'x' } });
    assert.equal((await call(`/api/classes/${code}/results`, { headers: { 'X-Teacher-Pin': 'abcd' } })).status, 429);
  });
});

test('No se sirven los datos ni archivos fuera del proyecto, y se rechazan cuerpos enormes', async () => {
  // Proyecto de prueba con la carpeta de datos dentro, como en una instalación real.
  const root = await mkdtemp(join(tmpdir(), 'opentc-root-'));
  await writeFile(join(root, 'index.html'), '<h1>ok</h1>');
  const server = createApp({ root, dataDir: join(root, 'data') });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, data) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  try {
    const { code } = await (await post('/api/classes', { name: 'C', pin: 'abcd' })).json();
    assert.equal((await fetch(`${base}/data/classes.json`)).status, 403);
    // La ruta se normaliza dentro del proyecto: nunca se sirve un archivo de fuera.
    assert.ok([403, 404].includes((await fetch(`${base}/%2e%2e%2f%2e%2e%2fwindows%2fwin.ini`)).status));
    assert.equal((await fetch(`${base}/index.html`)).status, 200);
    const big = report({ items: [{ label: 'x', got: 1, max: 1, comment: 'y'.repeat(70000) }] });
    assert.equal((await post(`/api/classes/${code}/results`, big)).status, 413);
  } finally {
    server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('sanitizeReport recorta campos y descarta los desconocidos', () => {
  const r = sanitizeReport(report({ student: 'x'.repeat(200), percent: 150, extra: '<script>' }));
  assert.equal(r.student.length, 60);
  assert.equal(r.percent, 100);
  assert.ok(!('extra' in r));
  assert.equal(sanitizeReport({ student: 'a' }), null);
});
