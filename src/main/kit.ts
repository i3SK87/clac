/**
 * El kit de emergencia, en HTML listo para imprimir a PDF.
 *
 * Es el papel que salva la caja fuerte si se pierde el ordenador: lleva la
 * clave secreta y un hueco para escribir a mano la contraseña maestra. Sin él,
 * una copia de seguridad en otro equipo no se puede abrir, y nadie —tampoco
 * esta aplicación— tiene forma de recuperarla.
 *
 * No importa nada de Electron, como el informe de BONK, para poder comprobar la
 * maqueta en las pruebas. Los colores van a fuego: un papel no tiene tema.
 */
import { formatearClave, type ClaveSecreta } from '@shared/claveSecreta'
import { fechaLarga } from '@shared/fechas'

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface DatosKit {
  clave: ClaveSecreta
  carpeta: string
  creada: Date
  /** El icono en PNG, como `data:`. */
  icono: string
}

export function construirKitHtml(d: DatosKit): string {
  const clave = formatearClave(d.clave)
  const trozos = clave.split('-')
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Kit de emergencia de CLAC</title>
<style>
  @page { size: A4; margin: 18mm 18mm 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; color: #14161a; font-size: 10.5pt; line-height: 1.5; }
  header { display: flex; align-items: center; gap: 12px; padding-bottom: 12px; border-bottom: 2px solid #14161a; }
  header img { width: 40px; height: 40px; }
  header h1 { font-size: 20pt; margin: 0; letter-spacing: -0.02em; }
  header p { margin: 0; color: #5c636e; font-size: 9.5pt; }
  .fecha { margin-left: auto; text-align: right; color: #5c636e; font-size: 9pt; }
  h2 { font-size: 11pt; margin: 22px 0 6px; text-transform: uppercase; letter-spacing: 0.07em; color: #5c636e; }
  .clave { border: 1.5px solid #14161a; border-radius: 10px; padding: 14px 16px; }
  .clave .signos { font-family: "Cascadia Mono", Consolas, monospace; font-size: 17pt; letter-spacing: 0.06em; font-weight: 600; }
  .clave .signos span.guion { color: #9aa1ab; }
  .clave .pie { font-size: 8.5pt; color: #5c636e; margin-top: 6px; }
  .hueco { border: 1.5px dashed #9aa1ab; border-radius: 10px; height: 64px; margin-top: 4px; position: relative; }
  .hueco span { position: absolute; left: 14px; bottom: 8px; font-size: 8.5pt; color: #9aa1ab; }
  ol { padding-left: 20px; margin: 6px 0; }
  li { margin-bottom: 5px; }
  .aviso { margin-top: 22px; padding: 12px 14px; border-radius: 10px; background: #f6ecde; color: #6b3f00; font-size: 9.5pt; }
  .dato { font-family: "Cascadia Mono", Consolas, monospace; font-size: 9pt; word-break: break-all; }
  footer { margin-top: 26px; font-size: 8.5pt; color: #9aa1ab; }
</style>
</head>
<body>
  <header>
    <img src="${d.icono}" alt="">
    <div>
      <h1>Kit de emergencia</h1>
      <p>CLAC · gestor de contraseñas</p>
    </div>
    <div class="fecha">Caja fuerte creada<br>el ${escaparHtml(fechaLarga(d.creada))}</div>
  </header>

  <h2>Clave secreta</h2>
  <div class="clave">
    <div class="signos">${trozos.map((t) => escaparHtml(t)).join('<span class="guion">-</span>')}</div>
    <div class="pie">Identificador de la cuenta: <strong>${escaparHtml(d.clave.idCuenta)}</strong> · 34 signos, sin 0, 1, I, O ni U</div>
  </div>

  <h2>Contraseña maestra</h2>
  <div class="hueco"><span>Escríbela aquí a mano, o guárdala en otro sitio seguro</span></div>

  <h2>Para qué sirve este papel</h2>
  <p>Tu caja fuerte se abre con dos cosas a la vez: la contraseña maestra, que sabes tú, y la clave secreta de arriba, que está guardada en este ordenador. Si el ordenador se rompe, se pierde o lo cambias, la clave secreta solo existe aquí.</p>

  <h2>Cómo abrir tu caja fuerte en otro ordenador</h2>
  <ol>
    <li>Instala CLAC en el ordenador nuevo.</li>
    <li>Copia la carpeta de tus datos, o una de sus copias de seguridad (están en la subcarpeta <em>copias</em>). En este equipo la carpeta es:<br><span class="dato">${escaparHtml(d.carpeta)}</span></li>
    <li>En el ordenador nuevo, pégala en el mismo sitio (<span class="dato">%APPDATA%\\CLAC</span>) o elige «Restaurar una copia» al abrir CLAC.</li>
    <li>CLAC te pedirá la contraseña maestra y esta clave secreta.</li>
  </ol>

  <div class="aviso"><strong>Guárdalo como guardarías una llave.</strong> Con este papel y tu contraseña se abre todo. Sin los dos, nadie puede abrir la caja fuerte: ni tú, ni quien la robe, ni esta aplicación.</div>

  <footer>Generado por CLAC. No hace falta volver a imprimirlo salvo que cambies de clave secreta: cambiar la contraseña maestra no la cambia.</footer>
</body>
</html>`
}
