/**
 * La primera vez: crear la caja fuerte, o traerse una copia de otro equipo.
 *
 * Tres pasos, y el del medio es el que importa: la contraseña maestra es lo
 * único que no se puede recuperar. Por eso se ofrece una memorable generada, se
 * mide lo que se escribe y no se deja pasar nada de menos de diez caracteres.
 * El tercero enseña la clave secreta y no deja seguir sin haber guardado el kit.
 */
import { useState, type ReactNode } from 'react'
import { ArrowRight, Download, Eye, EyeOff, FolderOpen, ShieldCheck, Sparkles } from 'lucide-react'
import { Checkbox, Field, useAvisos, mensajeDeError } from 'casa/ui'
import { fortaleza } from '@shared/fortaleza'
import { generar, OPCIONES_POR_DEFECTO } from '@shared/generador'
import { leerClave } from '@shared/claveSecreta'
import { api } from '../lib/store'
import { Medidor } from '../components/piezas'
import marca from '../../../../resources/icon.png'

type Paso = 'inicio' | 'contrasena' | 'clave' | 'restaurar'

export function Bienvenida({ alTerminar }: { alTerminar: () => void }): ReactNode {
  const [paso, setPaso] = useState<Paso>('inicio')
  const [clave, setClave] = useState('')
  const [contrasena, setContrasena] = useState('')

  return (
    <div className="puerta">
      <div className="puerta-caja ancha">
        <img src={marca} alt="" className="puerta-marca" width={64} height={64} />
        {paso === 'inicio' && <Inicio alCrear={() => setPaso('contrasena')} alRestaurar={() => setPaso('restaurar')} />}
        {paso === 'contrasena' && (
          <PasoContrasena
            alVolver={() => setPaso('inicio')}
            alCrear={(pw, c) => {
              setContrasena(pw)
              setClave(c)
              setPaso('clave')
            }}
          />
        )}
        {paso === 'clave' && <PasoClave clave={clave} contrasena={contrasena} alTerminar={alTerminar} />}
        {paso === 'restaurar' && <PasoRestaurar alVolver={() => setPaso('inicio')} alTerminar={alTerminar} />}
      </div>
    </div>
  )
}

function Pasos({ actual }: { actual: 1 | 2 }): ReactNode {
  return (
    <ol className="pasos" aria-label="Pasos">
      <li className={actual === 1 ? 'activo' : 'hecho'}>Contraseña maestra</li>
      <li className={actual === 2 ? 'activo' : undefined}>Clave secreta</li>
    </ol>
  )
}

function Inicio({ alCrear, alRestaurar }: { alCrear: () => void; alRestaurar: () => void }): ReactNode {
  return (
    <>
      <h1>CLAC</h1>
      <p className="puerta-sub">Tus contraseñas, en tu ordenador y en ningún otro sitio.</p>
      <ul className="puerta-lista">
        <li>
          <ShieldCheck size={16} /> Todo se cifra aquí, con una contraseña que solo sabes tú y una clave secreta que se
          queda en este equipo.
        </li>
        <li>
          <ShieldCheck size={16} /> Sin cuenta y sin nube. A internet sale solo para mirar si hay versión nueva y,
          si lo pides, comprobar filtraciones.
        </li>
      </ul>
      <button className="btn primary puerta-boton" onClick={alCrear}>
        Crear mi caja fuerte <ArrowRight size={16} />
      </button>
      <button className="link puerta-olvido" onClick={alRestaurar}>
        Ya tengo una: restaurar una copia
      </button>
    </>
  )
}

