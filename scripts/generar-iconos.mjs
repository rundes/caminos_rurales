// Genera los íconos PWA desde un SVG inline (cuadrado verde redondeado con "V").
// Uso: node scripts/generar-iconos.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const VERDE = '#166534'
const DESTINO = path.join(process.cwd(), 'public', 'icons')

/**
 * `relleno` deja margen alrededor de la "V" para los íconos maskable, que se
 * recortan en un círculo del 80 % del lienzo.
 */
function svg(margen) {
  const radio = margen > 0 ? 0 : 96
  const escala = 1 - margen * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radio}" fill="${VERDE}"/>
  <g transform="translate(256 256) scale(${escala}) translate(-256 -256)">
    <path d="M150 150 L256 372 L362 150 L306 150 L256 258 L206 150 Z" fill="#ffffff"/>
  </g>
</svg>`
}

const ARCHIVOS = [
  { nombre: 'icon-192.png', tamano: 192, margen: 0 },
  { nombre: 'icon-512.png', tamano: 512, margen: 0 },
  { nombre: 'icon-maskable-192.png', tamano: 192, margen: 0.12 },
  { nombre: 'icon-maskable-512.png', tamano: 512, margen: 0.12 },
]

async function main() {
  await mkdir(DESTINO, { recursive: true })
  await writeFile(path.join(DESTINO, 'icon.svg'), svg(0), 'utf8')

  for (const { nombre, tamano, margen } of ARCHIVOS) {
    const buffer = await sharp(Buffer.from(svg(margen))).resize(tamano, tamano).png().toBuffer()
    await writeFile(path.join(DESTINO, nombre), buffer)
    console.log(`✓ ${nombre}`)
  }
}

main().catch((error) => {
  console.error('[iconos]', error)
  process.exit(1)
})
