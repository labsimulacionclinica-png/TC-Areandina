import test from 'node:test';
import assert from 'node:assert/strict';

test('SCORM 1.2: nombre del estudiante, nota y estado aprobado', async () => {
  const calls = [];
  const data = { 'cmi.core.student_name': 'Pérez, Ana María' };
  const API = {
    LMSInitialize: () => { calls.push('init'); return 'true'; },
    LMSGetValue: (k) => data[k] ?? '',
    LMSSetValue: (k, v) => { data[k] = v; return 'true'; },
    LMSCommit: () => { calls.push('commit'); return 'true'; },
    LMSFinish: () => { calls.push('finish'); return 'true'; },
  };
  const win = { API, addEventListener() {} };
  win.parent = win;
  globalThis.window = win;
  const { lms } = await import(`../js/lms.js?scorm12=${Date.now()}`);
  assert.equal(lms.active, true);
  assert.equal(lms.version, 12);
  assert.equal(lms.studentName(), 'Ana María Pérez');
  assert.equal(lms.report({ percent: 72, caseKey: 'angio-tep', date: '2026-11-05' }), true);
  assert.equal(data['cmi.core.score.raw'], '72');
  assert.equal(data['cmi.core.lesson_status'], 'passed');
  lms.report({ percent: 40, caseKey: 'angio-tep', date: '2026-11-05' });
  assert.equal(data['cmi.core.lesson_status'], 'failed');
  assert.ok(calls.includes('commit'));
  lms.finish();
  assert.ok(calls.includes('finish'));
});

test('SCORM 2004: nota escalada y estados de éxito y finalización', async () => {
  const data = {};
  const API_1484_11 = { Initialize: () => 'true', GetValue: (k) => data[k] ?? '', SetValue: (k, v) => { data[k] = v; return 'true'; }, Commit: () => 'true', Terminate: () => 'true' };
  const win = { API_1484_11, addEventListener() {} };
  win.parent = win;
  globalThis.window = win;
  const { lms } = await import(`../js/lms.js?scorm2004=${Date.now()}`);
  assert.equal(lms.version, 2004);
  lms.report({ percent: 85, caseKey: 'x', date: 'd' });
  assert.equal(data['cmi.score.scaled'], '0.85');
  assert.equal(data['cmi.success_status'], 'passed');
  assert.equal(data['cmi.completion_status'], 'completed');
});

test('Sin plataforma: la app funciona igual', async () => {
  const win = { addEventListener() {} };
  win.parent = win;
  globalThis.window = win;
  const { lms } = await import(`../js/lms.js?none=${Date.now()}`);
  assert.equal(lms.active, false);
  assert.equal(lms.report({ percent: 90 }), false);
  assert.equal(lms.studentName(), '');
});
