/**
 * El aviso de las llaves de acceso, dentro de la página.
 *
 * Corre en el mundo aparte de la extensión, donde los guiones de la web no
 * llegan, y hace tres cosas: pregunta a CLAC qué llaves tiene de esta web,
 * dibuja el aviso para que elijas, y devuelve al mundo de la página lo que CLAC
 * haya firmado. La contraseña maestra no se pide nunca aquí: para eso está el
 * candado de la barra, que la web no puede imitar.
 *
 * El aviso se dibuja dentro de un «shadow root» cerrado: la web no puede leer
 * lo que pone ni tocar los botones, y solo se hace caso a las pulsaciones de
 * verdad (`isTrusted`), no a las que se inventa un guion.
 */
import { PETICION, RESPUESTA, avisar, type PeticionPagina, type RespuestaFondo, type ResultadoPagina } from './llave-comun'
import { h, icono, type Hijo } from './dibujar'
import { dominioDe } from '@shared/webs'
import type { EstadoLlaves, LlaveNavegador, RespuestaCrearLlave, RespuestaFirmarLlave } from '@shared/navegador'

/** El icono de CLAC, metido al compilar: en la página no se puede pedir un archivo de la extensión. */
declare const __ICONO_CLAC__: string

// Repartido por cada rama de la unión: si no, se quedaría en lo común a todas.
type Sin<T> = T extends unknown ? Omit<T, 'id'> : never
type Eleccion = Sin<ResultadoPagina>

class FalloClac extends Error {
  constructor(
    mensaje: string,
    public nombre?: string
  ) {
    super(mensaje)
  }
}

/* ---------- Hablar con CLAC, por el service worker ---------- */

function pedir<T>(mensaje: Record<string, unknown>): Promise<T> {
  return new Promise((resolver, rechazar) => {
    chrome.runtime.sendMessage(mensaje, (r: RespuestaFondo | undefined) => {
      if (chrome.runtime.lastError || !r) return rechazar(new FalloClac(chrome.runtime.lastError?.message ?? 'CLAC no contesta.'))
      if (!r.ok) return rechazar(new FalloClac(r.error ?? 'Algo ha fallado.', r.nombreError))
      resolver(r.datos as T)
    })
  })
}

let hoja: string | null = null

async function estilos(): Promise<string> {
  if (hoja === null) hoja = await pedir<string>({ tipo: 'estilos' }).catch(() => '')
  return hoja
}

/* ---------- El aviso ---------- */

interface Aviso {
  caja: HTMLElement
  cerrar: () => void
}

function abrirAviso(css: string, estado: EstadoLlaves): Aviso {
  const anfitrion = document.createElement('clac-llaves')
  anfitrion.style.cssText = 'all: initial; position: fixed; top: 14px; right: 14px; z-index: 2147483647; display: block;'
  const sombra = anfitrion.attachShadow({ mode: 'closed' })
  const caja = h('div', {
    className: 'aviso',
    role: 'dialog',
    'aria-modal': 'false',
    'aria-label': 'CLAC, llaves de acceso',
    'data-theme': estado.tema === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : estado.tema,
    'data-palette': estado.paleta
  })
  const estilo = document.createElement('style')
  estilo.textContent = css
  sombra.append(estilo, caja)
  document.documentElement.append(anfitrion)
  return { caja, cerrar: () => anfitrion.remove() }
}

function cabecera(): HTMLElement {
  return h(
    'div',
    { className: 'aviso-cabecera' },
    h('img', { src: `data:image/png;base64,${__ICONO_CLAC__}`, width: '18', height: '18', alt: '' }),
    h('strong', {}, 'CLAC'),
    h('span', { className: 'aviso-web' }, dominioDe(location.href))
  )
}

function boton(texto: string, clase: string, alPulsar: () => void, dibujo?: Hijo): HTMLButtonElement {
  return h(
    'button',
    {
      type: 'button',
      className: `btn ${clase}`,
      onClick: (ev: Event) => {
        if (!ev.isTrusted) return
        alPulsar()
      }
    },
    dibujo,
    texto
  ) as HTMLButtonElement
}

function fila(llave: LlaveNavegador, alPulsar: () => void): HTMLElement {
  return h(
    'button',
    {
      type: 'button',
      className: 'aviso-fila',
      onClick: (ev: Event) => {
        if (!ev.isTrusted) return
        alPulsar()
      }
    },
    icono('key', 15),
    h(
      'span',
      { className: 'aviso-textos' },
      h('span', { className: 'aviso-titulo' }, llave.usuario || llave.titulo),
      h('span', { className: 'aviso-sub' }, llave.usuario ? llave.titulo : 'Llave de acceso')
    )
  )
}

