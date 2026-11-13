# OpenTC Sim

Simulador educativo de tomografía computarizada (TC), libre y gratuito. Funciona en el navegador, sin instalación, sin registro y sin licencias. Es el complemento de [OpenRM Sim](../openrm-sim) para TC.

Las imágenes no se guardan precalculadas: se **simulan con física de TC**. El simulador proyecta un fantasma anatómico matemático, añade ruido cuántico y reconstruye cada corte por retroproyección filtrada. Por eso cada decisión del técnico (kV, mAs, pitch, filtro, centrado, brazos, apnea, sincronización del contraste) cambia la imagen.

## Flujo del examen

1. **Paciente**
   - Orden médica e identificación con dos identificadores (nombre y fecha de nacimiento) frente al brazalete.
   - Historia clínica: creatinina, FG, alergias, metformina y embarazo.
   - Decisión sobre el contraste, consentimiento y calibre del catéter (22G/20G/18G, con el caudal máximo de cada uno).
   - Retiro de objetos metálicos y ubicación del acompañante (dentro, con delantal plomado o fuera).
2. **Sala 3D** (Three.js, con realidad virtual WebXR)
   - Orientación del paciente, brazos, soporte de cabeza y cinta de sujeción.
   - Altura de la mesa con el láser coronal en la línea medioaxilar.
   - Cero marcado en un punto de referencia (nasion, escotadura esternal, xifoides…) y traslado al isocentro.
3. **Topograma** AP o lateral (con magnificación si la mesa está mal centrada). Planificación del rango arrastrando las líneas sobre el topograma.
4. **Protocolo**
   - Parámetros: kV, mAs efectivo, modulación de corriente (ATCM, calculada a partir del diámetro equivalente en agua del topograma), rotación, pitch, colimación, grosor, filtro, DFOV/SFOV y reducción de metal.
   - Indicadores en vivo: CTDIvol, DLP, dosis efectiva, SSDE, tiempo de adquisición, corriente del tubo (con su límite) y ruido esperado.
   - Series por fases: simple, arterial, portal y tardía, con retardo fijo o con seguimiento del bolo.
5. **Inyector**: volumen, caudal, concentración y bolo de suero. Muestra la curva de realce prevista para la aorta, la arteria pulmonar, la porta, el hígado y la lesión.
6. **Adquisición**
   - Seguimiento del bolo: el estudiante coloca la ROI en la imagen de referencia y el disparo se produce al superar el umbral.
   - Las series se reconstruyen en paralelo en Web Workers.
7. **Visor**: axial, coronal y sagital (MPR), presets de ventana, ventana/nivel con el ratón, ROI con media y DE en HU, y zoom.
8. **Finalizar**: lectura de las imágenes, envío al PACS, indicaciones tras el contraste e informe con rúbrica.

## Herramientas de aprendizaje

- **Tutorial guiado** (botón «Tutorial»): un TC de cráneo en 29 pasos. Resalta cada zona y espera a que el estudiante haga la acción real.
- **Reconstrucción desde los datos brutos** (en el visor): otro filtro, otro grosor, otro DFOV, reconstrucción iterativa (0–100 %) o MAR **sin volver a irradiar**. El ruido de la adquisición se conserva.
- **Reconstrucción iterativa**: difusión anisotrópica que conserva los bordes, mezclada con la FBP como en ASIR/ADMIRE. A porcentajes altos la textura se vuelve «plástica».
- **Casos de artefactos** (6): movimiento, metal, brazos en el campo, truncamiento, escalera en MPR y ruido en un paciente obeso. El paciente ya está escaneado; el estudiante identifica el artefacto, corrige la causa y repite o reconstruye. Se puntúa identificación (40), corrección (40), dosis (10) y tiempo (10).
- **Visor**: MIP de 10, 20 o 40 mm en axial, coronal y sagital, y medición de distancias.
- **Exportación DICOM** (ZIP): CT Image Storage con HU, geometría LPS y UID propios, para abrir las series en Horos, 3D Slicer o el PACS de prácticas. El nombre del paciente lleva el prefijo `SIMULADO`.

