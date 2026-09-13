/**
 * La ventana de la extensión: lo que sale al pulsar el candado o Ctrl+Mayús+X.
 *
 * Arriba, lo de la web en la que estás; al escribir, busca en toda la caja.
 * Intro o un clic rellenan el usuario y la contraseña en la página, y si el
 * elemento es de otra web lo avisa antes, que es como se para una web falsa que
 * se hace pasar por el banco. Debajo, guardar lo que acabas de escribir en la
 * página y el generador.
 *
 * Sin React: es una ventana pequeña y así el paquete se queda en poco. Los
 * colores, botones y campos son los de la casa, igual que en CLAC.
 */
import { colorDe, dominioBase, dominioDe, inicialDe } from '@shared/webs'
import { generar, trocear, OPCIONES_POR_DEFECTO, type OpcionesGenerador } from '@shared/generador'
import { NOMBRE_ANFITRION, type Credenciales, type ElementoNavegador, type EstadoNavegador, type Peticion, type Respuesta, type ResultadoGuardar } from '@shared/navegador'
import { ICONOS } from './iconos.gen'
import { leerPagina, rellenarNueva, rellenarPagina, type Rellenado } from './pagina'

/* ---------- El puente con CLAC ---------- */

class SinPuente extends Error {}
class Cerrada extends Error {}

let puerto: chrome.runtime.Port | null = null
let siguiente = 1
const esperando = new Map<number, { resolver: (r: Respuesta) => void; rechazar: (e: Error) => void }>()

function conectar(): chrome.runtime.Port {
  const p = chrome.runtime.connectNative(NOMBRE_ANFITRION)
  p.onMessage.addListener((r: Respuesta) => {
    const e = esperando.get(r.id)
    if (!e) return
    esperando.delete(r.id)
    e.resolver(r)
  })
  p.onDisconnect.addListener(() => {
    const motivo = chrome.runtime.lastError?.message ?? 'Se ha cortado la conexión con CLAC.'
    for (const e of esperando.values()) e.rechazar(new SinPuente(motivo))
    esperando.clear()
    puerto = null
  })
  return p
}

type SinId<T> = T extends unknown ? Omit<T, 'id'> : never

function pedir<T>(peticion: SinId<Peticion>): Promise<T> {
  if (!puerto) puerto = conectar()
  const id = siguiente++
  return new Promise<T>((resolver, rechazar) => {
    const plazo = window.setTimeout(() => {
      esperando.delete(id)
      rechazar(new Error('CLAC no contesta.'))
    }, 10_000)
    esperando.set(id, {
      resolver: (r) => {
        window.clearTimeout(plazo)
        if (r.cerrada) rechazar(new Cerrada(r.error))
        else if (!r.ok) rechazar(new Error(r.error ?? 'Algo ha fallado.'))
        else resolver(r.datos as T)
      },
      rechazar: (e) => {
        window.clearTimeout(plazo)
        rechazar(e)
      }
    })
    puerto!.postMessage({ ...peticion, id })
  })
}

/* ---------- Dibujar ---------- */

type Hijo = Node | string | null | false | undefined

function h(etiqueta: string, atributos: Record<string, unknown> = {}, ...hijos: Hijo[]): HTMLElement {
  const el = document.createElement(etiqueta)
  for (const [k, v] of Object.entries(atributos)) {
    if (v == null || v === false) continue
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener)
    else if (k === 'className') el.className = String(v)
    else el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const hijo of hijos) if (hijo) el.append(hijo)
  return el
}

/** Los dibujos de Lucide, ya en SVG desde la compilación: texto nuestro, no de la web. */
function icono(nombre: keyof typeof ICONOS, tamano = 15): HTMLElement {
  const s = h('span', { className: 'icono', 'aria-hidden': 'true' })
  s.innerHTML = ICONOS[nombre].replace(/width="24" height="24"/, `width="${tamano}" height="${tamano}"`)
  return s
}

