// Service worker: permite usar la app sin conexión ("red primero": con conexión siempre sirve la versión más reciente).
const CACHE = 'opentc-v11';
const SHELL = [
  './', 'index.html', 'teacher.html', 'manifest.webmanifest', 'icon.svg',
  'css/styles.css', 'css/ct.css', 'css/teacher.css',
  'js/main.js', 'js/app/base.js', 'js/app/core.js', 'js/app/patient.js', 'js/app/roomstep.js', 'js/app/planning.js', 'js/app/acquisition.js', 'js/app/viewerstep.js', 'js/app/finish.js', 'js/app/start.js', 'js/calibration.js', 'js/calcium.js', 'js/randomcase.js', 'js/biopsy.js', 'js/app/biopsystep.js', 'calibracion.html', 'sus.html', 'js/phantom.js', 'js/ct.js', 'js/contrast.js', 'js/cases.js', 'js/protocols.js', 'js/pool.js', 'js/worker.js',
  'js/viewer.js', 'js/room.js', 'js/artifacts.js', 'js/dicom.js', 'js/tour.js', 'js/tourSteps.js', 'js/gpu.js', 'js/gpuworker.js', 'js/perfusion.js', 'js/dualenergy.js', 'js/i18n.js', 'js/lms.js', 'js/editor.js', 'editor.html', 'js/evaluation.js', 'js/classStats.js', 'js/teacher.js',
  'js/app/settings.js', 'js/app/ecoe.js', 'js/app/worklist.js', 'js/app/live.js', 'js/voice.js', 'js/xapi.js', 'js/questions.js', 'js/quiz.js', 'js/ecoe.js', 'js/worklist.js',
  'preguntas.html', 'ecoe.html', 'atlas.html', 'js/atlas.js', 'js/anatomy-names.js', 'js/cases-i18n.js', 'js/spectral.js', 'js/sart.js', 'js/brand.js', 'img/areandina.png', 'manual.html',
  'vendor/three/three.module.js', 'vendor/three/addons/controls/OrbitControls.js', 'vendor/three/addons/webxr/VRButton.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // La API de clases nunca se guarda en caché (contiene resultados de estudiantes).
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))),
  );
});
