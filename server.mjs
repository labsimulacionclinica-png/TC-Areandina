// Servidor de OpenTC Sim: archivos estáticos y API de clases para el panel del docente.
//   node server.mjs [puerto]          → http://localhost:5173
//   OPENTC_DATA=ruta node server.mjs  → carpeta de datos (por defecto ./data)
//   OPENTC_PACS_URL=http://orthanc:8042/dicom-web [OPENTC_PACS_AUTH=usuario:clave] → envío real al PACS (STOW-RS)
// Los resultados se guardan en archivos JSON en la carpeta de datos; no hace falta base de datos.
import { createServer } from 'node:http';
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual, randomInt } from 'node:crypto';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.md': 'text/plain', '.zip': 'application/zip' };
const MAX_BODY = 64 * 1024;
const MAX_STOW = 64 * 1024 * 1024;
const LIVE_TTL = 2 * 3600 * 1000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I

const clip = (v, n) => String(v ?? '').slice(0, n);
const num = (v) => (Number.isFinite(+v) ? +v : 0);

// Solo se guardan los campos conocidos del informe, recortados.
export function sanitizeReport(r) {
  if (!r || typeof r !== 'object' || !Array.isArray(r.items)) return null;
  return {
    student: clip(r.student, 60) || 'Sin nombre',
    case: clip(r.case, 120),
    caseKey: clip(r.caseKey, 40),
    date: clip(r.date, 40),
    realMinutes: num(r.realMinutes),
    total: num(r.total),
    max: num(r.max),
    percent: Math.max(0, Math.min(100, Math.round(num(r.percent)))),
    items: r.items.slice(0, 20).map((i) => ({ label: clip(i.label, 80), got: num(i.got), max: num(i.max), comment: clip(i.comment, 300) })),
    series: Array.isArray(r.series) ? r.series.slice(0, 30).map((s) => ({ name: clip(s.name, 80), kv: num(s.kv), mas: num(s.mas), pitch: num(s.pitch), thickness: num(s.thickness), ctdi: num(s.ctdi), dlp: num(s.dlp) })) : [],
    explanation: clip(r.explanation, 600),
  };
}

function hashPin(pin, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(String(pin), salt, 32).toString('hex') };
}

