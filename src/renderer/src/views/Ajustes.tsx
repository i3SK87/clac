/**
 * Ajustes, en tarjetas como los de BONK: seguridad (con Windows Hello), acceso rápido, aspecto,
 * contraseña maestra y kit de emergencia, y los datos (copias, importar y
 * exportar).
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Download, Eye, EyeOff, FileDown, FileUp, FolderOpen, HardDriveDownload, KeyRound, Lock, Printer, TriangleAlert } from 'lucide-react'
import { Checkbox, Field, Modal, Segmented, SelectorPaleta, mensajeDeError, useAvisos } from 'casa/ui'
import { CATEGORIAS } from '@shared/categorias'
import { fortaleza } from '@shared/fortaleza'
import { haceCuanto } from '@shared/fechas'
import type { InfoDatos, InfoNavegador, Tema, VistaImportacion } from '@shared/tipos'
import { api, useStore } from '../lib/store'
import { PedirContrasena } from '../components/PedirContrasena'
import { Medidor } from '../components/piezas'
import { ConfirmarReinicio, contarActualizacion, useActualizacion } from '../components/Actualizacion'

const MINUTOS = [1, 2, 5, 10, 15, 30, 60, 0]
const SEGUNDOS = [30, 60, 90, 120, 300, 0]

/**
 * La copia fuera del ordenador: cada copia de CLAC, también en otra carpeta.
 * Pensada para una de OneDrive, que ya se sube sola a la nube.
 */
function CopiaFuera({ fallo }: { fallo: string | null }): ReactNode {
  const { toast } = useAvisos()
  const { ajustes, run } = useStore()
  const [kit, setKit] = useState<string | null>(null)
  const dir = ajustes.carpetaCopiaExtra

  const elegir = (): void =>
    void run(() => api.datos.elegirCarpetaExtra()).then((r) => {
      if (!r) return
      setKit(r.kitEnLaNube)
      toast('Copia guardada. A partir de ahora, cada copia irá también ahí.')
    })

  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="divider" />
      <div className="ajuste-fila">
        <div>
          <strong>Copia fuera del ordenador</strong>
          <p className="small muted">
            {dir ? (
              <>
                Cada copia se guarda también en <span className="mono">{dir}</span>, con las diez últimas.
                {ajustes.ultimaCopiaExtra ? ` La última, ${haceCuanto(ajustes.ultimaCopiaExtra)}.` : ''}
              </>
            ) : (
              'Elige una carpeta de OneDrive y cada copia se guardará también ahí, en la nube. Va cifrada: sin tu contraseña y tu clave secreta no se abre.'
            )}
          </p>
        </div>
        <div className="row">
          <button className="btn" onClick={elegir}>
            <FolderOpen size={15} /> {dir ? 'Cambiar…' : 'Elegir carpeta…'}
          </button>
          {dir && (
            <button className="btn ghost" onClick={() => void run(() => api.datos.quitarCarpetaExtra()).then((a) => a && toast('Ya no se copia fuera'))}>
              Quitar
            </button>
          )}
        </div>
      </div>
      {fallo && dir && (
        <div className="aviso-fuerte mal">
          <TriangleAlert size={15} /> La última copia no se pudo guardar ahí: {fallo}
        </div>
      )}
      {kit && (
        <div className="aviso-fuerte">
          <TriangleAlert size={15} />
          <span>
            Tu kit de emergencia está en la misma nube: <span className="mono">{kit}</span>. Con el kit y la copia juntos, solo la
            contraseña maestra protege tu caja. Imprímelo y saca el PDF de ahí.
          </span>
        </div>
      )}
    </div>
  )
}

