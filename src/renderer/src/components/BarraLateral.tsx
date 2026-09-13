/**
 * La barra lateral de la casa, con lo de una caja fuerte: todo, Watchtower y
 * el generador arriba; las categorías, cajas fuertes y etiquetas que de verdad
 * tienen algo, en medio; el archivo y la papelera, abajo.
 *
 * Las cajas fuertes tienen clic derecho: editarla o eliminarla.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Archive, Layers, Lock, Pencil, Plus, Settings, ShieldAlert, Tag, Trash2, WandSparkles } from 'lucide-react'
import { Confirm, useAvisos } from 'casa/ui'
import { MenuContextual, useMenu } from 'casa/menu'
import { CATEGORIAS } from '@shared/categorias'
import { Icono } from '../lib/iconos'
import { api, useStore, type Vista } from '../lib/store'
import { FormularioBoveda } from './FormularioBoveda'
import { AvisoVersion } from './Actualizacion'
import type { Boveda } from '@shared/tipos'
import marca from '../../../../resources/icon.png'

function mismaVista(a: Vista, b: Vista): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

interface PropsItem {
  destino: Vista
  icono: ReactNode
  etiqueta: string
  numero?: number
  aviso?: boolean
  extra?: ReactNode
  alMenu?: (evento: React.MouseEvent) => void
  marcada?: boolean
}

export function BarraLateral(): ReactNode {
  const { elementos, bovedas, vista, irA, revision, run } = useStore()
  const [problemas, setProblemas] = useState(0)
  const [editandoBoveda, setEditandoBoveda] = useState<Boveda | 'nueva' | null>(null)
  const [borrandoBoveda, setBorrandoBoveda] = useState<Boveda | null>(null)
  const { menu, abrir: abrirMenu, cerrar: cerrarMenu } = useMenu<Boveda>()
  const { toast } = useAvisos()

  // El número de Watchtower se recalcula con cada cambio: es barato y es lo que
  // hace que el aviso no se quede puesto después de cambiar la contraseña.
  useEffect(() => {
    let vivo = true
    void api.watchtower
      .informe()
      .then((inf) => vivo && setProblemas(inf.conProblemas))
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [revision])

  const activos = useMemo(() => elementos.filter((e) => e.estado === 'activo'), [elementos])
  const cuenta = useMemo(() => {
    const porCategoria = new Map<string, number>()
    const porBoveda = new Map<string, number>()
    const porEtiqueta = new Map<string, number>()
    for (const e of activos) {
      porCategoria.set(e.categoria, (porCategoria.get(e.categoria) ?? 0) + 1)
      porBoveda.set(e.bovedaId, (porBoveda.get(e.bovedaId) ?? 0) + 1)
      for (const t of e.etiquetas) porEtiqueta.set(t, (porEtiqueta.get(t) ?? 0) + 1)
    }
    return { porCategoria, porBoveda, porEtiqueta }
  }, [activos])

  const archivados = elementos.filter((e) => e.estado === 'archivado').length
  const eliminados = elementos.filter((e) => e.estado === 'eliminado').length
  const etiquetas = [...cuenta.porEtiqueta.keys()].sort((a, b) => a.localeCompare(b, 'es'))

  // Una función y no un componente: definido aquí dentro, React lo tomaría por
  // uno nuevo en cada pintada y desmontaría los botones, foco incluido.
  const item = (clave: string, { destino, icono, etiqueta, numero, aviso, extra, alMenu, marcada }: PropsItem): ReactNode => (
    <div className="nav-fila" key={clave}>
      <button
        className={`nav-item${mismaVista(vista, destino) ? ' active' : ''}${marcada ? ' marcada' : ''}`}
        onClick={() => irA(destino)}
        onContextMenu={alMenu}
        title={etiqueta}
      >
        {icono}
        <span className="nav-label">{etiqueta}</span>
        {numero != null && numero > 0 && <span className={`count${aviso ? ' aviso' : ''}`}>{numero}</span>}
      </button>
      {extra}
    </div>
  )

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img className="mark" src={marca} alt="" width={28} height={28} />
        CLAC
      </div>

      {/* «Todo» y no «Todos los elementos»: con el número al lado no cabía entero. */}
      {item('todos', { destino: { tipo: 'todos' }, icono: <Layers size={17} />, etiqueta: 'Todo', numero: activos.length })}
      {item('watchtower', {
        destino: { tipo: 'watchtower' },
        icono: <ShieldAlert size={17} />,
        etiqueta: 'Watchtower',
        numero: problemas,
        aviso: true
      })}
      {item('generador', { destino: { tipo: 'generador' }, icono: <WandSparkles size={17} />, etiqueta: 'Generador' })}

      {cuenta.porCategoria.size > 0 && <div className="sidebar-section">Categorías</div>}
      {CATEGORIAS.filter((c) => cuenta.porCategoria.has(c.id)).map((c) =>
        item(`cat-${c.id}`, {
          destino: { tipo: 'categoria', id: c.id },
          icono: <Icono nombre={c.icono} size={17} />,
          etiqueta: c.plural,
          numero: cuenta.porCategoria.get(c.id)
        })
      )}

      <div className="sidebar-section con-boton">
        <span>Cajas fuertes</span>
        <button className="sidebar-mas" onClick={() => setEditandoBoveda('nueva')} title="Nueva caja fuerte" aria-label="Nueva caja fuerte">
          <Plus size={14} />
        </button>
      </div>
      {bovedas.map((b) =>
        item(`bov-${b.id}`, {
          destino: { tipo: 'boveda', id: b.id },
          icono: <Icono nombre={b.icono} size={17} color={b.color} />,
          etiqueta: b.nombre,
          numero: cuenta.porBoveda.get(b.id),
          alMenu: abrirMenu(b),
          marcada: menu?.de.id === b.id,
          extra: (
            <button
              className="nav-editar solo-ancha"
              onClick={() => setEditandoBoveda(b)}
              title={`Editar «${b.nombre}»`}
              aria-label={`Editar «${b.nombre}»`}
            >
              <Pencil size={13} />
            </button>
          )
        })
      )}

      {etiquetas.length > 0 && <div className="sidebar-section">Etiquetas</div>}
      {etiquetas.map((t) =>
        item(`tag-${t}`, {
          destino: { tipo: 'etiqueta', nombre: t },
          icono: <Tag size={16} />,
          etiqueta: t,
          numero: cuenta.porEtiqueta.get(t)
        })
      )}

      <div className="sidebar-section" />
      {item('archivo', { destino: { tipo: 'archivo' }, icono: <Archive size={17} />, etiqueta: 'Archivo', numero: archivados })}
      {item('papelera', { destino: { tipo: 'papelera' }, icono: <Trash2 size={17} />, etiqueta: 'Papelera', numero: eliminados })}

      <div className="sidebar-footer">
        {item('ajustes', { destino: { tipo: 'ajustes' }, icono: <Settings size={17} />, etiqueta: 'Ajustes' })}
        {/* Bajo Ajustes, como en BONK: a la vista, sin tapar nada ni ser urgente. */}
        <AvisoVersion />
        <button className="nav-item" onClick={() => void run(() => api.sesion.bloquear())} title="Bloquear (Ctrl+Mayús+L)">
          <Lock size={17} />
          <span className="nav-label">Bloquear</span>
          <kbd className="solo-ancha nav-kbd">Ctrl+Mayús+L</kbd>
        </button>
      </div>

      {menu && (
        <MenuContextual
          x={menu.x}
          y={menu.y}
          onCerrar={cerrarMenu}
          opciones={[
            { etiqueta: 'Editar…', icono: Pencil, onElegir: () => setEditandoBoveda(menu.de) },
            { etiqueta: 'Nueva caja fuerte…', icono: Plus, onElegir: () => setEditandoBoveda('nueva') },
            ...(bovedas.length > 1
              ? [{ etiqueta: 'Eliminar…', icono: Trash2, peligrosa: true, onElegir: () => setBorrandoBoveda(menu.de) }]
              : [])
          ]}
        />
      )}
      {borrandoBoveda && (() => {
        // Cuenta todo, también lo archivado y la papelera: eso tampoco deja borrarla.
        const contiene = elementos.filter((e) => e.bovedaId === borrandoBoveda.id).length
        return (
          <Confirm
            title={`Eliminar «${borrandoBoveda.nombre}»`}
            message={
              contiene
                ? `Tiene ${contiene} ${contiene === 1 ? 'elemento' : 'elementos'}, contando el archivo y la papelera. Muévelos a otra caja fuerte antes de eliminarla.`
                : 'La caja fuerte está vacía y se eliminará.'
            }
            confirmLabel={contiene ? 'Entendido' : 'Eliminar'}
            destructive={!contiene}
            onCancel={() => setBorrandoBoveda(null)}
            onConfirm={() => {
              const b = borrandoBoveda
              setBorrandoBoveda(null)
              if (contiene) return
              void run(() => api.bovedas.eliminar(b.id).then(() => true)).then((ok) => {
                if (!ok) return
                toast('Caja fuerte eliminada')
                if (vista.tipo === 'boveda' && vista.id === b.id) irA({ tipo: 'todos' })
              })
            }}
          />
        )
      })()}
      {editandoBoveda && (
        <FormularioBoveda
          boveda={editandoBoveda === 'nueva' ? null : editandoBoveda}
          alCerrar={() => setEditandoBoveda(null)}
          alBorrar={() => {
            setEditandoBoveda(null)
            irA({ tipo: 'todos' })
          }}
        />
      )}
    </aside>
  )
}
