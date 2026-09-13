/**
 * ¿Ha salido esta contraseña en alguna filtración?
 *
 * Es la única vez que CLAC sale a internet, y solo cuando se pulsa el botón.
 * Pregunta a Have I Been Pwned, que guarda los hash de cientos de millones de
 * contraseñas filtradas, por **anonimato-k**: de cada contraseña se calcula su
 * SHA-1 y se mandan los cinco primeros caracteres. El servicio devuelve los
 * cientos de hash que empiezan igual, y es aquí, en el equipo, donde se mira si
 * el nuestro está entre ellos. La contraseña no sale nunca; su hash entero,
 * tampoco.
 *
 * Además se pide relleno (`Add-Padding`): cada respuesta trae hash de mentira
 * hasta un tamaño parecido, para que ni siquiera el tamaño de lo que viaja diga
 * nada.
 */
import { net } from 'electron'
import { createHash } from 'node:crypto'
import { contrasenaDe } from '@shared/categorias'
import type { ParaRevisar, ResultadoFiltracion } from '@shared/watchtower'

const SERVICIO = 'https://api.pwnedpasswords.com/range/'

async function consultar(prefijo: string): Promise<Map<string, number>> {
  const respuesta = await net.fetch(SERVICIO + prefijo, {
    headers: { 'Add-Padding': 'true', 'User-Agent': 'CLAC-gestor-de-contrasenas' }
  })
  if (!respuesta.ok) throw new Error(`El servicio de filtraciones contestó ${respuesta.status}.`)
  const mapa = new Map<string, number>()
  for (const linea of (await respuesta.text()).split(/\r?\n/)) {
    const [sufijo, veces] = linea.trim().split(':')
    // Las de relleno vienen con un cero.
    if (sufijo && Number(veces) > 0) mapa.set(sufijo.toUpperCase(), Number(veces))
  }
  return mapa
}

export async function comprobarFiltraciones(
  elementos: ParaRevisar[],
  alAvanzar?: (hechas: number, total: number) => void
): Promise<Record<string, ResultadoFiltracion>> {
  const porHash = new Map<string, ParaRevisar[]>()
  for (const x of elementos) {
    if (x.elemento.estado !== 'activo') continue
    const pw = contrasenaDe(x.detalle)
    if (!pw) continue
    const hash = createHash('sha1').update(pw, 'utf8').digest('hex').toUpperCase()
    porHash.set(hash, [...(porHash.get(hash) ?? []), x])
  }

  // Una consulta por prefijo, aunque varias contraseñas lo compartan.
  const prefijos = [...new Set([...porHash.keys()].map((h) => h.slice(0, 5)))]
  const respuestas = new Map<string, Map<string, number>>()
  let hechas = 0
  const cola = [...prefijos]
  const trabajar = async (): Promise<void> => {
    for (let p = cola.shift(); p; p = cola.shift()) {
      respuestas.set(p, await consultar(p))
      alAvanzar?.(++hechas, prefijos.length)
    }
  }
  // Cuatro a la vez: suficiente para no tardar y poco para no abusar del servicio.
  await Promise.all(Array.from({ length: Math.min(4, prefijos.length) }, trabajar))

  const resultado: Record<string, ResultadoFiltracion> = {}
  for (const [hash, lista] of porHash) {
    const veces = respuestas.get(hash.slice(0, 5))?.get(hash.slice(5)) ?? 0
    for (const x of lista) resultado[x.elemento.id] = { modificado: x.elemento.modificado, veces }
  }
  return resultado
}
