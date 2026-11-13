// Página de cuestionario: preguntas.html?tags=contraste,dosis&n=8&student=EST-01
import { QUESTIONS, TOPICS, pickQuestions } from './questions.js';
import { xapi } from './xapi.js';
import { initI18n } from './i18n.js';
initI18n();

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let current = [], answered = {};

$('topics').innerHTML = Object.entries(TOPICS).map(([k, v]) =>
  `<label><input type="checkbox" value="${k}" ${params.get('tags')?.split(',').includes(k) ? 'checked' : ''}> ${v} <span class="small">(${QUESTIONS.filter((q) => q.tags.includes(k)).length})</span></label>`).join('');
if (params.get('n')) $('n').value = params.get('n');
if (params.get('student')) $('student').value = params.get('student');

function start(list) {
  current = list; answered = {};
  $('result').hidden = true;
  $('questions').hidden = false;
  $('questions').innerHTML = list.map((q, i) => `
    <article class="qcard" data-id="${q.id}">
      <div>${q.tags.map((t) => `<span class="tagchip">${esc(TOPICS[t] || t)}</span>`).join('')}</div>
      <h3>${i + 1}. ${esc(q.q)}</h3>
      <div class="opts" role="radiogroup">${q.options.map((o, j) => `<label><input type="radio" name="${q.id}" value="${j}"> <span>${esc(o)}</span></label>`).join('')}</div>
      <div class="exp" hidden></div>
    </article>`).join('');
  $('questions').querySelectorAll('.qcard').forEach((card) => {
    const q = QUESTIONS.find((x) => x.id === card.dataset.id);
    card.querySelectorAll('input').forEach((inp) => inp.onchange = () => {
      if (q.id in answered) return;
      const v = +inp.value, ok = v === q.correct;
      answered[q.id] = ok;
      card.querySelectorAll('label').forEach((l, j) => { l.querySelector('input').disabled = true; if (j === q.correct) l.classList.add('right'); else if (j === v) l.classList.add('wrong'); });
      const exp = card.querySelector('.exp'); exp.hidden = false; exp.textContent = (ok ? '✓ Correcto. ' : '✗ Incorrecto. ') + q.explanation;
      xapi.record($('student').value.trim(), 'answered', { id: `question/${q.id}`, name: q.q, type: 'http://adlnet.gov/expapi/activities/cmi.interaction' },
        { result: { success: ok, response: String(v) } });
      if (Object.keys(answered).length === current.length) finish();
    });
  });
  $('questions').scrollIntoView({ behavior: 'smooth' });
}

function finish() {
  const ok = Object.values(answered).filter(Boolean).length, pct = Math.round(100 * ok / current.length);
  $('result').hidden = false;
  $('score').textContent = `${ok}/${current.length} · ${pct} %`;
  const by = {};
  for (const q of current) for (const t of q.tags) { by[t] ??= [0, 0]; by[t][1]++; if (answered[q.id]) by[t][0]++; }
  $('byTopic').textContent = Object.entries(by).map(([t, [a, b]]) => `${TOPICS[t] || t}: ${a}/${b}`).join(' · ');
  xapi.record($('student').value.trim(), pct >= 70 ? 'passed' : 'failed', { id: 'quiz', name: 'Cuestionario de TC', type: 'http://adlnet.gov/expapi/activities/assessment' },
    { result: { score: { scaled: pct / 100, raw: ok, min: 0, max: current.length }, success: pct >= 70, completion: true } });
  $('result').scrollIntoView({ behavior: 'smooth' });
}

const tags = () => [...$('topics').querySelectorAll('input:checked')].map((i) => i.value);
$('btnStart').onclick = () => start(pickQuestions({ tags: tags(), n: Math.max(3, Math.min(60, +$('n').value || 10)) }));
$('btnRetry').onclick = $('btnStart').onclick;
$('btnWrong').onclick = () => { const w = current.filter((q) => !answered[q.id]); if (w.length) start(w); };
if (params.get('auto') === '1' || params.get('tags')) $('btnStart').click();
