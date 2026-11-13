// Punto de entrada de OpenTC Sim. Cada paso del examen vive en su módulo de js/app/:
//   base.js        utilidades compartidas, motor de reconstrucción y visor
//   core.js        estado del examen, navegación entre pasos y guía
//   patient.js     1. orden, identificación, valoración y preparación
//   roomstep.js    2. sala 3D, posicionamiento, láseres, anatomía del paciente
//   planning.js    3–5. topograma, planificación, protocolo e inyector
//   acquisition.js 6. adquisición, seguimiento del bolo, perfusión, eventos
//   viewerstep.js  7. visor, reconstrucción desde datos brutos, doble energía, DICOM
//   finish.js      8. lectura, despacho e informe
//   start.js       casos de artefactos, tutorial, diálogo inicial y enlaces directos
import './cases-i18n.js';     // traducción del contenido clínico de los casos
import './app/base.js';
import './app/core.js';
import './app/patient.js';
import './app/roomstep.js';
import './app/planning.js';
import './app/acquisition.js';
import './app/viewerstep.js';
import './app/finish.js';
import { boot } from './app/start.js';
import './app/biopsystep.js';
import './app/settings.js';
import './app/ecoe.js';        // ECOE por estaciones con certificado
import './app/worklist.js';    // modo turno (lista de trabajo del RIS)
import './app/live.js';        // progreso en vivo para el panel docente

boot();
