// Pasos del tutorial: un TC de cráneo completo, de la orden médica al informe.
// ctx: { S() → estado del examen, step() → paso visible, offY() → desvío vertical, lastReport() }
import { ANATOMY_Z } from './phantom.js';

export function tourSteps(ctx) {
  const S = () => ctx.S();
  const nav = (k) => `#stepsNav [data-step="${k}"]`;
  const at = (k) => ctx.step() === k;
  const [h0, h1] = ANATOMY_Z.head;
  return [
    {
      title: 'Bienvenido a OpenTC Sim',
      text: 'Va a hacer un <b>TC de cráneo urgente</b> completo: identificar y valorar al paciente, posicionarlo, adquirir el topograma, planificar, escanear y leer las imágenes.<br><br>Cada paso espera a que usted lo haga. Puede cerrar el tutorial con Esc y repetirlo con el botón «Tutorial».',
    },
    {
      target: '#stepsNav',
      title: 'El flujo del examen',
      text: 'Estos son los pasos del examen. Se marcan en verde cuando están completos. Puede ir y volver entre ellos.',
    },
    {
      target: '#orderCard',
      title: 'La orden médica',
      text: 'Lea siempre la orden: qué estudio se pide, si es con o sin contraste y por qué. Aquí: <b>cráneo simple urgente</b> por sospecha de ACV en un paciente agitado y anticoagulado.',
    },
    {
      target: '#btnAskId',
      title: 'Identificación',
      text: 'Pida al paciente su nombre completo y su fecha de nacimiento: pulse <b>Preguntar al paciente</b>.',
      done: () => S().prep.idAsked,
    },
    {
      target: '#chkId',
      title: 'Dos identificadores',
      text: 'Compare lo que dice el paciente con el brazalete y la orden. Si coinciden, márquelo.',
      done: () => S().prep.idChecked,
    },
    {
      target: '#btnLabs',
      title: 'Valoración previa',
      text: 'Revise la historia clínica: función renal, alergias, metformina y embarazo. Aunque el estudio sea simple, conocer al paciente evita errores.',
      done: () => S().prep.labsReviewed,
    },
    {
      target: '#segContrast',
      title: 'Decisión sobre el contraste',
      text: 'La orden es de un <b>cráneo simple</b>: elija «No requiere contraste».',
      done: () => S().prep.contrastDecision === 'no',
      failIf: () => S().prep.contrastDecision && S().prep.contrastDecision !== 'no',
      failText: 'En un cráneo simple por sospecha de hemorragia no se usa contraste: el sangrado agudo ya es hiperdenso.',
    },
    {
      target: '#metalList',
      title: 'Objetos metálicos',
      text: 'Aretes, gafas y prótesis dental producen rayas en la imagen del cráneo. Pida que los retire: márquelos todos.',
      done: () => S().prep.removed.size === S().caseDef.items.length,
    },
    {
      target: '#segCompanion',
      title: 'Protección del acompañante',
      text: 'Nadie que no sea imprescindible debe quedarse en la sala durante la exposición: elija «Sale de la sala».',
      done: () => S().prep.companion === 'fuera',
    },
    {
      target: nav('sala'),
      title: 'A la sala',
      text: 'Vaya al paso <b>Sala y posición</b>.',
      done: () => at('sala'),
    },
    {
      target: '#roomCanvas',
      title: 'La sala 3D',
      text: 'Arrastre para girar la vista y use la rueda para acercarse. Con unas gafas de realidad virtual puede entrar con «ENTER VR».',
    },
    {
      target: () => document.querySelector('#segArms')?.closest('.panel'),
      title: 'Posición para cráneo',
      text: 'Cráneo: <b>cabeza primero</b>, <b>brazos a los lados</b>, cabeza en el <b>soporte</b> y, como el paciente está agitado, <b>cinta de sujeción</b>.',
      done: () => S().position.orientation === 'head' && S().position.arms === 'down' && S().position.headHolder && S().position.strap,
    },
    {
      target: '#chkLasers',
      title: 'Láseres',
      text: 'Encienda los láseres de centrado.',
      done: () => S().position.lasers,
    },
    {
      target: () => document.querySelector('#rngHeight')?.closest('.travel'),
      title: 'Altura de la mesa',
      text: () => `Suba o baje la mesa hasta que el láser coronal quede en la línea medioaxilar (desvío actual: ${Math.round(ctx.offY())} mm). Un paciente descentrado tiene más ruido y más dosis en la piel.`,
      done: () => Math.abs(ctx.offY()) <= 5,
    },
    {
      target: () => document.querySelector('#selLandmark')?.parentElement,
      title: 'El cero',
      text: 'Elija <b>Nasion (línea orbitomeatal)</b> y pulse <b>Marcar cero</b>: las posiciones de la mesa se medirán desde ahí.',
      done: () => S().position.landmark === 'nasion',
      failIf: () => S().position.landmark && S().position.landmark !== 'nasion',
      failText: 'Para cráneo la referencia habitual es el nasion / línea orbitomeatal. Cámbielo.',
    },
    {
      target: '#btnIso',
      title: 'Al isocentro',
      text: 'Lleve al paciente al gantry.',
      done: () => S().position.atIso,
    },
    {
      target: nav('topograma'),
      title: 'Topograma',
      text: 'Vaya al paso <b>Topograma y rango</b>.',
      done: () => at('topograma'),
    },
    {
      target: '#btnTopo',
      title: 'Adquirir el topograma',
      text: 'El topograma es una radiografía digital de baja dosis que sirve para planificar. Para cráneo se usa la vista lateral. Pulse <b>Adquirir topograma</b>.',
      done: () => S().topos.length > 0,
    },
    {
      target: '.topo-view',
      title: 'Planificar el rango',
      text: 'Arrastre las líneas amarillas para cubrir <b>desde el vértex hasta la base del cráneo</b> (agujero magno), sin explorar de más hacia el cuello.',
      done: () => S().range && S().range[0] <= h0 + 3 && S().range[1] >= h1 - 3 && S().range[0] >= h0 - 30 && S().range[1] <= h1 + 30,
    },
    {
      target: nav('protocolo'),
      title: 'Protocolo',
      text: 'Vaya al paso <b>Protocolo</b>.',
      done: () => at('protocolo'),
    },
    {
      target: () => document.querySelector('#selProtocol')?.parentElement,
      title: 'Cargar el protocolo',
      text: 'Elija <b>Cráneo simple</b> y pulse <b>Cargar</b>.',
      done: () => S().protocolKey === 'head',
    },
    {
      target: '#metrics',
      title: 'Dosis y calidad en vivo',
      text: 'Cambie los mAs o el pitch y observe: el <b>CTDIvol</b> (dosis por corte), el <b>DLP</b> (dosis × longitud), la dosis efectiva, el tiempo y el ruido esperado. El nivel de referencia para cráneo es de unos 60 mGy.',
    },
    {
      target: nav('adquisicion'),
      title: 'Adquisición',
      text: 'Vaya al paso <b>Adquisición</b>.',
      done: () => at('adquisicion'),
    },
    {
      target: '#btnScan',
      title: 'Escanear',
      text: 'Revise la lista de comprobación y pulse <b>Iniciar adquisición</b>. Cada corte se reconstruye por retroproyección filtrada a partir de proyecciones con ruido.',
      done: () => S().series.length > 0 && at('visor'),
    },
    {
      target: '.viewport',
      title: 'El visor',
      text: 'Rueda: cortes. Arrastrar: ventana y nivel. Busque la lesión. Recuerde: <b>la derecha del paciente está a la izquierda de la imagen</b>.',
    },
    {
      target: '#segWindow',
      title: 'Ventanas',
      text: 'Pruebe la ventana de <b>Cerebro</b> (estrecha: separa sustancia gris y blanca) y la de <b>Hueso</b> (ancha: fracturas).',
    },
    {
      target: '#reconPanel',
      title: 'Reconstruir sin irradiar',
      text: 'Con los datos brutos se puede reconstruir otra vez con otro filtro, grosor o reconstrucción iterativa <b>sin dar más dosis</b>. Pruebe un filtro de hueso de 1,25 mm.',
    },
    {
      target: nav('finalizar'),
      title: 'Finalizar',
      text: 'Vaya al paso <b>Finalizar</b>, responda la pregunta, envíe las imágenes al PACS y pulse <b>Finalizar y ver informe</b>.',
      done: () => !!ctx.lastReport(),
    },
    {
      title: '¡Listo!',
      text: 'Ha completado un examen. Pruebe ahora los otros casos, los <b>casos de artefactos</b> o el <b>modo evaluación</b>, que no da pistas y pone nota.',
    },
  ];
}
