/**
 * Piezas pequeñas que salen en varias pantallas: el avatar de un elemento, la
 * contraseña pintada por clases, el medidor de fortaleza, el código de un solo
 * uso con su cuenta atrás y el menú desplegable.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { categoria } from '@shared/categorias'
import { colorDe, dominioDe, inicialDe } from '@shared/webs'
import { trocear } from '@shared/generador'
import { codigoTotp, formatearCodigo, leerTotp, segundosRestantes } from '@shared/totp'
import type { Fortaleza } from '@shared/fortaleza'
import type { CategoriaId } from '@shared/tipos'
import { Icono } from '../lib/iconos'

/* ---------- Avatar ---------- */

/**
 * Un inicio de sesión con web lleva la inicial sobre el color de su dominio;
 * todo lo demás, el icono de su categoría sobre el color de la categoría.
 */
export function Avatar({
  titulo,
  categoria: cat,
  webs,
  tamano = 32
}: {
  titulo: string
  categoria: CategoriaId
  webs: string[]
  tamano?: number
}): ReactNode {
  const dominio = dominioDe(webs[0] ?? '')
  const conInicial = dominio !== '' && (cat === 'login' || cat === 'contrasena' || categoria(cat).webs)
  const fondo = conInicial ? colorDe(dominio) : categoria(cat).color
  return (
    <span
      className="avatar-elemento"
      style={{ width: tamano, height: tamano, background: fondo, fontSize: tamano * 0.44, borderRadius: tamano * 0.28 }}
      aria-hidden
    >
      {conInicial ? inicialDe(titulo || dominio) : <Icono nombre={categoria(cat).icono} size={tamano * 0.55} color="#fff" />}
    </span>
  )
}

/* ---------- La contraseña, por clases ---------- */

/** Letras en la tinta de siempre, cifras del acento y símbolos del segundo color, como en 1Password. */
export function ContrasenaPintada({ valor }: { valor: string }): ReactNode {
  return (
    <span className="pintada">
      {trocear(valor).map((t, i) => (
        <span key={i} className={t.clase === 'letra' ? undefined : t.clase}>
          {t.texto}
        </span>
      ))}
    </span>
  )
}

/* ---------- Fortaleza ---------- */

const TONOS = ['mal', 'mal', 'aviso', 'ok', 'ok'] as const

export function Medidor({ fortaleza, bits }: { fortaleza: Fortaleza; bits?: boolean }): ReactNode {
  return (
    <div className={`medidor tono-${TONOS[fortaleza.nivel]}`}>
      <div className="medidor-barras" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={i <= fortaleza.nivel ? 'llena' : undefined} />
        ))}
      </div>
      <span className="medidor-texto">
        {fortaleza.etiqueta}
        {bits && fortaleza.bits > 0 && <span className="subtle"> · {fortaleza.bits} bits</span>}
      </span>
    </div>
  )
}

/* ---------- Código de un solo uso ---------- */

export function CodigoTotp({ secreto, alCopiar }: { secreto: string; alCopiar?: () => void }): ReactNode {
  const config = leerTotp(secreto)
  const [codigo, setCodigo] = useState('')
  const [quedan, setQuedan] = useState(30)

  useEffect(() => {
    if (!config) return
    let vivo = true
    const tic = (): void => {
      const ahora = Date.now()
      setQuedan(segundosRestantes(config, ahora))
      void codigoTotp(config, ahora).then((c) => vivo && setCodigo(c))
    }
    tic()
    const t = window.setInterval(tic, 1000)
    return () => {
      vivo = false
      window.clearInterval(t)
    }
    // Depende del secreto, que es texto: la configuración que sale de él se
    // rehace en cada pintada y como dependencia reiniciaría el reloj sin parar.
  }, [secreto])

  if (!config) return <span className="field-error">El secreto no es válido</span>
  const vuelta = quedan / config.periodo
  return (
    <button type="button" className="totp" onClick={alCopiar} title="Copiar el código">
      <span className="totp-codigo mono">{formatearCodigo(codigo)}</span>
      <svg className={`totp-reloj${quedan <= 5 ? ' ultimo' : ''}`} viewBox="0 0 20 20" aria-label={`Quedan ${quedan} segundos`}>
        <circle cx="10" cy="10" r="8" className="pista" />
        <circle
          cx="10"
          cy="10"
          r="8"
          className="resto"
          strokeDasharray={`${(2 * Math.PI * 8 * vuelta).toFixed(2)} 100`}
          transform="rotate(-90 10 10)"
        />
      </svg>
      <span className="totp-segundos tabular">{quedan}</span>
    </button>
  )
}

