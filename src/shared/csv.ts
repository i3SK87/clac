/**
 * CSV de ida y vuelta, el de la RFC 4180: comas, comillas dobles para lo que
 * lleva comas o saltos de línea dentro, y dos comillas seguidas para escribir
 * una. Es lo que exportan todos los navegadores y gestores de contraseñas.
 */

export function leerCsv(texto: string): string[][] {
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let entreComillas = false
  // La marca de orden de bytes que deja Excel al principio no es parte del texto.
  const t = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto

  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (entreComillas) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          campo += '"'
          i++
        } else {
          entreComillas = false
        }
      } else {
        campo += ch
      }
      continue
    }
    if (ch === '"') {
      entreComillas = true
    } else if (ch === ',') {
      fila.push(campo)
      campo = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++
      fila.push(campo)
      campo = ''
      if (fila.some((c) => c !== '')) filas.push(fila)
      fila = []
    } else {
      campo += ch
    }
  }
  fila.push(campo)
  if (fila.some((c) => c !== '')) filas.push(fila)
  return filas
}

function escapar(valor: string): string {
  return /[",\r\n]/.test(valor) || /^\s|\s$/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor
}

export function escribirCsv(filas: string[][]): string {
  return filas.map((fila) => fila.map(escapar).join(',')).join('\r\n') + '\r\n'
}

/** Las filas como objetos, con la cabecera en minúsculas y sin espacios de sobra. */
export function comoObjetos(filas: string[][]): { cabecera: string[]; registros: Array<Record<string, string>> } {
  const [primera, ...resto] = filas
  const cabecera = (primera ?? []).map((c) => c.trim().toLowerCase())
  const registros = resto.map((fila) => {
    const r: Record<string, string> = {}
    cabecera.forEach((col, i) => {
      r[col] = fila[i] ?? ''
    })
    return r
  })
  return { cabecera, registros }
}