/* ---------- Lo que se pregunta y lo que se elige ---------- */

/** Las llaves que valen para esta petición: al entrar, solo las que acepta la web. */
function utiles(p: PeticionPagina, estado: EstadoLlaves): LlaveNavegador[] {
  if (p.que !== 'entrar' || p.datos.permitidas.length === 0) return estado.llaves
  return estado.llaves.filter((l) => p.datos.permitidas.includes(l.id))
}

/** Para poder cerrar desde fuera el aviso que se esté enseñando. */
interface Mando {
  cerrar?: (r: Eleccion) => void
  /** La web ha abortado antes de que diera tiempo a enseñar nada. */
  cancelado?: boolean
}

function preguntarAlUsuario(p: PeticionPagina & { que: 'crear' | 'entrar' }, inicial: EstadoLlaves, css: string, mando: Mando): Promise<Eleccion> {
  return new Promise((resolver) => {
    let estado = inicial
    const { caja, cerrar } = abrirAviso(css, estado)
    // Se vuelve a preguntar solo mientras está bloqueada: cada pregunta le hace
    // a CLAC descifrar la caja entera, y con ella abierta no hay nada que esperar.
    const reloj = window.setInterval(() => {
      if (estado.sesion !== 'abierta') void refrescar()
    }, 2000)
    const terminar = (r: Eleccion): void => {
      window.clearInterval(reloj)
      cerrar()
      resolver(r)
    }
    mando.cerrar = terminar
    const dominio = p.datos.rpId || dominioDe(location.href)
    const otra = (): HTMLButtonElement => boton('Usar otra llave', 'ghost', () => terminar({ accion: 'navegador' }))

    const pintar = (...cuerpo: Hijo[]): void => caja.replaceChildren(cabecera(), h('div', { className: 'aviso-cuerpo' }, ...cuerpo))

    const trabajando = (texto: string): void => pintar(h('p', { className: 'aviso-texto' }, texto))

    const fallo = (mensaje: string): void =>
      pintar(
        h('h2', { className: 'aviso-h2' }, icono('alert', 16), 'No ha podido ser'),
        h('p', { className: 'aviso-texto' }, mensaje),
        h('div', { className: 'aviso-botones' }, otra())
      )

    const pedirAClac = <T,>(mensaje: Record<string, unknown>, espera: string, alSalir: (datos: T) => void): void => {
      trabajando(espera)
      pedir<T>(mensaje)
        .then(alSalir)
        .catch((e: unknown) => {
          const f = e instanceof FalloClac ? e : new FalloClac(String(e))
          // Los fallos con nombre son cosa de la web (ya tienes esa llave, no
          // vale el dominio…): se le cuentan tal cual y ella decide.
          if (f.nombre) terminar({ accion: 'error', nombre: f.nombre, mensaje: f.message })
          else fallo(f.message)
        })
    }

    const pintarCrear = (): void => {
      const datos = p.que === 'crear' ? p.datos : null
      if (!datos) return
      const repetida = estado.llaves.find((l) => datos.excluir.includes(l.id))
      if (repetida) {
        return pintar(
          h('h2', { className: 'aviso-h2' }, icono('alert', 16), 'Ya tienes una llave de esta web'),
          h('p', { className: 'aviso-texto' }, `«${repetida.titulo}» guarda una llave de ${dominio} en CLAC.`),
          h(
            'div',
            { className: 'aviso-botones' },
            otra(),
            boton('Entendido', 'primary', () =>
              terminar({ accion: 'error', nombre: 'InvalidStateError', mensaje: 'Ya tienes una llave de esta web guardada en CLAC.' })
            )
          )
        )
      }
      pintar(
        h('h2', { className: 'aviso-h2' }, icono('key', 16), 'Guardar una llave de acceso'),
        h(
          'p',
          { className: 'aviso-texto' },
          datos.usuario ? `Para entrar en ${dominio} como ${datos.usuario}.` : `Para entrar en ${dominio}.`
        ),
        h('p', { className: 'aviso-nota' }, 'Se guarda cifrada en tu caja fuerte, en este ordenador. No sale a ninguna nube.'),
        h(
          'div',
          { className: 'aviso-botones' },
          otra(),
          boton('Guardar en CLAC', 'primary', () =>
            pedirAClac<RespuestaCrearLlave>({ tipo: 'llaveCrear', ...datos }, 'Creando la llave…', (llave) =>
              terminar({ accion: 'creada', llave })
            )
          )
        )
      )
    }

    const pintarEntrar = (): void => {
      const datos = p.que === 'entrar' ? p.datos : null
      if (!datos) return
      const lista = utiles(p, estado)
      pintar(
        h('h2', { className: 'aviso-h2' }, icono('key', 16), `Entrar en ${dominio}`),
        h(
          'div',
          { className: 'aviso-lista' },
          ...lista.map((l) =>
            fila(l, () =>
              pedirAClac<RespuestaFirmarLlave>({ tipo: 'llaveFirmar', rpId: datos.rpId, reto: datos.reto, credencial: l.id }, 'Entrando…', (llave) =>
                terminar({ accion: 'entrada', llave })
              )
            )
          )
        ),
        h('div', { className: 'aviso-botones' }, otra())
      )
    }

    const pintarBloqueada = (): void =>
      pintar(
        h('h2', { className: 'aviso-h2' }, icono('lock', 16), 'CLAC está bloqueada'),
        h('p', { className: 'aviso-texto' }, 'Ábrela para usar las llaves de acceso que guarda.'),
        estado.hello
          ? h('p', { className: 'aviso-nota' }, 'Windows te lo preguntará a ti, fuera del navegador.')
          : h('p', { className: 'aviso-nota' }, 'Pulsa el candado de CLAC en la barra del navegador (Ctrl+Mayús+X) y desbloquéala.'),
        h(
          'div',
          { className: 'aviso-botones' },
          otra(),
          estado.hello &&
            boton(
              'Usar Windows Hello',
              'primary',
              () => pedirAClac({ tipo: 'desbloquearHello' }, 'Confírmalo en Windows…', () => void refrescar(true)),
              icono('hello', 15)
            )
        )
      )

    const pintarTodo = (): void => {
      if (estado.sesion !== 'abierta') return pintarBloqueada()
      if (p.que === 'entrar' && utiles(p, estado).length === 0) return terminar({ accion: 'navegador' })
      if (p.que === 'crear') pintarCrear()
      else pintarEntrar()
    }

    async function refrescar(forzar = false): Promise<void> {
      try {
        const nuevo = await pedir<EstadoLlaves>({ tipo: 'llaves', rpId: p.datos.rpId })
        if (!forzar && nuevo.sesion === estado.sesion) return
        estado = nuevo
        pintarTodo()
      } catch {
        // Si CLAC deja de contestar, el aviso se queda como está y siempre
        // queda el botón de seguir con el navegador.
      }
    }

    pintarTodo()
  })
}


