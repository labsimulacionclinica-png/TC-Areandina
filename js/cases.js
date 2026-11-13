// Casos clínicos simulados (pacientes ficticios). Cada caso define el paciente, la orden médica,
// la anatomía patológica, lo que se espera del técnico y la pregunta final sobre las imágenes.
import { lesion, ANATOMY_Z, ell } from './phantom.js';

const { M } = lesion;
const BRAIN = ell([0, 0, 101], [65, 84, 92], { zmax: 151 });

// Eventos del paciente durante el examen (when: 'start' | 'injection' | 'end')
const EVENTS = {
  calor: {
    when: 'injection', type: 'calor', title: 'Sensación de calor',
    text: 'Al iniciar la inyección la paciente dice que siente un calor intenso por todo el cuerpo y como si se fuera a orinar. Está consciente, respira bien y no tiene lesiones en la piel.',
    options: ['Detener el estudio y llamar al médico de urgencias', 'Tranquilizarla: es un efecto esperado y pasajero del contraste; continuar vigilándola', 'Retirar el catéter de inmediato'],
    correct: 1, explanation: 'El calor generalizado y la sensación de micción son efectos fisiológicos frecuentes del contraste yodado (vasodilatación), no una alergia. Se tranquiliza a la paciente, se sigue vigilando y se continúa.',
  },
  urticaria: {
    when: 'end', type: 'urticaria', title: 'Habones tras el contraste', danger: true,
    text: 'Al terminar, el paciente presenta habones en el tórax y picor. Respira bien, sin ronquera ni sibilancias; tensión arterial normal.',
    options: ['Darle el alta, es leve', 'Avisar al radiólogo, mantener la vía, vigilar signos vitales y registrar la reacción', 'Administrar adrenalina intramuscular de inmediato'],
    correct: 1, explanation: 'Es una reacción leve. Se avisa al radiólogo (puede indicar un antihistamínico), se mantiene la vía venosa, se vigila al menos 30 min por si progresa y se registra en la historia para futuros estudios. La adrenalina se reserva para reacciones moderadas-graves (broncoespasmo, edema laríngeo, hipotensión).',
  },
  nauseas: {
    when: 'injection', type: 'nauseas', title: 'Náuseas',
    text: 'Durante la inyección la paciente refiere náuseas intensas.',
    options: ['Pausar, tranquilizarla, ponerla de lado si vomita para evitar aspiración y continuar cuando ceda', 'Ignorarlo y seguir escaneando', 'Suspender el estudio y darle el alta'],
    correct: 0, explanation: 'Las náuseas son frecuentes y suelen ceder en segundos. El riesgo es la aspiración si vomita en decúbito: hay que estar atento, girarla de lado si hace falta y continuar cuando esté estable.',
  },
  ansiedad: {
    when: 'start', type: 'ansiedad', title: 'Paciente ansioso',
    text: 'El paciente está muy nervioso, respira rápido y se mueve en la camilla.',
    options: ['Explicarle el procedimiento, practicar la apnea con él y esperar a que se tranquilice antes de empezar', 'Empezar ya para terminar cuanto antes', 'Sujetarlo con cintas sin explicarle nada'],
    correct: 0, explanation: 'Un paciente ansioso se mueve y no mantiene la apnea: artefactos y frecuencia cardíaca alta. Explicar, ensayar la apnea y dar tiempo mejora la calidad y la experiencia.',
  },
  llanto: {
    when: 'start', type: 'ansiedad', title: 'Niño que llora',
    text: 'El niño llora, no se queda quieto y llama a su madre.',
    options: ['Que la madre (con delantal plomado) lo acompañe y lo tranquilice; usar soporte e inmovilizador pediátrico; sedación solo si el médico la indica', 'Escanear igual: el estudio es rápido', 'Pedir sedación sin valoración médica'],
    correct: 0, explanation: 'En niños se intenta primero sin sedación: acompañante protegido, explicación adaptada, inmovilizadores y una adquisición rápida. Si no colabora, la sedación la decide y vigila el médico.',
  },
};

export const METAL_ITEMS = {
  aretes: 'Aretes',
  collar: 'Collar / cadena',
  gafas: 'Gafas',
  protesisDental: 'Prótesis dental removible',
  horquillas: 'Horquillas del cabello',
  brasier: 'Brasier con aro metálico',
  cinturon: 'Cinturón con hebilla',
  monedas: 'Monedas / llaves en el bolsillo',
  piercing: 'Piercing umbilical',
  reloj: 'Reloj',
};

// Zona de cada objeto (z del paciente) para saber si cae dentro del rango explorado
export const METAL_Z = { aretes: [140, 175], collar: [240, 340], gafas: [130, 160], protesisDental: [190, 215], horquillas: [10, 120], brasier: [380, 520], cinturon: [780, 820], monedas: [880, 960], piercing: [740, 760], reloj: [780, 800] };

