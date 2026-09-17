/**
 * El CLAC de la prueba de las llaves de acceso: una caja fuerte de verdad, en
 * una carpeta temporal, con el mismo `atender` que usa la extensión.
 *
 * Aquí está también lo que hace el service worker con lo que llega de una
 * página: dejar pasar solo las peticiones de las llaves y poner el origen que
 * dice el navegador, nunca el que diga la web.
 */
import { CajaFuerte } from '../../src/main/boveda/boveda'
import { leerAjustes } from '../../src/main/boveda/ajustes'
import { atender, type Piezas } from '../../src/main/navegador/protocolo'
import { nuevaClaveSecreta, nuevoIdCuenta } from '../../src/shared/claveSecreta'
import { PETICIONES_DE_PAGINA, type Peticion, type Respuesta } from '../../src/shared/navegador'
import type { EstadoSesion } from '../../src/shared/tipos'

const MAESTRA = 'una contraseña bastante larga'

export interface ClacDePrueba {
  bloquear: () => void
  desbloquear: () => void
  /** Cuántos elementos tiene la caja, para mirarlo desde la prueba. */
  elementos: () => Array<{ titulo: string; usuario: string; llaves: number }>
  /** Lo que hace el service worker con lo que llega de una página. */
  pedir: (mensaje: { tipo?: string }, origen: string) => Promise<Respuesta>
  cerrar: () => void
}

export function arrancarClac(carpeta: string): ClacDePrueba {
  const caja = new CajaFuerte(carpeta, { N: 2 ** 10 })
  const clave = nuevaClaveSecreta(nuevoIdCuenta())
  caja.crear(MAESTRA, clave)
  let estado: EstadoSesion = 'abierta'
  let siguiente = 1

  const piezas: Piezas = {
    caja: () => caja,
    estado: () => estado,
    ajustes: () => leerAjustes(caja.db),
    version: 'prueba',
    desbloquear: (contrasena) => {
      caja.desbloquear(contrasena, clave.secreto)
      estado = 'abierta'
    },
    helloListo: () => true,
    desbloquearHello: async () => {
      caja.desbloquear(MAESTRA, clave.secreto)
      estado = 'abierta'
    },
    copiar: async () => ({ segundos: 90 }),
    abrirElemento: () => undefined,
    alCambiar: () => undefined
  }

  return {
    bloquear: () => {
      caja.bloquear()
      estado = 'bloqueada'
    },
    desbloquear: () => {
      caja.desbloquear(MAESTRA, clave.secreto)
      estado = 'abierta'
    },
    elementos: () =>
      caja
        .listar()
        .filter((e) => e.estado === 'activo')
        .map((e) => {
          const detalle = caja.obtener(e.id)
          return {
            titulo: e.titulo,
            usuario: detalle.secciones.flatMap((s) => s.campos).find((c) => c.clave === 'usuario')?.valor ?? '',
            llaves: detalle.secciones.flatMap((s) => s.campos).filter((c) => c.tipo === 'llave').length
          }
        }),
    pedir: async (mensaje, origen) => {
      const tipo = mensaje?.tipo ?? ''
      if (!(PETICIONES_DE_PAGINA as readonly string[]).includes(tipo)) {
        return { id: 0, ok: false, error: 'Desde una página solo se pueden pedir las llaves de acceso.' }
      }
      return atender({ ...mensaje, id: siguiente++, origen } as Peticion, piezas)
    },
    cerrar: () => caja.cerrar()
  }
}
