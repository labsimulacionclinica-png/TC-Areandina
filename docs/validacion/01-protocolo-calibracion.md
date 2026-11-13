# Protocolo de calibración de OpenTC Sim con un tomógrafo real

**Objetivo:** que el ruido, los números TC y la dosis del simulador coincidan con los del tomógrafo de la institución, para que lo que el estudiante aprende se transfiera al equipo real.

**Responsables:** tecnólogo/a de control de calidad y docente del programa. **Tiempo:** unos 45 minutos. **Material:** maniquí de agua del control de calidad diario (o de 32 cm y 20 cm si están disponibles), consola del tomógrafo y, si se dispone, cámara de ionización tipo lápiz con maniquíes de CTDI de 16 y 32 cm.

> No se irradia a ninguna persona: todas las adquisiciones son del maniquí.

## 1. Números TC del agua y del aire

1. Coloque el maniquí de agua centrado en el isocentro (láseres).
2. Adquiera con el protocolo de control de calidad del fabricante (habitualmente 120 kV, axial, 5 mm, filtro estándar).
3. ROI circular de ~20 cm² en el centro y en el aire fuera del maniquí.
4. Registre: agua ____ HU (esperado 0 ± 4), aire ____ HU (esperado −1000 ± 10).

Si el equipo está fuera de tolerancia, avise al servicio técnico antes de seguir.

## 2. Ruido (base de la calibración del simulador)

Repita cada adquisición **3 veces** y anote la desviación estándar (DE) de la ROI central.

| Maniquí | kV | mAs efectivo | Grosor | Filtro | DE 1 | DE 2 | DE 3 | Media |
|---|---|---|---|---|---|---|---|---|
| Cuerpo 32 cm (o el disponible) | 120 | 200 | 5 mm | estándar | | | | |
| Cuerpo 32 cm | 100 | 200 | 5 mm | estándar | | | | |
| Cabeza 20 cm | 120 | 250 | 5 mm | estándar | | | | |

Introduzca la primera fila en **calibracion.html → 2. Ruido**. El simulador ajusta su número de fotones para reproducir esa DE. Las otras filas sirven para **verificar** después: cambie kV o maniquí en la misma página, pulse «Simular con el perfil actual» y compare. Una diferencia < 15 % se considera aceptable para docencia.

## 3. Dosis (CTDIw)

Opción A — **documentación del fabricante**: copie el CTDI<sub>w</sub> por 100 mAs para cada kV y maniquí.
Opción B — **medición**: cámara lápiz en los orificios central y periféricos de los maniquíes de 16 y 32 cm, una rotación axial a 100 mAs; CTDI<sub>w</sub> = ⅓ CTDI<sub>centro</sub> + ⅔ CTDI<sub>periferia</sub>.

| Maniquí | 80 kV | 100 kV | 120 kV | 140 kV |
|---|---|---|---|---|
| 16 cm (cabeza) | | | | |
| 32 cm (cuerpo) | | | | |

Introdúzcalos en **calibracion.html → 3. CTDIw**.

## 4. Verificación clínica de la dosis

Compare el CTDI<sub>vol</sub> y el DLP que muestra la consola del simulador con los del equipo real para 3 protocolos de la institución (cráneo simple, tórax, abdomen-pelvis) con los mismos parámetros. Registre la diferencia porcentual.

| Protocolo | CTDIvol real | CTDIvol simulador | Dif. % | DLP real | DLP simulador | Dif. % |
|---|---|---|---|---|---|---|
| Cráneo simple | | | | | | |
| Tórax | | | | | | |
| Abdomen-pelvis | | | | | | |

## 5. Distribución del perfil

En calibracion.html pulse **Exportar perfil (JSON)**. En cada computador de la sala abra calibracion.html e **Importar perfil**. Repita la calibración tras cada cambio importante del equipo (tubo, detector, actualización de software) o una vez al año.

## Limitaciones

El simulador usa geometría paralela, un modelo simplificado de endurecimiento del haz y un fantasma matemático: la calibración iguala el ruido y la dosis en condiciones de referencia, pero la textura del ruido y los artefactos no serán idénticos a los del equipo.