## Fase 2: rendimiento y realismo

- **Reconstrucción con WebGPU** (`js/gpu.js`, `js/gpuworker.js`): la proyección (muestreo bilineal por hardware en texturas `rg32float`), el filtrado (memoria compartida) y la retroproyección se hacen en la GPU. Dos workers de GPU con 4 cortes en vuelo cada uno, y los hilos de CPU ayudan cuando la GPU tiene cola. En una GPU AMD RDNA 3, 7,7 ms por corte frente a 55 ms en CPU, con la misma imagen (diferencia media 0,02 HU). Si no hay WebGPU se usa la CPU automáticamente.
- **Anatomía**: calota con tabla externa, díploe y tabla interna; surcos corticales y cisura interhemisférica; árbol bronquial con paredes; ventrículos derecho e izquierdo, aurículas y arterias coronarias (DA, Cx, CD).
- **Inclinación del gantry** (0 a −25°): el plano de corte se inclina de verdad (la rasterización usa z(y) = z + y·tan θ). En el topograma lateral el rango se dibuja oblicuo.
- **Dosis a órganos superficiales** (cristalino, tiroides, mamas), dentro o fuera del haz, y **protectores de bismuto**. Los protectores reducen la dosis del órgano un 35 %, pero producen rayas y ruido en la parte anterior; por eso hoy se prefiere la modulación por órgano. En cráneo, dejar los cristalinos en el haz resta puntos.
- **TC cardíaca con ECG**: el corazón se mueve según la fase del ciclo, y la diástasis se acorta al subir la frecuencia. Hay sincronización prospectiva (step and shoot) o retrospectiva (pitch 0,2, mucha más dosis), elección de fase y betabloqueador. Con la retrospectiva se puede reconstruir otra fase desde los datos brutos; con la prospectiva solo ±5 %. Nuevo caso: **angio-TC coronaria** con placa mixta y estenosis en la DA proximal, y nuevo criterio de rúbrica «Sincronización con el ECG».

## Fase 3: técnicas avanzadas y poblaciones especiales

- **Vasos cerebrales**: carótidas internas, polígono de Willis (ACM, ACA, ACP, comunicante anterior), basilar, vertebrales y senos venosos.
- **Perfusión cerebral** (`js/perfusion.js`):
  - El tejido realza según el modelo de dilución del indicador: CBV · (AIF ⊛ e^(−t/MTT)) con retraso.
  - La adquisición es un cine axial de 8 niveles de 5 mm × 30 tiempos (cada 1,5 s) a 80 kV.
  - Los mapas de CBF, CBV, MTT y Tmax se calculan por el método de los momentos y se ven en color.
  - La AIF se toma de los píxeles arteriales más precoces y se corrige el volumen parcial con la salida venosa (seno sagital).
  - Se informan los volúmenes de núcleo (CBF < 30 %, CBV bajo y Tmax > 6 s), de hipoperfusión (Tmax > 6 s) y la razón de mismatch.
  - Los valores absolutos de CBF salen algo altos; el patrón relativo (sano, penumbra, núcleo) es el que se usa para decidir.
