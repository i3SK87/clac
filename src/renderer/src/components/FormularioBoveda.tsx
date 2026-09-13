import { useState, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { Confirm, Field, Modal, useAvisos } from 'casa/ui'
import { COLORES_BOVEDA, ICONOS_BOVEDA } from '@shared/categorias'
import { Icono } from '../lib/iconos'
import { api, useStore } from '../lib/store'
import type { Boveda } from '@shared/tipos'

/** Crear o editar una caja fuerte: nombre, descripción, icono y color. */
export function FormularioBoveda({
  boveda,
  alCerrar,
  alBorrar
}: {
  boveda: Boveda | null
  alCerrar: () => void
  alBorrar: () => void
}): ReactNode {
  const { toast } = useAvisos()
  const { run, elementos, bovedas } = useStore()
  const [nombre, setNombre] = useState(boveda?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(boveda?.descripcion ?? '')
  const [icono, setIcono] = useState(boveda?.icono ?? 'vault')
  const [color, setColor] = useState(boveda?.color ?? COLORES_BOVEDA[(bovedas.length + 1) % COLORES_BOVEDA.length])
  const [borrando, setBorrando] = useState(false)
  const contiene = boveda ? elementos.filter((e) => e.bovedaId === boveda.id).length : 0

  const guardar = async (): Promise<void> => {
    const hecho = await run(() => api.bovedas.guardar({ id: boveda?.id, nombre, descripcion, icono, color }))
    if (hecho) {
      toast(boveda ? 'Caja fuerte guardada' : `Caja fuerte «${hecho.nombre}» creada`)
      alCerrar()
    }
  }

  return (
    <Modal
      title={boveda ? 'Editar caja fuerte' : 'Nueva caja fuerte'}
      onClose={alCerrar}
      footer={
        <>
          {boveda && bovedas.length > 1 && (
            <button className="btn ghost danger" onClick={() => setBorrando(true)}>
              <Trash2 size={15} /> Borrar
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button className="btn primary" disabled={!nombre.trim()} onClick={() => void guardar()}>
            Guardar
          </button>
        </>
      }
    >
      <Field label="Nombre" required htmlFor="boveda-nombre">
        <input
          id="boveda-nombre"
          className="input"
          value={nombre}
          autoFocus
          placeholder="Personal, Trabajo, Familia…"
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && nombre.trim() && void guardar()}
        />
      </Field>
      <Field label="Descripción" htmlFor="boveda-desc">
        <input id="boveda-desc" className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </Field>
      <Field label="Icono">
        <div className="rejilla-iconos">
          {ICONOS_BOVEDA.map((i) => (
            <button
              key={i}
              type="button"
              className={i === icono ? 'active' : undefined}
              onClick={() => setIcono(i)}
              aria-label={i}
              aria-pressed={i === icono}
            >
              <Icono nombre={i} size={19} color={i === icono ? color : undefined} />
            </button>
          ))}
        </div>
      </Field>
      <Field label="Color">
        <div className="fila-colores">
          {COLORES_BOVEDA.map((c) => (
            <button
              key={c}
              type="button"
              className={`muestra${c === color ? ' active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              aria-pressed={c === color}
            />
          ))}
        </div>
      </Field>

      {borrando && boveda && (
        <Confirm
          title={`Borrar «${boveda.nombre}»`}
          message={
            contiene
              ? `Tiene ${contiene} ${contiene === 1 ? 'elemento' : 'elementos'}. Muévelos a otra caja fuerte antes de borrarla.`
              : 'La caja fuerte está vacía y se borrará.'
          }
          confirmLabel={contiene ? 'Entendido' : 'Borrar'}
          destructive={!contiene}
          onCancel={() => setBorrando(false)}
          onConfirm={async () => {
            if (contiene) return setBorrando(false)
            const ok = await run(() => api.bovedas.eliminar(boveda.id).then(() => true))
            setBorrando(false)
            if (ok) {
              toast('Caja fuerte borrada')
              alBorrar()
            }
          }}
        />
      )}
    </Modal>
  )
}
