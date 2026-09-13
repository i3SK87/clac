/**
 * Buscar en la caja fuerte, en la ventana y en el acceso rápido.
 *
 * Solo sobre los resúmenes —título, subtítulo, webs y etiquetas—, que son lo
 * que está descifrado en memoria. Sin tildes ni mayúsculas: «camion» encuentra
 * «Camión». Cada palabra buscada tiene que aparecer en algún sitio, y lo que
 * aparece al principio del título va primero. Entre comillas, la frase exacta.
 */
import { categoria } from './categorias'
import { dominioDe } from './webs'
import type { ElementoLista } from './tipos'

function llano(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function trocearConsulta(consulta: string): string[] {
  const trozos: string[] = []
  const re = /"([^"]+)"|(\S+)/g
  for (const m of llano(consulta).matchAll(re)) trozos.push((m[1] ?? m[2]).trim())
  return trozos.filter(Boolean)
}

export function buscar<T extends ElementoLista>(lista: T[], consulta: string): T[] {
  const trozos = trocearConsulta(consulta)
  if (!trozos.length) return lista

  const puntuados: Array<{ e: T; puntos: number }> = []
  for (const e of lista) {
    const titulo = llano(e.titulo)
    const resto = llano(
      [e.subtitulo, ...e.webs.map((w) => `${w} ${dominioDe(w)}`), ...e.etiquetas, categoria(e.categoria).nombre].join('  ')
    )
    let puntos = 0
    let todos = true
    for (const t of trozos) {
      if (titulo.startsWith(t)) puntos += 10
      else if (titulo.split(/\s+/).some((p) => p.startsWith(t))) puntos += 6
      else if (titulo.includes(t)) puntos += 4
      else if (resto.includes(t)) puntos += 2
      else {
        todos = false
        break
      }
    }
    if (todos) puntuados.push({ e, puntos: puntos + Math.min(3, Math.log2(1 + e.usos)) })
  }
  return puntuados.sort((a, b) => b.puntos - a.puntos).map((x) => x.e)
}

/** Lo que propone el acceso rápido antes de escribir nada: favoritos y lo más usado. */
export function sugerencias<T extends ElementoLista>(lista: T[], cuantos = 8): T[] {
  return [...lista]
    .filter((e) => e.estado === 'activo')
    .sort(
      (a, b) =>
        Number(b.favorito) - Number(a.favorito) ||
        b.usos - a.usos ||
        (b.usado ?? '').localeCompare(a.usado ?? '') ||
        a.titulo.localeCompare(b.titulo, 'es')
    )
    .slice(0, cuantos)
}