// Hasta que CLAC diga su tema, el del sistema: si no llega a contestar, la
// ventana no se queda en oscuro con Windows en claro.
document.documentElement.setAttribute('data-theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

const contenido = document.getElementById('contenido')!
const rotuloDominio = document.getElementById('dominio')!

function pintar(...nodos: Hijo[]): void {
  contenido.replaceChildren(...(nodos.filter(Boolean) as Node[]))
}

function mensaje(texto: string, tono: 'error' | 'ok' | 'aviso' = 'error'): HTMLElement {
  return h('p', { className: `ext-mensaje ${tono}`, role: tono === 'error' ? 'alert' : 'status' }, texto)
}

/* ---------- La pestaña ---------- */

let pestana: { id: number; url: string } | null = null

async function leerPestana(): Promise<void> {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true })
  pestana = t?.id != null ? { id: t.id, url: t.url ?? '' } : null
  const dominio = dominioDe(pestana?.url ?? '')
  rotuloDominio.textContent = dominio
  rotuloDominio.title = pestana?.url ?? ''
}

function sePuedeRellenar(): boolean {
  return !!pestana && /^https?:\/\//i.test(pestana.url)
}

/* ---------- Los estados ---------- */

async function empezar(): Promise<void> {
  await leerPestana()
  try {
    const estado = await pedir<EstadoNavegador>({ tipo: 'estado' })
    document.documentElement.setAttribute(
      'data-theme',
      estado.tema === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : estado.tema
    )
    document.documentElement.setAttribute('data-palette', estado.paleta)
    if (estado.sesion === 'abierta') await pintarAbierta()
    else if (estado.sesion === 'bloqueada') pintarBloqueada()
    else pintarSinPreparar()
  } catch (e) {
    if (e instanceof Cerrada) pintarCerrada()
    else pintarSinPuente(e instanceof Error ? e.message : String(e))
  }
}

function pintarSinPuente(motivo: string): void {
  const noEsta = /not found|no encontrado|Specified native messaging host/i.test(motivo)
  pintar(
    h(
      'div',
      { className: 'ext-aviso' },
      icono('unplug', 26),
      h('h2', {}, noEsta ? 'Falta conectar CLAC con el navegador' : 'No se ha podido hablar con CLAC'),
      h(
        'p',
        {},
        noEsta
          ? 'En CLAC, ve a Ajustes ▸ Navegador y enciende «Dejar que la extensión de CLAC rellene contraseñas». Luego vuelve a abrir esta ventana.'
          : motivo
      )
    )
  )
}

function pintarCerrada(): void {
  const boton = h('button', { className: 'btn primary ancho', onClick: () => void abrirClac(boton) }, icono('external', 15), 'Abrir CLAC')
  pintar(h('div', { className: 'ext-aviso' }, icono('lock', 26), h('h2', {}, 'CLAC no está abierta'), h('p', {}, 'Ábrela y vuelve a pulsar el candado.'), boton))
}

async function abrirClac(boton: HTMLElement): Promise<void> {
  boton.setAttribute('disabled', '')
  boton.textContent = 'Abriendo CLAC…'
  await pedir({ tipo: 'abrirApp' }).catch(() => undefined)
  // Se espera a que conteste, hasta quince segundos.
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500))
    try {
      await pedir<EstadoNavegador>({ tipo: 'estado' })
      return void empezar()
    } catch {
      // Todavía arrancando.
    }
  }
  pintarCerrada()
}

function pintarSinPreparar(): void {
  pintar(
    h(
      'div',
      { className: 'ext-aviso' },
      icono('lock', 26),
      h('h2', {}, 'CLAC está a medio preparar'),
      h('p', {}, 'Abre CLAC y termina de crear o de restaurar tu caja fuerte.'),
      h('button', { className: 'btn primary ancho', onClick: () => void pedir({ tipo: 'abrirApp' }) }, 'Abrir CLAC')
    )
  )
}