/** La versión y el actualizador, como la tarjeta de BONK. */
function AcercaDe({ version }: { version: string }): ReactNode {
  const { ajustes, cambiarAjustes, run } = useStore()
  const e = useActualizacion()
  const [reiniciando, setReiniciando] = useState(false)
  return (
    <section className="card">
      <div className="card-header">
        <h2>Acerca de</h2>
      </div>
      <div className="card-body col" style={{ gap: 14 }}>
        <p className="small muted">CLAC, versión {version} · de la misma casa que BONK · sin cuenta y sin nube, salvo la copia que tú elijas</p>
        <div className="divider" />
        <Checkbox
          checked={ajustes.buscarVersiones}
          onChange={(v) => void cambiarAjustes({ buscarVersiones: v })}
          label="Buscar versiones nuevas"
          hint="Al abrir, en GitHub. Solo se piden los archivos de la versión publicada: nada de tu caja fuerte sale del ordenador."
        />
        <div className="row">
          <div className="small muted" style={{ maxWidth: 460 }}>
            {contarActualizacion(e)}
          </div>
          <div className="spacer" />
          {e.fase === 'lista' ? (
            <button className="btn primary small" onClick={() => setReiniciando(true)}>
              Reiniciar e instalar
            </button>
          ) : e.fase === 'disponible' ? (
            <button className="btn primary small" onClick={() => void run(() => api.actualizacion.descargar())}>
              Descargar
            </button>
          ) : (
            <button
              className="btn small"
              disabled={e.fase === 'buscando' || e.fase === 'descargando'}
              onClick={() => void run(() => api.actualizacion.buscar())}
            >
              Buscar ahora
            </button>
          )}
        </div>
      </div>
      {reiniciando && <ConfirmarReinicio version={e.version} alCerrar={() => setReiniciando(false)} />}
    </section>
  )
}

/**
 * Windows Hello. Encenderlo pide confirmar una vez, para no fiarse de algo que
 * no se ha visto funcionar. Apagarlo no pide nada: es quitar un atajo.
 */
function AjusteHello(): ReactNode {
  const { toast, fail } = useAvisos()
  const { ajustes, cambiarAjustes } = useStore()
  // undefined: todavía mirando; null: no se ha podido saber.
  const [disponible, setDisponible] = useState<string | null | undefined>(undefined)
  const [activando, setActivando] = useState(false)

  useEffect(() => {
    let vivo = true
    api.hello
      .disponible()
      .then((d) => vivo && setDisponible(d))
      .catch(() => vivo && setDisponible(null))
    return () => {
      vivo = false
    }
  }, [])

  const puede = disponible === 'Available'
  const pista =
    disponible === undefined
      ? 'Mirando si este equipo tiene Windows Hello…'
      : puede || ajustes.windowsHello
        ? 'Cuando CLAC se bloquee, vuelves a entrar con el PIN de Windows, la huella o la cara. Al abrir CLAC, y cada catorce días, sigue pidiendo la contraseña maestra.'
        : disponible === 'NotConfiguredForUser'
          ? 'Antes hay que configurarlo en Windows: Configuración ▸ Cuentas ▸ Opciones de inicio de sesión.'
          : 'Este equipo no puede usar Windows Hello ahora mismo.'

  return (
    <Checkbox
      checked={ajustes.windowsHello}
      disabled={!ajustes.windowsHello && (!puede || activando)}
      label={activando ? 'Confírmalo en Windows…' : 'Desbloquear con Windows Hello'}
      hint={pista}
      onChange={(v) => {
        if (!v) return void cambiarAjustes({ windowsHello: false })
        setActivando(true)
        api.hello
          .activar()
          .then(() => toast('Windows Hello, activado. Lo usarás la próxima vez que CLAC se bloquee.'))
          .catch((e: unknown) => {
            if (mensajeDeError(e) !== 'Cancelado.') fail(e)
          })
          .finally(() => setActivando(false))
      }}
    />
  )
}

