/**
 * El bloqueo automático.
 *
 * Tres motivos, los de 1Password: un rato sin tocar el teclado ni el ratón
 * (en todo el equipo, no solo en esta ventana), la suspensión y el bloqueo de
 * Windows con Win+L. Los dos últimos se pueden apagar en Ajustes.
 */
import { powerMonitor } from 'electron'
import type { Ajustes } from '@shared/tipos'

export function vigilarBloqueo(
  ajustes: () => Ajustes,
  abierta: () => boolean,
  bloquear: (motivo: string) => void
): void {
  setInterval(() => {
    if (!abierta()) return
    const minutos = ajustes().bloqueoMinutos
    if (minutos > 0 && powerMonitor.getSystemIdleTime() >= minutos * 60) bloquear('inactividad')
  }, 15_000)

  powerMonitor.on('suspend', () => {
    if (abierta() && ajustes().bloquearAlSuspender) bloquear('suspensión')
  })
  powerMonitor.on('lock-screen', () => {
    if (abierta() && ajustes().bloquearAlBloquearWindows) bloquear('bloqueo de Windows')
  })
}
