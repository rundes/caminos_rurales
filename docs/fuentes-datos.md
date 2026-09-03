# Fuentes de datos de referencia

Estudio "Infraestructura para el desarrollo agrario. Diagnóstico y propuesta para fortalecer la política de caminos rurales para el sector lácteo de la Provincia de Buenos Aires" (UBA Agronomía, Ministerio de Desarrollo Agrario PBA, CFI, 2023).

- App Earth Engine: https://caminosrurales.users.earthengine.app/view/caminos-rurales-bonaereneses
- Informe final: https://drive.google.com/file/d/1iOttvIDqV8KQfpQ9NM-3DYOEsNmGtji2/view
- Metodología: https://drive.google.com/file/d/1jkwvLCfKMq6L7aeHT0v2LOapZwrcm__S/view
- Contacto: caminosrurales@agro.uba.ar
- Desarrollo de la app: Paula Torre Zaffaroni y Hernán Dieguez

## Capas publicadas en la app

Tambos, Industrias, Escuelas, Segmentos (intensidad de uso social, intensidad de uso lechero, años con interrupciones, proporción interrumpible, primer y último año de interrupción), extensión de inundación 2009 y 2017, agua permanente 2000-2021, frecuencia de inundación (%), usos del suelo 2000/2010/2020.

Los datos crudos no se descargan desde la app. Hay que pedirlos al contacto.

## Fuentes primarias citadas

| Dato | Fuente |
|---|---|
| Red vial | OpenStreetMap |
| Tambos | Registro SENASA 2020-2022, Dirección Nacional de Lechería (SAGyP) |
| Industrias lácteas | Relevamiento de Industrias Lácteas 2017 (RIL) |
| Localidades, escuelas, hospitales | Instituto Geográfico Nacional |
| Usos del suelo | MapBiomas Pampa (https://pampa.mapbiomas.org/) |
| Suelos 1:50.000 | Cartas de Suelos INTA |
| Agua superficial / inundaciones | Global Surface Water (JRC), asset GEE `JRC_GSW1_0_1_MONTHLY` |

## Uso en Visiovial Rural

- OSM como mapa base (tiles) desde el MVP.
- Segmentos y puntos de interés UBA como capas futuras (fase 6, ver `docs/step-by-step-guide.md`).

## IGN - Red vial provincial

Instituto Geográfico Nacional, capa "Red vial" filtrada a la Dirección de Vialidad
de la Provincia de Buenos Aires (DVP). Se recorta por partido en
`scripts/generar-capas-municipio.mjs` y se guarda como
`public/capas/<municipio>/red-provincial.geojson`.

Campos relevantes de cada feature:

| Campo | Significado | Decodificación usada |
|---|---|---|
| `rtn` | Nombre/número de ruta | Se usa tal cual para el rótulo del tramo. |
| `typ` | Tipo de vía | 40 = ruta provincial, 47 = autovía (RP 2). Otros códigos se muestran tal cual. |
| `rst` | Superficie | 1 = pavimentado, 2 = consolidado, 3 = tierra. Define el color del tramo en la capa. |

Esta capa es de referencia visual (fondo de mapa); el denominador de cobertura
(`public.tramos`) se siembra desde la capa de OSM, no desde esta.

## OpenStreetMap (Overpass) - Maipú (partido 066)

Consulta Overpass sobre `highway=secondary|tertiary|unclassified|track` dentro
del límite del partido, con nomenclatura de Vialidad BA: RP 62, caminos
secundarios 066-01 a 066-05 y 039-08, más 112 tramos sin nombre asignados por
localidad rural más cercana. Total 632 km en 207 tramos en el GeoJSON completo;
165 tramos (610 km) quedan con `nombre_codigo` no nulo y son los que se siembran
en `public.tramos` (`scripts/seed-tramos.mjs`), el denominador de cobertura.
Los tramos excluidos son calles urbanas de Maipú ciudad.

## severo_data - Localidades y puntos de interés

Polígonos de localidades y puntos de interés (POIs) de Maipú, relevados
manualmente en `rundes/severo_data` (tablero previo del mismo autor). Se
reutilizan tal cual como `public/capas/maipu/localidades.geojson` — no se
regeneran con script, se copian del proyecto original.