function pintarBloqueada(): void {
  const campo = h('input', {
    className: 'input',
    type: 'password',
    placeholder: 'Contraseña maestra',
    'aria-label': 'Contraseña maestra',
    autocomplete: 'off'
  }) as HTMLInputElement
  const error = h('div', { className: 'hueco-mensaje' })
  const boton = h('button', { className: 'btn primary ancho', type: 'submit' }, icono('unlock', 15), 'Desbloquear') as HTMLButtonElement
  const formulario = h(
    'form',
    {
      className: 'ext-aviso',
      onSubmit: async (ev: Event) => {
        ev.preventDefault()
        if (!campo.value) return
        boton.disabled = true
        boton.lastChild!.textContent = 'Abriendo…'
        try {
          await pedir({ tipo: 'desbloquear', contrasena: campo.value })
          campo.value = ''
          await pintarAbierta()
        } catch (e) {
          campo.value = ''
          boton.disabled = false
          boton.lastChild!.textContent = 'Desbloquear'
          error.replaceChildren(mensaje(e instanceof Error ? e.message : String(e)))
          campo.focus()
        }
      }
    },
    icono('lock', 26),
    h('h2', {}, 'CLAC está bloqueada'),
    campo,
    boton,
    error
  )
  pintar(formulario)
  campo.focus()
}

/* ---------- Abierta ---------- */

let elementos: ElementoNavegador[] = []
let elegido = 0

async function pintarAbierta(): Promise<void> {
  const buscador = h('input', {
    className: 'input ext-buscador',
    placeholder: 'Buscar en CLAC',
    'aria-label': 'Buscar en CLAC',
    spellcheck: 'false'
  }) as HTMLInputElement
  const lista = h('div', { className: 'ext-lista', role: 'listbox', 'aria-label': 'Elementos' })
  const avisos = h('div', { className: 'hueco-mensaje' })
  const pie = h(
    'div',
    { className: 'ext-pie' },
    h('button', { className: 'btn small ghost', onClick: () => void pintarGuardar(), disabled: !sePuedeRellenar() }, icono('save', 14), 'Guardar lo escrito'),
    h('button', { className: 'btn small ghost', onClick: () => pintarGenerador() }, icono('wand', 14), 'Generar')
  )

  const cargar = async (): Promise<void> => {
    try {
      elementos = await pedir<ElementoNavegador[]>({ tipo: 'buscar', url: pestana?.url ?? '', consulta: buscador.value })
      elegido = 0
      pintarLista(lista, avisos, buscador.value)
    } catch (e) {
      if (e instanceof Error && /bloqueada/.test(e.message)) return pintarBloqueada()
      avisos.replaceChildren(mensaje(e instanceof Error ? e.message : String(e)))
    }
  }

  let espera = 0
  buscador.addEventListener('input', () => {
    window.clearTimeout(espera)
    espera = window.setTimeout(() => void cargar(), 120)
  })
  buscador.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault()
      elegido = Math.max(0, Math.min(elementos.length - 1, elegido + (ev.key === 'ArrowDown' ? 1 : -1)))
      marcarElegido(lista)
    } else if (ev.key === 'Enter' && elementos[elegido]) {
      ev.preventDefault()
      void rellenar(elementos[elegido], avisos)
    }
  })

  pintar(buscador, avisos, lista, pie)
  buscador.focus()
  await cargar()
}

function marcarElegido(lista: HTMLElement): void {
  lista.querySelectorAll('.ext-fila').forEach((f, i) => {
    f.classList.toggle('elegida', i === elegido)
    f.setAttribute('aria-selected', String(i === elegido))
    if (i === elegido) f.scrollIntoView({ block: 'nearest' })
  })
}

