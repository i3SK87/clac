/**
 * Copiar y, al rato, borrar.
 *
 * Lo copiado se va del portapapeles pasados los segundos de Ajustes (90 de
 * fábrica, como en 1Password), pero solo si sigue ahí lo mismo: si entretanto
 * has copiado otra cosa, esa no se toca.
 */
import { clipboard } from 'electron'
import { copiarSinHistorial } from './ayudante'
import type { ResultadoCopia } from '@shared/tipos'

let temporizador: NodeJS.Timeout | null = null
let loCopiado: string | null = null

export async function copiar(texto: string, segundos: number): Promise<ResultadoCopia> {
  const bien = await copiarSinHistorial(texto)
  // Si el ayudante no responde, se copia igual: no poder copiar es peor que
  // dejar una entrada en el historial de Win+V.
  if (!bien) clipboard.writeText(texto)

  loCopiado = texto
  if (temporizador) clearTimeout(temporizador)
  temporizador = null
  if (segundos > 0) {
    temporizador = setTimeout(vaciarSiEsNuestro, segundos * 1000)
  }
  return { segundos }
}

export function vaciarSiEsNuestro(): void {
  if (temporizador) clearTimeout(temporizador)
  temporizador = null
  if (loCopiado != null && clipboard.readText() === loCopiado) clipboard.clear()
  loCopiado = null
}
