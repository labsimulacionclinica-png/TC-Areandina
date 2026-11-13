// ECOE (evaluación clínica objetiva estructurada): configuración por enlace, cálculo del resultado
// y certificado con código de verificación. Sin dependencias del DOM (se prueba con node --test).

export const b64e = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const b64d = (s) => JSON.parse(decodeURIComponent(escape(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')))));

// { title, stations: [{ key, minutes }], quiz: { n, tags }, pass, minStation }
export function normalizeConfig(c) {
  if (!c || !Array.isArray(c.stations) || !c.stations.length) throw new Error('El ECOE no tiene estaciones');
  return {
    title: String(c.title || 'ECOE de tomografía').slice(0, 120),
    stations: c.stations.slice(0, 12).map((s) => ({ key: String(s.key), minutes: Math.max(2, Math.min(60, +s.minutes || 15)) })),
    quiz: c.quiz?.n > 0 ? { n: Math.min(40, Math.round(c.quiz.n)), tags: Array.isArray(c.quiz.tags) ? c.quiz.tags : [], minutes: Math.max(2, Math.min(60, +c.quiz.minutes || 10)) } : null,
    pass: Math.max(0, Math.min(100, +c.pass || 60)),
    minStation: Math.max(0, Math.min(100, +c.minStation || 0)),
  };
}

export const configToUrl = (cfg, base = 'index.html') => `${base}?ecoe=${b64e(normalizeConfig(cfg))}`;
export const configFromParam = (p) => normalizeConfig(b64d(p));

// results: [{ key, title, percent, minutes, timeout }]
export function summarize(cfg, results) {
  const n = results.length;
  const overall = n ? Math.round(results.reduce((a, r) => a + r.percent, 0) / n) : 0;
  const weak = results.filter((r) => r.percent < cfg.minStation);
  return { overall, passed: overall >= cfg.pass && !weak.length && n > 0, weak: weak.map((r) => r.title) };
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function digest(payload) {
  const data = new TextEncoder().encode(JSON.stringify(payload));
  return hex(await crypto.subtle.digest('SHA-256', data));
}

// El código lleva los datos y una huella SHA-256: detecta errores y ediciones del texto, pero NO es una firma digital
export async function certificateCode(payload) {
  return `${b64e(payload)}.${(await digest(payload)).slice(0, 20)}`;
}
export async function verifyCertificate(code) {
  try {
    const [data, h] = String(code).trim().split('.');
    const payload = b64d(data);
    return { valid: (await digest(payload)).slice(0, 20) === h, payload };
  } catch { return { valid: false, payload: null }; }
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function certificateHtml(p, code) {
  const short = code.split('.')[1]?.match(/.{1,5}/g).join('-').toUpperCase();
  return `<div class="cert">
    <div class="cert-head">OpenTC Sim · Certificado de ECOE</div>
    <h2>${esc(p.title)}</h2>
    <p>Se certifica que <b>${esc(p.student)}</b> completó la evaluación el ${new Date(p.date).toLocaleString('es', { dateStyle: 'long', timeStyle: 'short' })}
      con un resultado global de <b>${p.overall} %</b>: <b class="${p.passed ? 'ok' : 'err'}">${p.passed ? 'APROBADO' : 'NO APROBADO'}</b> (mínimo ${p.pass} %${p.minStation ? `, ${p.minStation} % por estación` : ''}).</p>
    <table class="tbl"><thead><tr><th>Estación</th><th>Resultado</th><th>Tiempo</th></tr></thead><tbody>
      ${p.results.map((r, i) => `<tr><td>${i + 1}. ${esc(r.title)}</td><td>${r.percent} %${r.timeout ? ' (tiempo agotado)' : ''}</td><td>${r.minutes} min</td></tr>`).join('')}
    </tbody></table>
    <p class="small">Código de verificación: <b>${short}</b>. Para comprobarlo, pegue el código completo en ecoe.html → «Verificar certificado».</p>
    <textarea class="cert-code" readonly rows="3">${esc(code)}</textarea>
    <p class="small">Simulador educativo: este certificado acredita un ejercicio de simulación, no una competencia profesional.</p>
  </div>`;
}