export const CASES = [
  {
    key: 'craneo-hic',
    title: 'TC de cráneo simple — déficit neurológico agudo',
    region: 'head',
    patient: { name: 'Jorge Iván Restrepo Mora', id: 'CC 71.234.556', dob: '1958-03-14', age: 67, sex: 'M', weight: 78, height: 172, creatinine: 1.0, egfr: 74, allergies: 'Ninguna conocida', metformin: false, pregnancy: null, breathHold: 0, cooperative: false, cardiacOutput: 1 },
    wristband: { name: 'Jorge Iván Restrepo Mora', dob: '1958-03-14' },
    order: 'TC de cráneo SIMPLE urgente. Hemiparesia izquierda y cefalea súbita de 1 h de evolución. Código ACV. Paciente agitado.',
    history: 'HTA mal controlada. Anticoagulado con warfarina. Escala de Glasgow 13/15.',
    items: ['aretes', 'protesisDental', 'gafas'],
    contrast: 'no',
    companion: true,
    expected: {
      coverage: ANATOMY_Z.head, armsDown: true, headFirst: true, headHolder: true, strap: true,
      kernels: ['brain', 'soft', 'standard'], maxThickness: 5, drl: 'head', protocolKey: 'head',
    },
    extras: [
      lesion.ell('edema-perihematoma', [-34, 2, 84], [19, 23, 17], { hu: 22 }),
      lesion.ell('hematoma', [-34, 2, 84], [14, 18, 13], { hu: 68 }),
    ],
    question: {
      text: '¿Cuál es el hallazgo principal?',
      options: ['Estudio sin alteraciones agudas', 'Hematoma intraparenquimatoso en el hemisferio DERECHO', 'Hematoma intraparenquimatoso en el hemisferio IZQUIERDO', 'Hematoma subdural bilateral'],
      correct: 1,
      explanation: 'Colección hiperdensa (~65 HU) con halo de edema en la región capsuloganglionar/temporoparietal derecha. Recuerde la convención radiológica: la derecha del paciente se ve a la izquierda de la imagen. La hemiparesia izquierda concuerda con una lesión derecha. En un paciente agitado se necesita fijar la cabeza (soporte y cinta) para evitar artefactos de movimiento.',
    },
  },
  {
    key: 'angio-tep', event: EVENTS.calor,
    title: 'Angio-TC de arterias pulmonares — sospecha de TEP',
    region: 'chest',
    patient: { name: 'Martha Lucía Cárdenas Ruiz', id: 'CC 43.876.120', dob: '1971-09-02', age: 54, sex: 'F', weight: 72, height: 160, creatinine: 0.8, egfr: 82, allergies: 'Penicilina', metformin: false, pregnancy: 'No aplica (posmenopáusica)', breathHold: 10, cooperative: true, cardiacOutput: 1 },
    wristband: { name: 'Martha Lucía Cárdenas Ruiz', dob: '1971-09-02' },
    order: 'Angio-TC de tórax (protocolo TEP). Disnea súbita, taquicardia, dímero D 2.400 ng/mL. Posoperatorio de reemplazo de rodilla.',
    history: 'Disnea: tolera apneas cortas (≈ 10 s).',
    items: ['collar', 'brasier', 'aretes'],
    contrast: 'si',
    companion: false,
    expected: {
      coverage: ANATOMY_Z.lungs, armsDown: false, headFirst: null, breathHold: true,
      kernels: ['standard', 'soft', 'lung'], maxThickness: 2.5, drl: 'ctpa', protocolKey: 'ctpa',
      timing: { comp: 'pa', minHU: 250, label: 'arteria pulmonar' }, maxFlow: 5, minFlow: 3.5,
    },
    extras: [
      lesion.ell('trombo', [-36, 8, 431], [11, 6, 7], { hu: 38 }),
      lesion.ell('trombo', [-58, -16, 462], [4.2, 4.2, 14], { hu: 38 }),
    ],
    question: {
      text: '¿Qué muestra el estudio?',
      options: ['Arterias pulmonares sin defectos de llenado', 'Defecto de llenado en la arteria pulmonar DERECHA y su rama lobar inferior (TEP)', 'Defecto de llenado en la arteria pulmonar IZQUIERDA', 'Disección de aorta'],
      correct: 1,
      explanation: 'Defectos de llenado hipodensos (~40 HU) dentro de la arteria pulmonar derecha y la arteria lobar inferior derecha, rodeados de contraste. Para verlos hace falta un realce > 250 HU en las arterias pulmonares: seguimiento del bolo en el tronco pulmonar, flujo alto (≥ 4 mL/s), bolo de suero y adquisición rápida (apnea corta).',
    },
  },
  {
    key: 'higado-trifasico', event: EVENTS.urticaria,
    title: 'TC de hígado trifásico — cirrosis con nódulo',
    region: 'abdomen',
    patient: { name: 'Luis Alberto Quintero Pérez', id: 'CC 19.455.873', dob: '1964-06-21', age: 61, sex: 'M', weight: 80, height: 170, creatinine: 1.1, egfr: 68, allergies: 'Ninguna conocida', metformin: false, pregnancy: null, breathHold: 20, cooperative: true, cardiacOutput: 1 },
    wristband: { name: 'Luis Alberto Quintero Pérez', dob: '1964-06-21' },
    order: 'TC de abdomen superior trifásico (hígado): simple, arterial tardía y portal. Cirrosis por VHC; nódulo de 3 cm en ecografía. AFP elevada.',
    history: 'Ayuno de 6 h. Sin antecedentes de reacción al contraste.',
    items: ['cinturon', 'monedas', 'reloj'],
    contrast: 'si',
    companion: false,
    expected: {
      coverage: ANATOMY_Z.liver, armsDown: false, breathHold: true,
      kernels: ['standard', 'soft'], maxThickness: 5, drl: 'abdomen', protocolKey: 'liver3',
      phases: { arterial: { comp: 'aorta', minHU: 220, liverMax: 40 }, portal: { comp: 'portal', minHU: 120, liverMin: 45 } },
      maxFlow: 5, minFlow: 3.5,
    },
    extras: [lesion.ell('hepatocarcinoma', [-92, 22, 632], [17, 16, 17], { hu: 48 }, { comp: 'hcc' })],
    question: {
      text: '¿Cómo se comporta el nódulo hepático?',
      options: ['Hipodenso en todas las fases (quiste)', 'Realce arterial intenso y lavado en fase portal (patrón de hepatocarcinoma)', 'Realce periférico nodular y progresivo (hemangioma)', 'No se identifica ninguna lesión'],
      correct: 1,
      explanation: 'El nódulo del lóbulo derecho capta mucho en la fase arterial tardía (cuando el hígado todavía capta poco) y se vuelve hipodenso respecto al parénquima en la fase portal: realce arterial con lavado, típico del hepatocarcinoma. Si la fase arterial se adquiere demasiado pronto o tarde, el contraste entre lesión e hígado se pierde.',
    },
  },
  {
    key: 'urolitiasis',
    title: 'Urotomografía simple de baja dosis — cólico renal',
    region: 'abdomen',
    patient: { name: 'Daniela Andrea Gómez Silva', id: 'CC 1.020.456.789', dob: '1987-11-30', age: 38, sex: 'F', weight: 64, height: 163, creatinine: 0.7, egfr: 105, allergies: 'Ninguna conocida', metformin: false, pregnancy: 'Prueba de embarazo en orina: NEGATIVA (hoy)', breathHold: 20, cooperative: true, cardiacOutput: 1 },
    wristband: { name: 'Daniela Andrea Gómez Silva', dob: '1987-11-30' },
    order: 'Urotomografía SIMPLE (protocolo de baja dosis). Dolor lumbar izquierdo irradiado a ingle, hematuria.',
    history: 'Primer episodio. Se descartó embarazo.',
    items: ['piercing', 'brasier', 'cinturon'],
    contrast: 'no',
    companion: false,
    expected: {
      coverage: [640, 945], armsDown: false, breathHold: true,
      kernels: ['standard', 'soft'], maxThickness: 5, drl: 'urolith', protocolKey: 'urolith',
    },
    extras: [
      lesion.ell('hidronefrosis', [60, -44, 696], [16, 13, 26], M.fluid),
      lesion.tube('ureter-dilatado', 710, 790, [58, -44], [52, -40], [6, 6], [6, 6], M.fluid),
      lesion.ell('calculo', [52, -40, 793], [3.2, 3.2, 3.5], { hu: 300, bone: 700 }),
    ],
    question: {
      text: '¿Cuál es el hallazgo?',
      options: ['Sin litiasis ni dilatación', 'Litiasis ureteral IZQUIERDA con dilatación de la vía excretora proximal', 'Litiasis ureteral DERECHA', 'Apendicitis aguda'],
      correct: 1,
      explanation: 'Cálculo hiperdenso (> 900 HU) en el uréter lumbar izquierdo con hidronefrosis y uréter dilatado por encima. Los cálculos se ven sin contraste: el protocolo debe ser simple y de baja dosis (CTDIvol ≤ 10 mGy) y cubrir desde los polos renales superiores hasta la base de la vejiga.',
    },
  },
  {
    key: 'contraindicacion',
    title: 'TC de abdomen y pelvis contrastado — control oncológico',
    region: 'abdomen',
    patient: { name: 'Hernando de Jesús Ospina Vélez', id: 'CC 8.345.002', dob: '1951-01-08', age: 74, sex: 'M', weight: 70, height: 168, creatinine: 2.6, egfr: 24, allergies: 'Contraste yodado: urticaria generalizada y broncoespasmo (2022)', metformin: true, pregnancy: null, breathHold: 15, cooperative: true, cardiacOutput: 0.9 },
    wristband: { name: 'Hernando de Jesús Ospina Vélez', dob: '1951-01-08' },
    order: 'TC de abdomen y pelvis CON contraste. Control de cáncer de colon operado.',
    history: 'Diabetes tipo 2 (metformina), enfermedad renal crónica estadio 4.',
    items: ['cinturon', 'monedas', 'reloj'],
    contrast: 'contraindicado',
    companion: false,
    expected: {
      coverage: ANATOMY_Z.abdomenPelvis, armsDown: false, breathHold: true,
      kernels: ['standard', 'soft'], maxThickness: 5, drl: 'abdomen', protocolKey: 'abdomen',
    },
    extras: [lesion.ell('metastasis', [-40, 30, 600], [11, 11, 11], { hu: 38 }, { comp: 'metastasis' })],
    question: {
      text: '¿Qué conducta es la correcta con el contraste?',
      options: ['Inyectar el contraste como dice la orden', 'No inyectar: reacción previa grave y FG < 30. Avisar al radiólogo, que decide si se hace simple, se cambia de técnica o se premedica', 'Inyectar la mitad de la dosis sin avisar', 'Inyectar y dar antihistamínico después'],
      correct: 1,
      explanation: 'El paciente tiene una reacción alérgica previa moderada-grave al contraste yodado y una función renal muy reducida (FG 24 mL/min/1,73 m²) además de metformina. El técnico no debe inyectar: debe suspender la administración y consultar al radiólogo, que valora el riesgo-beneficio (estudio simple, otra técnica o premedicación en un entorno preparado).',
    },
  },
  {
    key: 'torax-nodulo',
    title: 'TC de tórax de baja dosis — seguimiento de nódulo',
    region: 'chest',
    patient: { name: 'Gustavo Adolfo Pineda Rojas', id: 'CC 79.112.890', dob: '1965-04-17', age: 60, sex: 'M', weight: 85, height: 176, creatinine: 0.9, egfr: 90, allergies: 'Ninguna conocida', metformin: false, pregnancy: null, breathHold: 20, cooperative: true, cardiacOutput: 1 },
    wristband: { name: 'Gustavo Adolfo Pineda Rojas', dob: '1965-04-17' },
    order: 'TC de tórax SIMPLE de baja dosis. Fumador 40 paquetes-año. Control de nódulo pulmonar.',
    history: 'Asintomático.',
    items: ['collar', 'reloj', 'gafas'],
    contrast: 'no',
    companion: false,
    expected: {
      coverage: ANATOMY_Z.lungs, armsDown: false, breathHold: true,
      kernels: ['lung'], maxThickness: 1.25, drl: 'lowdose', protocolKey: 'lowdose',
    },
    extras: [lesion.ell('nodulo', [-62, 34, 398], [5, 5, 5], { hu: 35 })],
    question: {
      text: '¿Dónde está el nódulo?',
      options: ['No hay nódulos', 'Lóbulo superior DERECHO', 'Lóbulo superior IZQUIERDO', 'Lóbulo inferior izquierdo'],
      correct: 1,
      explanation: 'Nódulo sólido de ~10 mm en el lóbulo superior derecho (anterior). En el cribado y el seguimiento de nódulos se usan cortes finos (≤ 1,25 mm) con filtro de pulmón y una dosis muy baja (CTDIvol ≤ 3 mGy): el pulmón tiene un contraste natural muy alto y tolera el ruido.',
    },
  },
  {
    key: 'diseccion-aortica',
    title: 'Angio-TC de aorta — dolor torácico transfixiante',
    region: 'chest',
    patient: { name: 'Álvaro Enrique Salazar Mejía', id: 'CC 10.234.771', dob: '1959-08-11', age: 66, sex: 'M', weight: 84, height: 175, creatinine: 1.1, egfr: 70, allergies: 'Ninguna conocida', metformin: false, pregnancy: null, breathHold: 15, cooperative: true, cardiacOutput: 0.9 },
    wristband: { name: 'Álvaro Enrique Salazar Mejía', dob: '1959-08-11' },
    order: 'Angio-TC de aorta torácica y abdominal URGENTE. Dolor torácico súbito irradiado a la espalda. Diferencia de presión arterial entre brazos.',
    history: 'HTA de larga evolución. TA 190/110 mmHg. Troponina normal.',
    items: ['collar', 'reloj', 'monedas'],
    contrast: 'si',
    companion: true,
    positionTip: 'Angio de aorta: brazos sobre la cabeza, cero en la escotadura esternal, rango desde los troncos supraaórticos hasta las arterias ilíacas.',
    expected: {
      coverage: [320, 900], armsDown: false, breathHold: true,
      kernels: ['standard', 'soft'], maxThickness: 2.5, drl: 'aorta', protocolKey: 'angioaorta',
      timing: { comp: 'aorta', minHU: 250, label: 'aorta' }, maxFlow: 5, minFlow: 3.5,
    },
    extras: [
      // Disección tipo B: la falsa luz empieza tras la subclavia izquierda y llega a la aorta infrarrenal
      lesion.tube('falsa-luz', 402, 560, [30.6, -33.7], [19, -26], [7, 9], [7, 9], { hu: 40 }, { comp: 'falselumen' }),
      lesion.tube('flap-intimal', 402, 560, [24, -31.7], [12.5, -24], [1.4, 11], [1.4, 11], { hu: 55 }),
      lesion.tube('falsa-luz', 560, 760, [16, -19], [12.6, -7], [6, 8], [5, 7], { hu: 40 }, { comp: 'falselumen' }),
      lesion.tube('flap-intimal', 560, 760, [10.5, -18], [7.1, -6], [1.4, 10], [1.4, 8], { hu: 55 }),
    ],
    question: {
      text: '¿Cuál es el diagnóstico?',
      options: ['Aorta normal', 'Disección de la aorta DESCENDENTE (Stanford B) con flap intimal y doble luz', 'Disección de la aorta ascendente (Stanford A)', 'Tromboembolismo pulmonar'],
      correct: 1,
      explanation: 'Se ve una membrana lineal (flap intimal) dentro de la aorta descendente que separa una luz verdadera, que realza mucho en la fase arterial, de una falsa luz que realza más tarde y menos. La aorta ascendente y el cayado están respetados: disección tipo B de Stanford. Para valorarla hace falta una fase arterial bien sincronizada (aorta > 250 HU) que cubra desde los troncos supraaórticos hasta las ilíacas.',
    },
  },
  {
    key: 'cuello-absceso', event: EVENTS.nauseas,
    title: 'TC de cuello contrastado — sospecha de absceso',
    region: 'neck',
    patient: { name: 'Ana María Velásquez Torres', id: 'CC 1.037.552.140', dob: '1991-02-27', age: 34, sex: 'F', weight: 60, height: 158, creatinine: 0.6, egfr: 118, allergies: 'Ninguna conocida', metformin: false, pregnancy: 'β-hCG en sangre: NEGATIVA (ayer)', breathHold: 15, cooperative: true, cardiacOutput: 1 },
    wristband: { name: 'Ana María Velásquez Torres', dob: '1991-02-27' },
    order: 'TC de cuello CON contraste. Odinofagia, fiebre de 39 °C, trismo y masa cervical izquierda dolorosa.',
    history: 'Amigdalitis hace 10 días tratada con amoxicilina. Leucocitosis.',
    items: ['aretes', 'collar', 'piercing'],
    contrast: 'si',
    companion: false,
    positionTip: 'Cuello: brazos a los lados con los hombros descendidos (así no tapan la parte baja del cuello), cabeza en el soporte, cero en el mentón. Pida que no trague durante la adquisición.',
    expected: {
      coverage: [150, 390], armsDown: true, breathHold: true,
      kernels: ['soft', 'standard'], maxThickness: 3, drl: 'neck', protocolKey: 'neck',
      phases: { portal: { comp: 'jugular', minHU: 100, label: 'yugular' } }, maxFlow: 5, minFlow: 2,
    },
    extras: [
      lesion.ell('pared-absceso', [36, -22, 232], [12, 11, 16], { hu: 45 }, { comp: 'rim' }),
      lesion.ell('absceso', [36, -22, 232], [8.5, 7.5, 12], { hu: 18 }),
    ],
    question: {
      text: '¿Qué muestra el estudio?',
      options: ['Cuello normal', 'Colección cervical IZQUIERDA con realce periférico (absceso)', 'Colección cervical DERECHA', 'Adenopatías sin colección'],
      correct: 1,
      explanation: 'Colección hipodensa (~18 HU) con una pared que realza en el espacio cervical posterior izquierdo: absceso. La pared inflamada capta contraste y el centro líquido no. Se adquiere en fase venosa (~60–70 s), con los hombros bajos y pidiendo a la paciente que no trague.',
    },
  },
  {
    key: 'trauma-bazo',
    title: 'TC de tórax, abdomen y pelvis — politraumatismo',
    region: 'abdomen',
    patient: { name: 'Sebastián Camilo Arango Duque', id: 'CC 1.152.903.338', dob: '1997-05-03', age: 28, sex: 'M', weight: 74, height: 178, creatinine: 0.9, egfr: 112, allergies: 'Ninguna conocida', metformin: false, pregnancy: null, breathHold: 15, cooperative: true, cardiacOutput: 1.1 },
    wristband: { name: 'Sebastián Camilo Arango Duque', dob: '1997-05-03' },
    order: 'TC de tórax, abdomen y pelvis CON contraste (protocolo de trauma). Accidente de moto. Dolor en hipocondrio izquierdo, taquicardia.',
    history: 'Glasgow 15. FAST positivo en el cuadrante superior izquierdo. Llega acompañado por un familiar.',
    items: ['cinturon', 'monedas', 'collar'],
    contrast: 'si',
    companion: true,
    positionTip: 'Trauma: brazos sobre la cabeza si es posible, cero en la escotadura esternal, un solo rango desde los vértices pulmonares hasta la sínfisis del pubis.',
    expected: {
      coverage: [335, 945], armsDown: false, breathHold: true,
      kernels: ['standard', 'soft'], maxThickness: 5, drl: 'trauma', protocolKey: 'tap',
      phases: { portal: { comp: 'portal', minHU: 120, liverMin: 40, label: 'porta' } }, maxFlow: 5, minFlow: 3,
    },
    extras: [
      lesion.ell('laceracion-esplenica', [100, -32, 602], [3.5, 34, 30], { hu: 48 }, { shapeOpts: { rot: 35 } }),
      lesion.ell('hemoperitoneo-periesplenico', [128, -22, 604], [9, 46, 42], { hu: 42 }),
      lesion.ell('hemoperitoneo-pelvico', [-22, 18, 885], [24, 11, 14], { hu: 40 }),
    ],
    question: {
      text: '¿Cuál es el hallazgo principal?',
      options: ['Sin lesiones traumáticas', 'Laceración ESPLÉNICA con hemoperitoneo', 'Laceración hepática', 'Neumotórax a tensión'],
      correct: 1,
      explanation: 'Banda hipodensa lineal que atraviesa el bazo y no realza (laceración), con líquido denso (~40 HU, sangre) alrededor del bazo y en la pelvis (hemoperitoneo). En la fase portal el parénquima esplénico realza de forma homogénea y la laceración resalta. El protocolo de trauma cubre en una sola adquisición desde los vértices hasta la sínfisis.',
    },
  },
  {
    key: 'protesis-cadera',
    title: 'TC de pelvis — prótesis de cadera dolorosa',
    region: 'abdomen',
    patient: { name: 'Rosa Elena Montoya Giraldo', id: 'CC 32.441.870', dob: '1948-12-19', age: 76, sex: 'F', weight: 68, height: 155, creatinine: 0.9, egfr: 62, allergies: 'Ninguna conocida', metformin: false, pregnancy: 'No aplica (76 años)', breathHold: 10, cooperative: true, cardiacOutput: 1 },
    wristband: { name: 'Rosa Elena Montoya Giraldo', dob: '1948-12-19' },
    order: 'TC de pelvis SIMPLE. Prótesis total de cadera derecha hace 3 meses, dolor y fiebre. Descartar colección periprotésica.',
    history: 'Proteína C reactiva elevada. No puede elevar la pierna derecha.',
    items: ['cinturon', 'monedas', 'reloj'],
    contrast: 'no',
    companion: false,
    positionTip: 'Pelvis con prótesis: brazos sobre el pecho o la cabeza, cero en las crestas ilíacas. Active la reducción de artefactos metálicos (MAR) y considere más kV.',
    expected: {
      coverage: [790, 985], armsDown: false, breathHold: false, mar: true,
      kernels: ['standard', 'soft', 'bone'], maxThickness: 3, drl: 'pelvis', protocolKey: 'pelvis',
    },
    extras: [
      lesion.ell('coleccion-periprotesica', [-122, 6, 930], [16, 24, 28], { hu: 16 }),
      lesion.ell('cotilo-protesico', [-88, -6, 915], [28, 28, 28], { hu: 50, bone: 7000 }),
      lesion.ell('cabeza-protesica', [-88, -6, 915], [22, 22, 22], { hu: 50, bone: 9000 }),
      lesion.tube('vastago-protesico', 918, 990, [-94, -6], [-104, -4], [8, 8], [7, 7], { hu: 50, bone: 9000 }),
    ],
    question: {
      text: '¿Qué hallazgo hay alrededor de la prótesis?',
      options: ['Ninguno: solo artefactos metálicos', 'Colección líquida periprotésica lateral a la cadera DERECHA', 'Fractura del pubis izquierdo', 'Luxación de la prótesis'],
      correct: 1,
      explanation: 'Lateral a la prótesis derecha hay una colección líquida (~15 HU) compatible con colección/absceso periprotésico. Sin reducción de artefactos metálicos (MAR) las rayas oscuras y brillantes que salen del metal la ocultan. Además del MAR ayudan un kV más alto, los cortes algo más gruesos y los mAs suficientes.',
    },
  },
  {
    key: 'coronario', event: EVENTS.ansiedad,
    title: 'Angio-TC coronaria — dolor torácico estable',
    region: 'chest',
    patient: { name: 'Carlos Mario Betancur Ríos', id: 'CC 71.889.204', dob: '1967-10-09', age: 58, sex: 'M', weight: 82, height: 174, creatinine: 0.9, egfr: 88, allergies: 'Ninguna conocida', metformin: false, pregnancy: null, breathHold: 15, cooperative: true, cardiacOutput: 1, hr: 82, betaOk: true },
    wristband: { name: 'Carlos Mario Betancur Ríos', dob: '1967-10-09' },
    order: 'Angio-TC de arterias coronarias. Dolor torácico con el esfuerzo, prueba de esfuerzo no concluyente. Frecuencia cardíaca en reposo 82 lpm.',
    history: 'Dislipidemia, exfumador. Sin asma ni bloqueos cardíacos: puede recibir betabloqueador.',
    items: ['collar', 'reloj', 'monedas'],
    contrast: 'si',
    companion: false,
    positionTip: 'Coronarias: brazos sobre la cabeza, electrodos del ECG bien colocados, cero en la escotadura esternal y rango desde la carina hasta el ápex. Con frecuencia > 65 lpm hay que dar betabloqueador.',
    expected: {
      coverage: [440, 556], armsDown: false, breathHold: true,
      kernels: ['standard', 'soft'], maxThickness: 0.625, drl: 'coronary', protocolKey: 'coronary',
      timing: { comp: 'aorta', minHU: 300, label: 'aorta ascendente' }, maxFlow: 6, minFlow: 4.5,
      cardiac: { maxHr: 65 },
    },
    extras: [
      lesion.ell('placa-calcificada', [27, 72, 456], [2.2, 2.2, 2.5], { hu: 50, bone: 750 }, { group: 'heart' }),
      lesion.ell('placa-blanda', [30, 77, 466], [1.6, 1.6, 4.5], { hu: 45 }, { group: 'heart' }),
    ],
    question: {
      text: '¿Qué muestra la angio-TC coronaria?',
      options: ['Coronarias normales', 'Placa mixta (calcificada y blanda) con estenosis significativa en la DA proximal', 'Oclusión de la coronaria derecha', 'Puente miocárdico sin estenosis'],
      correct: 1,
      explanation: 'En la descendente anterior proximal hay una placa calcificada seguida de una placa blanda que estrecha mucho la luz (estenosis significativa). Para ver coronarias de 3–4 mm hace falta: frecuencia cardíaca baja (betabloqueador si > 65 lpm), sincronización con el ECG en diástole (70–80 %), cortes de 0,625 mm, contraste a 5 mL/s y una sola apnea corta.',
    },
  },
  {
    key: 'ictus-acm',
    title: 'Código ictus — TC simple, angio-TC de Willis y perfusión',
    region: 'head',
    patient: { name: 'Gloria Inés Zapata Arango', id: 'CC 21.765.430', dob: '1953-05-22', age: 72, sex: 'F', weight: 66, height: 158, creatinine: 0.9, egfr: 68, allergies: 'Ninguna conocida', metformin: false, pregnancy: 'No aplica (72 años)', breathHold: 0, cooperative: true, cardiacOutput: 1 },
    wristband: { name: 'Gloria Inés Zapata Arango', dob: '1953-05-22' },
    order: 'CÓDIGO ICTUS. Hemiplejia izquierda, desviación de la mirada a la derecha y negligencia desde hace 1 h 40 min. NIHSS 16. Solicito TC simple, angio-TC de troncos supraaórticos y polígono de Willis, y perfusión.',
    history: 'Fibrilación auricular sin anticoagular. Glucemia 118 mg/dL.',
    items: ['aretes', 'protesisDental', 'collar'],
    contrast: 'si',
    companion: true,
    positionTip: 'Ictus: brazos a los lados, cabeza en el soporte, cero en el nasion. Cada minuto cuenta: simple → angio (desde el cayado aórtico) → perfusión con un segundo bolo.',
    expected: {
      coverage: ANATOMY_Z.head, armsDown: true, headFirst: true, headHolder: true,
      kernels: ['brain', 'soft', 'standard'], maxThickness: 5, drl: 'stroke', protocolKey: 'stroke',
      timing: { comp: 'cerebralArt', minHU: 250, label: 'arterias cerebrales' }, maxFlow: 6, minFlow: 4, perfusion: true,
    },
    extras: [
      lesion.ell('penumbra', [-40, 8, 88], [24, 42, 34], { hu: 37 }, { comp: 'penumbra', clip: BRAIN }),
      lesion.ell('nucleo-infarto', [-44, 6, 90], [11, 16, 12], { hu: 33 }, { comp: 'core', clip: BRAIN }),
      lesion.tube('ACM-M2-colateral', 78, 124, [-54, 8], [-46, 18], [1.4, 1.4], [1.4, 1.4], { hu: 40 }, { comp: 'collateral' }),
      lesion.tube('ACM-M2-colateral', 80, 124, [-52, 30], [-46, 18], [1.3, 1.3], [1.3, 1.3], { hu: 40 }, { comp: 'collateral' }),
      lesion.tube('trombo-M1', 122, 128, [-35, 16], [-35, 16], [9, 2.2], [9, 2.2], { hu: 62 }),
    ],
    question: {
      text: '¿Cuál es el diagnóstico?',
      options: ['Sin oclusión de grandes vasos', 'Oclusión de la ACM DERECHA (M1) con núcleo pequeño y penumbra extensa: candidata a trombectomía', 'Hemorragia intraparenquimatosa derecha', 'Oclusión de la ACM IZQUIERDA'],
      correct: 1,
      explanation: 'En la TC simple la ACM derecha se ve hiperdensa (trombo). La angio-TC muestra el corte de la M1 derecha con ramas distales que se rellenan tarde por colaterales. En la perfusión el núcleo es pequeño (CBF y CBV muy bajos) y el territorio con Tmax > 6 s es mucho mayor: hay tejido salvable (mismatch) y la paciente es candidata a trombectomía.',
    },
  },
  {
    key: 'pediatrico-tec',
    title: 'TC de cráneo pediátrico — traumatismo',
    region: 'head', event: EVENTS.llanto,
    patient: { name: 'Samuel Andrés Rincón Patiño', id: 'RC 1.098.776.554', dob: '2020-08-14', age: 5, sex: 'M', weight: 19, height: 110, scale: 0.86, creatinine: 0.4, egfr: 110, allergies: 'Ninguna conocida', metformin: false, pregnancy: null, breathHold: 0, cooperative: false, cardiacOutput: 1 },
    wristband: { name: 'Samuel Andrés Rincón Patiño', dob: '2020-08-14' },
    order: 'TC de cráneo SIMPLE. Caída de 1,5 m desde una litera, intervalo lúcido y luego somnolencia y dos vómitos. Glasgow 13.',
    history: 'Llega con su madre. Hematoma parietal izquierdo en el cuero cabelludo.',
    items: ['horquillas', 'collar'],
    contrast: 'no',
    companion: true, companionApron: true,
    positionTip: 'Niños: protocolo pediátrico (menos mAs y kV según el peso), soporte e inmovilizador, la madre puede quedarse con delantal plomado. El cero se marca en el nasion del niño.',
    expected: {
      coverage: [4, 139], armsDown: true, headFirst: true, headHolder: true, strap: true,
      kernels: ['brain', 'soft', 'standard'], maxThickness: 5, drl: 'pedHead', protocolKey: 'pedHead',
    },
    extras: [
      lesion.ell('hematoma-epidural', [58, 18, 72], [7, 26, 24], { hu: 70 }),
      lesion.tube('fractura', 52, 92, [69, 20], [69, 20], [3.5, 0.9], [3.5, 0.9], { hu: 20 }),
    ],
    question: {
      text: '¿Qué muestra el estudio?',
      options: ['Estudio normal', 'Hematoma EPIDURAL izquierdo (biconvexo) con fractura parietal', 'Hematoma subdural derecho', 'Contusión frontal'],
      correct: 1,
      explanation: 'Colección hiperdensa biconvexa (lente) adyacente a la calota parietal izquierda, que no cruza las suturas, con una fractura lineal de la calota (ventana de hueso): hematoma epidural, una urgencia neuroquirúrgica. En niños la dosis debe ajustarse al tamaño (Image Gently): el mismo protocolo de adulto daría el doble de dosis efectiva.',
    },
  },
  {
    key: 'tep-embarazada',
    title: 'Angio-TC pulmonar en embarazada (24 semanas)',
    region: 'chest',
    patient: { name: 'Valentina Ospina Herrera', id: 'CC 1.017.223.908', dob: '1994-03-11', age: 31, sex: 'F', weight: 70, height: 165, creatinine: 0.5, egfr: 120, allergies: 'Ninguna conocida', metformin: false, pregnancy: 'Embarazo de 24 semanas (confirmado)', pregnantWeeks: 24, breathHold: 12, cooperative: true, cardiacOutput: 1.3 },
    wristband: { name: 'Valentina Ospina Herrera', dob: '1994-03-11' },
    order: 'Angio-TC de arterias pulmonares. Embarazo de 24 semanas, disnea y taquicardia; dímero D elevado; ecografía doppler de miembros inferiores negativa. Estudio justificado por el radiólogo.',
    history: 'Gestación normal. La paciente pregunta si la radiación afecta al bebé.',
    items: ['collar', 'aretes'],
    contrast: 'si',
    companion: false,
    positionTip: 'Embarazada: justificar, informar y optimizar. Topograma y rango SOLO del tórax (que no llegue al útero), kV bajo, una sola fase. No hace falta delantal sobre el abdomen si el útero está fuera del haz.',
    expected: {
      coverage: ANATOMY_Z.lungs, armsDown: false, breathHold: true, maxTopoZ: 630,
      kernels: ['standard', 'soft', 'lung'], maxThickness: 2.5, drl: 'ctpa', protocolKey: 'ctpa',
      timing: { comp: 'pa', minHU: 250, label: 'arteria pulmonar' }, maxFlow: 5, minFlow: 3.5,
    },
    extras: [],
    question: {
      text: '¿Qué muestra el estudio?',
      options: ['Arterias pulmonares bien opacificadas, SIN defectos de llenado (no hay TEP)', 'TEP bilateral', 'Neumonía lobar', 'Disección de aorta'],
      correct: 0,
      explanation: 'Las arterias pulmonares realzan bien y no hay defectos de llenado: se descarta el TEP. En el embarazo el gasto cardíaco aumentado diluye el contraste (hace falta un buen caudal y seguimiento del bolo). El útero queda fuera del haz si el topograma y el rango se limitan al tórax: la dosis fetal es solo dispersa (< 0,1 mGy).',
    },
  },
  {
    key: 'obeso-abdomen',
    title: 'TC de abdomen contrastado — paciente con obesidad',
    region: 'abdomen',
    patient: { name: 'Julián David Cardona Lopera', id: 'CC 98.556.120', dob: '1980-12-02', age: 45, sex: 'M', weight: 138, height: 172, creatinine: 1.0, egfr: 85, allergies: 'Ninguna conocida', metformin: false, pregnancy: null, breathHold: 15, cooperative: true, cardiacOutput: 1 },
    wristband: { name: 'Julián David Cardona Lopera', dob: '1980-12-02' },
    order: 'TC de abdomen y pelvis CON contraste. Estudio de extensión de cáncer de colon.',
    history: 'IMC 47. Peso dentro del límite de la mesa (227 kg).',
    items: ['cinturon', 'monedas', 'reloj'],
    contrast: 'si',
    companion: false,
    positionTip: 'Obesidad: comprobar el límite de peso de la mesa, centrar bien, brazos arriba, ATCM activada, más kV/mAs y un DFOV que incluya toda la piel. Se acepta más dosis que en un adulto estándar. El contraste se calcula por peso (~0,5 gI/kg): con la dosis estándar el realce queda bajo.',
    expected: {
      coverage: ANATOMY_Z.abdomenPelvis, armsDown: false, breathHold: true, minDfov: 420,
      kernels: ['standard', 'soft'], maxThickness: 5, drl: 'obese', protocolKey: 'abdomen',
      phases: { portal: { comp: 'portal', minHU: 100, liverMin: 30, label: 'porta' } }, maxFlow: 5, minFlow: 3,
    },
    extras: [lesion.ell('metastasis', [-62, 22, 622], [10, 10, 10], { hu: 40 }, { comp: 'metastasis' })],
    question: {
      text: '¿Qué hallazgo hay en el hígado?',
      options: ['Hígado normal', 'Lesión hipodensa en el lóbulo hepático DERECHO compatible con metástasis', 'Quiste simple en el lóbulo izquierdo', 'Esteatosis difusa'],
      correct: 1,
      explanation: 'Lesión hipodensa de ~2 cm en el lóbulo derecho en fase portal: metástasis. En pacientes obesos llegan muchos menos fotones: sin suficientes kV/mAs (o modulación) el ruido tapa lesiones de bajo contraste. El DFOV debe incluir toda la piel; si no, se pierde anatomía y se crean artefactos.',
    },
  },
  {
    key: 'biopsia-pulmon', procedure: true,
    title: 'Biopsia pulmonar guiada por TC',
    region: 'chest',
    patient: { name: 'Rubén Darío Castaño Arias', id: 'CC 15.432.778', dob: '1957-07-30', age: 68, sex: 'M', weight: 76, height: 170, creatinine: 1.0, egfr: 75, allergies: 'Ninguna conocida', metformin: false, pregnancy: null, breathHold: 15, cooperative: true, cardiacOutput: 1, inr: 1.1, platelets: 245000 },
    wristband: { name: 'Rubén Darío Castaño Arias', dob: '1957-07-30' },
    order: 'Biopsia percutánea guiada por TC de nódulo de 18 mm en el lóbulo superior derecho, sospechoso de malignidad. INR 1,1; plaquetas 245.000. Consentimiento firmado.',
    history: 'Exfumador. EPOC leve. Suspendió la aspirina hace 7 días.',
    items: ['collar', 'reloj'],
    contrast: 'no', companion: false,
    expected: { coverage: [395, 465], armsDown: false, breathHold: true, kernels: ['lung', 'standard'], maxThickness: 2.5, drl: 'chest', protocolKey: 'chest' },
    extras: [lesion.ell('nodulo', [-95, 30, 430], [9, 9, 9], { hu: 38 })],
    nodule: { x: -95, y: 30, z: 430, r: 9 },
    question: { text: '¿Hay neumotórax en el control final?', options: ['No', 'Sí'], correct: 0, explanation: '' },
  },
];

