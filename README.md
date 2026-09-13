# CLAC

Un gestor de contraseñas para Windows, hermano de [BONK](../bonk): la misma casa,
la misma barra lateral, las mismas nueve paletas. Hace lo que hace 1Password
—guardar contraseñas, tarjetas, documentos y todo lo que haya que tener a
mano—, pero **todo se queda en tu ordenador**: no hay cuenta, ni nube, ni
suscripción.

---

## Cómo se protege lo que guardas

La caja fuerte se abre con dos cosas a la vez:

- **La contraseña maestra**, que sabes tú. Es la única que hay que recordar.
- **La clave secreta**, 34 signos al azar (`C1-XXXXXX-…`) que se generan al crear
  la caja. Se guarda en este equipo, cifrada con tu cuenta de Windows, y en el
  **kit de emergencia**, un PDF para imprimir.

Es el mismo esquema que 1Password. Lo que consigue: una copia de tu caja fuerte
que acabe en una memoria USB, en la nube o en manos de otro no sirve para probar
contraseñas, porque le falta la clave secreta.

Por dentro: la contraseña se estira con **scrypt** (128 MB de memoria por intento,
lo que encarece mucho un ataque con tarjetas gráficas), se mezcla con la clave
secreta, y de ahí salen las claves que abren cada caja fuerte. Cada elemento va
cifrado con **AES-256-GCM**, que además detecta cualquier cambio en el archivo.
Los títulos, las webs, los usuarios, las notas y los archivos adjuntos van
cifrados; en claro solo quedan las fechas y los ajustes de la aplicación.

**Si pierdes la contraseña maestra, no hay forma de recuperarla.** Es a
propósito: si CLAC pudiera abrir la caja sin ella, también podría hacerlo quien
te la robara.

## Lo que hay dentro

- **22 tipos de elemento**: inicios de sesión, contraseñas, notas, tarjetas,
  identidades, DNI/NIE, pasaportes, carnés, cuentas bancarias (con IBAN), redes
  wifi, claves SSH, licencias, servidores… Cada uno con sus campos, y se pueden
  añadir más. Sin secciones, etiquetas ni notas: lo más sencilla posible.
- **Varias cajas fuertes** (Personal, Trabajo…), **archivo** y **papelera** (lo
  borrado se va solo a los 30 días).
- **Clic derecho**, como en BONK, en la lista, en cada campo y en las cajas fuertes.
- **Windows Hello**: tras bloquearse, se vuelve a entrar con el PIN de Windows, la
  huella o la cara. La contraseña maestra, al abrir CLAC y cada catorce días.
- **Historial**: las 20 últimas versiones de cada elemento, para volver atrás.
- **Códigos de un solo uso** (los de Google Authenticator), con su cuenta atrás.
- **Archivos adjuntos** cifrados, de hasta 50 MB cada uno.
- **Generador**: aleatoria, memorable (palabras en castellano) o PIN, con los
  bits de azar que lleva de verdad.
- **Watchtower**: avisa de contraseñas débiles, repetidas, webs sin cifrar, lo
  que caduca pronto y los duplicados. Y, **solo si lo pides**, de las
  contraseñas que han salido en filtraciones.
- **Acceso rápido**: `Ctrl + Mayús + Espacio` desde cualquier programa abre un
  buscador; `Intro` copia la contraseña, `Ctrl + C` el usuario y
  `Ctrl + Alt + C` el código.
- **Portapapeles**: lo que copias no queda en el historial de Win+V y se borra a
  los 90 segundos.
- **Bloqueo automático** a los 10 minutos sin usar el ordenador, al bloquear
  Windows y al suspender. `Ctrl + Mayús + L` bloquea al instante.
- **Importar** desde Opera, Chrome, Edge, Brave, Firefox, 1Password (`.1pux` y
  CSV), Bitwarden, KeePassXC y LastPass. **Exportar** en JSON completo o CSV.

## La extensión para el navegador

Rellena el usuario, la contraseña y el código de un solo uso en Opera Air (y en
Chrome, Edge o Brave). Pulsas el candado de CLAC en la barra —o `Ctrl + Mayús +
X`—, te enseña lo guardado de la web en la que estás, y con `Intro` o un clic lo
escribe en el formulario. Si el elemento es de otra web, **para y avisa antes**:
es como se descubre una web falsa que imita a la de tu banco.

