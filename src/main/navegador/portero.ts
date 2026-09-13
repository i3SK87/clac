/**
 * El portero del canal de la extensión.
 *
 * Hasta la 1.4.1 escuchaba Node directamente en el canal con nombre, y atendía
 * a cualquiera que se conectase: con CLAC desbloqueada, cualquier programa que
 * corriera con tu usuario podía pedirle todas las contraseñas sin que se viera
 * nada. Node no tiene manera de saber quién está al otro lado de un canal.
 * Windows sí: `GetNamedPipeClientProcessId` dice qué proceso se ha conectado, y
 * eso no lo puede falsear quien llama.
 *
 * Así que el canal lo abre ahora un PowerShell con una pieza en C#, y antes de
 * dejar pasar a nadie comprueba dos cosas:
 *
 * 1. Que el proceso es **el CLAC.exe de esta instalación**: el puente es el
 *    propio CLAC.exe en modo Node, arrancado por el .cmd que lanza el navegador.
 * 2. Que lo ha abierto **un navegador** (Opera, Chrome, Edge o Brave), mirando
 *    hacia arriba en su familia: el navegador arranca el .cmd con cmd.exe, y
 *    cmd.exe arranca el puente.
 *
 * Además, el canal solo admite a tu usuario y rechaza la red.
 *
 * No lo cierra del todo —un programa malicioso con tu usuario podría llegar a
 * falsear la familia de procesos, o leer la memoria de CLAC—, pero pasa de
 * «basta con conectarse» a tener que atacar de verdad.
 *
 * Con CLAC habla por su entrada y salida, una línea por aviso, con el texto en
 * base64 para no pelearse con codificaciones ni comillas:
 *   sale  LISTO · A <id> <pid> · R <pid> <motivo> · M <id> <mensaje> · C <id> · E <error>
 *   entra M <id> <mensaje> · C <id>
 *
 * No depende de Electron: se prueba con Node en `npm test`.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

const CSHARP = `
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Threading;

namespace Clac {
  public static class Portero {
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetNamedPipeClientProcessId(IntPtr tubo, out uint pid);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr OpenProcess(uint acceso, bool heredar, uint pid);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool QueryFullProcessImageNameW(IntPtr proceso, uint flags, StringBuilder nombre, ref uint largo);
    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    static extern bool Process32FirstW(IntPtr foto, ref Entrada e);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    static extern bool Process32NextW(IntPtr foto, ref Entrada e);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct Entrada {
      public uint dwSize; public uint cntUsage; public uint th32ProcessID; public IntPtr th32DefaultHeapID;
      public uint th32ModuleID; public uint cntThreads; public uint th32ParentProcessID; public int pcPriClassBase;
      public uint dwFlags;
      [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile;
    }

    static readonly object cerrojo = new object();
    static StreamWriter salida;
    static readonly ConcurrentDictionary<int, NamedPipeServerStream> conexiones = new ConcurrentDictionary<int, NamedPipeServerStream>();
    static int siguiente = 0;

    static void Decir(string linea) {
      lock (cerrojo) { salida.Write(linea + "\\n"); salida.Flush(); }
    }

    static string B64(string s) { return Convert.ToBase64String(Encoding.UTF8.GetBytes(s)); }

    static string RutaDe(uint pid) {
      IntPtr h = OpenProcess(0x1000, false, pid);
      if (h == IntPtr.Zero) return null;
      try {
        var nombre = new StringBuilder(1024);
        uint largo = (uint)nombre.Capacity;
        return QueryFullProcessImageNameW(h, 0, nombre, ref largo) ? nombre.ToString() : null;
      } finally { CloseHandle(h); }
    }

    static Dictionary<uint, Entrada> Procesos() {
      var todos = new Dictionary<uint, Entrada>();
      IntPtr foto = CreateToolhelp32Snapshot(2, 0);
      if (foto == IntPtr.Zero || foto == new IntPtr(-1)) return todos;
      try {
        var e = new Entrada();
        e.dwSize = (uint)Marshal.SizeOf(typeof(Entrada));
        if (Process32FirstW(foto, ref e)) {
          do {
            todos[e.th32ProcessID] = e;
            e.dwSize = (uint)Marshal.SizeOf(typeof(Entrada));
          } while (Process32NextW(foto, ref e));
        }
      } finally { CloseHandle(foto); }
      return todos;
    }

    // null si puede pasar; si no, por qué.
    static string Examinar(uint pid, string exe, string[] navegadores) {
      string ruta = RutaDe(pid);
      if (ruta == null) return "no se puede saber qué programa es (proceso " + pid + ")";
      if (!string.Equals(Path.GetFullPath(ruta), Path.GetFullPath(exe), StringComparison.OrdinalIgnoreCase)) {
        return "no es el puente de CLAC, es " + ruta;
      }
      var procesos = Procesos();
      var familia = new List<string>();
      uint actual = pid;
      for (int i = 0; i < 4; i++) {
        Entrada e, padre;
        if (!procesos.TryGetValue(actual, out e)) break;
        if (e.th32ParentProcessID == 0 || !procesos.TryGetValue(e.th32ParentProcessID, out padre)) break;
        familia.Add(padre.szExeFile);
        foreach (var n in navegadores) {
          if (string.Equals(padre.szExeFile, n, StringComparison.OrdinalIgnoreCase)) return null;
        }
        actual = e.th32ParentProcessID;
      }
      return "no lo ha abierto un navegador (" + (familia.Count > 0 ? string.Join(" < ", familia) : "sin padre") + ")";
    }

    static void Aceptar(string nombre, string exe, string[] navegadores, PipeSecurity seguridad) {
      bool listo = false;
      while (true) {
        NamedPipeServerStream s;
        try {
          s = new NamedPipeServerStream(nombre, PipeDirection.InOut, NamedPipeServerStream.MaxAllowedServerInstances,
            PipeTransmissionMode.Byte, PipeOptions.Asynchronous, 65536, 65536, seguridad);
        } catch (Exception e) {
          Decir("E " + B64(e.Message));
          Thread.Sleep(3000);
          continue;
        }
        if (!listo) { Decir("LISTO"); listo = true; }
        try { s.WaitForConnection(); } catch (Exception) { s.Dispose(); continue; }
        uint pid = 0;
        GetNamedPipeClientProcessId(s.SafePipeHandle.DangerousGetHandle(), out pid);
        string motivo = pid == 0 ? "no se sabe quién llama" : Examinar(pid, exe, navegadores);
        if (motivo != null) {
          Decir("R " + pid + " " + B64(motivo));
          try { s.Disconnect(); } catch (Exception) { }
          s.Dispose();
          continue;
        }
        int id = Interlocked.Increment(ref siguiente);
        conexiones[id] = s;
        Decir("A " + id + " " + pid);
        var hilo = new Thread(() => Leer(id, s));
        hilo.IsBackground = true;
        hilo.Start();
      }
    }

    static void Leer(int id, NamedPipeServerStream s) {
      try {
        var lector = new StreamReader(s, new UTF8Encoding(false));
        string linea;
        while ((linea = lector.ReadLine()) != null) {
          if (linea.Trim().Length > 0) Decir("M " + id + " " + B64(linea));
        }
      } catch (Exception) { }
      NamedPipeServerStream quitada;
      conexiones.TryRemove(id, out quitada);
      try { s.Dispose(); } catch (Exception) { }
      Decir("C " + id);
    }

    public static void Correr(string tubo, string exe, string lista) {
      salida = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
      string[] navegadores = lista.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
      var seguridad = new PipeSecurity();
      seguridad.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User, PipeAccessRights.FullControl, AccessControlType.Allow));
      seguridad.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.NetworkSid, null), PipeAccessRights.FullControl, AccessControlType.Deny));
      string nombre = tubo.StartsWith(@"\\\\.\\pipe\\") ? tubo.Substring(9) : tubo;
      var aceptar = new Thread(() => Aceptar(nombre, exe, navegadores, seguridad));
      aceptar.IsBackground = true;
      aceptar.Start();
      var entrada = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
      string linea;
      while ((linea = entrada.ReadLine()) != null) {
        var partes = linea.Split(' ');
        int id;
        if (partes.Length < 2 || !int.TryParse(partes[1], out id)) continue;
        NamedPipeServerStream c;
        if (!conexiones.TryGetValue(id, out c)) continue;
        try {
          if (partes[0] == "M" && partes.Length == 3) {
            byte[] datos = Encoding.UTF8.GetBytes(Encoding.UTF8.GetString(Convert.FromBase64String(partes[2])) + "\\n");
            c.Write(datos, 0, datos.Length);
            c.Flush();
          } else if (partes[0] == "C") {
            c.Dispose();
          }
        } catch (Exception) { }
      }
    }
  }
}
`

const GUION = `
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Core -TypeDefinition @'
${CSHARP}
'@
[Clac.Portero]::Correr($env:CLAC_TUBO, $env:CLAC_EXE, $env:CLAC_NAVEGADORES)
`

/** Los que pueden abrir el puente. Opera Air también se llama opera.exe. */
export const NAVEGADORES = ['opera.exe', 'chrome.exe', 'msedge.exe', 'brave.exe']

