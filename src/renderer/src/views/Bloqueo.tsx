/**
 * La puerta: lo que se ve con la caja fuerte bloqueada.
 *
 * Toda la ventana del color de la barra lateral, que es el único que es oscuro
 * en todas las paletas, con la marca y un solo campo. Si en este equipo falta
 * la clave secreta —se ha traído la carpeta de otro ordenador—, se pide también.
 *
 * Con Windows Hello activado y la clave guardada, sale además su botón, y se
 * pide solo al volver a la ventana. Solo al volver: si CLAC se ha bloqueado
 * con la ventana delante es porque te has ido, y un diálogo saltando en ese
 * momento sería para nadie.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Eye, EyeOff, LockOpen, ScanFace } from 'lucide-react'
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
  const [hello, setHello] = useState<{ activo: boolean; listo: boolean }>({ activo: false, listo: false })
  const [conHello, setConHello] = useState(false)
  const campo = useRef<HTMLInputElement>(null)
  const pidiendo = useRef(false)
  /** Cuándo acabó el último intento: el foco que vuelve al cerrarse el diálogo no es «volver». */
  const acabo = useRef(0)

  const usarHello = async (): Promise<void> => {
    if (pidiendo.current) return
    pidiendo.current = true
    setConHello(true)
    setError(null)
    try {
      await api.sesion.desbloquearHello()
    } catch (e) {
      const texto = mensajeDeError(e)
      if (texto !== 'Cancelado.') setError(texto)
      setHello(await api.sesion.hello())
      campo.current?.focus()
    } finally {
      pidiendo.current = false
      acabo.current = Date.now()
      setConHello(false)
    }
  }

  useEffect(() => {
    let vivo = true
    campo.current?.focus()
    void api.sesion.hello().then((h) => vivo && setHello(h))
    // Al volver a la ventana, el cursor tiene que estar ya en el campo; y si se
    // puede con Hello, se pide.
    const alVolver = (): void => {
      campo.current?.focus()
      void api.sesion.hello().then((h) => {
        if (!vivo) return
        setHello(h)
        // Si lo acabas de cancelar, el foco vuelve aquí: pedirlo otra vez sería un bucle.
        if (h.listo && !sinClave && Date.now() - acabo.current > 3000) void usarHello()
      })
    }
    window.addEventListener('focus', alVolver)
    return () => {
      vivo = false
      window.removeEventListener('focus', alVolver)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        {hello.listo && !sinClave && (
          <button type="button" className="btn puerta-boton puerta-hello" onClick={() => void usarHello()} disabled={conHello || ocupado}>
            <ScanFace size={16} /> {conHello ? 'Confírmalo en Windows…' : 'Usar Windows Hello'}
          </button>
        )}
        {hello.activo && !hello.listo && !sinClave && (
          <p className="puerta-nota">
            Windows Hello vuelve a funcionar en cuanto entres con la contraseña maestra. Hace falta al abrir CLAC y cada
            catorce días.
          </p>
        )}
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
