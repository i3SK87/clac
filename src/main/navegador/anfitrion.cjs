/*
 * El puente entre el navegador y CLAC.
 *
 * El navegador lo arranca cuando la extensión abre su ventana, y le habla por
 * la entrada y la salida estándar con la «mensajería nativa» de Chromium: cada
 * mensaje es un JSON precedido de su longitud en cuatro bytes. Este puente se
 * los pasa a CLAC por un canal con nombre de Windows, una línea por mensaje, y
 * devuelve las respuestas por el mismo camino.
 *
 * Lo ejecuta el propio CLAC.exe en modo Node (ELECTRON_RUN_AS_NODE=1), así que
 * no hace falta tener Node instalado. No guarda nada ni ve nada de la caja: si
 * CLAC no está abierta, lo dice; y si se le pide, la abre.
 */
'use strict'
const net = require('node:net')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const TUBO = '\\\\.\\pipe\\clac-navegador-' + String(process.env.USERNAME || 'usuario').toLowerCase()

function enviar(objeto) {
  const cuerpo = Buffer.from(JSON.stringify(objeto), 'utf8')
  const cabecera = Buffer.alloc(4)
  cabecera.writeUInt32LE(cuerpo.length, 0)
  process.stdout.write(Buffer.concat([cabecera, cuerpo]))
}

let conexion = null
let pendiente = ''

function conectar() {
  return new Promise((resolver, rechazar) => {
    const c = net.connect(TUBO)
    c.once('connect', () => {
      c.setEncoding('utf8')
      c.on('data', (trozo) => {
        pendiente += trozo
        let salto
        while ((salto = pendiente.indexOf('\n')) >= 0) {
          const linea = pendiente.slice(0, salto)
          pendiente = pendiente.slice(salto + 1)
          if (linea.trim()) {
            try {
              enviar(JSON.parse(linea))
            } catch (e) {
              // Una línea rota de CLAC no puede tumbar el puente.
            }
          }
        }
      })
      c.on('close', () => {
        conexion = null
      })
      resolver(c)
    })
    c.once('error', rechazar)
  })
}

function lanzarClac() {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'lanzar.json'), 'utf8'))
  const entorno = Object.assign({}, process.env)
  delete entorno.ELECTRON_RUN_AS_NODE
  spawn(cfg.exe, cfg.args || [], { detached: true, stdio: 'ignore', env: entorno }).unref()
}

async function atender(mensaje) {
  if (mensaje && mensaje.tipo === 'abrirApp') {
    try {
      lanzarClac()
      enviar({ id: mensaje.id, ok: true, datos: null })
    } catch (e) {
      enviar({ id: mensaje.id, ok: false, error: 'No se ha podido abrir CLAC.' })
    }
    return
  }
  try {
    if (!conexion) conexion = await conectar()
    conexion.write(JSON.stringify(mensaje) + '\n')
  } catch (e) {
    enviar({ id: mensaje && mensaje.id, ok: false, cerrada: true, error: 'CLAC no está abierta.' })
  }
}

let entrada = Buffer.alloc(0)
process.stdin.on('data', (trozo) => {
  entrada = Buffer.concat([entrada, trozo])
  while (entrada.length >= 4) {
    const largo = entrada.readUInt32LE(0)
    // Chromium no manda mensajes de más de 4 GB, pero uno absurdo es que algo va mal.
    if (largo > 16 * 1024 * 1024) process.exit(1)
    if (entrada.length < 4 + largo) break
    const cuerpo = entrada.subarray(4, 4 + largo).toString('utf8')
    entrada = entrada.subarray(4 + largo)
    let mensaje = null
    try {
      mensaje = JSON.parse(cuerpo)
    } catch (e) {
      continue
    }
    atender(mensaje)
  }
})
// El navegador cierra la entrada cuando se cierra la ventana de la extensión.
process.stdin.on('end', () => process.exit(0))