function pintarLista(lista: HTMLElement, avisos: HTMLElement, consulta: string): void {
  const filas: Node[] = []
  const coinciden = elementos.filter((e) => e.coincide).length
  if (!consulta) {
    filas.push(
      h(
        'div',
        { className: 'ext-rotulo' },
        coinciden ? `En ${dominioBase(pestana?.url ?? '')}` : sePuedeRellenar() ? 'Nada de esta web · tus favoritos' : 'Tus favoritos'
      )
    )
  }
  elementos.forEach((e, i) => {
    if (!consulta && coinciden && i === coinciden && i < elementos.length) filas.push(h('div', { className: 'ext-rotulo' }, 'Favoritos'))
    const dominio = dominioDe(e.web)
    const avatar = h('span', { className: 'ext-avatar', style: `background:${colorDe(dominio || e.titulo)}` }, inicialDe(e.titulo))
    const acciones = h(
      'span',
      { className: 'ext-acciones' },
      e.usuario && boton('user', 'Copiar el usuario', () => void copiar(e, 'usuario', avisos)),
      e.tieneContrasena && boton('key', 'Copiar la contraseña', () => void copiar(e, 'contrasena', avisos)),
      e.tieneTotp && boton('clock', 'Copiar el código', () => void copiar(e, 'totp', avisos)),
      boton('external', 'Abrir en CLAC', () => void pedir({ tipo: 'abrirElemento', elementoId: e.id }).then(() => window.close()))
    )
    filas.push(
      h(
        'div',
        {
          className: `ext-fila${i === elegido ? ' elegida' : ''}`,
          role: 'option',
          'aria-selected': String(i === elegido),
          tabindex: '-1',
          onClick: (ev: Event) => {
            if ((ev.target as HTMLElement).closest('.ext-acciones')) return
            elegido = i
            marcarElegido(lista)
            void rellenar(e, avisos)
          },
          onMouseMove: () => {
            if (elegido !== i) {
              elegido = i
              marcarElegido(lista)
            }
          }
        },
        avatar,
        h('span', { className: 'ext-textos' }, h('span', { className: 'ext-titulo truncate' }, e.titulo), h('span', { className: 'ext-sub truncate' }, e.usuario || dominio || ' ')),
        acciones
      )
    )
  })
  if (!elementos.length) {
    filas.push(h('p', { className: 'ext-vacio' }, consulta ? `Nada se llama «${consulta}».` : 'No hay nada guardado de esta web. Escribe para buscar en toda la caja.'))
  }
  lista.replaceChildren(...filas)
}

function boton(nombre: keyof typeof ICONOS, titulo: string, alPulsar: () => void): HTMLElement {
  return h(
    'button',
    {
      className: 'btn ghost icon small',
      title: titulo,
      'aria-label': titulo,
      onClick: (ev: Event) => {
        ev.stopPropagation()
        alPulsar()
      }
    },
    icono(nombre, 14)
  )
}

async function copiar(e: ElementoNavegador, que: 'usuario' | 'contrasena' | 'totp', avisos: HTMLElement): Promise<void> {
  try {
    const r = await pedir<{ segundos: number }>({ tipo: 'copiar', elementoId: e.id, que })
    const nombre = que === 'usuario' ? 'Usuario' : que === 'contrasena' ? 'Contraseña' : 'Código'
    avisos.replaceChildren(mensaje(r.segundos ? `${nombre} copiado. Se borrará en ${r.segundos} s.` : `${nombre} copiado.`, 'ok'))
  } catch (err) {
    avisos.replaceChildren(mensaje(err instanceof Error ? err.message : String(err)))
  }
}

/**
 * Rellenar. Si el elemento no es de esta web se para y lo pregunta: una página
 * que imita a la de tu banco tiene otro dominio, y es aquí donde se nota.
 */
