/**
 * Sacar las contraseñas de CLAC, en claro.
 *
 * Dos salidas, para dos cosas distintas:
 *
 * - **JSON de CLAC**: todo, con cada campo, sección, etiqueta y nota. Es la
 *   salida de emergencia y la que se vuelve a importar aquí sin perder nada.
 * - **CSV al estilo de Bitwarden**: solo inicios de sesión y notas, pero en un
 *   formato que casi cualquier gestor sabe leer, por si algún día toca irse.
 *
 * Los dos van sin cifrar. La pantalla lo avisa y pide la contraseña antes.
 */
import { escribirCsv } from '@shared/csv'
import { categoria, contrasenaDe, todosLosCampos, totpDe, usuarioDe } from '@shared/categorias'
import type { ParaRevisar } from '@shared/watchtower'
import type { Boveda } from '@shared/tipos'

export function exportarJson(elementos: ParaRevisar[], bovedas: Boveda[]): string {
  const nombres = new Map(bovedas.map((b) => [b.id, b.nombre]))
  return JSON.stringify(
    {
      formato: 'clac',
      version: 1,
      exportado: new Date().toISOString(),
      aviso: 'Este archivo tiene todas tus contraseñas sin cifrar. Bórralo en cuanto no lo necesites.',
      bovedas: bovedas.map((b) => ({ nombre: b.nombre, descripcion: b.descripcion })),
      elementos: elementos
        .filter((x) => x.elemento.estado !== 'eliminado')
        .map(({ elemento: e, detalle }) => ({
          boveda: nombres.get(e.bovedaId) ?? '',
          categoria: e.categoria,
          titulo: e.titulo,
          webs: e.webs,
          etiquetas: e.etiquetas,
          favorito: e.favorito,
          estado: e.estado,
          creado: e.creado,
          modificado: e.modificado,
          secciones: detalle.secciones,
          notas: detalle.notas
        }))
    },
    null,
    2
  )
}

export function exportarCsv(elementos: ParaRevisar[], bovedas: Boveda[]): string {
  const nombres = new Map(bovedas.map((b) => [b.id, b.nombre]))
  const filas: string[][] = [
    ['folder', 'favorite', 'type', 'name', 'notes', 'fields', 'reprompt', 'login_uri', 'login_username', 'login_password', 'login_totp']
  ]
  for (const { elemento: e, detalle } of elementos) {
    if (e.estado === 'eliminado') continue
    const usuario = usuarioDe(detalle)
    const contrasena = contrasenaDe(detalle)
    const esLogin = e.categoria === 'login' || e.categoria === 'contrasena' || !!usuario || !!contrasena
    // Lo que no es usuario, contraseña ni código va como campo personalizado:
    // «nombre: valor», uno por línea, que es lo que entiende Bitwarden.
    const resto = todosLosCampos(detalle)
      .filter((c) => c.valor.trim() && c.clave !== 'usuario' && c.clave !== 'contrasena' && c.tipo !== 'totp')
      .map((c) => `${c.etiqueta}: ${c.valor.replace(/\r?\n/g, ' ')}`)
    const tipoNoLogin = e.categoria === 'nota' ? '' : `Tipo: ${categoria(e.categoria).nombre}`
    filas.push([
      nombres.get(e.bovedaId) ?? '',
      e.favorito ? '1' : '',
      esLogin ? 'login' : 'note',
      e.titulo,
      [esLogin ? '' : tipoNoLogin, detalle.notas].filter(Boolean).join('\n'),
      resto.join('\n'),
      '0',
      e.webs.join(','),
      usuario,
      contrasena,
      totpDe(detalle)
    ])
  }
  return escribirCsv(filas)
}
