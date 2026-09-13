/**
 * La lista de elementos, a la izquierda del detalle.
 *
 * Ordenada por título lleva los rótulos de cada letra pegados arriba mientras
 * se baja, como la agenda del teléfono; por fecha o por uso, no, que ahí la
 * inicial no dice nada.
 *
 * Cada fila tiene clic derecho; el menú lo pone quien la usa, que es quien
 * sabe qué se puede hacer en esa vista.
 */
import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react'
import { ArrowUpDown } from 'lucide-react'
import { inicialDe } from '@shared/webs'
import { haceCuanto } from '@shared/fechas'
import type { ElementoLista, OrdenLista } from '@shared/tipos'
import { Avatar, MenuDesplegable } from './piezas'

const NOMBRE_ORDEN: Record<OrdenLista, string> = {
  titulo: 'Por título',
  modificado: 'Por fecha de modificación',
  usado: 'Por uso'
}

export function Lista({
  elementos,
  seleccion,
  orden,
  buscando,
  vacia,
  alSeleccionar,
  alOrdenar,
  alMenu,
  conMenu,
  papelera
}: {
  elementos: ElementoLista[]
  seleccion: string | null
  orden: OrdenLista
  buscando: boolean
  vacia: ReactNode
  alSeleccionar: (id: string) => void
  alOrdenar: (o: OrdenLista) => void
  /** El clic derecho sobre una fila. */
  alMenu?: (e: ElementoLista) => (evento: MouseEvent) => void
  /** La fila sobre la que está abierto el menú, marcada mientras tanto. */
  conMenu?: string | null
  papelera?: boolean
}): ReactNode {
  const contenedor = useRef<HTMLDivElement>(null)

  // La fila elegida con el teclado se mantiene a la vista.
  useEffect(() => {
    if (!seleccion) return
    contenedor.current?.querySelector<HTMLElement>(`[data-id="${seleccion}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [seleccion])

  const conLetras = orden === 'titulo' && !buscando
  let letraAnterior = ''

  return (
    <div className="lista">
      <div className="lista-cabecera">
        <span className="small muted tabular">
          {elementos.length} {elementos.length === 1 ? 'elemento' : 'elementos'}
        </span>
        <span className="spacer" />
        {!buscando && (
          <MenuDesplegable
            titulo={`Orden: ${NOMBRE_ORDEN[orden].toLowerCase()}`}
            boton={<ArrowUpDown size={15} />}
            opciones={(Object.keys(NOMBRE_ORDEN) as OrdenLista[]).map((o) => ({
              etiqueta: `${o === orden ? '✓ ' : ''}${NOMBRE_ORDEN[o]}`,
              alPulsar: () => alOrdenar(o)
            }))}
          />
        )}
      </div>
      <div className="lista-filas" ref={contenedor} role="listbox" aria-label="Elementos">
        {elementos.length === 0 && vacia}
        {elementos.map((e) => {
          const letra = inicialDe(e.titulo)
          const cabecera = conLetras && letra !== letraAnterior
          letraAnterior = letra
          return (
            <div key={e.id} role="presentation">
              {cabecera && <div className="lista-letra">{/\d/.test(letra) ? '0–9' : letra}</div>}
              <button
                type="button"
                role="option"
                aria-selected={e.id === seleccion}
                data-id={e.id}
                className={`fila-elemento${e.id === seleccion ? ' elegida' : ''}${e.id === conMenu ? ' marcada' : ''}`}
                onClick={() => alSeleccionar(e.id)}
                onContextMenu={alMenu?.(e)}
              >
                <Avatar titulo={e.titulo} categoria={e.categoria} webs={e.webs} />
                <span className="fila-textos">
                  <span className="fila-titulo truncate">{e.titulo}</span>
                  <span className="fila-sub truncate">
                    {papelera && e.eliminadoEn ? `Borrado ${haceCuanto(e.eliminadoEn)}` : e.subtitulo || ' '}
                  </span>
                </span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
