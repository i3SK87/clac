/**
 * Las versiones nuevas en la ventana, como en BONK.
 *
 * Quien descarga es el proceso principal; aquí solo se copia su estado. Se
 * pregunta al montar y se escucha después, que entrando tarde en Ajustes el
 * primer aviso ya habría pasado.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { Confirm } from 'casa/ui'
import { api, useStore } from '../lib/store'
import type { EstadoActualizacion } from '@shared/tipos'

const PARADA: EstadoActualizacion = { fase: 'ociosa', version: null, porcentaje: 0, comprobadaEn: null, mensaje: null }

export function useActualizacion(): EstadoActualizacion {
  const [estado, setEstado] = useState<EstadoActualizacion>(PARADA)
  useEffect(() => {
    // Si falla, se queda parada: no saber si hay versión nueva no merece un aviso.
    api.actualizacion.estado().then(setEstado).catch(() => undefined)
    return api.en.actualizacion(setEstado)
  }, [])
  return estado
}

/** Hay algo que enseñar: una esperando, bajándose o ya lista. */
export function hayNovedad(e: EstadoActualizacion): boolean {
  return e.fase === 'disponible' || e.fase === 'descargando' || e.fase === 'lista'
}

/**
 * El aviso de la barra lateral, bajo Ajustes: a la vista sin tapar nada.
 * Pulsado, la baja; bajada, pregunta por el reinicio sin esperar a otro clic
 * —es el final de la misma acción—, y si se dice que no, se queda como
 * «Reiniciar para actualizar».
 */
export function AvisoVersion(): ReactNode {
  const { run } = useStore()
  const e = useActualizacion()
  const [reiniciando, setReiniciando] = useState(false)
  const [yaPreguntado, setYaPreguntado] = useState(false)

  useEffect(() => {
    if (e.fase !== 'lista' || yaPreguntado) return
    setYaPreguntado(true)
    setReiniciando(true)
  }, [e.fase, yaPreguntado])

  return (
    <>
      {hayNovedad(e) && (
        <button
          className={`aviso-version${e.fase === 'lista' ? ' lista' : ''}`}
          disabled={e.fase === 'descargando'}
          onClick={() => {
            if (e.fase === 'disponible') void run(() => api.actualizacion.descargar())
            else if (e.fase === 'lista') setReiniciando(true)
          }}
          title={
            e.fase === 'disponible'
              ? `Está la versión ${e.version}. Pulsa para traértela.`
              : e.fase === 'descargando'
                ? `Descargando la versión ${e.version}: ${e.porcentaje} %`
                : `La versión ${e.version} ya está descargada. Se instala al reiniciar.`
          }
        >
          {e.fase === 'lista' ? <RefreshCw size={14} /> : <Download size={14} />}
          <span className="truncate">
            {e.fase === 'disponible'
              ? 'Actualización disponible'
              : e.fase === 'descargando'
                ? `Descargando… ${e.porcentaje} %`
                : 'Reiniciar para actualizar'}
          </span>
          {e.fase === 'descargando' && <span className="llenado" style={{ width: `${e.porcentaje}%` }} />}
        </button>
      )}
      {reiniciando && <ConfirmarReinicio version={e.version} alCerrar={() => setReiniciando(false)} />}
    </>
  )
}

/** Se pregunta antes porque cierra CLAC en el acto. */
export function ConfirmarReinicio({ version, alCerrar }: { version: string | null; alCerrar: () => void }): ReactNode {
  const { run } = useStore()
  return (
    <Confirm
      title="Reiniciar para actualizar"
      message={`CLAC se cerrará y volverá a abrirse en la versión ${version}. Tu caja fuerte no se toca: al volver, la desbloqueas como siempre.`}
      confirmLabel="Reiniciar"
      onCancel={alCerrar}
      onConfirm={async () => {
        const hecho = await run(() => api.actualizacion.instalar())
        if (!hecho) alCerrar()
      }}
    />
  )
}

/** Lo que se dice en Ajustes ▸ Acerca de. */
export function contarActualizacion(e: EstadoActualizacion): string {
  switch (e.fase) {
    case 'buscando':
      return 'Mirando si hay una versión nueva…'
    case 'disponible':
      return `Está la versión ${e.version}. Se descarga cuando tú digas.`
    case 'descargando':
      return `Descargando la versión ${e.version}: ${e.porcentaje} %.`
    case 'lista':
      return `La versión ${e.version} ya está descargada. Se instala al reiniciar.`
    case 'error':
      return e.mensaje ?? 'No se pudo comprobar si hay versiones nuevas.'
    default:
      return e.comprobadaEn
        ? `Estás en la última versión. Comprobado a las ${new Date(e.comprobadaEn).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.`
        : 'Todavía no se ha mirado desde que se abrió CLAC.'
  }
}
