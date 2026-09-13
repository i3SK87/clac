/**
 * Desbloquear con Windows Hello: el PIN de Windows, la huella o la cara.
 *
 * Como en 1Password, Hello no sustituye a la contraseña maestra: la recuerda un
 * rato. La caja fuerte sigue cifrada con la contraseña y la clave secreta, y un
 * PIN de Windows no la abriría nunca por sí solo. Lo que pasa es esto:
 *
 * - Al bloquearse CLAC (el rato sin tocar nada, Win+L, la suspensión, a mano),
 *   si Hello está activado, se guarda la clave de la cuenta **solo en memoria**
 *   y cifrada con DPAPI, que la ata a tu sesión de Windows. Nunca va al disco.
 * - Si Windows confirma que eres tú, se abre con ella, y se borra.
 * - Cerrar CLAC del todo o reiniciar la pierde: al arrancar, siempre la
 *   contraseña maestra.
 * - Y pasados catorce días desde la última vez que la escribiste, también. Es
 *   la única que no tiene arreglo si se olvida: conviene no perder la costumbre.
 */
import { safeStorage } from 'electron'

export const DIAS_SIN_MAESTRA = 14

let sobre: Buffer | null = null
let ultimaMaestra = 0
let esperando = false

/** Se acaba de abrir con la contraseña maestra: empiezan a contar los catorce días. */
export function anotarMaestra(): void {
  ultimaMaestra = Date.now()
}

function maestraReciente(): boolean {
  return ultimaMaestra > 0 && Date.now() - ultimaMaestra < DIAS_SIN_MAESTRA * 86_400_000
}

/**
 * Guarda la clave de la cuenta al bloquear, si toca. Borra la que recibe: quien
 * llama le da una copia y no la vuelve a usar.
 */
export function guardarClave(clave: Buffer): void {
  olvidarClave()
  try {
    if (maestraReciente() && safeStorage.isEncryptionAvailable()) {
      sobre = safeStorage.encryptString(clave.toString('base64'))
    }
  } finally {
    clave.fill(0)
  }
}

/** La clave, descifrada. Quien la pide la borra al acabar. */
export function sacarClave(): Buffer | null {
  if (!sobre || !maestraReciente()) return null
  return Buffer.from(safeStorage.decryptString(sobre), 'base64')
}

export function olvidarClave(): void {
  sobre?.fill(0)
  sobre = null
}

/** Si ahora mismo se podría abrir con Hello (falta que Windows diga que sí). */
export function hayClave(): boolean {
  return sobre != null && maestraReciente()
}

/** Hay un diálogo de Hello abierto: el acceso rápido no se esconde por perder el foco. */
export function helloEsperando(): boolean {
  return esperando
}

export function marcarEsperando(valor: boolean): void {
  esperando = valor
}

/** Lo que dice Windows, contado para quien está delante. */
export function motivoHello(resultado: string | null): string {
  switch (resultado) {
    case 'Canceled':
      return 'Cancelado.'
    case 'RetriesExhausted':
      return 'Demasiados intentos. Entra con la contraseña maestra.'
    case 'DeviceBusy':
      return 'Windows Hello está ocupado. Prueba otra vez en un momento.'
    case 'NotConfiguredForUser':
      return 'Windows Hello no está configurado en tu cuenta de Windows.'
    case 'DeviceNotPresent':
      return 'Este equipo no tiene cómo usar Windows Hello ahora mismo.'
    case 'DisabledByPolicy':
      return 'Windows Hello está desactivado en este equipo.'
    case null:
      return 'No se ha podido preguntar a Windows Hello.'
    default:
      return `Windows Hello ha dicho que no (${resultado}).`
  }
}
