import { app } from 'electron'

/** Bandera que recibe el arranque con Windows: se abre en la bandeja, sin ventana. */
const OCULTA = '--hidden'

export function arrancoOculta(): boolean {
  return process.argv.includes(OCULTA)
}

/**
 * Da de alta o de baja el arranque con Windows. Sin empaquetar no se toca, por
 * lo mismo que en BONK: si no, un `npm run dev` dejaría la copia del proyecto
 * adueñada del arranque del equipo.
 */
export function aplicarArranque(activo: boolean): void {
  if (!app.isPackaged) return
  try {
    app.setLoginItemSettings({ openAtLogin: activo, path: process.execPath, args: [OCULTA] })
  } catch (error) {
    console.error('No se pudo cambiar el arranque con Windows:', error)
  }
}