- **Varias inyecciones** en un mismo examen (la perfusión lleva un segundo bolo) y **parámetros propios de cada serie** (kV, grosor, campo, rango extendido hasta el cayado aórtico).
- **Doble energía 80/140 kV** (`js/dualenergy.js`): descomposición agua/yodo por píxel. Genera imágenes monoenergéticas de 40 a 140 keV, mapa de yodo (mg/mL) e imagen sin contraste virtual. Reduce el ruido como los equipos reales: el yodo se estima suavizado y las imágenes se construyen sobre la mezcla de menor ruido. El calcio aparece en el mapa de yodo (limitación de dos materiales).
- **Eventos del paciente** con criterio en la rúbrica: calor por el contraste, urticaria leve, náuseas, paciente ansioso y niño que llora. En modo práctica se explica la conducta correcta.
- **Casos nuevos**:
  - **Código ictus**: TC simple, angio de troncos supraaórticos y Willis, y perfusión; oclusión de la ACM derecha con mismatch.
  - **Cráneo pediátrico**: anatomía escalada a un niño de 5 años, protocolo pediátrico, madre con delantal plomado y hematoma epidural con fractura.
  - **Embarazada de 24 semanas** con útero y feto: el topograma y el rango deben quedarse en el tórax.
  - **Paciente obeso** de 138 kg: el DFOV debe incluir toda la piel, y con la dosis estándar el realce queda bajo (contraste según el peso).

## Fase 4: docentes, Moodle, idiomas y tableta

- **Editor de casos** (`editor.html`): el docente crea casos sin programar. Define el paciente ficticio, la orden, el protocolo esperado, el contraste, los objetos metálicos, las lesiones (tipo, posición y tamaño, con aviso si caen fuera del paciente), la pregunta y la explicación. Tiene vista previa de la imagen.
  - Los casos se guardan en el navegador y se exportan o importan en JSON.
  - Los estudiantes los importan desde el diálogo inicial («Importar casos del docente»).
  - Se evalúan con la misma rúbrica: lo esperado (cobertura, filtros, dosis de referencia, fases) se deduce del protocolo.
- **Enlaces directos**: `index.html?case=angio-tep&mode=evaluacion&student=Ana&class=ABC234&lang=en` abre el caso sin pasar por el diálogo inicial.
- **Moodle (SCORM 1.2 / 2004)**: `js/lms.js` detecta la plataforma, toma el nombre del estudiante y envía la nota (0–100) y el estado aprobado/no aprobado (≥ 60 %).
  - Para generar el paquete:
    ```bash
    node scripts/build-scorm.mjs
    node scripts/build-scorm.mjs --case angio-tep --mode evaluacion
    ```
  - Se crea `dist/opentc-scorm*.zip`. En Moodle: *Añadir una actividad → Paquete SCORM → subir el ZIP*. La calificación pasa sola al libro de notas.
- **Idiomas**: español, inglés y portugués (selector en la barra superior o `?lang=en|pt`). Se traducen la interfaz, la guía, la rúbrica, el panel docente y el editor. Los textos clínicos de cada caso se muestran en el idioma en que se escribieron.
- **Tableta**:
  - En horizontal, los pasos van arriba y la guía al lado; en vertical, todo en una columna sin desplazamiento horizontal.
  - Los controles son más grandes con el dedo.
  - En el visor, la herramienta «Cortes» permite pasar cortes arrastrando y se hace zoom pellizcando con dos dedos.
  - La sala 3D admite gestos táctiles.

## Calidad, validación y accesibilidad

- **Código modular**: `js/main.js` solo arranca la app; cada paso del examen vive en `js/app/`:
  - `base.js`: utilidades, motor y visor;
  - `core.js`: estado, navegación y guía;
  - `patient.js`, `roomstep.js`, `planning.js`, `acquisition.js`, `viewerstep.js`, `finish.js`: un módulo por paso;
  - `start.js`: artefactos, tutorial, diálogo inicial y enlaces directos.
- **Pruebas de extremo a extremo** (`e2e/`, Playwright): recorren el TC de cráneo completo, el artefacto de escalera, los idiomas, el editor de casos, la tableta vertical y la ausencia de errores en la consola.
  ```bash
  npm install
  npm run test:e2e
  ```
  Usan el Chrome instalado (`E2E_CHANNEL=msedge` para Edge). En GitHub Actions corren con el Chromium de Playwright antes de cada publicación.
