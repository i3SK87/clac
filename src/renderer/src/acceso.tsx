/**
 * El acceso rápido: Ctrl+Mayús+Espacio desde cualquier programa.
 *
 * Buscar, elegir con las flechas y copiar. Intro copia la contraseña y se va,
 * para que el foco vuelva al programa de antes y baste con pegar. Esta ventana
 * no ve nunca un secreto: la lista es de resúmenes y la copia la hace el
 * proceso principal.
 *
 * Bloqueada y con Windows Hello listo, lo pide nada más abrirse: lo acabas de
 * abrir tú, así que estás delante.
 */
import { StrictMode, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Lock, ScanFace, Search } from 'lucide-react'
import { aplicarTemaGuardado, recordarTema, vestir } from 'casa/tema'
import { mensajeDeError } from 'casa/ui'
import type { ElementoLista, EstadoSesion } from '@shared/tipos'
import { Avatar } from './components/piezas'
import 'casa/paletas.css'
import 'casa/base.css'
import './styles.css'

aplicarTemaGuardado('clac')
const api = window.clac

type Que = 'usuario' | 'contrasena' | 'totp'
const NOMBRE: Record<Que, string> = { usuario: 'Usuario copiado', contrasena: 'Contraseña copiada', totp: 'Código copiado' }

