// El tutorial de CLAC en PDF. Se escribe como una página web y lo pagina el
// propio motor de Electron, igual que el kit de emergencia.
//
//   node_modules\electron\dist\electron.exe docs\tutorial\construir.cjs
//
// Las capturas salen de `capturas/`, que se rehacen con retratar.cjs.
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync, mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const RAIZ = join(__dirname, '..', '..')
const version = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')).version.replace(/\.0$/, '')
const img = (nombre) => `data:image/png;base64,${readFileSync(join(__dirname, 'capturas', `${nombre}.png`)).toString('base64')}`
const icono = `data:image/png;base64,${readFileSync(join(RAIZ, 'resources', 'icon.png')).toString('base64')}`

const figura = (nombre, pie, clase = '') => `
  <figure class="${clase}">
    <img src="${img(nombre)}" alt="">
    <figcaption>${pie}</figcaption>
  </figure>`

const k = (...teclas) => teclas.map((t) => `<kbd>${t}</kbd>`).join('<span class="mas">+</span>')

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Cómo usar CLAC</title>
<style>
  @page { size: A4; margin: 17mm 18mm 20mm; }
  @page :first { margin: 0; }
  :root {
    --tinta: #14161a;
    --atenuado: #5c636e;
    --sutil: #767e8c;
    --papel: #ffffff;
    --hundido: #f2f3f7;
    --borde: #dfe2e8;
    --acento: #0b6bd3;
    --acento-suave: #e6f0fb;
    --noche: #1c1f26;
    --noche-tinta: #a8b0bd;
    --aviso: #a35a00;
    --aviso-suave: #fbf1e3;
    --mal: #c0271c;
    --mal-suave: #fbeceb;
    --ok: #157f3d;
  }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0;
    font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
    color: var(--tinta);
    font-size: 10.5pt;
    line-height: 1.55;
  }
  h1, h2, h3 { font-family: "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif; letter-spacing: -0.015em; text-wrap: balance; }
  h1 { font-size: 23pt; line-height: 1.15; margin: 0 0 4mm; }
  h2 { font-size: 13.5pt; margin: 7mm 0 2mm; }
  h3 { font-size: 11pt; margin: 5mm 0 1.5mm; }
  p { margin: 0 0 2.6mm; }
  strong { font-weight: 650; }
  code, .mono { font-family: "Cascadia Mono", Consolas, monospace; font-size: 0.9em; }
  code { background: var(--hundido); padding: 0.2mm 1.2mm; border-radius: 1mm; }
  kbd {
    display: inline-block;
    font-family: "Segoe UI", system-ui, sans-serif;
    font-size: 8.5pt;
    line-height: 1.5;
    padding: 0 1.6mm;
    border: 0.25mm solid #c8ccd4;
    border-bottom-width: 0.6mm;
    border-radius: 1.2mm;
    background: #fff;
    white-space: nowrap;
  }
  .mas { color: var(--sutil); margin: 0 0.6mm; font-size: 8.5pt; }

  /* ---------- Portada ---------- */
  .portada {
    height: 297mm;
    width: 210mm;
    background: var(--noche);
    color: #fff;
    padding: 34mm 24mm 22mm;
    display: flex;
    flex-direction: column;
    page-break-after: always;
  }
  .portada img { width: 30mm; height: 30mm; border-radius: 8mm; box-shadow: 0 6mm 16mm rgba(0,0,0,.4); }
  .portada .marca { font-size: 15pt; font-weight: 700; letter-spacing: -0.02em; margin-top: 7mm; color: #fff; }
  .portada h1 { font-size: 40pt; margin: 16mm 0 5mm; color: #fff; letter-spacing: -0.03em; }
  .portada .sub { font-size: 14pt; color: var(--noche-tinta); max-width: 130mm; line-height: 1.45; }
  .portada .pie { margin-top: auto; font-size: 9pt; color: var(--noche-tinta); border-top: 0.3mm solid rgba(255,255,255,.12); padding-top: 5mm; display: flex; justify-content: space-between; gap: 10mm; }

  /* ---------- Índice ---------- */
  .indice { page-break-after: always; }
  .indice ol { list-style: none; padding: 0; margin: 6mm 0 0; counter-reset: cap; }
  .indice li { counter-increment: cap; display: grid; grid-template-columns: 10mm 1fr; gap: 0 2mm; padding: 1.5mm 0; border-bottom: 0.25mm solid var(--borde); break-inside: avoid; }
  .indice li::before { content: counter(cap); font-weight: 700; color: var(--acento); font-size: 12pt; }
  .indice li strong { display: block; font-size: 10.5pt; }
  .indice li span { color: var(--atenuado); font-size: 9.5pt; }
  .nota-ejemplo { margin-top: 5mm; font-size: 9pt; color: var(--atenuado); }

  /* ---------- Capítulos ---------- */
  section.capitulo { margin-top: 12mm; padding-top: 8mm; border-top: 0.4mm solid var(--borde); }
  section.capitulo:first-of-type { margin-top: 0; padding-top: 0; border-top: none; }
  .cabeza { break-inside: avoid; break-after: avoid; }
  /* Una tabla entera no se parte: su capítulo empieza en página nueva para que el título no se quede solo. */
  section.capitulo.pagina-nueva { break-before: page; margin-top: 0; padding-top: 0; border-top: none; }
  h2, h3 { break-after: avoid; }
  p, li { orphans: 3; widows: 3; }
  .num {
    display: inline-grid; place-items: center;
    width: 9mm; height: 9mm; border-radius: 50%;
    background: var(--acento-suave); color: var(--acento);
    font-weight: 700; font-size: 11pt; margin-bottom: 3mm;
  }
  .entradilla { font-size: 11.5pt; color: var(--atenuado); margin-bottom: 5mm; max-width: 160mm; }

  figure { margin: 4mm 0 5mm; break-inside: avoid; }
  figure img { display: block; width: auto; max-width: 100%; max-height: 92mm; margin: 0 auto; border: 0.25mm solid var(--borde); border-radius: 2.4mm; box-shadow: 0 1mm 3mm rgba(16,24,40,.08); }
  figure.estrecha img { max-height: 72mm; }
  figure.pequena img { width: 46%; margin: 0 auto; }
  figcaption { font-size: 8.8pt; color: var(--sutil); margin-top: 2mm; text-align: center; }
  .pareja { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; align-items: start; }
  .pareja figure img { max-height: 110mm; }

  /* Un trozo de una captura grande. */
  .recorte { position: relative; overflow: hidden; width: 100%; border: 0.25mm solid var(--borde); border-radius: 2.4mm; box-shadow: 0 1mm 3mm rgba(16,24,40,.08); }
  .recorte img { position: absolute; border: none; border-radius: 0; box-shadow: none; max-width: none; }

  ol.pasos { list-style: none; counter-reset: paso; padding: 0; margin: 3mm 0 4mm; }
  ol.pasos > li { counter-increment: paso; position: relative; padding: 0 0 0 10mm; margin-bottom: 3mm; min-height: 7mm; }
  ol.pasos > li::before {
    content: counter(paso); position: absolute; left: 0; top: 0;
    width: 6.5mm; height: 6.5mm; border-radius: 50%;
    background: var(--noche); color: #fff; font-size: 8.5pt; font-weight: 700;
    display: grid; place-items: center;
  }
  ul { margin: 0 0 3mm; padding-left: 5mm; }
  ul li { margin-bottom: 1.4mm; }

  .caja-nota { border-radius: 2.4mm; padding: 3.2mm 4mm; margin: 4mm 0; font-size: 10pt; break-inside: avoid; }
  .caja-nota > strong:first-child { display: block; margin-bottom: 1mm; }
  .importante { background: var(--aviso-suave); }
  .importante > strong:first-child { color: var(--aviso); }
  .truco { background: var(--acento-suave); }
  .truco > strong:first-child { color: var(--acento); }
  .peligro { background: var(--mal-suave); }
  .peligro > strong:first-child { color: var(--mal); }

  table { width: 100%; border-collapse: collapse; margin: 3mm 0 4mm; font-size: 9.8pt; break-inside: avoid; }
  th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; color: var(--sutil); padding: 1.8mm 2mm; border-bottom: 0.3mm solid var(--borde); }
  td { padding: 2mm; border-bottom: 0.25mm solid var(--borde); vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  td:first-child { white-space: nowrap; }

  .preguntas h3 { margin-top: 6mm; }
  .clave-ejemplo { font-family: "Cascadia Mono", Consolas, monospace; font-weight: 600; letter-spacing: 0.05em; background: var(--hundido); border-radius: 2mm; padding: 2.5mm 4mm; display: inline-block; }

  /* Las dos llaves */
  .llaves { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr; align-items: center; gap: 3mm; margin: 5mm 0; break-inside: avoid; }
  .llave { border: 0.3mm solid var(--borde); border-radius: 2.4mm; padding: 3mm; text-align: center; font-size: 9.5pt; }
  .llave strong { display: block; font-size: 10.5pt; margin-bottom: 1mm; }
  .llave.caja { background: var(--noche); color: #fff; border-color: var(--noche); }
  .llave.caja span { color: var(--noche-tinta); }
  .signo { font-size: 16pt; color: var(--sutil); font-weight: 300; }
</style>
</head>
<body>

<div class="portada">
  <img src="${icono}" alt="">
  <div class="marca">CLAC</div>
  <h1>Cómo usar CLAC</h1>
  <p class="sub">Tu gestor de contraseñas, en tu ordenador y en ningún otro sitio. De la instalación a la extensión de Opera Air, paso a paso.</p>
  <div class="pie">
    <span>Versión ${version} · septiembre de 2026</span>
    <span>De la misma casa que BONK</span>
  </div>
</div>

<div class="indice">
  <h1>Qué hay aquí</h1>
  <ol>
    <li><div><strong>Antes de empezar</strong><span>Qué es CLAC y las dos llaves que abren tu caja fuerte.</span></div></li>
    <li><div><strong>Instalarla</strong><span>El aviso azul de Windows, y cómo se actualiza sola.</span></div></li>
    <li><div><strong>La primera vez</strong><span>La contraseña maestra, la clave secreta y el kit de emergencia.</span></div></li>
    <li><div><strong>Traerte tus contraseñas de Opera</strong><span>Exportar del navegador e importar en CLAC.</span></div></li>
    <li><div><strong>La pantalla principal</strong><span>La barra lateral, la lista, la ficha y el clic derecho.</span></div></li>
    <li><div><strong>Crear y editar</strong><span>Tipos de elemento, campos, generador, webs, etiquetas y archivos.</span></div></li>
    <li><div><strong>El generador</strong><span>Contraseñas aleatorias, memorables y PIN.</span></div></li>
    <li><div><strong>El acceso rápido</strong><span>Ctrl + Mayús + Espacio desde cualquier programa.</span></div></li>
    <li><div><strong>La extensión para Opera Air</strong><span>Instalarla y rellenar contraseñas en las webs.</span></div></li>
    <li><div><strong>Watchtower</strong><span>El repaso de tu caja: débiles, repetidas, filtradas, caducadas.</span></div></li>
    <li><div><strong>Ordenar la caja</strong><span>Cajas fuertes, etiquetas, archivo y papelera.</span></div></li>
    <li><div><strong>La seguridad del día a día</strong><span>Bloqueo, Windows Hello y portapapeles.</span></div></li>
    <li><div><strong>Copias y cambiar de ordenador</strong><span>Copias automáticas, restaurar y exportar.</span></div></li>
    <li><div><strong>Atajos de teclado</strong><span>Todos, en una tabla.</span></div></li>
    <li><div><strong>Preguntas frecuentes</strong><span>Lo que más se pregunta, con respuesta corta.</span></div></li>
  </ol>
  <p class="nota-ejemplo">Las capturas de este tutorial usan datos inventados (Ana García, Banco Ejemplo…): no son de nadie.</p>
</div>

<!-- 1 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">1</div>
  <h1>Antes de empezar</h1>
  <p class="entradilla">CLAC guarda tus contraseñas, tarjetas, documentos y todo lo que haya que tener a mano, cifrado en tu ordenador. No hay cuenta que crear, ni nube, ni suscripción.</p></div>

  <h2>Las dos llaves</h2>
  <p>Tu caja fuerte se abre con dos cosas a la vez. Es el mismo sistema que usa 1Password:</p>
  <div class="llaves">
    <div class="llave"><strong>Contraseña maestra</strong>La sabes tú. Es la única que tienes que recordar.</div>
    <div class="signo">+</div>
    <div class="llave"><strong>Clave secreta</strong>34 signos al azar. Se guarda en este ordenador y en tu kit de emergencia.</div>
    <div class="signo">=</div>
    <div class="llave caja"><strong>Tu caja fuerte</strong><span>Abierta, en este equipo y en ningún otro.</span></div>
  </div>
  <p>La clave secreta es lo que hace que una copia de tu caja fuerte no sirva de nada en manos de otro: aunque alguien se la llevara en una memoria USB, sin la clave secreta no podría ni empezar a probar contraseñas. Tiene esta pinta:</p>
  <p><span class="clave-ejemplo">C1-7KQ2MX-4TP9A-HX3VE-Z8R2K-N6YWD-QF5LBW</span></p>
  <p>No tienes que escribirla nunca en este ordenador: CLAC la guarda cifrada con tu cuenta de Windows. Solo te hará falta si cambias de ordenador, y para eso está el <strong>kit de emergencia</strong>, un PDF que imprimes una vez y guardas como guardarías una llave.</p>

  <div class="caja-nota peligro"><strong>Lo único que no tiene arreglo</strong>Si olvidas la contraseña maestra, nadie puede abrir la caja fuerte: ni tú, ni quien te la robe, ni CLAC. No hay «¿olvidaste tu contraseña?» que valga, y es precisamente lo que la hace segura. Elígela con calma y apúntala en el kit.</div>

  <h2>Lo que CLAC no hace</h2>
  <ul>
    <li><strong>No se conecta a internet</strong> más que para dos cosas: mirar al abrir si hay una versión nueva (capítulo 2), y comprobar si tus contraseñas han salido en alguna filtración, solo si tú lo pides (capítulo 10). En ninguna de las dos sale nada de tu caja fuerte.</li>
    <li><strong>No está en el móvil</strong>. Es solo para este ordenador.</li>
    <li><strong>No sincroniza</strong> entre ordenadores. Para llevarte la caja a otro equipo se usa una copia (capítulo 13).</li>
  </ul>
</section>

<!-- 2 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">2</div>
  <h1>Instalarla</h1>
  <p class="entradilla">Un instalador normal de Windows, como el de BONK.</p></div>
  <ol class="pasos">
    <li>En la pestaña <strong>Releases</strong> de <code>github.com/i3SK87/clac</code>, descarga <code>CLAC-${version}.0-Setup.exe</code> (el de arriba es el más reciente) y ábrelo.</li>
    <li><strong>Windows va a protestar</strong> con una pantalla azul que dice «Windows protegió su PC». Es lo normal en programas que no han pasado por la firma de pago de Microsoft; no significa que haya nada malo. Pulsa <strong>Más información</strong> y luego <strong>Ejecutar de todas formas</strong>.</li>
    <li>Sigue el instalador. Al acabar tendrás CLAC en el escritorio y en el menú Inicio.</li>
  </ol>
  <div class="caja-nota truco"><strong>Si el instalador no pasa</strong>Hay un <code>.zip</code> portátil con la misma aplicación. Descomprímelo donde quieras y abre <code>CLAC.exe</code>.</div>
  <p>CLAC se queda en la bandeja del sistema, junto al reloj, aunque cierres la ventana: es lo que permite el acceso rápido y la extensión del navegador. Para salir del todo, clic derecho en el candado de la bandeja ▸ <strong>Salir</strong>.</p>
  <p>Tus datos no están en la carpeta del programa sino en <code>%APPDATA%\\CLAC</code>. Desinstalar CLAC no los borra.</p>
  <h2>Se actualiza sola</h2>
  <p>Solo hay que instalarla una vez. Al abrir, CLAC mira en GitHub si hay una versión nueva, como BONK. Si la hay, sale <strong>Actualización disponible</strong> debajo de Ajustes, en la barra lateral: al pulsarlo se descarga y, al acabar, te ofrece <strong>reiniciar</strong>. Si dices que no, se instala sola la próxima vez que salgas de CLAC. Tu caja fuerte no se toca.</p>
  <p>Si no quieres que mire nada al abrir, desmarca <strong>Ajustes ▸ Acerca de ▸ Buscar versiones nuevas</strong>; ahí mismo tienes <strong>Buscar ahora</strong> para hacerlo a mano.</p>
  <div class="caja-nota truco"><strong>Tras actualizar, la extensión</strong>Viene dentro de CLAC y se actualiza con ella. Para que Opera cargue la nueva, pulsa el botón de recargar de la extensión de CLAC en <code>opera://extensions</code>.</div>
</section>

<!-- 3 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">3</div>
  <h1>La primera vez</h1>
  <p class="entradilla">Tres pantallas y habrás terminado. La del medio es la importante.</p></div>
  ${figura('t01-bienvenida', 'La bienvenida. «Ya tengo una: restaurar una copia» es para cuando cambias de ordenador (capítulo 13).', 'estrecha')}
  <h2>Elige la contraseña maestra</h2>
  <p>Pulsa <strong>Crear mi caja fuerte</strong>. Te pide la contraseña maestra dos veces. Tiene que tener al menos 10 caracteres y no ser fácil de adivinar: el medidor te lo dice mientras escribes.</p>
  <p>Lo más fácil de recordar y más difícil de adivinar es una <strong>frase de cuatro o cinco palabras que no tengan nada que ver</strong>. Si no se te ocurre, pulsa <strong>Sugiéreme una</strong> y CLAC te propone una, del estilo de <code>Farola-Tortuga-Queso-Lento-Pino</code>.</p>
  ${figura('t02-contrasena', 'El medidor dice «Excelente» con cinco palabras al azar.', 'estrecha')}
  <h2>Guarda el kit de emergencia</h2>
  <p>Al pulsar <strong>Crear la caja fuerte</strong> aparece tu clave secreta. Pulsa <strong>Guardar el kit de emergencia (PDF)</strong>, elige dónde guardarlo e <strong>imprímelo</strong>. En el papel hay un hueco para escribir a mano la contraseña maestra.</p>
  ${figura('t03-clave', 'No se puede seguir sin marcar «He guardado el kit de emergencia».', 'estrecha')}
  <div class="caja-nota importante"><strong>Dónde guardar el kit</strong>Impreso, en el mismo sitio donde guardas los papeles importantes. Si lo guardas en el ordenador, que no sea solo en este: si el ordenador se rompe, el kit se va con él.</div>
</section>

<!-- 4 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">4</div>
  <h1>Traerte tus contraseñas de Opera</h1>
  <p class="entradilla">Si ahora las tienes guardadas en el navegador, se pasan a CLAC en un par de minutos.</p></div>
  <h2>En Opera Air: exportarlas</h2>
  <ol class="pasos">
    <li>Escribe <code>opera://settings/passwords</code> en la barra de direcciones.</li>
    <li>Busca la opción <strong>Exportar contraseñas</strong> (suele estar en el menú de los tres puntos, junto a «Contraseñas guardadas») y guarda el archivo <code>.csv</code>. Si no la ves, escribe «exportar» en el buscador de la configuración.</li>
  </ol>
  <h2>En CLAC: importarlas</h2>
  <ol class="pasos">
    <li>Ve a <strong>Ajustes ▸ Datos ▸ Importar contraseñas…</strong> y pulsa <strong>Elegir el archivo…</strong>.</li>
    <li>CLAC reconoce solo de dónde viene el archivo y te enseña cuántos elementos hay y cuáles ya tenías (esos no se duplican).</li>
    <li>Pulsa <strong>Importar</strong>.</li>
  </ol>
  ${figura('t12-importar', 'La vista previa de lo que se va a importar.')}
  <div class="caja-nota peligro"><strong>Borra el archivo exportado</strong>El <code>.csv</code> tiene todas tus contraseñas sin cifrar. En cuanto termines de importar, bórralo (y vacía la papelera de Windows). Si ya no quieres que Opera las guarde, puedes borrarlas también de allí.</div>
  <p>También se puede importar desde Chrome, Edge, Brave, Firefox, 1Password (<code>.1pux</code>, que trae también los documentos, o CSV), Bitwarden, KeePassXC y LastPass.</p>
</section>

<!-- 5 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">5</div>
  <h1>La pantalla principal</h1>
  <p class="entradilla">Tres columnas: a la izquierda la barra lateral, en medio la lista y a la derecha la ficha del elemento elegido.</p></div>
  ${figura('t05-caja', 'Con «Google» elegido: el usuario, la contraseña oculta y el código de un solo uso con su cuenta atrás.')}
  <h2>La barra lateral</h2>
  <ul>
    <li><strong>Todo</strong>, <strong>Watchtower</strong> (con el número de avisos) y el <strong>Generador</strong>.</li>
    <li><strong>Categorías</strong>: solo salen las que tienen algo (inicios de sesión, tarjetas, DNI…).</li>
    <li><strong>Cajas fuertes</strong> y <strong>Etiquetas</strong>, para ordenar (capítulo 11).</li>
    <li>Abajo, <strong>Archivo</strong>, <strong>Papelera</strong>, <strong>Ajustes</strong> y <strong>Bloquear</strong>.</li>
  </ul>
  <h2>Copiar</h2>
  <p><strong>Pulsa cualquier valor y se copia.</strong> Un aviso abajo a la derecha te dice qué has copiado y que se borrará del portapapeles en 90 segundos. Al pasar el ratón por un campo aparecen sus botones: el ojo para <strong>mostrarlo</strong>, las flechas para <strong>verlo en grande</strong> (carácter a carácter, para dictarlo o teclearlo en otro sitio) y <strong>copiar</strong>.</p>
  <p>La contraseña, al mostrarla, sale con las <strong>cifras en azul</strong> y los <strong>símbolos en naranja</strong>, para no confundir la O con el 0 ni la l con el 1.</p>
  <h2>El clic derecho</h2>
  <p>Como en BONK, casi todo tiene clic derecho. En un elemento de la lista salen, sin tener que elegirlo antes, <strong>copiar el usuario, la contraseña o el código</strong>, abrir su web, editar, duplicar, moverlo a otra caja fuerte, archivarlo o mandarlo a la papelera. En la papelera, <strong>Recuperar</strong> y <strong>Borrar para siempre</strong>.</p>
  ${figura('t13-menu', 'Clic derecho en «Google» sin salir de «Banco Ejemplo». A la derecha, el atajo de cada cosa.')}
  <p>En la ficha, el clic derecho sobre un campo tiene lo mismo que sus botones: <strong>copiar</strong>, <strong>mostrar</strong> y, en las contraseñas, <strong>ver en grande</strong>. Y sobre una caja fuerte de la barra lateral, <strong>editarla</strong>, <strong>crear otra</strong> o <strong>eliminarla</strong>.</p>
  <h2>Buscar</h2>
  <p>El buscador de arriba (<kbd>Ctrl</kbd><span class="mas">+</span><kbd>F</kbd>) busca en títulos, usuarios, webs y etiquetas, sin importar tildes ni mayúsculas. Con las flechas <kbd>↑</kbd> <kbd>↓</kbd> te mueves por la lista.</p>
</section>

<!-- 6 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">6</div>
  <h1>Crear y editar</h1>
  <p class="entradilla">Pulsa <strong>Nuevo elemento</strong> (o <kbd>Ctrl</kbd><span class="mas">+</span><kbd>N</kbd>) y elige qué es.</p></div>
  ${figura('t06-nuevo', 'Veintidós tipos, con los más usados arriba. Escribe para buscar uno.')}
  <p>Cada tipo trae sus campos: un inicio de sesión, usuario y contraseña; una tarjeta, titular, número, caducidad y código de seguridad; una cuenta bancaria, IBAN y BIC; un DNI, número, soporte y caducidad… Pero son un punto de partida: todo se puede cambiar.</p>
  ${figura('t07-editor', 'Editando «Google», con el generador abierto junto a la contraseña.')}
  <h2>Lo que puedes hacer en la ficha</h2>
  <ul>
    <li><strong>Cambiar el nombre de un campo</strong>: pulsa en su rótulo y escribe.</li>
    <li><strong>Añadir un campo</strong> de cualquier tipo: texto, contraseña, código de un solo uso, correo, web, teléfono, fecha…</li>
    <li><strong>Añadir una sección</strong> con título propio, por ejemplo «Preguntas de seguridad».</li>
    <li>Junto a cada contraseña, la <strong>varita</strong> abre el generador; <strong>Usar esta</strong> la pone en el campo.</li>
    <li><strong>Webs</strong>: las del inicio de sesión. Son las que usa la extensión para saber qué va en cada web.</li>
    <li><strong>Etiquetas</strong>: escribe y pulsa <kbd>Intro</kbd>.</li>
  </ul>
  <p>Guarda con <strong>Guardar</strong> o <kbd>Ctrl</kbd><span class="mas">+</span><kbd>S</kbd>. Para editar uno que ya existe: <strong>Editar</strong> o <kbd>Ctrl</kbd><span class="mas">+</span><kbd>E</kbd>.</p>
  <h2>Códigos de un solo uso</h2>
  <p>Son los de «verificación en dos pasos» que dan apps como Google Authenticator. Cuando una web te enseñe el código QR para activarlos, busca debajo el enlace de «¿no puedes escanearlo?»: te dará un secreto en letras y números. Pégalo en un campo <strong>Código de un solo uso</strong> y CLAC generará los códigos de seis cifras, con su cuenta atrás.</p>
  <h2>Archivos e historial</h2>
  <p>Con el elemento guardado, <strong>Adjuntar archivo</strong> le añade documentos (hasta 50 MB cada uno), cifrados como todo lo demás. Y cada vez que guardas un cambio, lo de antes queda en el <strong>Historial de cambios</strong> (menú <strong>⋯</strong> de la ficha): las veinte últimas versiones, que puedes ver y restaurar.</p>
</section>

<!-- 7 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">7</div>
  <h1>El generador</h1>
  <p class="entradilla">En la barra lateral, y junto a cada campo de contraseña.</p></div>
  ${figura('t08-generador', 'Una aleatoria de 20 caracteres: 125 bits de azar.')}
  <ul>
    <li><strong>Aleatoria</strong>: para las webs, que no tienes que recordar. De 8 a 64 caracteres, con o sin cifras y símbolos. La de fábrica, 20 con todo, es más que suficiente.</li>
    <li><strong>Memorable</strong>: de 3 a 10 palabras en castellano, para lo que tecleas a mano (la contraseña del ordenador, la del wifi). Eliges el separador y si llevan mayúscula. Sin tildes ni eñes de fábrica, por si algún día la escribes en un teclado de fuera.</li>
    <li><strong>PIN</strong>: de 4 a 12 cifras.</li>
  </ul>
  <p>Los <strong>bits</strong> son el azar de verdad que lleva: a partir de 60 es muy difícil de adivinar, y a partir de 80, imposible en la práctica.</p>
  <p><strong>Copiar</strong> la deja en el portapapeles; <strong>Guardar como elemento</strong> la guarda como «Contraseña generada» para que le pongas el nombre cuando sepas de qué es.</p>
</section>

<!-- 8 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">8</div>
  <h1>El acceso rápido</h1>
  <p class="entradilla">Desde cualquier programa, sin abrir CLAC: pulsa ${k('Ctrl', 'Mayús', 'Espacio')}.</p></div>
  ${figura('t09-acceso', 'Antes de escribir nada propone lo que más usas.', 'estrecha')}
  <ol class="pasos">
    <li>Pulsa ${k('Ctrl', 'Mayús', 'Espacio')} y empieza a escribir el nombre.</li>
    <li>Elige con las flechas y pulsa <kbd>Intro</kbd>: la contraseña queda copiada y el buscador se va.</li>
    <li>El foco vuelve al programa en el que estabas: pega con ${k('Ctrl', 'V')}.</li>
  </ol>
  <table>
    <tr><th>Tecla</th><th>Qué hace</th></tr>
    <tr><td><kbd>Intro</kbd></td><td>Copia la contraseña</td></tr>
    <tr><td>${k('Ctrl', 'C')}</td><td>Copia el usuario</td></tr>
    <tr><td>${k('Ctrl', 'Alt', 'C')}</td><td>Copia el código de un solo uso</td></tr>
    <tr><td>${k('Alt', 'Intro')}</td><td>Abre la web en el navegador y copia la contraseña</td></tr>
    <tr><td>${k('Ctrl', 'O')}</td><td>Abre el elemento en CLAC</td></tr>
    <tr><td><kbd>Esc</kbd></td><td>Borra la búsqueda, y si ya está vacía, cierra</td></tr>
  </table>
  <p>Si CLAC está bloqueada, el acceso rápido te pide la contraseña maestra ahí mismo, o Windows Hello si lo tienes activado (capítulo 12).</p>
</section>

<!-- 9 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">9</div>
  <h1>La extensión para Opera Air</h1>
  <p class="entradilla">Rellena el usuario y la contraseña en las webs sin copiar ni pegar. Funciona también en Chrome, Edge y Brave.</p></div>
  <h2>Instalarla (una sola vez)</h2>
  <ol class="pasos">
    <li>En CLAC, <strong>Ajustes ▸ Navegador</strong>: marca <strong>Dejar que la extensión de CLAC rellene contraseñas</strong>. La tarjeta te enseña los pasos y la carpeta de la extensión.</li>
    <li>En Opera Air, escribe <code>opera://extensions</code> en la barra de direcciones.</li>
    <li>Enciende el <strong>Modo desarrollador</strong>, arriba a la derecha.</li>
    <li>Pulsa el botón de cargar una extensión descomprimida y elige la carpeta que te indica CLAC (en CLAC tienes un botón para copiar la ruta).</li>
    <li>Fija el candado de CLAC en la barra del navegador para tenerlo a mano.</li>
  </ol>
  <div class="recorte" style="aspect-ratio: 785 / 345">
    <img src="${img('t11-ajustes')}" alt="" style="width: ${(1181 / 785) * 100}%; left: -${(250 / 785) * 100}%; top: -${(736 / 345) * 100}%">
  </div>
  <figcaption>La tarjeta «Navegador» de Ajustes, con la extensión ya conectada.</figcaption>

  <h2>Usarla</h2>
  <div class="pareja">
    <div>
      <p>En la página de entrar de una web, pulsa el candado o ${k('Ctrl', 'Mayús', 'X')}. Arriba salen los elementos de <strong>esa web</strong>; debajo, lo que más usas. Si escribes, busca en toda la caja.</p>
      <p>Pulsa uno (o <kbd>Intro</kbd>) y CLAC <strong>rellena el usuario y la contraseña</strong> en el formulario. Luego entras tú: la extensión nunca envía el formulario por su cuenta.</p>
      <p>En la fila elegida tienes también botones para copiar el usuario, la contraseña o el código, y para abrir el elemento en CLAC.</p>
    </div>
    ${figura('p01-extension', 'En mail.google.com, lo de google.com arriba.')}
  </div>
  <div class="pareja">
    ${figura('p02-extension-aviso', 'Rellenar el banco en una web que no es la del banco: primero, el aviso.')}
    <div>
      <h3>Si la web no es la del elemento, avisa</h3>
      <p>Si pulsas un elemento de otra web, la extensión se para y te lo dice antes de rellenar. Es tu defensa contra las <strong>webs falsas</strong>: una página que imita a la de tu banco puede ser idéntica, pero su dirección no. Si esperabas estar en tu banco y ves este aviso, cierra la página.</p>
      <h3>Guardar y generar</h3>
      <p><strong>Guardar lo escrito</strong> guarda en CLAC el usuario y la contraseña que acabas de escribir en una página; si ya tenías esa web con ese usuario, le cambia la contraseña y la vieja queda en el historial.</p>
      <p><strong>Generar</strong> crea una contraseña nueva para las páginas de alta, la rellena en «contraseña» y «repítela», y te ofrece guardarla.</p>
    </div>
  </div>
  <div class="pareja">
    <div>
      <h3>Si CLAC está cerrada o bloqueada</h3>
      <p>La extensión no guarda nada: cada vez se lo pregunta a CLAC. Si CLAC está <strong>cerrada</strong>, te lo dice y tiene un botón para abrirla. Para que esté siempre, activa <strong>Ajustes ▸ Arrancar con Windows</strong>: arranca en la bandeja, bloqueada y sin ventana.</p>
      <p>Si está <strong>bloqueada</strong>, la desbloqueas desde la propia extensión, con la contraseña maestra o con <strong>Windows Hello</strong>. Con Hello, el diálogo de Windows se lleva el foco y el navegador cierra la ventanita: confirma y vuelve a pulsar el candado.</p>
    </div>
    ${figura('p04-extension-bloqueada', 'Bloqueada, y con Windows Hello activado.')}
  </div>
  <div class="caja-nota truco"><strong>Qué puede ver la extensión</strong>Solo la pestaña en la que la pulsas, y solo en ese momento. No lee las webs que visitas ni guarda nada: cada vez le pregunta a CLAC, que tiene que estar abierta (si no, te ofrece abrirla) y desbloqueada.</div>
</section>

<!-- 10 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">10</div>
  <h1>Watchtower</h1>
  <p class="entradilla">El repaso de tu caja fuerte. Se hace solo, cada vez que entras, sin salir del ordenador.</p></div>
  ${figura('t10-watchtower', 'La puntuación es la parte de la caja que no tiene ningún problema.')}
  <table>
    <tr><th>Aviso</th><th>Qué significa y qué hacer</th></tr>
    <tr><td>Contraseñas filtradas</td><td>Han salido en filtraciones públicas. Cámbialas cuanto antes.</td></tr>
    <tr><td>Caducados</td><td>Tarjetas o documentos que ya no valen.</td></tr>
    <tr><td>Contraseñas débiles</td><td>Se adivinan pronto. Cámbialas por una del generador.</td></tr>
    <tr><td>Contraseñas repetidas</td><td>Si una web se filtra, sirven para entrar en las demás. Cada web, la suya.</td></tr>
    <tr><td>Webs sin cifrar</td><td>La dirección empieza por <code>http://</code>. Comprueba si existe con <code>https://</code>.</td></tr>
    <tr><td>Caducan pronto</td><td>Dos meses antes para tarjetas y carnés; diez para el DNI y el pasaporte.</td></tr>
    <tr><td>Duplicados</td><td>Dos elementos idénticos en la misma caja. Sobra uno.</td></tr>
  </table>
  <p>Pulsa cualquier elemento de la lista para ir a él y arreglarlo.</p>
  <h2>Comprobar filtraciones</h2>
  <p>Es lo único que CLAC consulta en internet, y solo cuando pulsas <strong>Comprobar ahora</strong>. Pregunta al servicio Have I Been Pwned <strong>sin mandar ninguna contraseña</strong>: de cada una viajan solo los cinco primeros caracteres de su «huella», que comparten cientos de contraseñas distintas, y la comparación se hace en tu ordenador. Conviene hacerlo de vez en cuando.</p>
</section>

<!-- 11 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">11</div>
  <h1>Ordenar la caja</h1>
  <p class="entradilla">Tres formas, que se pueden combinar.</p></div>
  <h2>Cajas fuertes</h2>
  <p>Separan del todo: por ejemplo «Personal» y «Trabajo». Se crean con el <strong>+</strong> junto a «Cajas fuertes» en la barra lateral; el lápiz que aparece al pasar por encima de una, o su clic derecho, permite cambiarle el nombre, el icono y el color, o eliminarla si está vacía. Para pasar un elemento a otra: menú <strong>⋯</strong> de la ficha ▸ <strong>Mover a otra caja fuerte…</strong>.</p>
  <h2>Etiquetas</h2>
  <p>Libres, las que quieras, y un elemento puede llevar varias: «banco», «streaming», «familia»… Salen en la barra lateral.</p>
  <h2>Archivo y papelera</h2>
  <ul>
    <li><strong>Archivar</strong> (<kbd>Supr</kbd>) quita un elemento de las listas, del acceso rápido y de la extensión, pero lo guarda en «Archivo». Útil para cuentas que ya no usas pero no quieres perder.</li>
    <li><strong>Mover a la papelera</strong> (${k('Ctrl', 'Supr')}): se borra solo a los 30 días. Hasta entonces se puede <strong>Recuperar</strong>.</li>
    <li><strong>Borrar para siempre</strong> o <strong>Vaciar la papelera</strong>: eso ya no tiene vuelta atrás.</li>
  </ul>
</section>

<!-- 12 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">12</div>
  <h1>La seguridad del día a día</h1>
  <p class="entradilla">Lo que CLAC hace sola, y lo que puedes ajustar en <strong>Ajustes ▸ Seguridad</strong>.</p></div>
  ${figura('t04-bloqueo', 'Bloqueada: todo lo de la caja desaparece de la pantalla. Con Windows Hello activado, sale también su botón.', 'estrecha')}
  <ul>
    <li><strong>Bloqueo automático</strong> a los 10 minutos sin tocar el ordenador (puedes cambiarlo), al bloquear Windows con ${k('Win', 'L')} y al suspender el equipo.</li>
    <li><strong>Bloquear al momento</strong>: ${k('Ctrl', 'Mayús', 'L')} desde cualquier programa, o <strong>Bloquear</strong> en la barra lateral.</li>
    <li><strong>El portapapeles se vacía</strong> a los 90 segundos, si sigue ahí lo que copiaste. Y lo que copias de CLAC <strong>no queda en el historial de</strong> ${k('Win', 'V')}.</li>
    <li>Para lo delicado —exportar sin cifrar, ver la clave secreta, sacar el kit— te vuelve a pedir la contraseña maestra, aunque la caja esté abierta.</li>
  </ul>
  <h2>Windows Hello</h2>
  <p>Para no escribir la contraseña maestra cada vez que CLAC se bloquea: activa <strong>Ajustes ▸ Seguridad ▸ Desbloquear con Windows Hello</strong> (te pide confirmarlo una vez). Desde entonces, cuando CLAC se bloquee, entras con el <strong>PIN de Windows, la huella o la cara</strong>, lo que tengas configurado en Windows. Al volver a la ventana te lo pide solo, y en el acceso rápido, nada más abrirlo.</p>
  <p>No sustituye a la contraseña maestra, la recuerda un rato. Al bloquearse, CLAC guarda la llave de la caja <strong>solo en memoria</strong> y cifrada con tu sesión de Windows; nunca va al disco. Por eso:</p>
  <ul>
    <li><strong>Al abrir CLAC</strong> (y al reiniciar el ordenador) siempre va la contraseña maestra.</li>
    <li><strong>Cada catorce días</strong>, también: es la única que no tiene arreglo si se olvida, y así no pierdes la costumbre.</li>
    <li>Si Windows dice que ha habido <strong>demasiados intentos</strong>, vuelve a pedir la contraseña maestra.</li>
  </ul>
  <div class="caja-nota importante"><strong>¿Y un PIN de CLAC en vez de la contraseña?</strong>No: la contraseña maestra es con lo que se cifra la caja, y un PIN de cuatro cifras son diez mil combinaciones, que se prueban en muy poco tiempo. Windows Hello da la comodidad sin eso: la llave no sale nunca de la memoria, y el PIN de Windows lo protege Windows, que bloquea los intentos.</div>
  <h2>Cambiar la contraseña maestra</h2>
  <p><strong>Ajustes ▸ Contraseña maestra y clave secreta ▸ Cambiar la contraseña maestra</strong>. La clave secreta y el kit siguen valiendo (apunta la contraseña nueva en el kit).</p>
</section>

<!-- 13 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">13</div>
  <h1>Copias y cambiar de ordenador</h1>
  <p class="entradilla">Tu caja fuerte es un archivo, <code>clac.db</code>, en <code>%APPDATA%\\CLAC</code>. Va cifrado: sin tu contraseña y tu clave secreta no se abre.</p></div>
  <h2>Copias automáticas</h2>
  <p>Cada día, al cerrar CLAC, se guarda una copia en la carpeta <code>copias</code>, y se conservan las diez últimas. Desde <strong>Ajustes ▸ Datos</strong> puedes hacer una ahora, abrir la carpeta, o <strong>Guardar una copia cifrada…</strong> donde quieras: en una memoria USB, en otro disco, en la nube. Al ir cifrada, no importa dónde esté.</p>
  <h2>Llevarte la caja a otro ordenador</h2>
  <ol class="pasos">
    <li>Guarda una copia cifrada (o copia la carpeta <code>%APPDATA%\\CLAC</code> entera).</li>
    <li>Instala CLAC en el ordenador nuevo.</li>
    <li>En la bienvenida, pulsa <strong>Ya tengo una: restaurar una copia</strong> y elige el archivo.</li>
    <li>Escribe la <strong>clave secreta del kit de emergencia</strong> y tu contraseña maestra.</li>
  </ol>
  <p>Si copias la carpeta entera en el sitio de antes, al abrir CLAC te pedirá la clave secreta una vez, porque la de este equipo va cifrada con la cuenta de Windows del otro.</p>
  <h2>Exportar sin cifrar</h2>
  <p><strong>Ajustes ▸ Datos ▸ Exportar sin cifrar…</strong> saca todo en JSON (completo, se vuelve a importar en CLAC) o en CSV (el formato de Bitwarden, que entienden casi todos los gestores). Es la salida de emergencia si algún día quieres irte a otro gestor.</p>
  <div class="caja-nota peligro"><strong>El archivo exportado lleva todo a la vista</strong>Guárdalo solo el tiempo que te haga falta y bórralo después. Para una copia de seguridad, usa siempre la copia cifrada.</div>
</section>

<!-- 14 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">14</div>
  <h1>Atajos de teclado</h1></div>
  <table>
    <tr><th>Dónde</th><th>Atajo</th><th>Qué hace</th></tr>
    <tr><td>Cualquier programa</td><td>${k('Ctrl', 'Mayús', 'Espacio')}</td><td>Abre el acceso rápido</td></tr>
    <tr><td>Cualquier programa</td><td>${k('Ctrl', 'Mayús', 'L')}</td><td>Bloquea CLAC</td></tr>
    <tr><td>Opera Air</td><td>${k('Ctrl', 'Mayús', 'X')}</td><td>Abre la extensión</td></tr>
    <tr><td>CLAC</td><td>Clic derecho</td><td>El menú del elemento, del campo o de la caja fuerte</td></tr>
    <tr><td>CLAC</td><td>${k('Ctrl', 'N')}</td><td>Nuevo elemento</td></tr>
    <tr><td>CLAC</td><td>${k('Ctrl', 'F')}</td><td>Buscar</td></tr>
    <tr><td>CLAC</td><td><kbd>↑</kbd> <kbd>↓</kbd></td><td>Moverse por la lista</td></tr>
    <tr><td>CLAC</td><td>${k('Ctrl', 'C')}</td><td>Copia el usuario del elemento elegido</td></tr>
    <tr><td>CLAC</td><td>${k('Ctrl', 'Mayús', 'C')}</td><td>Copia la contraseña</td></tr>
    <tr><td>CLAC</td><td>${k('Ctrl', 'Alt', 'C')}</td><td>Copia el código de un solo uso</td></tr>
    <tr><td>CLAC</td><td>${k('Ctrl', 'R')}</td><td>Muestra u oculta todo lo oculto de la ficha</td></tr>
    <tr><td>CLAC</td><td>${k('Ctrl', 'E')} · ${k('Ctrl', 'S')}</td><td>Editar · guardar</td></tr>
    <tr><td>CLAC</td><td><kbd>Supr</kbd></td><td>Archiva</td></tr>
    <tr><td>CLAC</td><td>${k('Ctrl', 'Supr')}</td><td>Manda a la papelera</td></tr>
    <tr><td>CLAC</td><td><kbd>Esc</kbd></td><td>Vacía la búsqueda, o cancela la edición</td></tr>
    <tr><td>Acceso rápido</td><td><kbd>Intro</kbd> · ${k('Alt', 'Intro')}</td><td>Copia la contraseña · abre la web</td></tr>
    <tr><td>Acceso rápido</td><td>${k('Ctrl', 'O')}</td><td>Abre el elemento en CLAC</td></tr>
  </table>
</section>

<!-- 15 -->
<section class="capitulo preguntas pagina-nueva">
  <div class="num">15</div>
  <h1>Preguntas frecuentes</h1>
  <h3>He olvidado la contraseña maestra.</h3>
  <p>No se puede recuperar. Mira si la apuntaste en el kit de emergencia. Si no, la caja fuerte no se puede abrir: habría que empezar una nueva.</p>
  <h3>He perdido el kit de emergencia.</h3>
  <p>Mientras sigas en este ordenador no pasa nada: abre CLAC y, en <strong>Ajustes ▸ Contraseña maestra y clave secreta</strong>, pulsa <strong>Guardar el kit de emergencia</strong> para sacar otro. Hazlo ya: sin él no podrías restaurar una copia en otro equipo.</p>
  <h3>¿Puedo entrar con un PIN?</h3>
  <p>Con el de Windows, sí: activa Windows Hello (capítulo 12). La contraseña maestra la seguirá pidiendo al abrir CLAC y cada catorce días.</p>
  <h3>¿La extensión funciona con CLAC cerrada?</h3>
  <p>No: las llaves las tiene CLAC. La extensión te ofrece abrirla. Con <strong>Arrancar con Windows</strong> activado estará siempre en la bandeja.</p>
  <h3>¿Se conecta a internet?</h3>
  <p>Para dos cosas: mirar al abrir si hay una versión nueva (se apaga en Ajustes ▸ Acerca de) y, cuando pulsas <strong>Comprobar ahora</strong> en Watchtower, preguntar por filtraciones. En ninguna viaja una contraseña. Los iconos de las webs no se descargan: el cuadrado de color con la inicial sale del propio nombre de la web.</p>
  <h3>¿Qué pasa si alguien me roba el ordenador?</h3>
  <p>Con CLAC bloqueada, la caja fuerte está cifrada y no se abre sin tu contraseña maestra. Por eso importa que sea buena y que el bloqueo automático esté encendido.</p>
  <h3>¿Por qué la extensión se instala en «modo desarrollador»?</h3>
  <p>Porque no está publicada en la tienda de extensiones de Opera: es solo tuya. Opera te lo recordará de vez en cuando; puedes ignorarlo.</p>
  <h3>La extensión dice «Falta conectar CLAC con el navegador».</h3>
  <p>Enciende <strong>Ajustes ▸ Navegador</strong> en CLAC y vuelve a abrir la extensión. Si sigue igual, cierra Opera del todo y vuelve a abrirlo.</p>
  <h3>La extensión no encuentra dónde escribir.</h3>
  <p>Algunas webs hacen el formulario de entrar de forma poco habitual. Usa los botones de copiar de la fila elegida y pega a mano.</p>
  <h3>¿Puedo tener CLAC en el móvil?</h3>
  <p>No. CLAC es solo para este ordenador.</p>
  <h3>¿Qué pasa si desinstalo CLAC?</h3>
  <p>Tus datos se quedan en <code>%APPDATA%\\CLAC</code>. Si vuelves a instalarla, aparecen tal cual.</p>
</section>

</body>
</html>`

app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  // Con las capturas dentro pasa de los 2 MB que admite una URL data:, así que va por archivo.
  const carpeta = mkdtempSync(join(tmpdir(), 'clac-tutorial-'))
  const pagina = join(carpeta, 'tutorial.html')
  writeFileSync(pagina, html)
  await w.loadFile(pagina)
  const pdf = await w.webContents.printToPDF({
    printBackground: true,
    preferCSSPageSize: true,
  })
  const destino = join(__dirname, 'Tutorial de CLAC.pdf')
  writeFileSync(destino, pdf)
  console.log(`${destino} (${Math.round(pdf.length / 1024)} KB)`)
  rmSync(carpeta, { recursive: true, force: true })
  app.quit()
})