export interface OpcionesPortero {
  tubo: string
  /** El ejecutable que tiene que ser el puente: el CLAC.exe de esta instalación. */
  exe: string
  navegadores?: string[]
  /** Una petición de la extensión, en texto; devuelve la respuesta, en texto. */
  alPedir: (linea: string) => Promise<string>
  alAbrir?: (pid: number) => void
  alRechazar?: (pid: number, motivo: string) => void
  alListo?: () => void
  /** Un fallo del portero, o que se ha cerrado. */
  alFallar?: (mensaje: string) => void
}

export interface Portero {
  parar: () => void
}

const deB64 = (s: string): string => Buffer.from(s, 'base64').toString('utf8')
const aB64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64')

export function arrancarPortero(o: OpcionesPortero): Portero {
  const p: ChildProcessWithoutNullStreams = spawn(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(GUION, 'utf16le').toString('base64')],
    {
      windowsHide: true,
      env: { ...process.env, CLAC_TUBO: o.tubo, CLAC_EXE: o.exe, CLAC_NAVEGADORES: (o.navegadores ?? NAVEGADORES).join(',') }
    }
  )
  let parado = false
  let resto = ''
  p.stdout.setEncoding('utf8')
  p.stdout.on('data', (trozo: string) => {
    resto += trozo
    let salto: number
    while ((salto = resto.indexOf('\n')) >= 0) {
      const linea = resto.slice(0, salto).trim()
      resto = resto.slice(salto + 1)
      if (!linea) continue
      const [que, a, b] = linea.split(' ')
      if (que === 'LISTO') o.alListo?.()
      else if (que === 'A') o.alAbrir?.(Number(b))
      else if (que === 'R') o.alRechazar?.(Number(a), deB64(b ?? ''))
      else if (que === 'E') o.alFallar?.(deB64(a ?? ''))
      else if (que === 'M') {
        const id = a
        void o
          .alPedir(deB64(b ?? ''))
          .then((respuesta) => {
            if (!parado && !p.stdin.destroyed) p.stdin.write(`M ${id} ${aB64(respuesta)}\n`)
          })
          .catch(() => undefined)
      }
    }
  })
  p.stderr.on('data', (t: Buffer) => o.alFallar?.(t.toString('utf8').trim().slice(0, 400)))
  p.on('exit', (codigo) => {
    if (!parado) o.alFallar?.(`el portero se ha cerrado (${codigo})`)
  })
  p.on('error', (error) => o.alFallar?.(error.message))
  return {
    parar: () => {
      parado = true
      try {
        p.stdin.end()
        p.kill()
      } catch {
        // Ya estaba cerrado.
      }
    }
  }
}