// --- Casos creados por el docente (editor de casos) -------------------------------

export const CUSTOM_KEY = 'opentc-custom-cases';

// Lo que se espera de cada protocolo (lo usa el editor para no pedirle todo al docente)
export const PROTOCOL_EXPECTED = {
  head: { region: 'head', coverage: ANATOMY_Z.head, armsDown: true, headHolder: true, kernels: ['brain', 'soft', 'standard'], maxThickness: 5, drl: 'head' },
  chest: { region: 'chest', coverage: ANATOMY_Z.lungs, armsDown: false, breathHold: true, kernels: ['standard', 'lung', 'soft'], maxThickness: 5, drl: 'chest' },
  lowdose: { region: 'chest', coverage: ANATOMY_Z.lungs, armsDown: false, breathHold: true, kernels: ['lung'], maxThickness: 1.25, drl: 'lowdose' },
  ctpa: { region: 'chest', coverage: ANATOMY_Z.lungs, armsDown: false, breathHold: true, kernels: ['standard', 'soft', 'lung'], maxThickness: 2.5, drl: 'ctpa', timing: { comp: 'pa', minHU: 250, label: 'arteria pulmonar' }, minFlow: 3.5, maxFlow: 5 },
  abdomen: { region: 'abdomen', coverage: ANATOMY_Z.abdomenPelvis, armsDown: false, breathHold: true, kernels: ['standard', 'soft'], maxThickness: 5, drl: 'abdomen', phases: { portal: { comp: 'portal', minHU: 120, liverMin: 40, label: 'porta' } }, minFlow: 2.5, maxFlow: 5 },
  liver3: { region: 'abdomen', coverage: ANATOMY_Z.liver, armsDown: false, breathHold: true, kernels: ['standard', 'soft'], maxThickness: 5, drl: 'abdomen', phases: { arterial: { comp: 'aorta', minHU: 220, liverMax: 40 }, portal: { comp: 'portal', minHU: 120, liverMin: 45 } }, minFlow: 3.5, maxFlow: 5 },
  urolith: { region: 'abdomen', coverage: [640, 945], armsDown: false, breathHold: true, kernels: ['standard', 'soft'], maxThickness: 5, drl: 'urolith' },
  neck: { region: 'neck', coverage: [150, 390], armsDown: true, breathHold: true, kernels: ['soft', 'standard'], maxThickness: 3, drl: 'neck', phases: { portal: { comp: 'jugular', minHU: 100, label: 'yugular' } }, minFlow: 2, maxFlow: 5 },
  pelvis: { region: 'abdomen', coverage: [790, 985], armsDown: false, kernels: ['standard', 'soft', 'bone'], maxThickness: 3, drl: 'pelvis' },
};

