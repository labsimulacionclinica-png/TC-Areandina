// Integración con plataformas de aprendizaje (Moodle, Canvas, Blackboard…) mediante SCORM 1.2 o SCORM 2004.
// Si la app se abre dentro de un paquete SCORM, se busca la API del LMS en las ventanas padre:
// al terminar un caso se envían la nota (0–100) y el estado aprobado/no aprobado (≥ 60 %).

function findApi(win) {
  for (let n = 0; win && n < 12; n++) {
    try {
      if (win.API_1484_11) return { v: 2004, api: win.API_1484_11 };
      if (win.API) return { v: 12, api: win.API };
    } catch { return null; } // ventana de otro origen
    if (win.parent === win) break;
    win = win.parent;
  }
  try { if (window.opener) return findApi(window.opener); } catch { /* sin acceso */ }
  return null;
}

const found = findApi(window);
let initialized = false;

export const lms = {
  active: !!found,
  version: found?.v || null,
  init() {
    if (!found || initialized) return;
    const ok = found.v === 2004 ? found.api.Initialize('') : found.api.LMSInitialize('');
    initialized = ok === 'true' || ok === true;
    if (initialized) this.set(found.v === 2004 ? 'cmi.completion_status' : 'cmi.core.lesson_status', found.v === 2004 ? 'incomplete' : 'incomplete');
  },
  get(k) { try { return found.v === 2004 ? found.api.GetValue(k) : found.api.LMSGetValue(k); } catch { return ''; } },
  set(k, v) { try { return found.v === 2004 ? found.api.SetValue(k, String(v)) : found.api.LMSSetValue(k, String(v)); } catch { return false; } },
  studentName() {
    if (!found) return '';
    this.init();
    const raw = this.get(found.v === 2004 ? 'cmi.learner_name' : 'cmi.core.student_name') || '';
    // SCORM usa «Apellido, Nombre»
    return raw.includes(',') ? raw.split(',').reverse().map((s) => s.trim()).join(' ') : raw;
  },
  // report: el informe de evaluation.js
  report(r) {
    if (!found) return false;
    this.init();
    const pass = r.percent >= 60;
    if (found.v === 2004) {
      this.set('cmi.score.min', 0); this.set('cmi.score.max', 100); this.set('cmi.score.raw', r.percent); this.set('cmi.score.scaled', (r.percent / 100).toFixed(2));
      this.set('cmi.success_status', pass ? 'passed' : 'failed');
      this.set('cmi.completion_status', 'completed');
      found.api.Commit('');
    } else {
      this.set('cmi.core.score.min', 0); this.set('cmi.core.score.max', 100); this.set('cmi.core.score.raw', r.percent);
      this.set('cmi.core.lesson_status', pass ? 'passed' : 'failed');
      this.set('cmi.suspend_data', JSON.stringify({ caseKey: r.caseKey, percent: r.percent, date: r.date }).slice(0, 4000));
      found.api.LMSCommit('');
    }
    return true;
  },
  finish() {
    if (!found || !initialized) return;
    try { found.v === 2004 ? found.api.Terminate('') : found.api.LMSFinish(''); } catch { /* ya cerrado */ }
    initialized = false;
  },
};

if (found) {
  lms.init();
  window.addEventListener('pagehide', () => lms.finish());
}
