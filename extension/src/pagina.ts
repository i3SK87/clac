/**
 * Lo que se ejecuta dentro de la página, y solo cuando se pulsa algo en la
 * ventana de la extensión.
 *
 * Cada función viaja sola: el navegador la convierte en texto y la ejecuta en la
 * pestaña, en un mundo aparte donde los scripts de la web no la ven. Por eso
 * cada una lleva dentro sus ayudantes y no toca nada de fuera.
 *
 * No envía el formulario: rellena y deja que seas tú quien pulse «Entrar». Es
 * menos cómodo que el envío automático, pero no hay forma de que una web haga
 * enviar credenciales a donde no se ve.
 */

export interface Rellenado {
  usuario: boolean
  contrasena: boolean
  codigo: boolean
}

export function rellenarPagina(usuario: string, contrasena: string, codigo: string | null): Rellenado {
  const visible = (el: HTMLInputElement): boolean => {
    if (el.disabled || el.readOnly) return false
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    const s = getComputedStyle(el)
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05
  }
  // Con el «setter» nativo y los eventos de teclear: si no, los formularios hechos
  // con React, Vue o Angular no se enteran de que el campo tiene algo.
  const poner = (el: HTMLInputElement, valor: string): void => {
    el.focus()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (setter) setter.call(el, valor)
    else el.value = valor
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }
  const texto = (c: HTMLInputElement): string =>
    [c.name, c.id, c.autocomplete, c.placeholder, c.getAttribute('aria-label') ?? ''].join(' ').toLowerCase()
  const pareceUsuario = (c: HTMLInputElement): boolean =>
    c.autocomplete === 'username' ||
    c.type === 'email' ||
    /user|login|e-?mail|correo|usuario|dni|nif|nie|cuenta|account|identifier/.test(texto(c))
  const pareceCodigo = (c: HTMLInputElement): boolean =>
    c.autocomplete === 'one-time-code' || /otp|totp|2fa|mfa|one.?time|c[oó]digo|verif|token|pin/.test(texto(c))
  const pareceBusqueda = (c: HTMLInputElement): boolean => c.type === 'search' || /search|buscar|query/.test(texto(c))

  const campos = Array.from(document.querySelectorAll('input')).filter(visible)
  const textuales = campos.filter((c) => ['text', 'email', 'tel', 'number'].includes(c.type))
  const claves = campos.filter((c) => c.type === 'password')
  const hecho: Rellenado = { usuario: false, contrasena: false, codigo: false }

  // La contraseña: la primera que no sea de «contraseña nueva».
  const clave = claves.find((c) => c.autocomplete !== 'new-password') ?? claves[0]
  if (clave && contrasena) {
    poner(clave, contrasena)
    hecho.contrasena = true
  }

  // El usuario: el último campo de texto antes de la contraseña, en su formulario.
  if (usuario) {
    let candidatos = textuales.filter((c) => !pareceBusqueda(c) && !pareceCodigo(c) && c.type !== 'number')
    if (clave) {
      const delFormulario = candidatos.filter((c) => !clave.form || c.form === clave.form)
      const antes = delFormulario.filter((c) => c.compareDocumentPosition(clave) & Node.DOCUMENT_POSITION_FOLLOWING)
      candidatos = antes.length ? antes.reverse() : delFormulario
    }
    const elegido = candidatos.find(pareceUsuario) ?? (clave ? candidatos[0] : undefined)
    if (elegido) {
      poner(elegido, usuario)
      hecho.usuario = true
    }
  }

  // El código de un solo uso, cuando la página lo pide (y ya no pide contraseña).
  if (codigo && !clave) {
    const casillas = textuales.filter((c) => c.maxLength === 1)
    if (casillas.length >= codigo.length) {
      // Seis casillas de una cifra cada una.
      codigo.split('').forEach((cifra, i) => poner(casillas[i], cifra))
      hecho.codigo = true
    } else {
      const campo = textuales.find(pareceCodigo)
      if (campo) {
        poner(campo, codigo)
        hecho.codigo = true
      }
    }
  }
  return hecho
}

/** Una contraseña nueva: en «contraseña nueva» y en «repítela», que suelen ser dos. */
export function rellenarNueva(valor: string): number {
  const visible = (el: HTMLInputElement): boolean => {
    const r = el.getBoundingClientRect()
    return !el.disabled && !el.readOnly && r.width > 1 && r.height > 1
  }
  const poner = (el: HTMLInputElement): void => {
    el.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, valor)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }
  const claves = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]')).filter(visible)
  const nuevas = claves.filter((c) => c.autocomplete === 'new-password')
  // En un cambio de contraseña hay tres: la actual no se toca.
  const destino = nuevas.length ? nuevas : claves.length >= 2 ? claves.slice(-2) : claves
  destino.forEach(poner)
  return destino.length
}

/** Lo escrito en la página, para guardarlo en CLAC. */
export function leerPagina(): { usuario: string; contrasena: string; titulo: string } | null {
  const claves = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]')).filter((c) => c.value)
  if (!claves.length) return null
  const clave = claves.find((c) => c.autocomplete === 'new-password') ?? claves[0]
  const texto = (c: HTMLInputElement): string => [c.name, c.id, c.autocomplete, c.placeholder].join(' ').toLowerCase()
  const textuales = Array.from(document.querySelectorAll<HTMLInputElement>('input')).filter(
    (c) => ['text', 'email', 'tel'].includes(c.type) && c.value && !/search|buscar|query/.test(texto(c))
  )
  const delFormulario = textuales.filter((c) => !clave.form || c.form === clave.form)
  const antes = delFormulario.filter((c) => c.compareDocumentPosition(clave) & Node.DOCUMENT_POSITION_FOLLOWING).reverse()
  const usuario =
    antes.find((c) => c.autocomplete === 'username' || c.type === 'email' || /user|login|mail|correo|usuario/.test(texto(c))) ??
    antes[0] ??
    delFormulario[0]
  return { usuario: usuario?.value ?? '', contrasena: clave.value, titulo: document.title }
}
