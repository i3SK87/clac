import { buscar } from '@shared/buscar'
import { categoria } from '@shared/categorias'
import type { Boveda, ElementoLista, OrdenLista } from '@shared/tipos'
import type { Vista } from './store'

export function deLaVista(elementos: ElementoLista[], vista: Vista): ElementoLista[] {
  switch (vista.tipo) {
    case 'categoria':
      return elementos.filter((e) => e.estado === 'activo' && e.categoria === vista.id)
    case 'boveda':
      return elementos.filter((e) => e.estado === 'activo' && e.bovedaId === vista.id)
    case 'etiqueta':
      return elementos.filter((e) => e.estado === 'activo' && e.etiquetas.includes(vista.nombre))
    case 'archivo':
      return elementos.filter((e) => e.estado === 'archivado')
    case 'papelera':
      return elementos.filter((e) => e.estado === 'eliminado')
    default:
      return elementos.filter((e) => e.estado === 'activo')
  }
}

export function ordenar(lista: ElementoLista[], orden: OrdenLista): ElementoLista[] {
  const copia = [...lista]
  if (orden === 'modificado') return copia.sort((a, b) => b.modificado.localeCompare(a.modificado))
  if (orden === 'usado') {
    return copia.sort((a, b) => b.usos - a.usos || (b.usado ?? '').localeCompare(a.usado ?? '') || a.titulo.localeCompare(b.titulo, 'es'))
  }
  return copia.sort((a, b) => a.titulo.localeCompare(b.titulo, 'es', { sensitivity: 'base' }))
}

/** Lo que se ve en la lista: la vista, la búsqueda y el orden, por ese orden. */
export function visibles(elementos: ElementoLista[], vista: Vista, consulta: string, orden: OrdenLista): ElementoLista[] {
  const deAqui = deLaVista(elementos, vista)
  // Buscando, manda la relevancia; sin buscar, el orden elegido.
  return consulta.trim() ? buscar(deAqui, consulta) : ordenar(deAqui, orden)
}

export function tituloDeVista(vista: Vista, bovedas: Boveda[]): string {
  switch (vista.tipo) {
    case 'todos':
      return 'Todos los elementos'
    case 'categoria':
      return categoria(vista.id).plural
    case 'boveda':
      return bovedas.find((b) => b.id === vista.id)?.nombre ?? 'Caja fuerte'
    case 'etiqueta':
      return vista.nombre
    case 'archivo':
      return 'Archivo'
    case 'papelera':
      return 'Papelera'
    case 'watchtower':
      return 'Watchtower'
    case 'generador':
      return 'Generador'
    case 'ajustes':
      return 'Ajustes'
  }
}
