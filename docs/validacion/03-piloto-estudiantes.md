# Estudio piloto con estudiantes

**Pregunta:** ¿mejora OpenTC Sim los conocimientos y la confianza de los estudiantes en la adquisición de TC, y es fácil de usar?

**Diseño:** cuasiexperimental pre-post en un grupo (o con grupo control si se dispone de dos cohortes). **Participantes:** estudiantes de tecnología en radiología e imágenes diagnósticas que cursan la asignatura de TC; participación voluntaria con consentimiento informado y aval del comité de ética de la institución. **Datos personales:** solo un código por estudiante (Ley 1581 de 2012); los resultados se analizan de forma agregada.

## Procedimiento (4 semanas)

| Semana | Actividad | Instrumento |
|---|---|---|
| 0 | Prueba de conocimientos previa (20 preguntas de física, protocolos, contraste y protección radiológica) y escala de confianza (1–10) | Cuestionario pre |
| 1 | Tutorial guiado y 3 casos en modo práctica (cráneo, TEP, artefactos) | Simulador |
| 2 | 3 casos en modo práctica (hígado trifásico, urolitiasis, contraindicación) | Simulador |
| 3 | 3 casos en modo evaluación (nota de la rúbrica) | Panel docente |
| 4 | Prueba posterior equivalente, escala de confianza y **SUS** | Cuestionario post y `sus.html` |

## Medidas

- **Conocimientos:** puntuación pre y post (prueba t pareada o Wilcoxon). Tamaño del efecto (d de Cohen).
- **Desempeño en el simulador:** porcentaje por criterio de la rúbrica (exportación CSV del panel docente); evolución entre el primer y el último caso.
- **Confianza autopercibida:** escala 1–10 pre y post.
- **Usabilidad:** System Usability Scale (SUS), 10 ítems. Puntuación ≥ 68 = por encima del promedio; ≥ 80 = excelente. El formulario `sus.html` calcula la puntuación y exporta los resultados en CSV.
- **Comentarios abiertos:** qué ayudó, qué confundió, qué falta.

## Cuestionario SUS (versión en español)

Escala 1 (totalmente en desacuerdo) a 5 (totalmente de acuerdo):

1. Creo que me gustaría usar este simulador con frecuencia.
2. Encontré el simulador innecesariamente complejo.
3. Pensé que el simulador era fácil de usar.
4. Creo que necesitaría el apoyo de un técnico para poder usar este simulador.
5. Encontré que las distintas funciones del simulador estaban bien integradas.
6. Pensé que había demasiada inconsistencia en el simulador.
7. Imagino que la mayoría de las personas aprenderían a usar este simulador muy rápidamente.
8. Encontré el simulador muy engorroso de usar.
9. Me sentí muy seguro/a usando el simulador.
10. Necesité aprender muchas cosas antes de poder usar el simulador.

Cálculo: ítems impares → (respuesta − 1); ítems pares → (5 − respuesta); suma × 2,5 = puntuación de 0 a 100.

## Difusión

Con los resultados se puede preparar un trabajo de grado o un artículo (por ejemplo, para una revista de educación en ciencias de la salud o un congreso de radiología), describiendo el simulador, la calibración (documento 01), la validez de contenido (documento 02) y estos resultados.
