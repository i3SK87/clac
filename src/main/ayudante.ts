/**
 * Un ayudante de PowerShell para lo que Electron no sabe hacer en Windows.
 *
 * Por ahora, una sola cosa: **copiar sin que quede en el historial del
 * portapapeles**. Windows guarda lo copiado en Win+V —y en este equipo está
 * encendido—, así que una contraseña copiada seguiría ahí aunque luego se vacíe
 * el portapapeles. Windows respeta tres marcas para no guardar algo
 * (`ExcludeClipboardContentFromMonitorProcessing`, `CanIncludeInClipboardHistory`
 * y `CanUploadToCloudClipboard`), pero hay que ponerlas en la misma operación que
 * el texto, y el portapapeles de Electron solo escribe texto, HTML o imágenes.
 *
 * .NET sí puede, y .NET viene con Windows. En vez de arrancar un PowerShell en
 * cada copia —medio segundo de espera cada vez—, se arranca uno al primer uso y
 * se queda escuchando: recibe órdenes en JSON, una por línea, y contesta igual.
 * Si algo falla, quien lo llama copia a la manera de siempre.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { registrar, registrarFallo } from './registro'

const GUION = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
[Console]::InputEncoding = [Text.Encoding]::UTF8
[Console]::OutputEncoding = [Text.Encoding]::UTF8
function Cero { New-Object System.IO.MemoryStream(,[byte[]](0,0,0,0)) }
while ($true) {
  $linea = [Console]::In.ReadLine()
  if ($linea -eq $null) { break }
  $orden = $null
  try {
    $orden = $linea | ConvertFrom-Json
    if ($orden.op -eq 'copiar') {
      $texto = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($orden.texto))
      $datos = New-Object System.Windows.Forms.DataObject
      $datos.SetData([System.Windows.Forms.DataFormats]::UnicodeText, $texto)
      $datos.SetData('ExcludeClipboardContentFromMonitorProcessing', (Cero))
      $datos.SetData('CanIncludeInClipboardHistory', (Cero))
      $datos.SetData('CanUploadToCloudClipboard', (Cero))
      [System.Windows.Forms.Clipboard]::SetDataObject($datos, $true, 10, 50)
      $texto = $null
    }
    [Console]::Out.WriteLine((@{ id = $orden.id; ok = $true } | ConvertTo-Json -Compress))
  } catch {
    $id = if ($orden) { $orden.id } else { 0 }
    [Console]::Out.WriteLine((@{ id = $id; ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress))
  }
  [Console]::Out.Flush()
}
`

let proceso: ChildProcessWithoutNullStreams | null = null
let siguiente = 1
let pendiente = ''
const esperando = new Map<number, { resolver: (ok: boolean) => void; plazo: NodeJS.Timeout }>()

function arrancar(): ChildProcessWithoutNullStreams {
  if (proceso && !proceso.killed && proceso.exitCode === null) return proceso
  const codificado = Buffer.from(GUION, 'utf16le').toString('base64')
  const p = spawn(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Sta', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', codificado],
    { windowsHide: true }
  )
  p.stdout.setEncoding('utf8')
  p.stdout.on('data', (trozo: string) => {
    pendiente += trozo
    let salto: number
    while ((salto = pendiente.indexOf('\n')) >= 0) {
      const linea = pendiente.slice(0, salto).trim()
      pendiente = pendiente.slice(salto + 1)
      if (!linea) continue
      try {
        const r = JSON.parse(linea) as { id: number; ok: boolean; error?: string }
        const e = esperando.get(r.id)
        if (!e) continue
        clearTimeout(e.plazo)
        esperando.delete(r.id)
        if (!r.ok) registrar('ayudante', `no pudo copiar: ${r.error ?? '¿?'}`)
        e.resolver(r.ok)
      } catch {
        // Una línea que no es nuestra (un aviso de PowerShell): se ignora.
      }
    }
  })
  p.stderr.on('data', (t: Buffer) => registrar('ayudante', t.toString('utf8').trim().slice(0, 300)))
  p.on('exit', (codigo) => {
    registrar('ayudante', `se ha cerrado (${codigo})`)
    for (const e of esperando.values()) {
      clearTimeout(e.plazo)
      e.resolver(false)
    }
    esperando.clear()
    proceso = null
  })
  p.on('error', (error) => registrarFallo('ayudante', error))
  proceso = p
  return p
}

/** Copia sin dejar rastro en el historial. `false` si no ha podido. */
export function copiarSinHistorial(texto: string): Promise<boolean> {
  return new Promise((resolver) => {
    let p: ChildProcessWithoutNullStreams
    try {
      p = arrancar()
    } catch (error) {
      registrarFallo('ayudante', error)
      resolver(false)
      return
    }
    const id = siguiente++
    // El primer uso incluye arrancar PowerShell, que en frío tarda un par de segundos.
    const plazo = setTimeout(() => {
      esperando.delete(id)
      resolver(false)
    }, 6000)
    esperando.set(id, { resolver, plazo })
    p.stdin.write(JSON.stringify({ id, op: 'copiar', texto: Buffer.from(texto, 'utf8').toString('base64') }) + '\n')
  })
}

/** Lo arranca por adelantado, para que la primera copia no espere. */
export function precalentar(): void {
  try {
    arrancar()
  } catch (error) {
    registrarFallo('ayudante', error)
  }
}

export function pararAyudante(): void {
  if (!proceso) return
  try {
    proceso.stdin.end()
    proceso.kill()
  } catch {
    // Ya estaba muerto.
  }
  proceso = null
}
