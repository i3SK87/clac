/**
 * Claves SSH nuevas, en el formato que entiende OpenSSH.
 *
 * Node genera el par Ed25519, pero lo exporta en PKCS#8 y OpenSSH quiere el
 * suyo: la pública como `ssh-ed25519 AAAA… comentario` y la privada entre
 * `BEGIN OPENSSH PRIVATE KEY`. Los dos formatos están documentados (PROTOCOL.key
 * en el código de OpenSSH) y son unas cuantas cadenas con su longitud delante,
 * así que se escriben a mano.
 *
 * La privada va sin frase de paso: la protege la caja fuerte, que es donde vive.
 */
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto'

function cadena(datos: Buffer | string): Buffer {
  const b = typeof datos === 'string' ? Buffer.from(datos, 'utf8') : datos
  const largo = Buffer.alloc(4)
  largo.writeUInt32BE(b.length)
  return Buffer.concat([largo, b])
}

function entero(n: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n >>> 0)
  return b
}

export interface ParSsh {
  privada: string
  publica: string
  huella: string
  tipo: string
}

export function generarClaveSsh(comentario = 'clac'): ParSsh {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const jwkPub = publicKey.export({ format: 'jwk' })
  const jwkPriv = privateKey.export({ format: 'jwk' })
  const pub = Buffer.from(jwkPub.x!, 'base64url')
  const semilla = Buffer.from(jwkPriv.d!, 'base64url')

  const blobPublico = Buffer.concat([cadena('ssh-ed25519'), cadena(pub)])
  const control = randomBytes(4).readUInt32BE()

  let privados = Buffer.concat([
    entero(control),
    entero(control),
    cadena('ssh-ed25519'),
    cadena(pub),
    cadena(Buffer.concat([semilla, pub])),
    cadena(comentario)
  ])
  // Relleno 1, 2, 3… hasta múltiplo de 8, que es el bloque del cifrado «none».
  const relleno: number[] = []
  for (let i = 1; (privados.length + relleno.length) % 8 !== 0; i++) relleno.push(i)
  privados = Buffer.concat([privados, Buffer.from(relleno)])

  const cuerpo = Buffer.concat([
    Buffer.from('openssh-key-v1\0', 'binary'),
    cadena('none'),
    cadena('none'),
    cadena(''),
    entero(1),
    cadena(blobPublico),
    cadena(privados)
  ])
  const base64 = cuerpo.toString('base64').replace(/.{1,70}/g, '$&\n')
  semilla.fill(0)

  return {
    privada: `-----BEGIN OPENSSH PRIVATE KEY-----\n${base64}-----END OPENSSH PRIVATE KEY-----\n`,
    publica: `ssh-ed25519 ${blobPublico.toString('base64')} ${comentario}`,
    huella: `SHA256:${createHash('sha256').update(blobPublico).digest('base64').replace(/=+$/, '')}`,
    tipo: 'Ed25519'
  }
}
