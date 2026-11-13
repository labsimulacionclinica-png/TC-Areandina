# Privacidad y tratamiento de datos

OpenTC Sim está diseñado para recoger los mínimos datos posibles. Este documento sirve de base para la política de la institución que lo use (en Colombia, Ley 1581 de 2012 y Decreto 1377 de 2013).

## Qué datos maneja

| Dato | Dónde se guarda | Quién lo ve |
|---|---|---|
| Nombre o código que escribe el estudiante y sus informes de evaluación | En el navegador del equipo (almacenamiento local) | Solo quien use ese equipo |
| Informes enviados a una clase (si se usa el servidor de clase) | En el servidor de la institución (`data/`, no se publica en la web) | El docente con el PIN de la clase |
| Nota enviada a Moodle (si se usa como paquete SCORM) | En la plataforma de la institución | Según los permisos de Moodle |
| Casos del docente, perfil del tomógrafo, encuesta SUS | En el navegador | Solo quien use ese equipo, hasta que se exporten |

- **No hay pacientes reales**: todos los casos, nombres e imágenes son ficticios y generados por el simulador.
- **No hay analítica, publicidad ni cookies de terceros**, y la app no envía datos a servicios externos.
- El PIN de cada clase se guarda cifrado (scrypt). El servidor solo acepta los campos conocidos del informe y descarta el resto.

## Recomendaciones para la institución

1. Pida a los estudiantes que usen un **código** en lugar de su nombre completo cuando no se use Moodle.
2. Informe a los estudiantes de la finalidad (formación y evaluación) y del tiempo de conservación de los resultados. Borre la carpeta `data/` del servidor al cerrar el periodo académico.
3. Si los resultados se usan en una investigación (documento `docs/validacion/03-piloto-estudiantes.md`), obtenga el consentimiento informado y el aval del comité de ética, y analice los datos de forma anonimizada.
4. En equipos compartidos, el botón «Vaciar» del panel docente y el borrado de datos del navegador eliminan la información local.

## Aviso

OpenTC Sim es un **simulador educativo**. No es un dispositivo médico y no debe usarse para diagnóstico, tratamiento ni planificación clínica.
