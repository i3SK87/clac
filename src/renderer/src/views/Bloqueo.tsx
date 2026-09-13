/**
 * La puerta: lo que se ve con la caja fuerte bloqueada.
 *
 * Toda la ventana del color de la barra lateral, que es el único que es oscuro
 * en todas las paletas, con la marca y un solo campo. Si en este equipo falta
 * la clave secreta —se ha traído la carpeta de otro ordenador—, se pide también.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Eye, EyeOff, LockOpen } from 'lucide-react'
import { Field, Modal, mensajeDeError } from 'casa/ui'
import { api } from '../lib/store'
import marca from '../../../../resources/icon.png'

export function Bloqueo({ sinClave }: { sinClave: boolean }): ReactNode {
  const [contrasena, setContrasena] = useState('')
  const [clave, setClave] = useState('')
  const [ver, setVer] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [olvido, setOlvido] = useState(false)
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    campo.current?.focus()
    // Al volver a la ventana, el cursor tiene que estar ya en el campo.
    const alVolver = (): void => campo.current?.focus()
    window.addEventListener('focus', alVolver)
    return () => window.removeEventListener('focus', alVolver)
  }, [])

  const abrir = async (): Promise<void> => {
    if (!contrasena || ocupado) return
    setOcupado(true)
    setError(null)
    try {
      await api.sesion.desbloquear(contrasena, sinClave ? clave : undefined)
      // El estado nuevo llega por el aviso de sesión; aquí no hay nada más que hacer.
    } catch (e) {
      setError(mensajeDeError(e))
      setOcupado(false)
      setContrasena('')
      campo.current?.focus()
    }
  }

  return (
    <div className="puerta">
      <form
        className="puerta-caja"
        onSubmit={(e) => {
          e.preventDefault()
          void abrir()
        }}
      >
        <img src={marca} alt="" className="puerta-marca" width={72} height={72} />
        <h1>CLAC</h1>
        <p className="puerta-sub">{sinClave ? 'Falta la clave secreta de este equipo' : 'La caja fuerte está bloqueada'}</p>

        {sinClave && (
          <Field label="Clave secreta" hint="Está en tu kit de emergencia. Empieza por C1." htmlFor="puerta-clave">
            <input
              id="puerta-clave"
              className="input mono puerta-input"
              value={clave}
              spellCheck={false}
              autoComplete="off"
              placeholder="C1-XXXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXXX"
              onChange={(e) => setClave(e.target.value.toUpperCase())}
            />
          </Field>
        )}

        <div className="puerta-campo">
          <input
            id="puerta-contrasena"
            ref={campo}
            className={`input puerta-input${error ? ' invalid' : ''}`}
            type={ver ? 'text' : 'password'}
            placeholder="Contraseña maestra"
            aria-label="Contraseña maestra"
            autoComplete="current-password"
            value={contrasena}
            disabled={ocupado}
            onChange={(e) => setContrasena(e.target.value)}
          />
          <button
            type="button"
            className="btn ghost icon puerta-ojo"
            onClick={() => setVer(!ver)}
            aria-label={ver ? 'Ocultar' : 'Mostrar'}
            title={ver ? 'Ocultar' : 'Mostrar'}
          >
            {ver ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {error && <p className="puerta-error">{error}</p>}

        <button className="btn primary puerta-boton" type="submit" disabled={!contrasena || ocupado || (sinClave && !clave)}>
          <LockOpen size={16} /> {ocupado ? 'Abriendo…' : 'Desbloquear'}
        </button>
        <button type="button" className="link puerta-olvido" onClick={() => setOlvido(true)}>
          ¿Has olvidado la contraseña?
        </button>
      </form>

      {olvido && (
        <Modal title="Si has olvidado la contraseña" onClose={() => setOlvido(false)} sobre>
          <p className="small">
            No hay forma de recuperarla, y es a propósito: si CLAC pudiera abrir la caja sin tu contraseña, también podría
            hacerlo quien te la robara.
          </p>
          <p className="small muted">
            Lo que sí puedes hacer es probar con calma: las mayúsculas cuentan, y los espacios del principio y del final no.
            Si la apuntaste en el kit de emergencia, está en el hueco de «Contraseña maestra».
          </p>
        </Modal>
      )}
    </div>
  )
}
