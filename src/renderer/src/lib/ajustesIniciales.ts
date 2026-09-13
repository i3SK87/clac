import type { Ajustes } from '@shared/tipos'

/** Lo que se usa mientras llegan los ajustes de verdad. Los mismos que los de fábrica. */
export const AJUSTES_INICIALES: Ajustes = {
  theme: 'system',
  palette: 'grafito',
  bloqueoMinutos: 10,
  bloquearAlSuspender: true,
  bloquearAlBloquearWindows: true,
  portapapelesSegundos: 90,
  accesoRapido: true,
  arrancarConWindows: false,
  cerrarABandeja: true,
  ordenLista: 'titulo',
  ultimaCopia: null
}