/* ---------- Menú desplegable ---------- */

export interface OpcionMenu {
  etiqueta: string
  icono?: ReactNode
  peligro?: boolean
  atajo?: string
  alPulsar: () => void
  oculto?: boolean
}

/**
 * Un menú que cuelga de su botón. Se pinta en un portal, fijo respecto a la
 * ventana, para que ninguna tarjeta con `overflow: hidden` lo recorte.
 */
export function MenuDesplegable({
  boton,
  opciones,
  titulo = 'Más opciones',
  clase = 'btn ghost icon'
}: {
  boton: ReactNode
  opciones: Array<OpcionMenu | 'separador'>
  titulo?: string
  /** Las clases del botón que lo abre: de fábrica, un icono suelto. */
  clase?: string
}): ReactNode {
  const [abierto, setAbierto] = useState<{ x: number; y: number } | null>(null)
  const ancla = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!abierto) return
    const cerrar = (): void => setAbierto(null)
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        cerrar()
      }
    }
    window.addEventListener('mousedown', cerrar)
    window.addEventListener('keydown', tecla, true)
    window.addEventListener('blur', cerrar)
    return () => {
      window.removeEventListener('mousedown', cerrar)
      window.removeEventListener('keydown', tecla, true)
      window.removeEventListener('blur', cerrar)
    }
  }, [abierto])

  const visibles = opciones.filter((o) => o === 'separador' || !o.oculto)

  return (
    <>
      <button
        ref={ancla}
        type="button"
        className={clase}
        title={titulo}
        aria-label={titulo}
        aria-expanded={abierto != null}
        onClick={() => {
          const r = ancla.current!.getBoundingClientRect()
          // Pegado al canto derecho del botón; si el botón está a la izquierda
          // de la ventana, al izquierdo, para que no se salga por ese lado.
          const x = r.left < 240 ? Math.min(window.innerWidth - 12, r.left + 230) : Math.min(r.right, window.innerWidth - 12)
          setAbierto(abierto ? null : { x, y: r.bottom + 4 })
        }}
      >
        {boton}
      </button>
      {abierto &&
        createPortal(
          <div
            className="menu-flotante"
            role="menu"
            style={{ right: window.innerWidth - abierto.x, top: abierto.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {visibles.map((o, i) =>
              o === 'separador' ? (
                <div key={i} className="menu-separador" />
              ) : (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  className={`menu-opcion${o.peligro ? ' peligro' : ''}`}
                  onClick={() => {
                    setAbierto(null)
                    o.alPulsar()
                  }}
                >
                  {o.icono}
                  <span>{o.etiqueta}</span>
                  {o.atajo && <kbd>{o.atajo}</kbd>}
                </button>
              )
            )}
          </div>,
          document.body
        )}
    </>
  )
}

/* ---------- En grande ---------- */

/** La contraseña a pantalla completa, carácter a carácter, para dictarla o teclearla en otro sitio. */
export function EnGrande({ valor, alCerrar }: { valor: string; alCerrar: () => void }): ReactNode {
  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') alCerrar()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [alCerrar])
  return createPortal(
    <div className="en-grande" onMouseDown={alCerrar} role="dialog" aria-label="Contraseña en grande">
      <div className="en-grande-caja" onMouseDown={(e) => e.stopPropagation()}>
        {[...valor].map((ch, i) => (
          <span key={i} className="en-grande-signo">
            <span className={/\d/.test(ch) ? 'cifra' : /\p{L}/u.test(ch) ? undefined : 'simbolo'}>{ch === ' ' ? '␣' : ch}</span>
            <small>{i + 1}</small>
          </span>
        ))}
      </div>
      <p className="en-grande-pie">Pulsa Esc o en cualquier sitio para cerrar</p>
    </div>,
    document.body
  )
}
