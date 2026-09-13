/**
 * Volver a pedir la contraseña maestra antes de algo delicado: exportar sin
 * cifrar, ver la clave secreta o guardar el kit de emergencia. Con la caja
 * abierta cualquiera que pase por delante podría hacerlo; así, no.
 */
import { useState, type ReactNode } from 'react'
import { Field, Modal, mensajeDeError } from 'casa/ui'

export function PedirContrasena({
  titulo,
  explicacion,
  boton,
  peligro,
  alConfirmar,
  alCerrar
}: {
  titulo: string
  explicacion: ReactNode
  boton: string
  peligro?: boolean
  /** Recibe la contraseña; si lanza, el error se enseña en el propio cuadro. */
  alConfirmar: (contrasena: string) => Promise<void>
  alCerrar: () => void
}): ReactNode {
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const enviar = async (): Promise<void> => {
    if (!contrasena || ocupado) return
    setOcupado(true)
    setError(null)
    try {
      await alConfirmar(contrasena)
    } catch (e) {
      setError(mensajeDeError(e))
      setOcupado(false)
    }
  }

  return (
    <Modal
      title={titulo}
      onClose={alCerrar}
      sobre
      footer={
        <>
          <button className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button className={`btn ${peligro ? 'danger' : 'primary'}`} disabled={!contrasena || ocupado} onClick={() => void enviar()}>
            {ocupado ? 'Comprobando…' : boton}
          </button>
        </>
      }
    >
      <div className="small muted">{explicacion}</div>
      <Field label="Contraseña maestra" error={error} htmlFor="pedir-contrasena">
        <input
          id="pedir-contrasena"
          className={`input${error ? ' invalid' : ''}`}
          type="password"
          autoFocus
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void enviar()}
        />
      </Field>
    </Modal>
  )
}
