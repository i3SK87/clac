/**
 * El nombre de un programa a partir de la ruta de su ejecutable: sin carpetas
 * ni «.exe». Sirve para filtrar el buscador del auto-tecleo cuando el título
 * de la ventana no dice nada por sí solo (por ejemplo, «Iniciar sesión»).
 */
export function nombrePrograma(ruta: string): string {
  const archivo = ruta.split(/[\\/]/).pop() ?? ''
  return archivo.replace(/\.exe$/i, '')
}