// Tipos de lesión que ofrece el editor
export const LESION_TYPES = {
  hipodensa: { label: 'Lesión hipodensa (metástasis, quiste)', hu: 20, comp: 'metastasis' },
  hemorragia: { label: 'Hemorragia aguda (hiperdensa)', hu: 68 },
  hipervascular: { label: 'Realce arterial con lavado (hepatocarcinoma)', hu: 45, comp: 'hcc' },
  calculo: { label: 'Cálculo / calcificación', hu: 300, bone: 700 },
  trombo: { label: 'Trombo (defecto de llenado en un vaso)', hu: 38 },
  liquido: { label: 'Colección líquida', hu: 12 },
  absceso: { label: 'Absceso (pared que realza)', hu: 18, rim: true },
  aire: { label: 'Aire libre / gas', hu: -1000 },
  metal: { label: 'Cuerpo extraño metálico', hu: 50, bone: 9000 },
};

// Convierte las lesiones guardadas (datos simples) en estructuras del fantasma
export function lesionsToExtras(list = []) {
  const out = [];
  for (const l of list) {
    const t = LESION_TYPES[l.type] || LESION_TYPES.hipodensa;
    const c = [+l.x, +l.y, +l.z], r = [+l.rx, +l.ry, +l.rz];
    if (t.rim) out.push(lesion.ell(`${l.type}-pared`, c, r.map((v) => v + 2.5), { hu: 45 }, { comp: 'rim' }));
    out.push(lesion.ell(l.type, c, r, { hu: t.hu, bone: t.bone || 0 }, t.comp ? { comp: t.comp } : {}));
  }
  return out;
}

