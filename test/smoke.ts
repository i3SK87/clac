/**
 * Prueba de humo del núcleo de CLAC. Corre en Node 24 pelado, sin Electron y
 * sobre carpetas temporales: no toca ninguna caja fuerte de verdad.
 *
 *   npm test
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateRawSync, crc32 } from 'node:zlib'

import { enteroAleatorio, barajar } from '../src/shared/aleatorio'
import { ALFABETO, formatearClave, leerClave, nuevaClaveSecreta, nuevoIdCuenta } from '../src/shared/claveSecreta'
import { OPCIONES_POR_DEFECTO, SIMBOLOS, generar, llana, trocear } from '../src/shared/generador'
import { fortaleza } from '../src/shared/fortaleza'
import { base32ABytes, bytesABase32, codigoTotp, formatearCodigo, hotp, leerTotp, segundosRestantes } from '../src/shared/totp'
import { colorDe, dominioDe, esSinCifrar, inicialDe, normalizarWeb } from '../src/shared/webs'
import { finDeValidez, mostrarFecha } from '../src/shared/fechas'
import { escribirCsv, leerCsv } from '../src/shared/csv'
import { desde1pux, leerExportacion } from '../src/shared/importar'
import { revisar } from '../src/shared/watchtower'
import { CATEGORIAS, categoria, contrasenaDe, seccionesDePlantilla, subtituloDe, usuarioDe } from '../src/shared/categorias'
import { PALABRAS } from '../src/shared/palabras'
import type { Detalle, ElementoEntrada, ElementoLista, Seccion } from '../src/shared/tipos'

import { abrir, derivarClaveDesbloqueo, sellar, ErrorDescifrado, KDF_POR_DEFECTO } from '../src/main/boveda/cripto'
import { CajaFuerte, ErrorBloqueada, ErrorContrasena } from '../src/main/boveda/boveda'
import { hacerCopia } from '../src/main/boveda/db'
import { leerZip } from '../src/main/boveda/zip'
import { exportarCsv, exportarJson } from '../src/main/boveda/exportar'
import { generarClaveSsh } from '../src/main/boveda/ssh'
import { guardarAjustes, leerAjustes } from '../src/main/boveda/ajustes'
import { construirKitHtml } from '../src/main/kit'

let passed = 0
let failed = 0

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++
    console.log(`  ok   ${name}`)
  } else {
    failed++
    console.log(`  FALLO ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function equal(name: string, actual: unknown, expected: unknown): void {
  check(name, Object.is(actual, expected), `esperado ${String(expected)}, obtenido ${String(actual)}`)
}

function throws(name: string, fn: () => unknown, pattern?: RegExp | (new (...a: never[]) => Error)): void {
  try {
    fn()
    check(name, false, 'no lanzó nada')
  } catch (error) {
    if (!pattern) return check(name, true)
    if (pattern instanceof RegExp) check(name, pattern.test((error as Error).message), (error as Error).message)
    else check(name, error instanceof pattern, String(error))
  }
}

function section(title: string): void {
  console.log(`\n${title}`)
}

const carpetas: string[] = []
function carpetaTemporal(): string {
  const dir = mkdtempSync(join(tmpdir(), 'clac-prueba-'))
  carpetas.push(dir)
  return dir
}

/** Un login listo para guardar. */
function login(bovedaId: string, titulo: string, usuario: string, contrasena: string, web = ''): ElementoEntrada {
  const secciones = seccionesDePlantilla('login')
  for (const c of secciones[0].campos) {
    if (c.clave === 'usuario') c.valor = usuario
    if (c.clave === 'contrasena') c.valor = contrasena
  }
  return { bovedaId, categoria: 'login', titulo, webs: web ? [web] : [], etiquetas: [], favorito: false, secciones, notas: '' }
}

