// Analítica de aprendizaje con xAPI (Experience API 1.0.3).
// Cada acción relevante del examen genera una declaración «actor – verbo – objeto». Si hay un LRS configurado
// (Learning Record Store: Learning Locker, SCORM Cloud, Moodle con logstore xAPI…), se envían en lotes;
// si no, se guardan en el navegador y se pueden exportar en JSON.
const KEY = 'opentc-xapi-config', QUEUE = 'opentc-xapi-queue', ACTIVITY = 'https://opentc-sim.local/xapi';

const VERBS = {
  launched: ['http://adlnet.gov/expapi/verbs/launched', 'inició'],
  progressed: ['http://adlnet.gov/expapi/verbs/progressed', 'avanzó'],
  answered: ['http://adlnet.gov/expapi/verbs/answered', 'respondió'],
  completed: ['http://adlnet.gov/expapi/verbs/completed', 'completó'],
  passed: ['http://adlnet.gov/expapi/verbs/passed', 'aprobó'],
  failed: ['http://adlnet.gov/expapi/verbs/failed', 'no aprobó'],
  interacted: ['http://adlnet.gov/expapi/verbs/interacted', 'interactuó'],
};

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

export const xapi = {
  config() { return load(KEY, { endpoint: '', key: '', secret: '', enabled: false }); },
  setConfig(c) { save(KEY, c); },
  queue() { return load(QUEUE, []); },
  clear() { save(QUEUE, []); },

  statement(student, verb, object, { result, context } = {}) {
    const [id, display] = VERBS[verb];
    return {
      id: crypto.randomUUID?.() || undefined,
      actor: { objectType: 'Agent', name: student || 'Anónimo', account: { homePage: location.origin, name: (student || 'anonimo').toLowerCase().replace(/\s+/g, '.') } },
      verb: { id, display: { 'es-ES': display } },
      object: { objectType: 'Activity', id: `${ACTIVITY}/${object.id}`, definition: { name: { 'es-ES': object.name }, type: object.type || 'http://adlnet.gov/expapi/activities/simulation' } },
      ...(result ? { result } : {}),
      context: { platform: 'OpenTC Sim', language: document.documentElement.lang || 'es', ...(context || {}) },
      timestamp: new Date().toISOString(),
    };
  },

  record(student, verb, object, extra) {
    const st = this.statement(student, verb, object, extra);
    const q = this.queue();
    q.push(st);
    save(QUEUE, q.slice(-2000));
    this.flushSoon();
    return st;
  },

  flushSoon() { clearTimeout(this._t); this._t = setTimeout(() => this.flush(), 3000); },

  async flush() {
    const c = this.config(), q = this.queue();
    if (!c.enabled || !c.endpoint || !q.length) return { sent: 0 };
    const url = c.endpoint.replace(/\/+$/, '') + '/statements';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Experience-API-Version': '1.0.3', ...(c.key ? { Authorization: 'Basic ' + btoa(`${c.key}:${c.secret}`) } : {}) },
      body: JSON.stringify(q),
    }).catch((e) => ({ ok: false, status: 0, statusText: e.message }));
    if (res.ok) { this.clear(); return { sent: q.length }; }
    return { sent: 0, error: `${res.status} ${res.statusText || ''}`.trim() };
  },

  export() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(this.queue(), null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `opentc-xapi-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