async function rellenar(e: ElementoNavegador, avisos: HTMLElement, confirmado = false): Promise<void> {
  if (!sePuedeRellenar() || !pestana) {
    avisos.replaceChildren(mensaje('En esta página no se puede rellenar. Usa los botones de copiar.', 'aviso'))
    return
  }
  const aqui = dominioBase(pestana.url)
  const suyo = dominioBase(e.web)
  if (!confirmado && !e.coincide) {
    avisos.replaceChildren(
      h(
        'div',
        { className: 'ext-confirmar', role: 'alert' },
        icono('alert', 16),
        h(
          'span',
          {},
          suyo
            ? `Estás en ${aqui}, pero «${e.titulo}» es de ${suyo}. Si esperabas estar en ${suyo}, puede ser una web falsa.`
            : `«${e.titulo}» no tiene web guardada. ¿Rellenar en ${aqui}?`
        ),
        h(
          'span',
          { className: 'ext-confirmar-botones' },
          h('button', { className: 'btn small', onClick: () => avisos.replaceChildren() }, 'Cancelar'),
          h('button', { className: 'btn small danger', onClick: () => void rellenar(e, avisos, true) }, 'Rellenar igualmente')
        )
      )
    )
    return
  }
  try {
    const c = await pedir<Credenciales>({ tipo: 'credenciales', elementoId: e.id })
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: pestana.id },
      func: rellenarPagina,
      args: [c.usuario, c.contrasena, c.codigo]
    })
    const hecho = r?.result as Rellenado | undefined
    if (hecho && (hecho.usuario || hecho.contrasena || hecho.codigo)) window.close()
    else avisos.replaceChildren(mensaje('No he encontrado dónde escribir en esta página. Copia el usuario y la contraseña con los botones.', 'aviso'))
  } catch (err) {
    avisos.replaceChildren(mensaje(err instanceof Error ? err.message : String(err)))
  }
}

/* ---------- Guardar lo escrito ---------- */

async function pintarGuardar(datos?: { usuario: string; contrasena: string; titulo: string }): Promise<void> {
  if (!pestana) return
  let leido = datos ?? null
  if (!leido) {
    try {
      const [r] = await chrome.scripting.executeScript({ target: { tabId: pestana.id }, func: leerPagina })
      leido = (r?.result as typeof leido) ?? null
    } catch (err) {
      pintar(mensaje(err instanceof Error ? err.message : String(err)), volver())
      return
    }
  }
  if (!leido) {
    pintar(mensaje('No hay ninguna contraseña escrita en esta página. Escríbela en el formulario y vuelve a pulsar «Guardar lo escrito».', 'aviso'), volver())
    return
  }
  const titulo = h('input', { className: 'input', value: leido.titulo || dominioDe(pestana.url), 'aria-label': 'Título' }) as HTMLInputElement
  const usuario = h('input', { className: 'input', value: leido.usuario, 'aria-label': 'Usuario' }) as HTMLInputElement
  const avisos = h('div', { className: 'hueco-mensaje' })
  const contrasena = leido.contrasena
  pintar(
    h(
      'form',
      {
        className: 'ext-formulario',
        onSubmit: async (ev: Event) => {
          ev.preventDefault()
          try {
            const r = await pedir<ResultadoGuardar>({ tipo: 'guardar', url: pestana!.url, titulo: titulo.value, usuario: usuario.value, contrasena })
            avisos.replaceChildren(mensaje(r.accion === 'creado' ? `Guardado en CLAC como «${r.titulo}».` : `Contraseña cambiada en «${r.titulo}». La de antes queda en su historial.`, 'ok'))
            window.setTimeout(() => window.close(), 1400)
          } catch (err) {
            avisos.replaceChildren(mensaje(err instanceof Error ? err.message : String(err)))
          }
        }
      },
      h('h2', {}, 'Guardar en CLAC'),
      h('label', { className: 'ext-etiqueta' }, 'Título', titulo),
      h('label', { className: 'ext-etiqueta' }, 'Usuario', usuario),
      h('div', { className: 'ext-etiqueta' }, 'Contraseña', h('span', { className: 'ext-puntos' }, '•'.repeat(Math.min(16, contrasena.length)))),
      h('p', { className: 'ext-nota' }, `Web: ${new URL(pestana.url).origin}. Si ya tienes esta web con este usuario, se le cambia la contraseña.`),
      avisos,
      h('div', { className: 'ext-botones' }, volver(), h('button', { className: 'btn primary', type: 'submit' }, icono('save', 14), 'Guardar'))
    )
  )
  titulo.focus()
}