function pinMatches(pin, { salt, hash }) {
  const a = Buffer.from(hashPin(pin, salt).hash, 'hex'), b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

// Progreso en vivo: solo campos conocidos y recortados
export function sanitizeLive(b) {
  if (!b || typeof b !== 'object' || !/^[\w-]{6,40}$/.test(String(b.session || ''))) return null;
  return {
    session: String(b.session), student: clip(b.student, 60) || 'Sin nombre', case: clip(b.case, 120), step: clip(b.step, 30),
    stepIndex: Math.max(0, Math.min(20, Math.round(num(b.stepIndex)))), percent: b.percent == null ? null : Math.max(0, Math.min(100, Math.round(num(b.percent)))),
    dlp: num(b.dlp), alert: clip(b.alert, 140), mode: clip(b.mode, 20),
  };
}

export function createApp({ root = fileURLToPath(new URL('.', import.meta.url)), dataDir = process.env.OPENTC_DATA || join(root, 'data'),
  pacsUrl = process.env.OPENTC_PACS_URL || '', pacsAuth = process.env.OPENTC_PACS_AUTH || '' } = {}) {
  const classesFile = join(dataDir, 'classes.json');
  const resultsFile = (code) => join(dataDir, `results-${code}.jsonl`);
  let classes = null;
  // Intentos fallidos de PIN por clase: se bloquea un minuto tras 10 fallos.
  const failures = new Map();
  // Progreso en vivo de los estudiantes: solo en memoria (se pierde al reiniciar el servidor)
  const live = new Map();

  async function loadClasses() {
    if (classes) return classes;
    await mkdir(dataDir, { recursive: true });
    try { classes = JSON.parse(await readFile(classesFile, 'utf8')); } catch { classes = {}; }
    return classes;
  }

  async function readRaw(req, max) {
    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > max) throw Object.assign(new Error('Demasiado grande'), { status: 413 });
      chunks.push(c);
    }
    return Buffer.concat(chunks);
  }
  async function readBody(req) {
    const buf = await readRaw(req, MAX_BODY);
    try { return JSON.parse(buf.toString('utf8')); } catch { throw Object.assign(new Error('JSON no válido'), { status: 400 }); }
  }

  // Comprueba el PIN del docente; devuelve un error para responder o null si es correcto
  function pinError(req, code) {
    const f = failures.get(code);
    if (f && f.count >= 10 && Date.now() - f.last < 60000) return [429, 'Demasiados intentos. Espere un minuto.'];
    if (!pinMatches(req.headers['x-teacher-pin'] || '', cls()[code])) {
      failures.set(code, { count: (f?.count || 0) + 1, last: Date.now() });
      return [401, 'PIN incorrecto.'];
    }
    failures.delete(code);
    return null;
  }
  const cls = () => classes;

  async function pacs(req, res, path) {
    const target = pacsUrl.replace(/\/+$/, '');
    if (path === '/api/pacs/status') {
      let host = '';
      try { host = target ? new URL(target).host : ''; } catch { host = ''; }
      return send(res, 200, { configured: !!host, target: host });
    }
    if (path === '/api/pacs/stow' && req.method === 'POST') {
      if (!target) return send(res, 503, { error: 'El servidor no tiene PACS configurado (OPENTC_PACS_URL).' });
      const type = String(req.headers['content-type'] || '');
      if (!/^multipart\/related/i.test(type) || !/application\/dicom/i.test(type)) return send(res, 415, { error: 'Se espera multipart/related; type=\"application/dicom\"' });
      const body = await readRaw(req, MAX_STOW);
      let up;
      try {
        up = await fetch(target + '/studies', {
          method: 'POST', body,
          headers: { 'Content-Type': type, Accept: 'application/dicom+json', ...(pacsAuth ? { Authorization: 'Basic ' + Buffer.from(pacsAuth).toString('base64') } : {}) },
          signal: AbortSignal.timeout(60000),
        });
      } catch (e) { return send(res, 502, { error: `No se pudo conectar con el PACS: ${e.message}` }); }
      let detail = null;
      try { detail = await up.json(); } catch { detail = null; }
      const failed = Array.isArray(detail?.['00081198']?.Value) ? detail['00081198'].Value.length : 0;
      const stored = Array.isArray(detail?.['00081199']?.Value) ? detail['00081199'].Value.length : null;
      return send(res, up.ok ? 200 : 502, { ok: up.ok, status: up.status, stored, failed, error: up.ok ? undefined : `El PACS respondió ${up.status}` });
    }
    return send(res, 404, { error: 'No encontrado' });
  }

  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  async function api(req, res, url) {
    const cls = await loadClasses();
    const path = url.pathname;

    if (path === '/api/health') return send(res, 200, { ok: true });
    if (path.startsWith('/api/pacs/')) return pacs(req, res, path);

    // Crear una clase: { name, pin } → { code }
    if (path === '/api/classes' && req.method === 'POST') {
      const { name, pin } = await readBody(req);
      if (!clip(name, 80).trim() || String(pin ?? '').length < 4) return send(res, 400, { error: 'Indique un nombre y un PIN de al menos 4 caracteres.' });
      let code;
      do code = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join(''); while (cls[code]);
      cls[code] = { name: clip(name, 80).trim(), ...hashPin(pin), created: new Date().toISOString() };
      await writeFile(classesFile, JSON.stringify(cls, null, 2));
      return send(res, 201, { code, name: cls[code].name });
    }

    const m = path.match(/^\/api\/classes\/([A-Z0-9]{6})(\/results|\/live)?$/);
    if (!m) return send(res, 404, { error: 'No encontrado' });
    const code = m[1];
    if (!cls[code]) return send(res, 404, { error: 'No existe esa clase.' });

    // Comprobar que la clase existe (lo usa el estudiante antes de empezar)
    if (!m[2] && req.method === 'GET') return send(res, 200, { code, name: cls[code].name });

    // Progreso en vivo: el estudiante lo envía sin PIN; el docente lo lee con PIN
    if (m[2] === '/live' && req.method === 'POST') {
      const entry = sanitizeLive(await readBody(req));
      if (!entry) return send(res, 400, { error: 'Datos no válidos.' });
      if (!live.has(code)) live.set(code, new Map());
      const room = live.get(code);
      if (room.size >= 500 && !room.has(entry.session)) return send(res, 429, { error: 'Demasiadas sesiones en vivo.' });
      room.set(entry.session, { ...entry, updated: Date.now() });
      return send(res, 202, { ok: true });
    }
    if (m[2] === '/live' && req.method === 'GET') {
      const e = pinError(req, code);
      if (e) return send(res, e[0], { error: e[1] });
      const room = live.get(code) || new Map(), now = Date.now();
      for (const [k, v] of room) if (now - v.updated > LIVE_TTL) room.delete(k);
      return send(res, 200, { code, now, students: [...room.values()].sort((a, b) => b.updated - a.updated) });
    }

    // Enviar un resultado (estudiante, sin PIN)
    if (m[2] && req.method === 'POST') {
      const report = sanitizeReport(await readBody(req));
      if (!report) return send(res, 400, { error: 'Informe no válido.' });
      report.received = new Date().toISOString();
      await appendFile(resultsFile(code), JSON.stringify(report) + '\n');
      return send(res, 201, { ok: true });
    }

    // Leer resultados (docente, con PIN)
    if (m[2] && req.method === 'GET') {
      const e = pinError(req, code);
      if (e) return send(res, e[0], { error: e[1] });
      let lines = [];
      try { lines = (await readFile(resultsFile(code), 'utf8')).split('\n').filter(Boolean); } catch { /* sin resultados */ }
      return send(res, 200, { code, name: cls[code].name, results: lines.map((l) => JSON.parse(l)) });
    }
    return send(res, 405, { error: 'Método no permitido' });
  }

  async function serveStatic(req, res, url) {
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    const file = resolve(root, rel || 'index.html');
    // Nunca se sirven la carpeta de datos ni archivos fuera del proyecto.
    if (!file.startsWith(resolve(root)) || file.startsWith(resolve(dataDir))) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file.endsWith('\\') || file.endsWith('/') ? join(file, 'index.html') : file);
      res.writeHead(200, { 'Content-Type': (TYPES[extname(file)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404).end('No encontrado');
    }
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else await serveStatic(req, res, url);
    } catch (err) {
      send(res, err.status || 500, { error: err.status ? err.message : 'Error interno' });
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2]) || 5173;
  createApp().listen(port, () => console.log(`OpenTC Sim en http://localhost:${port}`));
}