export function VistaAjustes(): ReactNode {
  const { toast } = useAvisos()
  const { ajustes, cambiarAjustes, run, revision } = useStore()
  const [info, setInfo] = useState<InfoDatos | null>(null)
  const [version, setVersion] = useState('')
  const [modal, setModal] = useState<null | 'contrasena' | 'kit' | 'clave' | 'exportar' | 'importar'>(null)

  useEffect(() => {
    void api.datos.info().then(setInfo)
    void api.app.version().then(setVersion)
  }, [revision])

  return (
    <div className="content ajustes">
      <section className="card">
        <div className="card-header">
          <h2>Seguridad</h2>
        </div>
        <div className="card-body col" style={{ gap: 14 }}>
          <div className="ajuste-fila">
            <div>
              <strong>Bloquear tras un rato sin usar el ordenador</strong>
              <p className="small muted">Cuenta el teclado y el ratón de todo el equipo, no solo de esta ventana.</p>
            </div>
            <select
              className="select ajuste-select"
              value={ajustes.bloqueoMinutos}
              onChange={(e) => void cambiarAjustes({ bloqueoMinutos: Number(e.target.value) })}
              aria-label="Minutos hasta bloquear"
            >
              {MINUTOS.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? 'Nunca' : m === 1 ? '1 minuto' : m === 60 ? '1 hora' : `${m} minutos`}
                </option>
              ))}
            </select>
          </div>
          <Checkbox
            checked={ajustes.bloquearAlBloquearWindows}
            onChange={(v) => void cambiarAjustes({ bloquearAlBloquearWindows: v })}
            label="Bloquear al bloquear Windows (Win+L)"
          />
          <Checkbox
            checked={ajustes.bloquearAlSuspender}
            onChange={(v) => void cambiarAjustes({ bloquearAlSuspender: v })}
            label="Bloquear al suspender el equipo"
          />
          <AjusteHello />
          <div className="divider" />
          <div className="ajuste-fila">
            <div>
              <strong>Vaciar el portapapeles</strong>
              <p className="small muted">
                Lo copiado de la caja se borra al rato, si sigue ahí. Tampoco queda en el historial de Win+V.
              </p>
            </div>
            <select
              className="select ajuste-select"
              value={ajustes.portapapelesSegundos}
              onChange={(e) => void cambiarAjustes({ portapapelesSegundos: Number(e.target.value) })}
              aria-label="Segundos hasta vaciar el portapapeles"
            >
              {SEGUNDOS.map((s) => (
                <option key={s} value={s}>
                  {s === 0 ? 'Nunca' : s < 60 ? `A los ${s} segundos` : s === 60 ? 'Al minuto' : `A los ${s} segundos`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Acceso rápido</h2>
        </div>
        <div className="card-body col" style={{ gap: 12 }}>
          <Checkbox
            checked={ajustes.accesoRapido}
            onChange={(v) => void cambiarAjustes({ accesoRapido: v })}
            label={
              <>
                Abrir el buscador con <kbd>Ctrl</kbd> <kbd>Mayús</kbd> <kbd>Espacio</kbd> desde cualquier programa
              </>
            }
            hint="Busca, pulsa Intro y la contraseña queda copiada. Ctrl+C copia el usuario y Ctrl+Alt+C el código de un solo uso."
          />
          <Checkbox
            checked={ajustes.cerrarABandeja}
            onChange={(v) => void cambiarAjustes({ cerrarABandeja: v })}
            label="Al cerrar la ventana, seguir en la bandeja"
            hint="El acceso rápido y el bloqueo automático necesitan que CLAC siga en marcha."
          />
          <Checkbox
            checked={ajustes.arrancarConWindows}
            onChange={(v) => void cambiarAjustes({ arrancarConWindows: v })}
            label="Arrancar con Windows"
            hint="Se abre en la bandeja, bloqueada y sin ventana."
          />
        </div>
      </section>

      <TarjetaNavegador />

      <section className="card">
        <div className="card-header">
          <h2>Aspecto</h2>
        </div>
        <div className="card-body col" style={{ gap: 14 }}>
          <Field label="Tema">
            <Segmented<Tema>
              value={ajustes.theme}
              onChange={(theme) => void cambiarAjustes({ theme })}
              options={[
                { value: 'system', label: 'Como Windows' },
                { value: 'light', label: 'Claro' },
                { value: 'dark', label: 'Oscuro' }
              ]}
            />
          </Field>
          <Field label="Paleta" hint="Las mismas nueve que BONK: son de la casa.">
            <SelectorPaleta value={ajustes.palette} onChange={(palette) => void cambiarAjustes({ palette })} />
          </Field>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Contraseña maestra y clave secreta</h2>
        </div>
        <div className="card-body col" style={{ gap: 12 }}>
          <p className="small muted">
            La caja se abre con las dos a la vez. La contraseña la sabes tú; la clave secreta está guardada en este equipo, cifrada con tu cuenta de
            Windows, y en el kit de emergencia. Si pierdes las dos, nadie puede abrir la caja: tampoco CLAC.
          </p>
          <div className="row wrap">
            <button className="btn" onClick={() => setModal('contrasena')}>
              <KeyRound size={15} /> Cambiar la contraseña maestra
            </button>
            <button className="btn" onClick={() => setModal('kit')}>
              <Printer size={15} /> Guardar el kit de emergencia
            </button>
            <button className="btn ghost" onClick={() => setModal('clave')}>
              <Eye size={15} /> Ver la clave secreta
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Datos</h2>
        </div>
        <div className="card-body col" style={{ gap: 12 }}>
          {info && (
            <p className="small muted">
              {info.elementos} {info.elementos === 1 ? 'elemento' : 'elementos'} en {info.bovedas} {info.bovedas === 1 ? 'caja fuerte' : 'cajas fuertes'}.
              Se guardan en <span className="mono">{info.carpeta}</span>. Cada día se hace una copia, y se guardan las diez últimas
              {info.copias ? ` (ahora hay ${info.copias})` : ''}. {info.ultimaCopia ? `La última, ${haceCuanto(info.ultimaCopia)}.` : ''}
            </p>
          )}
          <div className="row wrap">
            <button className="btn" onClick={() => void run(() => api.datos.copiaAhora()).then((r) => r && toast('Copia hecha'))}>
              <HardDriveDownload size={15} /> Hacer una copia ahora
            </button>
            <button className="btn" onClick={() => void run(() => api.datos.guardarCopiaCifrada()).then((r) => r && toast('Copia cifrada guardada'))}>
              <Download size={15} /> Guardar una copia cifrada…
            </button>
            <button className="btn ghost" onClick={() => void run(() => api.datos.abrirCarpeta())}>
              <FolderOpen size={15} /> Abrir la carpeta
            </button>
          </div>
          <CopiaFuera fallo={info?.falloCopiaExtra ?? null} />
          <div className="divider" />
          <div className="row wrap">
            <button className="btn" onClick={() => setModal('importar')}>
              <FileUp size={15} /> Importar contraseñas…
            </button>
            <button className="btn" onClick={() => setModal('exportar')}>
              <FileDown size={15} /> Exportar sin cifrar…
            </button>
          </div>
        </div>
      </section>

      <AcercaDe version={version} />

      {modal === 'contrasena' && <CambiarContrasena alCerrar={() => setModal(null)} />}
      {modal === 'kit' && (
        <PedirContrasena
          titulo="Guardar el kit de emergencia"
          explicacion="El kit lleva tu clave secreta. Imprímelo y guárdalo donde guardarías una llave."
          boton="Guardar el PDF"
          alCerrar={() => setModal(null)}
          alConfirmar={async (pw) => {
            const ruta = await api.sesion.kit(pw)
            setModal(null)
            if (ruta) toast('Kit de emergencia guardado')
          }}
        />
      )}
      {modal === 'clave' && <VerClave alCerrar={() => setModal(null)} />}
      {modal === 'exportar' && <Exportar alCerrar={() => setModal(null)} />}
      {modal === 'importar' && <Importar alCerrar={() => setModal(null)} />}
    </div>
  )
}

/* ---------- Navegador ---------- */

/**
 * La extensión se carga a mano, en modo desarrollador: Opera no deja instalar
 * nada que no venga de su tienda si no. Por eso la tarjeta dice los pasos y
 * deja la carpeta a un clic, y abajo cuenta si la extensión ya ha llamado.
 */
function TarjetaNavegador(): ReactNode {
  const { toast } = useAvisos()
  const { ajustes, cambiarAjustes, run, revision } = useStore()
  const [info, setInfo] = useState<InfoNavegador | null>(null)

  useEffect(() => {
    let vivo = true
    // El alta en el registro tarda un instante: se pregunta un poco después.
    const t = window.setTimeout(() => void api.navegador.info().then((i) => vivo && setInfo(i)), 400)
    return () => {
      vivo = false
      window.clearTimeout(t)
    }
  }, [ajustes.navegador, revision])

  return (
    <section className="card">
      <div className="card-header">
        <h2>Navegador</h2>
        {info?.activo && (
          <span className={`pill ${info.ultimaConexion ? 'ok' : info.registrado ? 'acento' : 'aviso'}`}>
            {info.ultimaConexion ? 'Conectada' : info.registrado ? 'Esperando a la extensión' : 'Sin registrar'}
          </span>
        )}
      </div>
      <div className="card-body col" style={{ gap: 12 }}>
        <Checkbox
          checked={ajustes.navegador}
          onChange={(v) => void cambiarAjustes({ navegador: v })}
          label="Dejar que la extensión de CLAC rellene contraseñas en Opera, Chrome, Edge o Brave"
          hint="Apunta en el registro de Windows, solo para tu usuario, quién es CLAC para esa extensión y para ninguna otra. Apagarlo lo borra."
        />
        {ajustes.navegador && info && (
          <>
            <ol className="pasos-extension small">
              <li>
                En Opera Air, escribe <span className="mono">opera://extensions</span> en la barra de direcciones.
              </li>
              <li>
                Enciende el <strong>Modo desarrollador</strong>, arriba a la derecha.
              </li>
              <li>
                Pulsa el botón de cargar una extensión descomprimida (el primero de la barra que aparece) y elige esta carpeta:
                <div className="ruta-extension">
                  <span className="mono truncate" title={info.carpetaExtension}>
                    {info.carpetaExtension}
                  </span>
                  <button
                    className="btn small"
                    onClick={() => void run(() => api.copiar.texto(info.carpetaExtension)).then(() => toast('Ruta copiada'))}
                  >
                    Copiar
                  </button>
                  <button className="btn small ghost" onClick={() => void run(() => api.navegador.abrirCarpeta())}>
                    Abrir
                  </button>
                </div>
              </li>
              <li>
                Fija el icono del candado en la barra del navegador. Se abre también con <kbd>Ctrl</kbd> <kbd>Mayús</kbd> <kbd>X</kbd>.
              </li>
            </ol>
            <p className="small subtle">
              {info.ultimaConexion
                ? `La extensión habló con CLAC por última vez ${haceCuanto(info.ultimaConexion)}.`
                : 'La extensión todavía no ha hablado con CLAC desde que se abrió.'}{' '}
              Solo rellena cuando pulsas en ella, y avisa si la web no es la del elemento.
            </p>
          </>
        )}
      </div>
    </section>
  )
}

/* ---------- Cambiar la contraseña maestra ---------- */

function CambiarContrasena({ alCerrar }: { alCerrar: () => void }): ReactNode {
  const { toast } = useAvisos()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [ver, setVer] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const f = fortaleza(nueva)
  const vale = actual && nueva.trim().length >= 10 && f.nivel >= 2 && nueva === repetida

  const cambiar = async (): Promise<void> => {
    if (!vale || ocupado) return
    setOcupado(true)
    setError(null)
    try {
      await api.sesion.cambiarContrasena(actual, nueva)
      toast('Contraseña maestra cambiada. La clave secreta y el kit siguen valiendo.')
      alCerrar()
    } catch (e) {
      setError(mensajeDeError(e))
      setOcupado(false)
    }
  }

  return (
    <Modal
      title="Cambiar la contraseña maestra"
      onClose={alCerrar}
      footer={
        <>
          <button className="btn ghost" onClick={() => setVer(!ver)}>
            {ver ? <EyeOff size={15} /> : <Eye size={15} />} {ver ? 'Ocultar' : 'Mostrar'}
          </button>
          <span className="spacer" />
          <button className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button className="btn primary" disabled={!vale || ocupado} onClick={() => void cambiar()}>
            {ocupado ? 'Cambiando…' : 'Cambiar'}
          </button>
        </>
      }
    >
      <Field label="Contraseña actual" error={error} htmlFor="cc-actual">
        <input id="cc-actual" className="input" type={ver ? 'text' : 'password'} value={actual} autoFocus onChange={(e) => setActual(e.target.value)} />
      </Field>
      <Field label="Contraseña nueva" htmlFor="cc-nueva" hint={nueva ? undefined : 'Al menos 10 caracteres'}>
        <input id="cc-nueva" className="input" type={ver ? 'text' : 'password'} value={nueva} onChange={(e) => setNueva(e.target.value)} />
      </Field>
      {nueva && <Medidor fortaleza={f} />}
      <Field label="Repítela" error={repetida && repetida !== nueva ? 'No coincide.' : null} htmlFor="cc-repetida">
        <input
          id="cc-repetida"
          className="input"
          type={ver ? 'text' : 'password'}
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void cambiar()}
        />
      </Field>
    </Modal>
  )
}

/* ---------- Ver la clave secreta ---------- */

function VerClave({ alCerrar }: { alCerrar: () => void }): ReactNode {
  const [clave, setClave] = useState<string | null>(null)
  if (!clave) {
    return (
      <PedirContrasena
        titulo="Ver la clave secreta"
        explicacion="Con ella y tu contraseña se abre la caja en cualquier ordenador. No la enseñes."
        boton="Ver"
        alCerrar={alCerrar}
        alConfirmar={async (pw) => setClave(await api.sesion.claveSecreta(pw))}
      />
    )
  }
  return (
    <Modal title="Tu clave secreta" onClose={alCerrar}>
      <div className="clave-grande mono">{clave}</div>
      <p className="small muted">
        Sin 0, 1, I, O ni U: lo que parezca uno de esos es un 2, una Z, una J, una Q o una V. Los guiones no cuentan.
      </p>
    </Modal>
  )
}

/* ---------- Exportar ---------- */

function Exportar({ alCerrar }: { alCerrar: () => void }): ReactNode {
  const { toast } = useAvisos()
  const [formato, setFormato] = useState<'json' | 'csv' | null>(null)
  if (formato) {
    return (
      <PedirContrasena
        titulo="Exportar sin cifrar"
        peligro
        explicacion="El archivo tendrá todas tus contraseñas a la vista. Guárdalo solo el tiempo que te haga falta y bórralo después."
        boton="Exportar"
        alCerrar={alCerrar}
        alConfirmar={async (pw) => {
          const ruta = await api.datos.exportar(formato, pw)
          alCerrar()
          if (ruta) toast('Exportado. Recuerda borrarlo cuando termines.')
        }}
      />
    )
  }
  return (
    <Modal title="Exportar sin cifrar" onClose={alCerrar}>
      <div className="aviso-fuerte">
        <TriangleAlert size={18} />
        <span>
          Esto saca tus contraseñas de la caja fuerte, sin cifrar. Para una copia de seguridad, usa mejor «Guardar una copia cifrada».
        </span>
      </div>
      <button className="opcion-grande" onClick={() => setFormato('json')}>
        <strong>Todo, en JSON de CLAC</strong>
        <span className="small muted">Cada campo, sección, etiqueta y nota. Se vuelve a importar aquí sin perder nada.</span>
      </button>
      <button className="opcion-grande" onClick={() => setFormato('csv')}>
        <strong>Inicios de sesión, en CSV</strong>
        <span className="small muted">Con el formato de Bitwarden, que entienden casi todos los gestores. Lo demás va como notas.</span>
      </button>
    </Modal>
  )
}

/* ---------- Importar ---------- */

function Importar({ alCerrar }: { alCerrar: () => void }): ReactNode {
  const { toast } = useAvisos()
  const { bovedas } = useStore()
  const [vista, setVista] = useState<VistaImportacion | null>(null)
  const [destino, setDestino] = useState(bovedas[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const elegir = async (): Promise<void> => {
    setError(null)
    try {
      const v = await api.importar.elegir()
      if (v) setVista(v)
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  const importar = async (): Promise<void> => {
    setOcupado(true)
    try {
      const r = await api.importar.confirmar(destino)
      toast(
        r.repetidos
          ? `Importados ${r.nuevos}. ${r.repetidos} ya estaban y no se han duplicado.`
          : `Importados ${r.nuevos} ${r.nuevos === 1 ? 'elemento' : 'elementos'}.`
      )
      alCerrar()
    } catch (e) {
      setError(mensajeDeError(e))
      setOcupado(false)
    }
  }

  const cerrar = (): void => {
    void api.importar.cancelar()
    alCerrar()
  }

  const nuevos = vista ? vista.total - vista.repetidos : 0

  return (
    <Modal
      title="Importar contraseñas"
      onClose={cerrar}
      wide
      footer={
        <>
          <span className="spacer" />
          <button className="btn" onClick={cerrar}>
            Cancelar
          </button>
          {vista && (
            <button className="btn primary" disabled={ocupado || nuevos === 0} onClick={() => void importar()}>
              {ocupado ? 'Importando…' : `Importar ${nuevos}`}
            </button>
          )}
        </>
      }
    >
      {!vista && (
        <>
          <p className="small muted">
            Exporta tus contraseñas desde donde estén y elige aquí el archivo. Se reconoce solo de dónde viene.
          </p>
          <ul className="lista-origenes small">
            <li>
              <strong>Opera, Chrome, Edge o Brave</strong>: Configuración ▸ Contraseñas ▸ Exportar contraseñas (CSV).
            </li>
            <li>
              <strong>Firefox</strong>: Contraseñas ▸ menú ⋯ ▸ Exportar contraseñas (CSV).
            </li>
            <li>
              <strong>1Password</strong>: Archivo ▸ Exportar, en formato .1pux (trae también los documentos) o CSV.
            </li>
            <li>
              <strong>Bitwarden</strong>: Herramientas ▸ Exportar caja fuerte, en JSON sin cifrar o CSV.
            </li>
            <li>
              <strong>KeePassXC y LastPass</strong>: su exportación en CSV.
            </li>
          </ul>
          {error && <p className="field-error">{error}</p>}
          <button className="btn primary" onClick={() => void elegir()}>
            <FileUp size={15} /> Elegir el archivo…
          </button>
        </>
      )}
      {vista && (
        <>
          <p>
            <strong>{vista.archivo}</strong> <span className="muted">· {vista.nombreFormato}</span>
          </p>
          <div className="row wrap">
            {Object.entries(vista.porCategoria).map(([cat, n]) => (
              <span key={cat} className="pill">
                {CATEGORIAS.find((c) => c.id === cat)?.plural}: {n}
              </span>
            ))}
          </div>
          {vista.repetidos > 0 && (
            <p className="small muted">
              {vista.repetidos} {vista.repetidos === 1 ? 'ya está' : 'ya están'} en la caja fuerte y no se {vista.repetidos === 1 ? 'duplicará' : 'duplicarán'}.
            </p>
          )}
          {vista.avisos.map((a) => (
            <div key={a} className="aviso-fuerte suave">
              <TriangleAlert size={16} />
              <span className="small">{a}</span>
            </div>
          ))}
          <div className="muestra-importacion">
            {vista.muestra.map((m, i) => (
              <div key={i} className="small">
                <strong>{m.titulo}</strong> <span className="muted">{m.subtitulo}</span>
              </div>
            ))}
            {vista.total > vista.muestra.length && <div className="small subtle">y {vista.total - vista.muestra.length} más…</div>}
          </div>
          {bovedas.length > 1 && (
            <Field label="Meterlos en" htmlFor="imp-destino">
              <select id="imp-destino" className="select" value={destino} onChange={(e) => setDestino(e.target.value)}>
                {bovedas.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="aviso-fuerte suave">
            <Lock size={16} />
            <span className="small">
              Cuando termines, borra el archivo exportado: tiene las contraseñas sin cifrar. Si venían del navegador, puedes borrarlas también de allí.
            </span>
          </div>
          {error && <p className="field-error">{error}</p>}
        </>
      )}
    </Modal>
  )
}