function volver(): HTMLElement {
  return h('button', { className: 'btn ghost', type: 'button', onClick: () => void pintarAbierta() }, 'Volver')
}

/* ---------- Generar ---------- */

function pintarGenerador(): void {
  let opciones: OpcionesGenerador = { ...OPCIONES_POR_DEFECTO }
  let actual = generar(opciones)
  const salida = h('div', { className: 'ext-generada mono', 'aria-live': 'polite' })
  const bits = h('span', { className: 'ext-nota' })
  const avisos = h('div', { className: 'hueco-mensaje' })
  const dibujar = (): void => {
    salida.replaceChildren(...trocear(actual.valor).map((t) => h('span', { className: t.clase === 'letra' ? '' : t.clase }, t.texto)))
    bits.textContent = `${Math.round(actual.bits)} bits de azar`
  }
  const tipo = (t: OpcionesGenerador['tipo'], texto: string): HTMLElement =>
    h(
      'button',
      {
        type: 'button',
        className: opciones.tipo === t ? 'active' : '',
        onClick: (ev: Event) => {
          opciones = { ...opciones, tipo: t }
          actual = generar(opciones)
          ;(ev.currentTarget as HTMLElement).parentElement!.querySelectorAll('button').forEach((b) => b.classList.remove('active'))
          ;(ev.currentTarget as HTMLElement).classList.add('active')
          dibujar()
        }
      },
      texto
    )
  dibujar()
  pintar(
    h('h2', { className: 'ext-titulo-seccion' }, 'Contraseña nueva'),
    h('div', { className: 'segmented ancho' }, tipo('aleatoria', 'Aleatoria'), tipo('memorable', 'Memorable'), tipo('pin', 'PIN')),
    salida,
    h(
      'div',
      { className: 'ext-botones' },
      bits,
      h('button', { className: 'btn ghost icon small', title: 'Otra', 'aria-label': 'Otra', onClick: () => ((actual = generar(opciones)), dibujar()) }, icono('refresh', 14))
    ),
    avisos,
    h(
      'div',
      { className: 'ext-botones' },
      volver(),
      h(
        'button',
        {
          className: 'btn',
          onClick: () =>
            void pedir<{ segundos: number }>({ tipo: 'copiarTexto', texto: actual.valor })
              .then((r) => avisos.replaceChildren(mensaje(`Copiada. Se borrará en ${r.segundos} s.`, 'ok')))
              .catch((e) => avisos.replaceChildren(mensaje(String(e.message ?? e))))
        },
        icono('copy', 14),
        'Copiar'
      ),
      h(
        'button',
        {
          className: 'btn primary',
          disabled: !sePuedeRellenar(),
          onClick: async () => {
            if (!pestana) return
            const [r] = await chrome.scripting.executeScript({ target: { tabId: pestana.id }, func: rellenarNueva, args: [actual.valor] })
            if (!r?.result) return avisos.replaceChildren(mensaje('No hay ningún campo de contraseña en esta página.', 'aviso'))
            // Rellenada, lo siguiente es guardarla, con el usuario que haya escrito.
            const [l] = await chrome.scripting.executeScript({ target: { tabId: pestana.id }, func: leerPagina })
            const leido = (l?.result as { usuario: string; titulo: string } | null) ?? { usuario: '', titulo: '' }
            void pintarGuardar({ usuario: leido.usuario, titulo: leido.titulo, contrasena: actual.valor })
          }
        },
        'Rellenar y guardar'
      )
    )
  )
}

void empezar()