- **Calibración con un tomógrafo real** (`calibracion.html`): el docente introduce la DE medida en el maniquí de agua y el CTDIw por kV de su equipo. El simulador ajusta el número de fotones para reproducir ese ruido y usa esas dosis. El perfil se exporta e importa en JSON para toda la sala.
- **Kit de validación** (`docs/validacion/`):
  1. protocolo de calibración con el maniquí;
  2. revisión experta de los casos con índice de validez de contenido (I-CVI);
  3. estudio piloto pre/post con la escala SUS. La encuesta está en `sus.html`, que calcula la puntuación y exporta un CSV.
- **Accesibilidad**:
  - el visor se maneja con el teclado (flechas, RePág/AvPág, + y −, 0);
  - foco visible, enlace «Saltar al contenido» y pasos con `aria-current`;
  - registros con `aria-live` y etiquetas en los controles;
  - paleta **viridis** para daltonismo en los mapas de color;
  - respeta «reducir movimiento».
- **Licencia y privacidad**: [LICENSE](LICENSE) (MIT, con aviso de que no es un dispositivo médico) y [PRIVACIDAD.md](PRIVACIDAD.md) (qué datos se guardan y dónde, y recomendaciones según la Ley 1581 de 2012).

## Fase B: visor avanzado, calcio, casos aleatorios y biopsia

- **MPR oblicua**: con la herramienta «Plano oblicuo», un clic en axial fija el centro y al arrastrar se gira el plano. La vista «Oblicua» muestra ese plano en todos los cortes.
- **MPR curva enderezada**: con la herramienta «Trayecto» se marcan puntos en los cortes axiales (se puede cambiar de corte entre clics). La vista «Curva» endereza el vaso a lo largo del trayecto (aorta, coronarias, uréter).
- **3D**: proyección de máxima intensidad (MIP) y renderizado de volumen por trazado de rayos, girando alrededor del paciente al arrastrar. La ventana y el nivel controlan la función de transferencia.
- **Puntuación de calcio de Agatston** (`js/calcium.js`): busca lesiones de ≥ 130 HU y ≥ 1 mm² en la región cardíaca, aplica el factor de densidad por lesión y corte, escala por grosor/3 mm y da la categoría de riesgo. Descarta lo que se continúa fuera del corazón (esternón, costillas) y avisa si la serie tiene contraste, otro grosor u otro kV. El protocolo coronario empieza con una serie de calcio sin contraste (3 mm, 120 kV).
- **Casos aleatorios** (`js/randomcase.js`) de hígado, pulmón, litiasis, hemorragia cerebral y TEP:
  - el paciente, el lado, el tamaño y la posición de la lesión cambian, y la lesión siempre cae dentro del órgano;
  - las opciones de respuesta se barajan;
  - en el TEP, uno de cada cinco casos no tiene trombo;
  - cada caso tiene un número (`rand-higado-53477`): el mismo enlace da siempre el mismo caso, útil para evaluar a un grupo con casos distintos pero comparables.
- **Biopsia pulmonar guiada por TC** (`js/biopsy.js`, `js/app/biopsystep.js`; «Procedimientos» en el diálogo inicial o `?case=proc-biopsia`):
  - se adquiere una serie de planificación de baja dosis;
  - el estudiante marca la entrada en la piel y el objetivo en el nódulo, y el simulador analiza la trayectoria: longitud, ángulo, estructuras prohibidas (costillas, escápula, mediastino, grandes vasos), vasos y bronquios, punciones pleurales y pulmón aireado atravesado;
  - la aguja (metal, con sus rayas) avanza por pasos con una pequeña desviación aleatoria: hay que hacer cortes de control y corregir la dirección;
  - tras tomar la muestra, el riesgo de neumotórax depende del pulmón atravesado, las punciones y los pases, y el control final puede mostrar un neumotórax (aire con la línea de la pleura visceral) que el estudiante debe detectar;
  - rúbrica de 100 puntos: precisión, seguridad de la trayectoria, pleura, detección de complicaciones, dosis de los controles y tiempo.

