/**
 * Azar de verdad, y sin sesgo.
 *
 * Todo sale de `crypto.getRandomValues`, que es el generador criptográfico del
 * sistema y existe igual en la ventana que en Node. Nada de `Math.random`, que
 * es predecible.
 *
 * Y sin sesgo: sacar un número del 0 al 30 con `byte % 31` hace que los seis
 * primeros salgan un pelo más que el resto, porque 256 no es múltiplo de 31.
 * Aquí se descartan los valores que caen en la cola que no llena una vuelta
 * completa y se vuelve a tirar, que es lo que se llama muestreo por rechazo.
 */

/** Un entero uniforme en [0, n). */
export function enteroAleatorio(n: number): number {
  if (!Number.isInteger(n) || n <= 0 || n > 2 ** 32) throw new Error(`Rango imposible: ${n}`)
  if (n === 1) return 0
  const limite = Math.floor(2 ** 32 / n) * n
  const caja = new Uint32Array(1)
  for (;;) {
    globalThis.crypto.getRandomValues(caja)
    if (caja[0] < limite) return caja[0] % n
  }
}

export function elegir<T>(lista: readonly T[]): T {
  return lista[enteroAleatorio(lista.length)]
}

/** Baraja en el sitio (Fisher-Yates). */
export function barajar<T>(lista: T[]): T[] {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = enteroAleatorio(i + 1)
    ;[lista[i], lista[j]] = [lista[j], lista[i]]
  }
  return lista
}