export function customToCase(d) {
  const exp = PROTOCOL_EXPECTED[d.protocolKey] || PROTOCOL_EXPECTED.abdomen;
  const contrast = d.contrast || 'no';
  const expected = { ...exp, protocolKey: d.protocolKey };
  if (contrast !== 'si') { delete expected.timing; delete expected.phases; }
  return {
    key: d.key, custom: true, title: d.title, region: exp.region,
    patient: { breathHold: 15, cooperative: true, cardiacOutput: 1, creatinine: 0.9, egfr: 80, allergies: 'Ninguna conocida', metformin: false, pregnancy: null, ...d.patient },
    wristband: { name: d.patient.name, dob: d.patient.dob },
    order: d.order, history: d.history || '', items: d.items || [], contrast, companion: !!d.companion,
    positionTip: d.positionTip || '', expected, extras: lesionsToExtras(d.lesions), lesions: d.lesions,
    question: { text: d.question.text, options: d.question.options.filter((o) => o.trim()), correct: +d.question.correct, explanation: d.question.explanation || '' },
  };
}

export function loadCustomCases() {
  try { return (JSON.parse(localStorage.getItem(CUSTOM_KEY)) || []).filter((d) => d && d.key && d.patient && d.question); } catch { return []; }
}
export function saveCustomCases(list) {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); return true; } catch { return false; }
}

export const allCases = () => [...CASES, ...loadCustomCases().map(customToCase)];
// Casos aleatorios (se generan bajo demanda; ver js/randomcase.js). Se registra el generador para evitar dependencias circulares.
let randomGenerator = null;
export const setRandomGenerator = (fn) => { randomGenerator = fn; };
const randomCache = new Map();
export const caseByKey = (k) => {
  if (k?.startsWith('rand-') && randomGenerator) {
    if (!randomCache.has(k)) { const d = randomGenerator(k); randomCache.set(k, d ? customToCase(d) : null); }
    return randomCache.get(k);
  }
  return CASES.find((c) => c.key === k) || allCases().find((c) => c.key === k);
};
