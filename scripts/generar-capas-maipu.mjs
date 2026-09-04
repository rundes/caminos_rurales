// Wrapper de compatibilidad: delega en el script generalizado por
// municipio (scripts/generar-capas-municipio.mjs) fijando el slug
// 'maipu'. Se conserva para no romper referencias existentes.
//
// public/capas/maipu/localidades.geojson NO se genera con este script: viene
// de severo_data (polígonos de localidades y POIs de Maipú relevados
// manualmente en un proyecto previo del mismo autor). Se copia tal cual.
//
// Uso: node scripts/generar-capas-maipu.mjs [--osm]
import { main } from './generar-capas-municipio.mjs'

main(['maipu', ...process.argv.slice(2)]).catch((error) => {
  console.error('[generar-capas-maipu]', error)
  process.exit(1)
})