/* ---------- La puerta: lo que llega del mundo de la página ---------- */

interface EnCurso {
  id: string
  mando: Mando
  /** La web ha abortado: se cierra el aviso y no se le contesta nada. */
  abortada: boolean
}

let enCurso: EnCurso | null = null

async function decidir(p: PeticionPagina & { que: 'crear' | 'entrar' }, mando: Mando): Promise<Eleccion> {
  let estado: EstadoLlaves
  try {
    estado = await pedir<EstadoLlaves>({ tipo: 'llaves', rpId: p.datos.rpId })
  } catch {
    // CLAC no está, está a medio preparar, o el dominio que pide la web no vale
    // para una llave: que siga el navegador, que sabrá qué hacer con ello.
    return { accion: 'navegador' }
  }
  if (estado.sesion === 'nueva' || estado.sesion === 'sinClave') return { accion: 'navegador' }
  // Entrar en una web de la que no tienes llave en CLAC no interrumpe nada.
  if (p.que === 'entrar' && estado.sesion === 'abierta' && utiles(p, estado).length === 0) return { accion: 'navegador' }
  const css = await estilos()
  // Puede haber abortado mientras se preguntaba: entonces no se enseña nada.
  if (mando.cancelado) return { accion: 'navegador' }
  return preguntarAlUsuario(p, estado, css, mando)
}

window.addEventListener(PETICION, (ev) => {
  let p: PeticionPagina
  try {
    p = JSON.parse((ev as CustomEvent<string>).detail) as PeticionPagina
  } catch {
    return
  }
  if (p.que === 'cancelar') {
    if (enCurso && enCurso.id === p.id) {
      enCurso.abortada = true
      enCurso.mando.cancelado = true
      enCurso.mando.cerrar?.({ accion: 'navegador' })
    }
    return
  }
  // Otra petición mientras se enseña un aviso: la de antes se deja en manos del
  // navegador y se atiende la nueva.
  if (enCurso) {
    enCurso.mando.cancelado = true
    enCurso.mando.cerrar?.({ accion: 'navegador' })
  }
  const actual: EnCurso = { id: p.id, mando: {}, abortada: false }
  enCurso = actual
  void decidir(p, actual.mando)
    .catch((): Eleccion => ({ accion: 'navegador' }))
    .then((resultado) => {
      if (enCurso === actual) enCurso = null
      if (!actual.abortada) avisar(RESPUESTA, { id: p.id, ...resultado })
    })
})