function PasoContrasena({
  alVolver,
  alCrear
}: {
  alVolver: () => void
  alCrear: (contrasena: string, clave: string) => void
}): ReactNode {
  const [pw, setPw] = useState('')
  const [repetida, setRepetida] = useState('')
  const [ver, setVer] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const f = fortaleza(pw)
  const corta = pw.trim().length < 10
  const distintas = repetida !== '' && repetida !== pw
  const vale = !corta && f.nivel >= 2 && repetida === pw

  const sugerir = (): void => {
    const s = generar({ ...OPCIONES_POR_DEFECTO, tipo: 'memorable', palabras: 5, separador: 'guion', mayusculas: true, conTildes: false })
    setPw(s.valor)
    setRepetida('')
    setVer(true)
  }

  const crear = async (): Promise<void> => {
    if (!vale || ocupado) return
    setOcupado(true)
    setError(null)
    try {
      const clave = await api.sesion.crear(pw)
      alCrear(pw, clave)
    } catch (e) {
      setError(mensajeDeError(e))
      setOcupado(false)
    }
  }

  return (
    <>
      <Pasos actual={1} />
      <h2>Elige la contraseña maestra</h2>
      <p className="puerta-sub">
        Es la única que tendrás que recordar, y no se puede recuperar si la olvidas. Una frase de cuatro o cinco palabras
        que no tengan que ver entre sí es fácil de recordar y muy difícil de adivinar.
      </p>

      <Field label="Contraseña maestra" htmlFor="nueva-pw">
        <div className="puerta-campo">
          <input
            id="nueva-pw"
            className="input puerta-input"
            type={ver ? 'text' : 'password'}
            value={pw}
            autoFocus
            autoComplete="new-password"
            onChange={(e) => setPw(e.target.value)}
          />
          <button type="button" className="btn ghost icon puerta-ojo" onClick={() => setVer(!ver)} aria-label={ver ? 'Ocultar' : 'Mostrar'}>
            {ver ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </Field>
      <div className="row">
        {pw ? <Medidor fortaleza={f} /> : <span className="small subtle">Al menos 10 caracteres</span>}
        <span className="spacer" />
        <button type="button" className="btn small contorno" onClick={sugerir}>
          <Sparkles size={14} /> Sugiéreme una
        </button>
      </div>
      {pw && corta && <p className="field-error">Le faltan {10 - pw.trim().length} caracteres para llegar a 10.</p>}
      {pw && !corta && f.nivel < 2 && (
        <p className="field-error">Es demasiado fácil de adivinar. Prueba con varias palabras sueltas, o pulsa «Sugiéreme una».</p>
      )}

      <Field label="Repítela" error={distintas ? 'No coincide con la de arriba.' : error} htmlFor="nueva-pw-2">
        <input
          id="nueva-pw-2"
          className={`input puerta-input${distintas ? ' invalid' : ''}`}
          type={ver ? 'text' : 'password'}
          value={repetida}
          autoComplete="new-password"
          onChange={(e) => setRepetida(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void crear()}
        />
      </Field>

      <div className="row puerta-botones">
        <button className="btn ghost" onClick={alVolver} disabled={ocupado}>
          Volver
        </button>
        <span className="spacer" />
        <button className="btn primary" disabled={!vale || ocupado} onClick={() => void crear()}>
          {ocupado ? 'Creando la caja fuerte…' : 'Crear la caja fuerte'}
        </button>
      </div>
    </>
  )
}

function PasoClave({ clave, contrasena, alTerminar }: { clave: string; contrasena: string; alTerminar: () => void }): ReactNode {
  const { toast, fail } = useAvisos()
  const [guardado, setGuardado] = useState(false)
  const [marcado, setMarcado] = useState(false)

  const guardarKit = async (): Promise<void> => {
    try {
      const ruta = await api.sesion.kit(contrasena)
      if (ruta) {
        setGuardado(true)
        setMarcado(true)
        toast('Kit de emergencia guardado. Imprímelo y guárdalo en un sitio seguro.')
      }
    } catch (e) {
      fail(e)
    }
  }

  return (
    <>
      <Pasos actual={2} />
      <h2>Esta es tu clave secreta</h2>
      <p className="puerta-sub">
        Se guarda cifrada en este equipo y no tendrás que escribirla aquí. Pero si cambias de ordenador, sin ella no podrás
        abrir tus copias. Guárdala en el kit de emergencia.
      </p>
      <div className="clave-grande mono">{clave}</div>
      <button className="btn primary puerta-boton" onClick={() => void guardarKit()}>
        <Download size={16} /> {guardado ? 'Guardar otra copia del kit' : 'Guardar el kit de emergencia (PDF)'}
      </button>
      <Checkbox
        checked={marcado}
        onChange={setMarcado}
        label="He guardado el kit de emergencia"
        hint="Puedes volver a sacarlo cuando quieras desde Ajustes."
      />
      <div className="row puerta-botones">
        <span className="spacer" />
        <button className="btn primary" disabled={!marcado} onClick={alTerminar}>
          Abrir mi caja fuerte <ArrowRight size={16} />
        </button>
      </div>
    </>
  )
}

function PasoRestaurar({ alVolver, alTerminar }: { alVolver: () => void; alTerminar: () => void }): ReactNode {
  const { fail } = useAvisos()
  const [copia, setCopia] = useState<{ ruta: string; nombre: string; idCuenta: string } | null>(null)
  const [clave, setClave] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const leida = clave ? leerClave(clave) : null
  const errorClave = leida && 'error' in leida && clave.replace(/[\s-]/g, '').length >= 34 ? leida.error : null

  const elegir = async (): Promise<void> => {
    try {
      const c = await api.sesion.restaurarElegir()
      if (c) setCopia(c)
    } catch (e) {
      fail(e)
    }
  }

  const restaurar = async (): Promise<void> => {
    if (!copia || !pw || !clave || ocupado) return
    setOcupado(true)
    setError(null)
    try {
      await api.sesion.restaurar(copia.ruta, pw, clave)
      alTerminar()
    } catch (e) {
      setError(mensajeDeError(e))
      setOcupado(false)
    }
  }

  return (
    <>
      <h2>Restaurar una copia</h2>
      <p className="puerta-sub">
        Elige la copia de tu caja fuerte —el archivo <span className="mono">clac.db</span> de tu otro equipo o una de sus
        copias— y ábrela con tu contraseña y la clave secreta del kit de emergencia.
      </p>
      <button className="btn contorno puerta-boton" onClick={() => void elegir()}>
        <FolderOpen size={16} /> {copia ? copia.nombre : 'Elegir el archivo…'}
      </button>
      {copia && (
        <>
          <p className="small muted">
            Es una caja fuerte de la cuenta <strong className="mono">{copia.idCuenta}</strong>: su clave secreta empieza por{' '}
            <span className="mono">C1-{copia.idCuenta}</span>.
          </p>
          <Field label="Clave secreta" error={errorClave} htmlFor="restaurar-clave">
            <input
              id="restaurar-clave"
              className="input mono puerta-input"
              value={clave}
              spellCheck={false}
              autoComplete="off"
              placeholder={`C1-${copia.idCuenta}-…`}
              onChange={(e) => setClave(e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="Contraseña maestra" error={error} htmlFor="restaurar-pw">
            <input
              id="restaurar-pw"
              className={`input puerta-input${error ? ' invalid' : ''}`}
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void restaurar()}
            />
          </Field>
        </>
      )}
      <div className="row puerta-botones">
        <button className="btn ghost" onClick={alVolver} disabled={ocupado}>
          Volver
        </button>
        <span className="spacer" />
        <button className="btn primary" disabled={!copia || !pw || !clave || ocupado} onClick={() => void restaurar()}>
          {ocupado ? 'Comprobando…' : 'Restaurar y abrir'}
        </button>
      </div>
    </>
  )
}