## Fase C: servicio real, evaluación y analítica

- **Instrucciones por voz** (`js/voice.js`): «inspire y no respire», «no se mueva», «la mesa se va a mover», el aviso del contraste… con las voces del sistema en español, inglés o portugués. Se activa en **Ajustes**.
- **Banco de preguntas** (`js/questions.js`, `preguntas.html`): 40 preguntas de física, dosimetría, protección radiológica, contraste, protocolos, artefactos y seguridad, cada una con su explicación. Se filtran por tema (`preguntas.html?tags=dosis,contraste&n=8`), se repasan las falladas, y el informe de cada caso enlaza 5 preguntas relacionadas.
- **ECOE por estaciones** (`ecoe.html`, `js/ecoe.js`, `js/app/ecoe.js`):
  - el docente elige las estaciones (casos clínicos, aleatorios, biopsia o artefactos), el tiempo de cada una, un cuestionario opcional y la nota mínima (media y por estación);
  - el enlace generado (`index.html?ecoe=…`) lleva toda la configuración y funciona sin servidor;
  - el estudiante ve un cronómetro; al agotarse el tiempo la estación cuenta 0;
  - al final se genera un certificado imprimible con un código de verificación (huella SHA-256), que se comprueba en `ecoe.html`. La huella detecta ediciones del código, pero no es una firma digital.
