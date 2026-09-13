/**
 * Fechas de los campos: como se guardan, como se leen y como se enseñan.
 *
 * Los campos de fecha guardan `AAAA-MM-DD` y los de mes y año `AAAA-MM`, que es
 * lo que dan los controles del navegador. Pero lo importado llega como llega
 * —«12/27», «12/2027», «2027-12»—, así que al leer se entiende de todo.
 */

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/**
 * El último día en que la fecha sigue valiendo. Para un mes y año es el último
 * día de ese mes: una tarjeta que caduca en 03/27 vale todo marzo.
 */
export function finDeValidez(valor: string): Date | null {
  const texto = valor.trim()
  if (!texto) return null

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(texto)
  if (m) return fecha(+m[1], +m[2], +m[3])

  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(texto)
  if (m) return fecha(anio(m[3]), +m[2], +m[1])

  m = /^(\d{4})-(\d{1,2})$/.exec(texto)
  if (m) return ultimoDia(+m[1], +m[2])

  m = /^(\d{1,2})\s*[/.-]\s*(\d{2}|\d{4})$/.exec(texto)
  if (m) return ultimoDia(anio(m[2]), +m[1])

  return null
}

function anio(texto: string): number {
  const n = Number(texto)
  return texto.length === 2 ? 2000 + n : n
}

function fecha(a: number, m: number, d: number): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const f = new Date(a, m - 1, d)
  return f.getMonth() === m - 1 ? f : null
}

function ultimoDia(a: number, m: number): Date | null {
  if (m < 1 || m > 12) return null
  return new Date(a, m, 0)
}

/** «3 de mayo de 2027». */
export function fechaLarga(d: Date): string {
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`
}

/** «mayo de 2027». */
export function mesLargo(d: Date): string {
  return `${MESES[d.getMonth()]} de ${d.getFullYear()}`
}

/** Cómo se enseña el valor de un campo de fecha, sin tocar lo guardado. */
export function mostrarFecha(valor: string, tipo: 'fecha' | 'mesAnio'): string {
  const d = finDeValidez(valor)
  if (!d) return valor
  if (tipo === 'mesAnio') return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  return fechaLarga(d)
}

/** «hoy», «ayer», «hace 5 días», «el 3 de mayo de 2027». */
export function haceCuanto(iso: string | null, ahora = new Date()): string {
  if (!iso) return 'nunca'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const dias = Math.floor(
    (new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86_400_000
  )
  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (dias <= 0) return `hoy a las ${hora}`
  if (dias === 1) return `ayer a las ${hora}`
  if (dias < 7) return `hace ${dias} días`
  return `el ${fechaLarga(d)}`
}

export function sumarMeses(d: Date, meses: number): Date {
  const r = new Date(d)
  r.setMonth(r.getMonth() + meses)
  return r
}
