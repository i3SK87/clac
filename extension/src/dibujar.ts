/**
 * Dibujar sin React, que es lo que usan la ventana de la extensión y el aviso
 * de las llaves de acceso. Son pocas líneas y así el paquete se queda en poco.
 */
import { ICONOS } from './iconos.gen'

export type Hijo = Node | string | null | false | undefined

export function h(etiqueta: string, atributos: Record<string, unknown> = {}, ...hijos: Hijo[]): HTMLElement {
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
export type NombreIcono = keyof typeof ICONOS

export function icono(nombre: NombreIcono, tamano = 15): HTMLElement {
  const s = h('span', { className: 'icono', 'aria-hidden': 'true' })
  s.innerHTML = ICONOS[nombre].replace(/width="24" height="24"/, `width="${tamano}" height="${tamano}"`)
  return s
}