function Acceso(): ReactNode {
  const [sesion, setSesion] = useState<EstadoSesion | null>(null)
  const [consulta, setConsulta] = useState('')
  const [resultados, setResultados] = useState<ElementoLista[]>([])
  const [indice, setIndice] = useState(0)
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null)
  const [contrasena, setContrasena] = useState('')
  const [abriendo, setAbriendo] = useState(false)
  const [helloListo, setHelloListo] = useState(false)
  const campo = useRef<HTMLInputElement>(null)
  const pidiendoHello = useRef(false)
  const lista = useRef<HTMLDivElement>(null)

  const cargar = useCallback(async (q: string) => {
    try {
      setResultados(await api.acceso.buscar(q))
      setIndice(0)
    } catch {
      setResultados([])
    }
  }, [])

  const usarHello = useCallback(async () => {
    if (pidiendoHello.current) return
    pidiendoHello.current = true
    setAbriendo(true)
    setMensaje({ texto: 'Confírmalo en Windows…' })
    try {
      await api.sesion.desbloquearHello()
      setMensaje(null)
    } catch (e) {
      const texto = mensajeDeError(e)
      setMensaje(texto === 'Cancelado.' ? null : { texto, error: true })
      setHelloListo((await api.sesion.hello()).listo)
    } finally {
      pidiendoHello.current = false
      setAbriendo(false)
      setTimeout(() => campo.current?.focus(), 0)
    }
  }, [])

  const alMostrar = useCallback(async () => {
    setConsulta('')
    setMensaje(null)
    setContrasena('')
    const estado = await api.sesion.estado()
    setSesion(estado)
    if (estado === 'abierta') await cargar('')
    setTimeout(() => campo.current?.focus(), 0)
    if (estado === 'bloqueada') {
      const listo = (await api.sesion.hello()).listo
      setHelloListo(listo)
      if (listo) void usarHello()
    }
  }, [cargar, usarHello])

  useEffect(() => {
    void alMostrar()
    const quitar = [
      api.en.accesoMostrado(() => void alMostrar()),
      api.en.sesion((estado) => {
        setSesion(estado)
        if (estado === 'abierta') void cargar(consulta)
        else setResultados([])
      }),
      api.en.ajustes((a) => {
        vestir(a.theme, a.palette)
        recordarTema('clac', a.theme, a.palette)
      })
    ]
    return () => quitar.forEach((q) => q())
    // Solo al montar: los avisos se atienden con lo que haya en cada momento.
  }, [])

  useEffect(() => {
    lista.current?.querySelector<HTMLElement>('.elegida')?.scrollIntoView({ block: 'nearest' })
  }, [indice])

  const copiar = async (que: Que, luego: 'ocultar' | 'abrir' = 'ocultar'): Promise<void> => {
    const e = resultados[indice]
    if (!e) return
    try {
      await api.copiar.rapido(e.id, que)
      if (luego === 'abrir' && e.webs[0]) await api.web.abrir(e.webs[0])
      setMensaje({ texto: NOMBRE[que] })
      // Un instante para que se lea, y fuera: el foco vuelve a donde estaba.
      setTimeout(() => void api.acceso.ocultar(), 350)
    } catch (err) {
      setMensaje({ texto: mensajeDeError(err), error: true })
    }
  }

  const tecla = (ev: React.KeyboardEvent<HTMLInputElement>): void => {
    const k = ev.key.toLowerCase()
    if (ev.key === 'Escape') {
      ev.preventDefault()
      if (consulta) {
        setConsulta('')
        void cargar('')
      } else void api.acceso.ocultar()
    } else if (ev.key === 'ArrowDown') {
      ev.preventDefault()
      setIndice((i) => Math.min(resultados.length - 1, i + 1))
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault()
      setIndice((i) => Math.max(0, i - 1))
    } else if (ev.key === 'Enter' && ev.altKey) {
      ev.preventDefault()
      void copiar('contrasena', 'abrir')
    } else if (ev.key === 'Enter') {
      ev.preventDefault()
      void copiar('contrasena')
    } else if (ev.ctrlKey && k === 'c') {
      // Con texto elegido en el buscador, Ctrl+C es copiar ese texto.
      const input = ev.currentTarget
      if (input.selectionStart !== input.selectionEnd) return
      ev.preventDefault()
      void copiar(ev.altKey ? 'totp' : ev.shiftKey ? 'contrasena' : 'usuario')
    } else if (ev.ctrlKey && k === 'o') {
      ev.preventDefault()
      const e = resultados[indice]
      if (e) void api.acceso.abrirEnApp(e.id)
    }
  }

  const desbloquear = async (): Promise<void> => {
    if (!contrasena || abriendo) return
    setAbriendo(true)
    setMensaje(null)
    try {
      await api.sesion.desbloquear(contrasena)
      setContrasena('')
      setTimeout(() => campo.current?.focus(), 0)
    } catch (e) {
      setMensaje({ texto: mensajeDeError(e), error: true })
      setContrasena('')
    } finally {
      setAbriendo(false)
    }
  }

  if (sesion === null) return <div className="acceso" />

  if (sesion !== 'abierta') {
    return (
      <div className="acceso">
        <div className="acceso-bloqueado">
          <Lock size={26} />
          {sesion === 'bloqueada' ? (
            <>
              <p>CLAC está bloqueada</p>
              <input
                ref={campo}
                className="input acceso-input"
                type="password"
                placeholder="Contraseña maestra"
                aria-label="Contraseña maestra"
                value={contrasena}
                disabled={abriendo}
                onChange={(e) => setContrasena(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void desbloquear()
                  if (e.key === 'Escape') void api.acceso.ocultar()
                }}
              />
              {helloListo && (
                <button className="btn" onClick={() => void usarHello()} disabled={abriendo}>
                  <ScanFace size={15} /> Usar Windows Hello
                </button>
              )}
            </>
          ) : (
            <>
              <p>Abre CLAC para terminar de prepararla.</p>
              <button className="btn primary" onClick={() => void api.acceso.abrirPrincipal()}>
                Abrir CLAC
              </button>
            </>
          )}
          {mensaje && <p className={mensaje.error ? 'field-error' : 'small'}>{mensaje.texto}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="acceso">
      <div className="acceso-busqueda">
        <Search size={18} className="subtle" />
        <input
          ref={campo}
          className="acceso-input-limpio"
          placeholder="Buscar en CLAC"
          aria-label="Buscar en CLAC"
          value={consulta}
          spellCheck={false}
          onChange={(e) => {
            setConsulta(e.target.value)
            void cargar(e.target.value)
          }}
          onKeyDown={tecla}
        />
      </div>
      <div className="acceso-rotulo rotulo">{consulta.trim() ? 'Resultados' : 'Lo que más usas'}</div>
      <div className="acceso-lista" ref={lista} role="listbox" aria-label="Resultados">
        {resultados.length === 0 && <p className="acceso-vacio small muted">{consulta ? `Nada se llama «${consulta}».` : 'La caja está vacía.'}</p>}
        {resultados.map((e, i) => (
          <button
            key={e.id}
            role="option"
            aria-selected={i === indice}
            className={`fila-elemento${i === indice ? ' elegida' : ''}`}
            onMouseMove={() => setIndice(i)}
            onClick={() => void copiar('contrasena')}
          >
            <Avatar titulo={e.titulo} categoria={e.categoria} webs={e.webs} />
            <span className="fila-textos">
              <span className="fila-titulo truncate">{e.titulo}</span>
              <span className="fila-sub truncate">{e.subtitulo || ' '}</span>
            </span>
          </button>
        ))}
      </div>
      <div className={`acceso-pie small${mensaje?.error ? ' error' : ''}`}>
        {mensaje ? (
          mensaje.texto
        ) : (
          <>
            <span>
              <kbd>Intro</kbd> contraseña
            </span>
            <span>
              <kbd>Ctrl</kbd>+<kbd>C</kbd> usuario
            </span>
            <span>
              <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> código
            </span>
            <span>
              <kbd>Alt</kbd>+<kbd>Intro</kbd> web
            </span>
            <span>
              <kbd>Ctrl</kbd>+<kbd>O</kbd> abrir
            </span>
          </>
        )}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Acceso />
  </StrictMode>
)