- **Modo turno** (`js/worklist.js`, `js/app/worklist.js`; «Empezar un turno» o `?turno=5`): una lista de trabajo del RIS con pacientes de prioridad inmediata, urgente o programada que llegan durante la jornada. El estudiante decide el orden. La nota combina la calidad de cada estudio (60 %), el orden de prioridad (25 %) y los tiempos de espera frente al objetivo (15 %). `?turno=5&semilla=123` repite el mismo turno.
- **Monitor en vivo** (`js/app/live.js`): si el estudiante entra con el código de clase, el panel docente muestra en una tabla «En vivo» el paso en que está, la dosis acumulada, los avisos (reacción al contraste, eventos) y la nota final. Se actualiza cada 5 s. Estos datos solo se guardan en memoria en el servidor (2 h).
- **Analítica xAPI** (`js/xapi.js`): declaraciones *launched*, *progressed*, *answered*, *passed/failed* y *completed* para cada caso, pregunta, ECOE y turno. Se envían a un LRS (Learning Locker, SCORM Cloud, Moodle con logstore xAPI…) configurado en **Ajustes**, o se exportan en JSON.
- **PACS real por DICOMweb**: con el servidor de OpenTC, la casilla «Enviar al PACS» del paso Finalizar manda todas las series por STOW-RS. Sin PACS configurado el envío es simulado. Para probarlo con Orthanc:

  ```bash
  docker run -p 8042:8042 -p 4242:4242 jodogne/orthanc-plugins
  ```

  ```bash
  OPENTC_PACS_URL=http://localhost:8042/dicom-web OPENTC_PACS_AUTH=orthanc:orthanc node server.mjs 8080
  ```

  En PowerShell: `$env:OPENTC_PACS_URL="http://localhost:8042/dicom-web"; $env:OPENTC_PACS_AUTH="orthanc:orthanc"; node server.mjs 8080`. Las imágenes aparecen en Orthanc Explorer (<http://localhost:8042>). Use solo un PACS de docencia: los pacientes son ficticios, pero cualquiera en la red del servidor puede enviar estudios.

## Identidad institucional, informe y manual

- Desarrollado por los **Laboratorios de Salud y Deporte Bogotá** de la **Facultad de Ciencias de la Salud y del Deporte**, Fundación Universitaria del Área Andina (Areandina).
- El logo (`img/areandina.png`) aparece en la barra superior de todas las páginas, en el diálogo de inicio, en el informe, en la impresión, en el manual y como icono de la aplicación.
- La paleta sigue los colores del logo: verde, magenta, naranja y gris. Está definida en `css/styles.css` (`--brand-*`).
- **Informe de evaluación** (`reportHtml` en `js/evaluation.js`). Incluye:
  - un anillo con la puntuación y el veredicto (Excelente, Aprobado, Aprobado con observaciones o No aprobado);
  - una frase de resumen;
  - «Lo que hizo bien» y «Qué mejorar, por prioridad», ordenado por los puntos perdidos;
  - barras de logro por criterio, las series y la dosis, y el aprendizaje clave del caso.
- **Impresión** (`js/brand.js`): «Imprimir / PDF» genera un documento A4 independiente de la aplicación. Lleva el encabezado institucional, los datos del estudiante, la rúbrica, las series, un espacio para observaciones del docente, las firmas y un pie con los créditos. Los certificados de ECOE y los resúmenes de turno también se imprimen con el encabezado.
- **Manual de uso** (`manual.html`, enlazado en la barra superior y en el pie de cada página). Es imprimible y explica cada paso del examen, el visor, los casos, cómo leer el informe, las herramientas de aprendizaje, la guía del docente, los ajustes, el teclado, la solución de problemas y un glosario.
## Fase D: física avanzada, atlas y traducción de los casos

- **Física avanzada** (opcional, en **Ajustes → Física de la simulación**; `js/spectral.js` y `measureAdvanced` en `js/ct.js`). Se ejecuta solo en la CPU y es unas 2 veces más lenta.
  - **Espectro policromático**: ley de Kramers, líneas K del wolframio y 7 mm de aluminio de filtración. Usa coeficientes de atenuación de agua, hueso cortical, yodo (con su borde K a 33 keV) y aluminio, tomados de NIST XCOM.
  - **Detector integrador de energía** y **linealización con agua**, como la calibración de un equipo real. El agua da 0 HU a cualquier kV, mientras que el yodo y el hueso cambian con el kV. Por ejemplo, el yodo a 10 mg/mL da ≈ 450 HU a 80 kV y ≈ 280 HU a 120 kV.
  - **Corrección del endurecimiento por hueso en dos pasadas**. Se puede desactivar para ver las bandas oscuras entre huesos.
  - **Haz en abanico**: 360° de fuente y detector en arco, reordenado (rebinning) a proyecciones paralelas.
  - **Dispersión**: núcleo ancho proporcional a I·p, a la colimación y a la presencia de rejilla antidifusora. Por defecto el equipo la corrige (queda ≈ 3 %). Los modos didácticos sin corrección muestran el *cupping*.
  - Las HU pueden diferir unos ±10 HU del modo estándar, como pasa entre tomógrafos reales.
- **Anillos**: cada canal del detector puede tener un error de ganancia, que se ve como círculos centrados en el isocentro (también en el modo estándar). El nuevo caso de artefacto «círculos concéntricos en el cráneo» se corrige con el botón **Calibración en aire del detector** (paso Adquisición) y repitiendo. Reconstruir no basta, porque el error está en los datos brutos.
- **SART iterativa** (`js/sart.js`; «Algoritmo» en el panel de reconstrucción desde datos brutos).
  - Es un OS-SART de 10 subconjuntos y 4 iteraciones. Parte de la FBP, trabaja con una rejilla del tamaño del muestreo del detector y regulariza respetando los bordes.
  - A dosis baja reduce el ruido a menos de la mitad que la FBP, con la misma nitidez de bordes.
  - Tarda unos 0,6 s por corte en la CPU.
- **Atlas anatómico** (`atlas.html`, `js/atlas.js`, `js/anatomy-names.js`).
  - Convierte el fantoma del simulador en un volumen de vóxeles de 2,5 × 2,5 × 4 mm, con cinco pacientes: hombre, mujer, obesidad, niño y embarazada.
  - Muestra cortes axial, coronal y sagital sincronizados, coloreados por sistema, con el nombre y las HU de cada estructura.
  - Incluye búsqueda y un modo de preguntas («¿qué estructura marca la cruz?»).
  - Los nombres están en español, inglés y portugués.
- **Casos traducidos** (`js/cases-i18n.js`): títulos, órdenes, antecedentes, alergias, preguntas, opciones, explicaciones y eventos del paciente de los 15 casos y de los 7 casos de artefactos, en inglés y portugués. El texto en español se toma del propio caso: si se corrige un caso, solo ese campo queda sin traducir hasta actualizarlo. Los casos aleatorios y los del docente siguen en el idioma en que se escribieron.

## Física simulada

- **Fantasma anatómico** de vértex a muslos (`js/phantom.js`). Incluye cerebro con sustancia gris y blanca, LCR y ventrículos; cráneo, peñascos y senos; cuello y tiroides; pulmones con trama vascular, corazón, aorta y arterias pulmonares; hígado, bazo, páncreas, riñones, vía urinaria, intestino y colon; columna con discos, costillas oblicuas, pelvis, fémures y brazos. El tejido adiposo cambia con el peso.
- **Reconstrucción** (`js/ct.js`):
  - Proyecciones paralelas (240 × 320) con perfil de corte y volumen parcial.
  - Filtro bowtie y ruido cuántico de Poisson más ruido electrónico.
  - Endurecimiento del haz por el calcio y el metal (rayas entre estructuras densas) y falta de fotones en el metal.
  - Movimiento rígido durante la rotación (respiración o cabeza), truncamiento fuera del SFOV y filtros de reconstrucción blando, estándar, cerebro, pulmón y hueso.
- **kV**: el yodo y el hueso realzan más a kV bajos; el tejido blando no cambia.
- **Contraste** (`js/contrast.js`):
  - Convolución del aporte de yodo con funciones de tránsito por compartimento, más una fase de recirculación.
  - Compartimentos: arteria pulmonar, aorta, porta, hígado, bazo, riñón (corticomedular y nefrográfico), fase excretora, vena cava superior con contraste casi puro y lavado de la lesión.
  - Efecto del bolo de suero, del peso, del gasto cardíaco y del FG.
- **Dosis**: nCTDIw por kV (maniquíes de 16 y 32 cm), sobrehaz de las colimaciones estrechas, sobrebarrido, coeficientes k de dosis efectiva y SSDE (AAPM 204/220).

## Casos (pacientes ficticios)

| Caso | Aprendizaje principal |
| --- | --- |
| Cráneo simple — hematoma | Convención radiológica (derecha a la izquierda de la imagen), fijación de un paciente agitado, brazos abajo |
| Angio-TC pulmonar — TEP | Seguimiento del bolo en el tronco pulmonar, flujo alto, suero, kV bajo, apnea corta |
| Hígado trifásico — hepatocarcinoma | Ventanas arterial tardía y portal; realce arterial con lavado |
| Urotomografía simple — litiasis | Protocolo de baja dosis, prueba de embarazo, cobertura de riñones a vejiga |
| Abdomen contrastado — contraindicación | FG 24, reacción previa grave y metformina: **no inyectar**, consultar (si se inyecta se simula una reacción adversa) |
| Tórax de baja dosis — nódulo | Cortes finos, filtro de pulmón, CTDIvol ≤ 3 mGy |
| Angio-TC de aorta — disección tipo B | Seguimiento del bolo en la aorta, cobertura de troncos supraaórticos a ilíacas, flap intimal y falsa luz con realce tardío |
| Cuello contrastado — absceso | Hombros bajos, fase venosa (~65 s), colección con pared que realza, prueba de embarazo |
| Tórax-abdomen-pelvis — trauma | Un solo rango de vértices a sínfisis, fase portal, laceración esplénica y hemoperitoneo, acompañante fuera |
| Pelvis — prótesis de cadera | Reducción de artefactos metálicos (MAR) y kV alto para ver una colección periprotésica |
| Angio-TC coronaria | Betabloqueador, sincronización con el ECG en diástole, cortes de 0,625 mm |
| Código ictus | Simple + angio de Willis + perfusión, segundo bolo, mismatch núcleo/penumbra |
| Cráneo pediátrico | Protocolo según tamaño, acompañante con delantal, hematoma epidural |
| Embarazada con sospecha de TEP | Justificación y limitar topograma y rango al tórax |
| Paciente obeso | DFOV que incluya la piel, kV/mAs y contraste según el peso |

**Modo práctica**: pistas en cada paso y curvas de realce visibles. **Modo evaluación**: sin pistas y con una rúbrica de 13 criterios. Los criterios son identificación, valoración del contraste, acceso venoso, metal, posicionamiento, centrado, cobertura, reconstrucción, dosis, sincronización, movimiento, hallazgo y despacho.

## Ejecutar en local

```bash
node server.mjs
```

Abra <http://localhost:5173>. No necesita `npm install`, porque Three.js r160 está incluido en `vendor/three/` (licencia MIT). Es una PWA y funciona sin conexión tras la primera visita.

## Panel del docente

Funciona igual que en OpenRM Sim. Con `node server.mjs 8080` en un equipo de la red, el docente crea una clase en `teacher.html` con un PIN y comparte el código de 6 letras. Los informes de los estudiantes llegan solos. Sin servidor (por ejemplo, en GitHub Pages), los estudiantes descargan el JSON y el docente lo arrastra al panel. Los datos se guardan en `data/` (o en la carpeta de `OPENTC_DATA`), que no se publica.

## Pruebas

```bash
npm test
```

Comprueban:

- HU y ruido del hígado y del cerebro, y la escala del ruido con los mAs y el filtro.
- Realce del yodo según el kV, rayas del metal y reducción de metal (MAR).
- Ruido con los brazos abajo, movimiento, topograma y magnificación.
- Dosis (CTDIvol, colimación, SSDE, ATCM) y curvas de realce (orden de llegada, lavado, fase excretora, suero).
- Posición de las lesiones, rúbrica y servidor de clase.

## Publicar gratis

Es un sitio estático. `node scripts/build-scorm.mjs --site` genera `dist/opentc-sitio.zip` con todo lo necesario.

- **Netlify Drop** (sin instalar nada): entrar en <https://app.netlify.com/drop>, descomprimir el ZIP y arrastrar la carpeta. Da una URL pública con HTTPS (necesaria para WebGPU y RV).
- **GitHub Pages**: crear un repositorio y subir la carpeta `opentc-sim` (en la web: *Add file → Upload files*).

Con GitHub Pages: `.github/workflows/pages.yml` ejecuta las pruebas y publica en GitHub Pages en cada cambio de `main`.

## Estructura

| Archivo | Contenido |
| --- | --- |
| `js/phantom.js` | Fantasma anatómico, materiales y rasterización |
| `js/ct.js` | Proyección, ruido, reconstrucción FBP, topograma, dosis y ATCM |
| `js/contrast.js` | Curvas de realce e inyector |
| `js/cases.js` | Casos clínicos, objetos metálicos y preguntas |
| `js/protocols.js` | Protocolos de partida y parámetros |
| `js/main.js` | Flujo del examen e interfaz |
| `js/viewer.js` | Visor axial/MPR, ventana/nivel y ROI |
| `js/room.js` | Sala 3D y RV |
| `js/evaluation.js` | Rúbrica, informe, historial y exportación |
| `js/pool.js`, `js/worker.js` | Reconstrucción en paralelo |
| `teacher.html`, `js/teacher.js`, `js/classStats.js` | Panel del docente |
| `server.mjs` | Servidor estático y API de clases |

No usa datos de pacientes reales ni contenido de terceros. No es apto para uso clínico.