También guarda lo que acabas de escribir en una página (y si ya tenías esa web
con ese usuario, le cambia la contraseña y guarda la de antes en el historial), y
genera contraseñas nuevas para las páginas de alta.

Cómo se instala:

1. En CLAC, **Ajustes ▸ Navegador**: enciende la casilla.
2. En Opera Air, `opera://extensions`, enciende el **modo desarrollador** y carga
   descomprimida la carpeta que te indica CLAC (dentro de la instalación, en
   `resources\extension`).

Por dentro: la extensión solo pide tres permisos —la pestaña en la que la pulsas,
escribir en ella y hablar con CLAC—; nada de «leer y cambiar todas tus webs». No
guarda nada: cada vez pregunta a CLAC, por la mensajería nativa de Chromium, a
través de un puente pequeño que es el propio `CLAC.exe` en modo Node. Solo rellena
cuando la pulsas, y nunca envía el formulario por ti.

En la puerta del canal hay un portero (`src/main/navegador/portero.ts`): Windows
le dice qué proceso se ha conectado, y solo deja pasar al `CLAC.exe` de la
instalación cuando lo ha abierto un navegador. El canal, además, solo admite al
usuario y rechaza la red.

## Internet

CLAC sale a internet para dos cosas:

- **Versiones nuevas**: al abrir, mira en las releases de este repositorio si hay
  una más nueva, como BONK. Si la hay, avisa bajo Ajustes y se descarga cuando
  pulsas el aviso. No viaja nada de tu caja fuerte. Se apaga en
  **Ajustes ▸ Acerca de ▸ Buscar versiones nuevas**.
- **Watchtower ▸ Comprobar ahora**, solo cuando pulsas el botón, pregunta a Have
  I Been Pwned si tus contraseñas han salido en alguna filtración. No viaja ninguna contraseña: de cada una se
mandan los cinco primeros caracteres de su huella SHA-1 y la comparación se hace
en tu equipo. Los iconos de las webs tampoco se descargan: el avatar es la
inicial sobre un color que sale del propio dominio.

## Tus datos y las copias

Todo está en `%APPDATA%\CLAC`: la caja fuerte (`clac.db`), la clave secreta
cifrada con Windows y la subcarpeta `copias`, donde se guarda una copia al día al
cerrar (las diez últimas). Las copias van cifradas igual que la caja.

Para llevártela a otro ordenador: instala CLAC allí, elige «Restaurar una copia»
y ábrela con tu contraseña y la clave secreta del kit de emergencia.

## Atajos

| Dónde | Atajo | Qué hace |
|---|---|---|
| Todo el sistema | `Ctrl + Mayús + Espacio` | Acceso rápido |
| Todo el sistema | `Ctrl + Mayús + L` | Bloquear |
| Ventana | `Ctrl + N` · `Ctrl + F` | Nuevo elemento · buscar |
| Ventana | `↑` `↓` | Moverse por la lista |
| Ventana | `Ctrl + C` · `Ctrl + Mayús + C` · `Ctrl + Alt + C` | Copiar usuario · contraseña · código |
| Ventana | `Ctrl + E` · `Ctrl + S` | Editar · guardar |
| Ventana | `Ctrl + R` | Mostrar lo oculto |
| Ventana | `Supr` · `Ctrl + Supr` | Archivar · a la papelera |

---

## Para desarrollar

Electron + React + TypeScript, con `node:sqlite` y la criptografía de Node: sin
módulos nativos ni librerías de cifrado de fuera. Hace falta Node 24.

Las piezas comunes con BONK (paletas, barra lateral, botones, diálogos, la regla
del icono) viven en su propio repositorio, [`casa`](https://github.com/i3SK87/casa),
y entran como dependencia local desde la carpeta de al lado. Hay que clonarlas
juntas:

```
Projects/
├── casa/   ← git clone https://github.com/i3SK87/casa
└── clac/   ← git clone https://github.com/i3SK87/clac
```

```
npm install
npm test           # el núcleo: cifrado, caja fuerte, importadores, Watchtower…
npm run typecheck
npm run dev        # en modo desarrollo
npm run dist       # instalador y zip portátil, en release/
npm run icono      # regenera resources/icon.ico desde la regla de la casa
```

Con npm 12 hay que aprobar los scripts de instalación: `npm install-scripts approve electron esbuild electron-winstaller`.