/** Un zip hecho a mano, para probar el lector. */
function hacerZip(archivos: Record<string, string>): Buffer {
  const locales: Buffer[] = []
  const centrales: Buffer[] = []
  let desplazamiento = 0
  for (const [nombre, contenido] of Object.entries(archivos)) {
    const datos = Buffer.from(contenido, 'utf8')
    const comprimido = deflateRawSync(datos)
    const nombreB = Buffer.from(nombre, 'utf8')
    const suma = crc32(datos) >>> 0
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(suma, 14)
    local.writeUInt32LE(comprimido.length, 18)
    local.writeUInt32LE(datos.length, 22)
    local.writeUInt16LE(nombreB.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(suma, 16)
    central.writeUInt32LE(comprimido.length, 20)
    central.writeUInt32LE(datos.length, 24)
    central.writeUInt16LE(nombreB.length, 28)
    central.writeUInt32LE(desplazamiento, 42)
    locales.push(local, nombreB, comprimido)
    centrales.push(central, nombreB)
    desplazamiento += 30 + nombreB.length + comprimido.length
  }
  const dirCentral = Buffer.concat(centrales)
  const fin = Buffer.alloc(22)
  fin.writeUInt32LE(0x06054b50, 0)
  fin.writeUInt16LE(Object.keys(archivos).length, 8)
  fin.writeUInt16LE(Object.keys(archivos).length, 10)
  fin.writeUInt32LE(dirCentral.length, 12)
  fin.writeUInt32LE(desplazamiento, 16)
  return Buffer.concat([...locales, dirCentral, fin])
}

async function main(): Promise<void> {
  /* ================================================================ */
  section('Azar')
  {
    const cuenta = new Array(7).fill(0)
    for (let i = 0; i < 70_000; i++) cuenta[enteroAleatorio(7)]++
    check('enteroAleatorio cae siempre dentro del rango', cuenta.reduce((a, b) => a + b) === 70_000)
    check('y reparte parejo (±5 %)', cuenta.every((n) => Math.abs(n - 10_000) < 500), cuenta.join(','))
    const b = barajar([1, 2, 3, 4, 5, 6, 7, 8])
    equal('barajar no pierde ni inventa elementos', [...b].sort().join(''), '12345678')
    throws('un rango de cero no existe', () => enteroAleatorio(0))
  }

  /* ================================================================ */
  section('Clave secreta')
  {
    equal('el alfabeto tiene 31 signos', ALFABETO.length, 31)
    check('y ninguno de los que se confunden', ![...'01IOU'].some((c) => ALFABETO.includes(c)))
    const id = nuevoIdCuenta()
    const clave = nuevaClaveSecreta(id)
    const texto = formatearClave(clave)
    equal('34 signos más 6 guiones', texto.length, 40)
    equal('empieza por la versión', texto.slice(0, 3), 'C1-')
    equal('lleva el identificador de la cuenta', texto.slice(3, 9), id)
    const leida = leerClave(texto.toLowerCase().replace(/-/g, ' '))
    check('se lee en minúsculas y con espacios', 'clave' in leida && leida.clave.secreto === clave.secreto)
    const conO = leerClave(texto.slice(0, -1) + 'O')
    check('una O da un error que explica por qué', 'error' in conO && /no lleva 0, 1, I, O ni U/.test(conO.error))
    const corta = leerClave(texto.slice(0, -2))
    check('si falta un signo, lo dice', 'error' in corta && /Tiene 32 signos y son 34/.test(corta.error))
    const otra = leerClave('X1' + texto.slice(2))
    check('otra versión no vale', 'error' in otra)
    check('las entropías cuadran: 26 × log2(31) > 128 bits', 26 * Math.log2(31) > 128)
  }

  /* ================================================================ */
  section('Generador')
  {
    const a = generar({ ...OPCIONES_POR_DEFECTO, tipo: 'aleatoria', largo: 20 })
    equal('aleatoria de 20', a.valor.length, 20)
    check('con cifra, mayúscula, minúscula y símbolo', /\d/.test(a.valor) && /[A-Z]/.test(a.valor) && /[a-z]/.test(a.valor) && [...a.valor].some((c) => SIMBOLOS.includes(c)))
    check('unos 125 bits', a.bits > 120 && a.bits < 130, String(a.bits))
    const sin = generar({ ...OPCIONES_POR_DEFECTO, tipo: 'aleatoria', largo: 40, simbolos: false, numeros: false })
    check('sin símbolos ni cifras, solo letras', /^[A-Za-z]{40}$/.test(sin.valor))
    const corta = generar({ ...OPCIONES_POR_DEFECTO, tipo: 'aleatoria', largo: 2 })
    equal('el largo no baja de 8', corta.valor.length, 8)

    const m = generar({ ...OPCIONES_POR_DEFECTO, tipo: 'memorable', palabras: 5, separador: 'guion', mayusculas: true, conTildes: false })
    const partes = m.valor.split('-')
    equal('memorable de cinco palabras', partes.length, 5)
    check('cada una con mayúscula', partes.every((p) => /^[A-Z]/.test(p)))
    check('sin tildes ni eñes', !/[áéíóúñü]/i.test(m.valor))
    equal('55 bits justos', Math.round(m.bits), 55)
    const mn = generar({ ...OPCIONES_POR_DEFECTO, tipo: 'memorable', palabras: 4, separador: 'numeros', mayusculas: false })
    check('con cifras entre palabras', /^[a-zñáéíóú]+\d[a-zñáéíóú]+\d[a-zñáéíóú]+\d[a-zñáéíóú]+$/.test(mn.valor), mn.valor)
    check('que suman sus bits', Math.abs(mn.bits - (44 + 3 * Math.log2(10))) < 0.01)
    const p = generar({ ...OPCIONES_POR_DEFECTO, tipo: 'pin', digitos: 6 })
    check('PIN de seis cifras', /^\d{6}$/.test(p.valor))
    equal('llana quita tildes y eñes', llana('Ñandú camión'), 'Nandu camion')
    equal('trocear separa cifras y símbolos', trocear('ab12-#c').map((t) => t.clase).join(','), 'letra,cifra,simbolo,letra')
    equal('la lista tiene 2.048 palabras', PALABRAS.length, 2048)
    equal('todas distintas sin tildes', new Set(PALABRAS.map(llana)).size, 2048)
  }

  /* ================================================================ */
  section('Fortaleza')
  {
    equal('«hola» es muy débil', fortaleza('hola').nivel, 0)
    equal('«123456» es muy débil', fortaleza('123456').nivel, 0)
    check('«Barcelona2024!» no pasa de débil', fortaleza('Barcelona2024!').nivel <= 1, JSON.stringify(fortaleza('Barcelona2024!')))
    check('«aaaaaaaaaaaaaa» es débil', fortaleza('aaaaaaaaaaaaaa').nivel <= 1)
    check('«qwertyuiop123» es débil', fortaleza('qwertyuiop123').nivel <= 1)
    const gen = generar({ ...OPCIONES_POR_DEFECTO, tipo: 'aleatoria', largo: 20 }).valor
    equal('una aleatoria de 20 es excelente', fortaleza(gen).nivel, 4)
    const mem = generar({ ...OPCIONES_POR_DEFECTO, tipo: 'memorable', palabras: 5 }).valor
    check('cinco palabras son al menos buenas', fortaleza(mem).nivel >= 3, `${mem} → ${JSON.stringify(fortaleza(mem))}`)
    equal('vacía, cero', fortaleza('').bits, 0)
  }

  /* ================================================================ */
  section('Códigos de un solo uso (RFC 6238)')
  {
    const s1 = new TextEncoder().encode('12345678901234567890')
    const s256 = new TextEncoder().encode('12345678901234567890123456789012')
    const s512 = new TextEncoder().encode('1234567890123456789012345678901234567890123456789012345678901234')
    const t = (secreto: Uint8Array, alg: 'SHA-1' | 'SHA-256' | 'SHA-512', seg: number): Promise<string> =>
      hotp({ secreto, algoritmo: alg, digitos: 8 }, Math.floor(seg / 30))
    equal('SHA-1 en t=59', await t(s1, 'SHA-1', 59), '94287082')
    equal('SHA-1 en t=1111111109', await t(s1, 'SHA-1', 1111111109), '07081804')
    equal('SHA-1 en t=1234567890', await t(s1, 'SHA-1', 1234567890), '89005924')
    equal('SHA-256 en t=59', await t(s256, 'SHA-256', 59), '46119246')
    equal('SHA-512 en t=59', await t(s512, 'SHA-512', 59), '90693936')
    equal('SHA-1 en t=20000000000', await t(s1, 'SHA-1', 20000000000), '65353130')

    const b32 = bytesABase32(s1)
    equal('base32 de ida', b32, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
    equal('y de vuelta', new TextDecoder().decode(base32ABytes(b32.toLowerCase().replace(/(.{4})/g, '$1 '))!), '12345678901234567890')
    check('base32 con basura no vale', base32ABytes('HOLA!!') === null)

    const cfg = leerTotp(`otpauth://totp/Ejemplo:yo%40correo.es?secret=${b32}&issuer=Ejemplo&digits=8&algorithm=SHA1&period=30`)
    check('lee la dirección otpauth', cfg != null && cfg.digitos === 8 && cfg.emisor === 'Ejemplo' && cfg.cuenta === 'yo@correo.es')
    equal('y calcula el mismo código', await codigoTotp(cfg!, 59_000), '94287082')
    check('el secreto suelto también vale', leerTotp('JBSWY3DPEHPK3PXP')?.digitos === 6)
    check('lo que no es un secreto no vale', leerTotp('esto no es') === null)
    equal('quedan 30 s al empezar el periodo', segundosRestantes({ periodo: 30 }, 60_000), 30)
    equal('y 1 al final', segundosRestantes({ periodo: 30 }, 89_000), 1)
    equal('se escribe en dos grupos', formatearCodigo('123456'), '123 456')
  }

  /* ================================================================ */
  section('Webs y fechas')
  {
    equal('le pone https', normalizarWeb('google.com'), 'https://google.com/')
    equal('no abre javascript:', normalizarWeb('javascript:alert(1)'), null)
    equal('no abre file:', normalizarWeb('file:///C:/Windows'), null)
    equal('el dominio sin www', dominioDe('https://www.ejemplo.es/entrar?x=1'), 'ejemplo.es')
    check('una web en http:// es sin cifrar', esSinCifrar('http://ejemplo.com'))
    check('el router de casa no', !esSinCifrar('http://192.168.1.1'))
    check('ni localhost', !esSinCifrar('http://localhost:3000'))
    equal('el mismo dominio, el mismo color', colorDe('google.com'), colorDe('GOOGLE.com'))
    equal('la inicial salta signos', inicialDe('  ¡hola!'), 'H')

    const marzo = finDeValidez('2027-03')
    check('mes y año valen hasta el último día', marzo?.getDate() === 31 && marzo.getMonth() === 2)
    equal('«03/27» es marzo de 2027', finDeValidez('03/27')?.getFullYear(), 2027)
    equal('el 30 de febrero no existe', finDeValidez('2026-02-30'), null)
    equal('«15/08/2030» se entiende', finDeValidez('15/08/2030')?.getMonth(), 7)
    equal('se enseña como mes/año', mostrarFecha('2027-03', 'mesAnio'), '03/2027')
    equal('y la fecha en largo', mostrarFecha('2027-03-05', 'fecha'), '5 de marzo de 2027')
  }

  /* ================================================================ */
  section('CSV')
  {
    const filas = [['a', 'b,c', 'd"e'], ['línea\ncon salto', '', ' espacio ']]
    const texto = escribirCsv(filas)
    equal('ida y vuelta', JSON.stringify(leerCsv(texto)), JSON.stringify(filas))
    equal('la marca de Excel no cuenta', leerCsv('\ufeffx,y\n1,2')[0][0], 'x')
    equal('las líneas vacías se saltan', leerCsv('a\n\n\nb\n').length, 2)
  }

  /* ================================================================ */
  section('Importar')
  {
    const chrome = leerExportacion('name,url,username,password,note\nGoogle,https://accounts.google.com/,yo@gmail.com,s3creta,nota\n,https://x.com,,,\n')
    equal('Opera/Chrome: se reconoce', chrome.formato, 'chromium')
    equal('y salta las filas vacías', chrome.elementos.length, 1)
    equal('usuario en su campo', usuarioDe(chrome.elementos[0]), 'yo@gmail.com')
    equal('contraseña en el suyo', contrasenaDe(chrome.elementos[0]), 's3creta')
    equal('la nota', chrome.elementos[0].notas, 'nota')
    check('y lo dice', chrome.avisos.some((a) => /1 fila vacía/.test(a)))

    const ff = leerExportacion('"url","username","password","httpRealm","formActionOrigin","guid","timeCreated","timeLastUsed","timePasswordChanged"\n"https://www.ejemplo.es","ana","pw1",,"https://www.ejemplo.es","{1}","1","1","1"\n')
    equal('Firefox: se reconoce', ff.formato, 'firefox')
    equal('y el título sale de la web', ff.elementos[0].titulo, 'ejemplo.es')

    const bw = leerExportacion('folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\nTrabajo,1,login,GitHub,,"PIN: 1234",0,"https://github.com,https://gist.github.com",dev,pw,JBSWY3DPEHPK3PXP\n,,note,Nota,texto,,0,,,,\n')
    equal('Bitwarden CSV: se reconoce', bw.formato, 'bitwarden-csv')
    check('con sus dos webs', bw.elementos[0].webs.length === 2)
    check('favorito y etiqueta', bw.elementos[0].favorito && bw.elementos[0].etiquetas[0] === 'Trabajo')
    check('el código de un solo uso', bw.elementos[0].secciones[0].campos.some((c) => c.tipo === 'totp'))
    check('los campos propios, en «Otros datos»', bw.elementos[0].secciones[1]?.campos[0]?.etiqueta === 'PIN')
    equal('la nota es nota', bw.elementos[1].categoria, 'nota')

    const bwj = leerExportacion(JSON.stringify({
      encrypted: false,
      folders: [{ id: 'f1', name: 'Casa' }],
      items: [
        { type: 3, name: 'Visa', folderId: 'f1', card: { cardholderName: 'Ana', number: '4111111111114242', expMonth: '3', expYear: '2027', code: '123', brand: 'Visa' } },
        { type: 4, name: 'Yo', identity: { firstName: 'Ana', lastName: 'Pérez', city: 'Madrid', company: 'ACME' } },
        { type: 99, name: 'raro' }
      ]
    }))
    equal('Bitwarden JSON: la tarjeta', bwj.elementos[0].categoria, 'tarjeta')
    equal('su caducidad como mes y año', bwj.elementos[0].secciones[0].campos.find((c) => c.clave === 'caducidad')?.valor, '2027-03')
    equal('su subtítulo', subtituloDe('tarjeta', bwj.elementos[0]), '•••• 4242')
    equal('la identidad', bwj.elementos[1].categoria, 'identidad')
    check('lo que no tiene sitio no se pierde', bwj.elementos[1].secciones[1]?.campos.some((c) => c.valor === 'ACME'))
    check('y avisa de lo que se salta', bwj.avisos.length === 1)
    throws('la exportación cifrada de Bitwarden se explica', () => leerExportacion('{"encrypted":true,"items":[]}'), /cifrada/)

    const op = leerExportacion('Title,Url,Username,Password,OTPAuth,Favorite,Archived,Tags,Notes\nBanco,https://banco.es,ana,pw,,true,false,"dinero;casa",\n')
    equal('1Password CSV: se reconoce', op.formato, '1password-csv')
    equal('con sus etiquetas', op.elementos[0].etiquetas.join('|'), 'dinero|casa')

    const kp = leerExportacion('"Group","Title","Username","Password","URL","Notes","TOTP","Icon","Last Modified","Created"\n"Root/Correo","Gmail","ana","pw","https://mail.google.com","","","0","",""\n')
    equal('KeePassXC: se reconoce', kp.formato, 'keepass')
    equal('el grupo pasa a etiqueta', kp.elementos[0].etiquetas[0], 'Correo')

    const lp = leerExportacion('url,username,password,totp,extra,name,grouping,fav\nhttp://sn,,,,"texto secreto",Nota LP,Personal,0\nhttps://x.es,ana,pw,,,X,,1\n')
    equal('LastPass: se reconoce', lp.formato, 'lastpass')
    equal('su nota segura es nota', lp.elementos[0].categoria, 'nota')
    check('y avisa de su filtración', lp.avisos.some((a) => /2022/.test(a)))

    throws('un CSV cualquiera no se reconoce', () => leerExportacion('a,b,c\n1,2,3\n'), /No reconozco/)

    const pux = desde1pux({
      accounts: [{
        vaults: [{
          attrs: { name: 'Personal' },
          items: [
            {
              categoryUuid: '001', favIndex: 1, state: 'active',
              overview: { title: 'Correo', url: 'https://mail.es', tags: ['correo'] },
              details: {
                loginFields: [{ designation: 'username', value: 'ana' }, { designation: 'password', value: 'pw' }],
                notesPlain: 'nota',
                sections: [{ title: '', fields: [{ id: 'TOTP_1', title: 'otp', value: { totp: 'JBSWY3DPEHPK3PXP' } }, { id: 'pregunta', title: 'Pregunta', value: { concealed: 'rojo' } }] }]
              }
            },
            {
              categoryUuid: '002', state: 'archived',
              overview: { title: 'Visa' },
              details: { sections: [{ fields: [{ id: 'ccnum', value: { creditCardNumber: '4111111111111111' } }, { id: 'expiry', value: { monthYear: 202703 } }, { id: 'cvv', value: { concealed: '123' } }] }] }
            },
            { categoryUuid: '006', overview: { title: 'Escritura' }, details: { documentAttributes: { fileName: 'casa.pdf', documentId: 'abc' } } },
            { categoryUuid: '999', overview: { title: '?' } },
            { categoryUuid: '001', state: 'trashed', overview: { title: 'Borrado' } }
          ]
        }]
      }]
    })
    equal('.1pux: tres elementos (ni la papelera ni lo desconocido)', pux.elementos.length, 3)
    check('el login con su código', pux.elementos[0].secciones[0].campos.some((c) => c.tipo === 'totp'))
    check('el campo oculto propio, en otros datos y oculto', pux.elementos[0].secciones[1]?.campos[0]?.tipo === 'oculto')
    check('el favorito', pux.elementos[0].favorito)
    equal('la tarjeta, con su caducidad', pux.elementos[1].secciones[0].campos.find((c) => c.clave === 'caducidad')?.valor, '2027-03')
    check('archivada', pux.elementos[1].archivado)
    equal('el documento trae su adjunto', pux.elementos[2].adjuntos?.[0].ruta, 'files/abc__casa.pdf')
  }

  /* ================================================================ */
  section('Zip')
  {
    const zip = hacerZip({ 'export.data': '{"hola":"qué tal"}', 'files/a.txt': 'contenido' })
    const entradas = leerZip(zip)
    equal('lee las dos entradas', entradas.size, 2)
    equal('y descomprime', entradas.get('export.data')!.leer().toString('utf8'), '{"hola":"qué tal"}')
    throws('lo que no es zip lo dice', () => leerZip(Buffer.from('no soy un zip, lo siento mucho de verdad')), /no es un .zip/)
  }

  /* ================================================================ */
  section('Cifrado')
  {
    const k = Buffer.alloc(32, 7)
    const sobre = sellar(k, 'secreto', 'elemento:1:detalle')
    equal('se abre con su clave y su contexto', abrir(k, sobre, 'elemento:1:detalle').toString(), 'secreto')
    check('dos sobres del mismo texto no se parecen', !sellar(k, 'secreto', 'x').equals(sellar(k, 'secreto', 'x')))
    throws('en otra fila no se abre', () => abrir(k, sobre, 'elemento:2:detalle'), ErrorDescifrado)
    const tocado = Buffer.from(sobre)
    tocado[20] ^= 1
    throws('un bit tocado y no se abre', () => abrir(k, tocado, 'elemento:1:detalle'), ErrorDescifrado)
    throws('con otra clave tampoco', () => abrir(Buffer.alloc(32, 8), sobre, 'elemento:1:detalle'), ErrorDescifrado)

    const kdf = { ...KDF_POR_DEFECTO, N: 2 ** 10, sal: Buffer.alloc(16, 1).toString('base64') }
    const a1 = derivarClaveDesbloqueo('contraseña larga', 'SECRETO', 'ABCDEF', kdf)
    const a2 = derivarClaveDesbloqueo('  contraseña larga  ', 'SECRETO', 'ABCDEF', kdf)
    check('los espacios de los extremos no cuentan', a1.equals(a2))
    const nfc = derivarClaveDesbloqueo('año'.normalize('NFC'), 'S', 'ABCDEF', kdf)
    const nfd = derivarClaveDesbloqueo('año'.normalize('NFD'), 'S', 'ABCDEF', kdf)
    check('la ñ da lo mismo venga como venga', nfc.equals(nfd))
    check('otra clave secreta, otra llave', !a1.equals(derivarClaveDesbloqueo('contraseña larga', 'OTRO', 'ABCDEF', kdf)))
    check('otra cuenta, otra llave', !a1.equals(derivarClaveDesbloqueo('contraseña larga', 'SECRETO', 'ZZZZZZ', kdf)))
    const t0 = Date.now()
    derivarClaveDesbloqueo('x'.repeat(12), 'S', 'ABCDEF', { ...KDF_POR_DEFECTO, sal: kdf.sal })
    const ms = Date.now() - t0
    check(`scrypt de fábrica tarda lo suyo (${ms} ms)`, ms > 50 && ms < 5000)
  }

  /* ================================================================ */
  section('Caja fuerte')
  {
    const dir = carpetaTemporal()
    const caja = new CajaFuerte(dir, { N: 2 ** 10 })
    const clave = nuevaClaveSecreta(nuevoIdCuenta())
    check('al principio no hay caja', !caja.existe())
    throws('una contraseña corta no vale', () => caja.crear('corta', clave), /al menos 10/)
    caja.crear('una contraseña bastante larga', clave)
    check('creada y abierta', caja.existe() && caja.abierta())
    equal('con su identificador', caja.idCuenta(), clave.idCuenta)
    const bovedas = caja.bovedas()
    equal('nace con la caja «Personal»', bovedas.map((b) => b.nombre).join(), 'Personal')
    const personal = bovedas[0].id

    const e1 = caja.guardar(login(personal, 'Banco Santander', 'ana.perez', 'Z9#pQ2!vL7@x', 'https://www.bancosantander.es'))
    equal('se guarda y se lista', caja.listar().length, 1)
    equal('con su subtítulo', caja.listar()[0].subtitulo, 'ana.perez')
    equal('y se vuelve a abrir igual', contrasenaDe(caja.obtener(e1.id)), 'Z9#pQ2!vL7@x')

    // Que en el archivo no haya nada en claro.
    caja.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    const bruto = readFileSync(join(dir, 'clac.db'))
    check('el título no está en claro en el archivo', !bruto.includes(Buffer.from('Santander')))
    check('ni el usuario', !bruto.includes(Buffer.from('ana.perez')))
    check('ni la contraseña', !bruto.includes(Buffer.from('Z9#pQ2!vL7@x')))
    check('ni el nombre de la caja', !bruto.includes(Buffer.from('Personal')))

    caja.bloquear()
    check('bloqueada, no enseña nada', !caja.abierta())
    throws('bloqueada, listar falla', () => caja.listar(), ErrorBloqueada)
    throws('con otra contraseña no abre', () => caja.desbloquear('una contraseña bastante largA', clave.secreto), ErrorContrasena)
    throws('con otra clave secreta tampoco', () => caja.desbloquear('una contraseña bastante larga', nuevaClaveSecreta(clave.idCuenta).secreto), ErrorContrasena)
    caja.desbloquear('una contraseña bastante larga', clave.secreto)
    equal('con las dos, abre y está todo', caja.listar()[0].titulo, 'Banco Santander')

    // Historial
    const editado = caja.guardar({ ...caja.obtener(e1.id), titulo: 'Santander' })
    equal('editar deja versión', caja.historial(e1.id).length, 1)
    equal('con lo de antes', caja.historial(e1.id)[0].titulo, 'Banco Santander')
    const modificado = editado.modificado
    caja.alternarFavorito(e1.id)
    check('el favorito se marca', caja.obtener(e1.id).favorito)
    equal('pero no deja versión', caja.historial(e1.id).length, 1)
    equal('ni cambia la fecha', caja.obtener(e1.id).modificado, modificado)
    const restaurado = caja.restaurarVersion(e1.id, caja.historial(e1.id)[0].id)
    equal('restaurar devuelve lo de antes', restaurado.titulo, 'Banco Santander')
    equal('y guarda lo que había', caja.historial(e1.id).length, 2)
    check('sin perder el favorito', restaurado.favorito)
    for (let i = 0; i < 25; i++) caja.guardar({ ...caja.obtener(e1.id), notas: `v${i}` })
    equal('se quedan veinte versiones', caja.historial(e1.id).length, 20)
    equal('las últimas', caja.historial(e1.id)[0].detalle.notas, 'v23')

    // Adjuntos y cajas fuertes
    const adj = caja.anadirAdjunto(e1.id, 'contrato.pdf', 'application/pdf', Buffer.from('%PDF-1.4 hola'))
    equal('el adjunto cuenta en la lista', caja.listar()[0].adjuntos, 1)
    throws('uno de más de 50 MB no', () => caja.anadirAdjunto(e1.id, 'enorme.bin', 'x', Buffer.alloc(50 * 1024 * 1024 + 1)), /50 MB/)
    const trabajo = caja.guardarBoveda({ nombre: 'Trabajo', descripcion: '', icono: 'briefcase', color: '#1f8a5b' })
    throws('dos cajas con el mismo nombre no', () => caja.guardarBoveda({ nombre: 'trabajo', descripcion: '', icono: 'vault', color: '#000' }), /Ya hay/)
    caja.mover([e1.id], trabajo.id)
    const movido = caja.obtener(e1.id)
    equal('movido a Trabajo', movido.bovedaId, trabajo.id)
    equal('se sigue abriendo', contrasenaDe(movido), 'Z9#pQ2!vL7@x')
    equal('su historial también', caja.historial(e1.id).length, 20)
    equal('y su adjunto', caja.leerAdjunto(adj.id).datos.toString(), '%PDF-1.4 hola')
    throws('una caja con cosas no se borra', () => caja.eliminarBoveda(trabajo.id), /Tiene 1 elemento/)
    caja.mover([e1.id], personal)
    caja.eliminarBoveda(trabajo.id)
    equal('vacía sí', caja.bovedas().length, 1)
    throws('la última nunca', () => caja.eliminarBoveda(personal), /única/)

    const copia = caja.duplicar(e1.id)
    equal('duplicar copia también el adjunto', copia.adjuntosInfo.length, 1)
    equal('con «(copia)» detrás', copia.titulo, 'Banco Santander (copia)')

    // Papelera
    caja.cambiarEstado([copia.id], 'archivado')
    equal('archivado', caja.obtener(copia.id).estado, 'archivado')
    equal('borrar para siempre solo desde la papelera', caja.eliminarDefinitivamente([copia.id]), 0)
    caja.cambiarEstado([copia.id], 'eliminado')
    check('a la papelera con fecha', caja.obtener(copia.id).eliminadoEn != null)
    equal('a los 29 días sigue', caja.purgarPapelera(new Date(Date.now() + 29 * 86_400_000)), 0)
    equal('a los 31 se va', caja.purgarPapelera(new Date(Date.now() + 31 * 86_400_000)), 1)
    equal('con su adjunto', (caja.db.prepare('SELECT COUNT(*) AS n FROM adjuntos').get() as { n: number }).n, 1)

    // Contraseña maestra
    check('comprobar la contraseña', caja.comprobarContrasena('una contraseña bastante larga', clave.secreto))
    check('y rechazar la mala', !caja.comprobarContrasena('otra cosa cualquiera', clave.secreto))
    caja.cambiarContrasena('una contraseña bastante larga', 'la contraseña nueva de verdad', clave.secreto)
    caja.bloquear()
    throws('la vieja ya no abre', () => caja.desbloquear('una contraseña bastante larga', clave.secreto), ErrorContrasena)
    caja.desbloquear('la contraseña nueva de verdad', clave.secreto)
    equal('la nueva sí, y está todo', contrasenaDe(caja.obtener(e1.id)), 'Z9#pQ2!vL7@x')

    // Datos de la cuenta
    caja.guardarDatosCuenta({ filtradasRevisadasEn: '2026-09-13T10:00:00.000Z', filtraciones: { x: { modificado: 'm', veces: 3 } } })
    equal('los datos de la cuenta se guardan cifrados', caja.datosCuenta().filtraciones.x.veces, 3)

    // Importar dos veces
    const imp = leerExportacion('name,url,username,password\nA,https://a.es,u1,p1\nB,https://b.es,u2,p2\n')
    equal('vista previa: nada repetido', caja.contarRepetidos(imp.elementos), 0)
    const r1 = caja.importar(imp.elementos, personal)
    equal('importa dos', r1.nuevos, 2)
    const r2 = caja.importar(leerExportacion('name,url,username,password\nA,https://a.es,u1,p1\nB,https://b.es,u2,p2\n').elementos, personal)
    equal('la segunda vez, ninguno', r2.nuevos, 0)
    equal('y dice que ya estaban', r2.repetidos, 2)
    const conArchivado = caja.importar([{ ...leerExportacion('name,url,username,password\nC,https://c.es,u3,p3\n').elementos[0], archivado: true }], personal)
    equal('lo archivado entra archivado', conArchivado.nuevos, 1)
    check('y lo está', caja.listar().some((e) => e.titulo === 'C' && e.estado === 'archivado'))

    // Una fila con el sobre de otra no se abre, y no tumba al resto
    const [a, b] = caja.listar().filter((e) => e.titulo === 'A' || e.titulo === 'B')
    const sobreA = (caja.db.prepare('SELECT resumen FROM elementos WHERE id = ?').get(a.id) as { resumen: Uint8Array }).resumen
    caja.db.prepare('UPDATE elementos SET resumen = ? WHERE id = ?').run(sobreA, b.id)
    caja.bloquear()
    caja.desbloquear('la contraseña nueva de verdad', clave.secreto)
    equal('el cambiado se detecta', caja.danados(), 1)
    check('y los demás abren', caja.listar().some((e) => e.id === a.id))

    // Copias
    const rutaCopia = hacerCopia(caja.db, dir)
    equal('la copia es una caja de la misma cuenta', CajaFuerte.examinar(rutaCopia).idCuenta, clave.idCuenta)
    equal('y abre con lo suyo', CajaFuerte.examinar(rutaCopia, 'la contraseña nueva de verdad', clave.secreto).abre, true)
    equal('y no con otra cosa', CajaFuerte.examinar(rutaCopia, 'mal', clave.secreto).abre, false)
    const basura = join(dir, 'basura.db')
    writeFileSync(basura, 'no soy una base de datos')
    throws('un archivo cualquiera no es una caja', () => CajaFuerte.examinar(basura), /no es una caja fuerte/)

    // Exportar e importar de vuelta
    const todo = caja.todosConDetalle()
    const json = exportarJson(todo, caja.bovedas())
    const vuelta = leerExportacion(json)
    equal('lo exportado en JSON se vuelve a leer', vuelta.formato, 'clac')
    equal('entero (sin la papelera)', vuelta.elementos.length, todo.filter((x) => x.elemento.estado !== 'eliminado').length)
    const csv = exportarCsv(todo, caja.bovedas())
    check('el CSV lleva la cabecera de Bitwarden', csv.startsWith('folder,favorite,type,name,notes,fields'))
    equal('y Bitwarden CSV se reconoce', leerExportacion(csv).formato, 'bitwarden-csv')

    // Ajustes
    equal('los ajustes nacen con los de fábrica', leerAjustes(caja.db).bloqueoMinutos, 10)
    const aj = guardarAjustes(caja.db, { bloqueoMinutos: 9999, palette: 'ghost' })
    equal('se acotan', aj.bloqueoMinutos, 240)
    equal('y la paleta vale', leerAjustes(caja.db).palette, 'ghost')
    equal('una paleta inventada vuelve a Grafito', guardarAjustes(caja.db, { palette: 'nada' as never }).palette, 'grafito')

    caja.cerrar()

    // La misma caja, abierta de nuevo desde el archivo: con los parámetros de fábrica
    const otra = new CajaFuerte(dir)
    otra.desbloquear('la contraseña nueva de verdad', clave.secreto)
    // Santander, A y C; B es el que se estropeó a propósito más arriba.
    equal('reabierta desde el disco, está todo', otra.listar().length, 3)
    equal('y el estropeado sigue sin abrir', otra.danados(), 1)
    otra.cerrar()
  }

  /* ================================================================ */
  section('Watchtower')
  {
    const hoy = new Date(2026, 8, 13)
    const hacer = (id: string, categoriaId: ElementoLista['categoria'], secciones: Seccion[], extra: Partial<ElementoLista> = {}): { elemento: ElementoLista; detalle: Detalle } => ({
      elemento: {
        id, bovedaId: 'b', estado: 'activo', creado: '', modificado: 'm1', usado: null, usos: 0, adjuntos: 0, eliminadoEn: null,
        titulo: id, categoria: categoriaId, subtitulo: '', webs: [], etiquetas: [], favorito: false, tieneTotp: false, ...extra
      },
      detalle: { secciones, notas: '' }
    })
    const conCampos = (categoriaId: ElementoLista['categoria'], valores: Record<string, string>): Seccion[] => {
      const s = seccionesDePlantilla(categoriaId)
      for (const c of s[0].campos) if (c.clave && valores[c.clave] != null) c.valor = valores[c.clave]
      return s
    }
    const lista = [
      hacer('debil', 'login', conCampos('login', { usuario: 'a', contrasena: 'hola' })),
      hacer('rep1', 'login', conCampos('login', { usuario: 'b', contrasena: 'Z9#pQ2!vL7@xY' })),
      hacer('rep2', 'login', conCampos('login', { usuario: 'c', contrasena: 'Z9#pQ2!vL7@xY' })),
      hacer('http', 'login', conCampos('login', { usuario: 'd', contrasena: 'K3$uW8^rT1&m' }), { webs: ['http://tienda.es'] }),
      hacer('tarjeta', 'tarjeta', conCampos('tarjeta', { caducidad: '2026-10' })),
      hacer('dni', 'dni', conCampos('dni', { caducidad: '2026-01-01' })),
      hacer('filtrada', 'login', conCampos('login', { usuario: 'e', contrasena: 'P7!kq9#Lm2$w' }), { modificado: 'm2' }),
      hacer('vieja', 'login', conCampos('login', { usuario: 'f', contrasena: 'R4@ht6*Np8!z' }), { modificado: 'm3' }),
      hacer('archivada', 'login', conCampos('login', { usuario: 'g', contrasena: 'hola' }), { estado: 'archivado' })
    ]
    const inf = revisar(lista, { filtrada: { modificado: 'm2', veces: 12345 }, vieja: { modificado: 'antes', veces: 5 } }, '2026-09-01', hoy)
    const de = (tipo: string): string[] => inf.grupos.find((g) => g.tipo === tipo)?.elementos.map((e) => e.id) ?? []
    equal('débil', de('debil').join(), 'debil')
    equal('repetidas, las dos', de('repetida').join(), 'rep1,rep2')
    equal('sin cifrar', de('sinCifrar').join(), 'http')
    equal('caduca pronto', de('caduca').join(), 'tarjeta')
    equal('caducada', de('caducada').join(), 'dni')
    equal('filtrada, solo si no ha cambiado desde que se miró', de('filtrada').join(), 'filtrada')
    // En castellano los miles llevan punto desde cinco cifras: 1234 va sin él.
    check('con las veces escritas en castellano', /12\.345 veces/.test(inf.grupos.find((g) => g.tipo === 'filtrada')!.elementos[0].nota!))
    equal('lo archivado no se revisa', inf.revisados, 8)
    equal('puntuación: 1 de 8 limpio', inf.puntuacion, 13)
    equal('la filtrada va primero', inf.grupos[0].tipo, 'filtrada')
    const dup = revisar([hacer('x1', 'nota', [], { titulo: 'Igual' }), hacer('x2', 'nota', [], { titulo: 'Igual' })], {}, null, hoy)
    equal('dos notas idénticas son duplicados', dup.grupos[0]?.tipo, 'duplicado')
    equal('una caja vacía saca un 100', revisar([], {}, null, hoy).puntuacion, 100)
  }

  /* ================================================================ */
  section('Categorías')
  {
    equal('veintidós categorías', CATEGORIAS.length, 22)
    equal('sin ids repetidos', new Set(CATEGORIAS.map((c) => c.id)).size, 22)
    check('ninguna repite clave de campo', CATEGORIAS.every((c) => new Set(c.campos.map((f) => f.clave)).size === c.campos.length))
    const iban = conValores('banco', { iban: 'ES9121000418450200051332' })
    equal('el IBAN se resume', subtituloDe('banco', iban), 'ES91 •••• 1332')
    equal('una categoría desconocida cae en login', categoria('nada' as never).id, 'login')
  }

  /* ================================================================ */
  section('SSH y kit')
  {
    const par = generarClaveSsh('ana@casa')
    check('pública en formato OpenSSH', /^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA[A-Za-z0-9+/]+=* ana@casa$/.test(par.publica), par.publica)
    check('privada entre sus marcas', par.privada.startsWith('-----BEGIN OPENSSH PRIVATE KEY-----\n') && par.privada.trimEnd().endsWith('-----END OPENSSH PRIVATE KEY-----'))
    const cuerpo = Buffer.from(par.privada.split('\n').slice(1, -2).join(''), 'base64')
    equal('con la cabecera de OpenSSH', cuerpo.subarray(0, 15).toString('binary'), 'openssh-key-v1\0')
    const blob = Buffer.from(par.publica.split(' ')[1], 'base64')
    check('la pública va dentro de la privada', cuerpo.includes(blob))
    check('huella SHA256', /^SHA256:[A-Za-z0-9+/]{43}$/.test(par.huella))

    const html = construirKitHtml({
      clave: nuevaClaveSecreta('ABCDEF'),
      carpeta: 'C:\\Users\\<ana>\\AppData\\Roaming\\CLAC',
      creada: new Date(2026, 8, 13),
      icono: 'data:image/png;base64,'
    })
    check('el kit lleva la clave', html.includes('ABCDEF') && html.includes('C1'))
    check('y escapa lo que se cuela', html.includes('&lt;ana&gt;') && !html.includes('<ana>'))
    check('con la fecha en castellano', html.includes('13 de septiembre de 2026'))
  }

  console.log(`\n${passed} bien, ${failed} mal`)
  for (const dir of carpetas) rmSync(dir, { recursive: true, force: true })
  if (failed > 0) process.exit(1)
}

function conValores(categoriaId: ElementoLista['categoria'], valores: Record<string, string>): Detalle {
  const s = seccionesDePlantilla(categoriaId)
  for (const c of s[0].campos) if (c.clave && valores[c.clave] != null) c.valor = valores[c.clave]
  return { secciones: s, notas: '' }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
