/**
 * Un ayudante de PowerShell para lo que Electron no sabe hacer en Windows.
 *
 * Dos cosas. La primera, **copiar sin que quede en el historial del
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
 *
 * La segunda, **Windows Hello**: preguntar si está configurado y pedir que
 * confirmes que eres tú, con el PIN de Windows, la huella o la cara. Es WinRT
 * (`UserConsentVerifier`), que PowerShell 5.1 sabe cargar; lo que no sabe es
 * enlazarlo al compilar, así que el puente con la ventana
 * (`IUserConsentVerifierInterop`, para que el diálogo salga delante y no
 * detrás) se declara en C# sin tipos de WinRT y devuelve el objeto tal cual, y
 * PowerShell lo espera con su `AsTask`. Se compila la primera vez que hace
 * falta: el portapapeles no espera por él.
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
$script:hello = $null
function Hello {
  if ($script:hello) { return $script:hello }
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Security.Credentials.UI.UserConsentVerifier, Windows.Security.Credentials.UI, ContentType = WindowsRuntime]
  $null = [Windows.Foundation.IAsyncOperation\`1, Windows.Foundation, ContentType = WindowsRuntime]
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace Clac {
  [ComImport, Guid("39E050C3-4E74-441A-8DC0-B81104DF949C"), InterfaceType(ComInterfaceType.InterfaceIsIInspectable)]
  public interface IUserConsentVerifierInterop {
    [return: MarshalAs(UnmanagedType.IInspectable)]
    object RequestVerificationForWindowAsync(IntPtr appWindow, [MarshalAs(UnmanagedType.HString)] string message, [In] ref Guid riid);
  }
  public static class Hello {
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
    // Sin ventana propia (lo pide la extensión), la de delante: el navegador.
    // Su dueña, no la ventanita de la extensión, que se cierra al perder el foco.
    public static IntPtr Duena(long propia) {
      if (propia != 0) return new IntPtr(propia);
      IntPtr w = GetForegroundWindow();
      IntPtr raiz = w == IntPtr.Zero ? IntPtr.Zero : GetAncestor(w, 3);
      return raiz == IntPtr.Zero ? w : raiz;
    }
    public static object Pedir(object fabrica, IntPtr ventana, string mensaje, Guid iid) {
      return ((IUserConsentVerifierInterop)fabrica).RequestVerificationForWindowAsync(ventana, mensaje, ref iid);
    }
  }
}
'@
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' } | Select-Object -First 1
  $script:hello = @{
    esperarEstado = $asTask.MakeGenericMethod([Windows.Security.Credentials.UI.UserConsentVerifierAvailability])
    esperarResultado = $asTask.MakeGenericMethod([Windows.Security.Credentials.UI.UserConsentVerificationResult])
    iid = [Windows.Foundation.IAsyncOperation\`1].MakeGenericType([Windows.Security.Credentials.UI.UserConsentVerificationResult]).GUID
    fabrica = [System.Runtime.InteropServices.WindowsRuntime.WindowsRuntimeMarshal]::GetActivationFactory([Windows.Security.Credentials.UI.UserConsentVerifier])
  }
  return $script:hello
}
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
    $datos = $null
    if ($orden.op -eq 'helloEstado') {
      $h = Hello
      $t = $h.esperarEstado.Invoke($null, @([Windows.Security.Credentials.UI.UserConsentVerifier]::CheckAvailabilityAsync()))
      $t.Wait()
      $datos = $t.Result.ToString()
    }
    if ($orden.op -eq 'hello') {
      $h = Hello
      $op = [Clac.Hello]::Pedir($h.fabrica, [Clac.Hello]::Duena([long]$orden.ventana), [string]$orden.mensaje, $h.iid)
      $t = $h.esperarResultado.Invoke($null, @($op))
      $t.Wait()
      $datos = $t.Result.ToString()
    }
    [Console]::Out.WriteLine((@{ id = $orden.id; ok = $true; datos = $datos } | ConvertTo-Json -Compress))
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
interface Respuesta {
  ok: boolean
  datos?: string | null
  error?: string
}
const esperando = new Map<number, { resolver: (r: Respuesta) => void; plazo: NodeJS.Timeout }>()

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
        const r = JSON.parse(linea) as Respuesta & { id: number }
        const e = esperando.get(r.id)
        if (!e) continue
        clearTimeout(e.plazo)
        esperando.delete(r.id)
        if (!r.ok) registrar('ayudante', `no pudo: ${r.error ?? '¿?'}`)
        e.resolver(r)
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
      e.resolver({ ok: false, error: 'El ayudante se ha cerrado.' })
    }
    esperando.clear()
    proceso = null
  })
  p.on('error', (error) => registrarFallo('ayudante', error))
  proceso = p
  return p
}

/** Una orden al ayudante, con su plazo. Sin respuesta a tiempo, un fallo. */
function pedir(orden: Record<string, unknown>, plazoMs: number): Promise<Respuesta> {
  return new Promise((resolver) => {
    let p: ChildProcessWithoutNullStreams
    try {
      p = arrancar()
    } catch (error) {
      registrarFallo('ayudante', error)
      resolver({ ok: false, error: 'No se ha podido arrancar el ayudante.' })
      return
    }
    const id = siguiente++
    const plazo = setTimeout(() => {
      esperando.delete(id)
      resolver({ ok: false, error: 'El ayudante no ha contestado a tiempo.' })
    }, plazoMs)
    esperando.set(id, { resolver, plazo })
    p.stdin.write(JSON.stringify({ id, ...orden }) + '\n')
  })
}

/** Copia sin dejar rastro en el historial. `false` si no ha podido. */
export async function copiarSinHistorial(texto: string): Promise<boolean> {
  // El primer uso incluye arrancar PowerShell, que en frío tarda un par de segundos.
  const r = await pedir({ op: 'copiar', texto: Buffer.from(texto, 'utf8').toString('base64') }, 6000)
  return r.ok
}

/**
 * Cómo está Windows Hello en este equipo: `Available`, `DeviceNotPresent`,
 * `NotConfiguredForUser`, `DisabledByPolicy`, `DeviceBusy`… o `null` si no se
 * ha podido saber.
 */
export async function estadoHello(): Promise<string | null> {
  // La primera vez compila el puente: unos cientos de milisegundos más.
  const r = await pedir({ op: 'helloEstado' }, 15_000)
  return r.ok ? (r.datos ?? null) : null
}

/**
 * Pide a Windows que confirme que eres tú. Devuelve lo que dice Windows:
 * `Verified`, `Canceled`, `RetriesExhausted`… o `null` si no se ha podido
 * preguntar. `ventana` es el identificador de la ventana de CLAC sobre la que
 * sale el diálogo; 0, la que esté delante.
 *
 * Mientras espera, el ayudante no copia: en ese rato la caja está bloqueada y
 * no hay nada que copiar.
 */
export async function pedirHello(mensaje: string, ventana: bigint): Promise<string | null> {
  const r = await pedir({ op: 'hello', mensaje, ventana: ventana.toString() }, 3 * 60_000)
  return r.ok ? (r.datos ?? null) : null
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
