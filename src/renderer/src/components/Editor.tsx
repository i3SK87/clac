/**
 * La ficha de un elemento, en modo edición. Sirve para crear y para editar.
 *
 * Los campos de la plantilla vienen puestos, pero todo se puede cambiar: el
 * rótulo de cada campo, quitar los que sobran, añadir otros de cualquier tipo y
 * abrir secciones con título propio. Junto a cada contraseña, el generador; en
 * las claves SSH, un botón para generar una nueva.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Eye, EyeOff, KeyRound, Plus, Trash2, WandSparkles, X } from 'lucide-react'
import { Confirm, useAvisos } from 'casa/ui'
import { categoria, nuevoId, seccionesDePlantilla } from '@shared/categorias'
import { fortaleza } from '@shared/fortaleza'
import { leerTotp } from '@shared/totp'
import { finDeValidez } from '@shared/fechas'
import type { Campo, CategoriaId, Elemento, ElementoEntrada, Seccion, TipoCampo } from '@shared/tipos'
import { api, useStore } from '../lib/store'
import { Avatar, CodigoTotp, Medidor, MenuDesplegable } from './piezas'
import { PanelGenerador } from './PanelGenerador'

const TIPOS: Array<{ tipo: TipoCampo; nombre: string }> = [
  { tipo: 'texto', nombre: 'Texto' },
  { tipo: 'oculto', nombre: 'Contraseña u oculto' },
  { tipo: 'totp', nombre: 'Código de un solo uso' },
  { tipo: 'correo', nombre: 'Correo' },
  { tipo: 'url', nombre: 'Dirección web' },
  { tipo: 'telefono', nombre: 'Teléfono' },
  { tipo: 'fecha', nombre: 'Fecha' },
  { tipo: 'mesAnio', nombre: 'Mes y año' },
  { tipo: 'multilinea', nombre: 'Texto largo' },
  { tipo: 'ocultoMultilinea', nombre: 'Texto largo oculto' }
]

const ETIQUETA_TIPO: Record<TipoCampo, string> = {
  texto: 'Texto',
  oculto: 'Contraseña',
  totp: 'Código de un solo uso',
  correo: 'Correo',
  url: 'Dirección web',
  telefono: 'Teléfono',
  fecha: 'Fecha',
  mesAnio: 'Mes y año',
  multilinea: 'Nota',
  ocultoMultilinea: 'Texto oculto'
}

/** Pasa lo importado («12/27») al formato de los controles de fecha, si se entiende. */
function normalizarFechas(secciones: Seccion[]): Seccion[] {
  return secciones.map((s) => ({
    ...s,
    campos: s.campos.map((c) => {
      if ((c.tipo !== 'fecha' && c.tipo !== 'mesAnio') || !c.valor) return c
      const d = finDeValidez(c.valor)
      if (!d) return c
      const m = String(d.getMonth() + 1).padStart(2, '0')
      return {
        ...c,
        valor: c.tipo === 'mesAnio' ? `${d.getFullYear()}-${m}` : `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, '0')}`
      }
    })
  }))
}

export function Editor({
  elemento,
  nuevo,
  bovedaInicial,
  alTerminar,
  alCancelar
}: {
  elemento: Elemento | null
  nuevo: CategoriaId | null
  bovedaInicial: string
  alTerminar: (id: string) => void
  alCancelar: () => void
}): ReactNode {
  const { toast } = useAvisos()
  const { bovedas, elementos, run } = useStore()
  const inicial = useMemo<ElementoEntrada>(
    () =>
      elemento
        ? {
            id: elemento.id,
            bovedaId: elemento.bovedaId,
            categoria: elemento.categoria,
            titulo: elemento.titulo,
            webs: elemento.webs.length ? elemento.webs : categoria(elemento.categoria).webs ? [''] : [],
            etiquetas: elemento.etiquetas,
            favorito: elemento.favorito,
            secciones: normalizarFechas(elemento.secciones.length ? elemento.secciones : [{ id: nuevoId(), titulo: '', campos: [] }]),
            notas: elemento.notas
          }
        : {
            bovedaId: bovedaInicial,
            categoria: nuevo ?? 'login',
            titulo: '',
            webs: categoria(nuevo ?? 'login').webs ? [''] : [],
            etiquetas: [],
            favorito: false,
            secciones: seccionesDePlantilla(nuevo ?? 'login'),
            notas: ''
          },
    [elemento, nuevo, bovedaInicial]
  )
  const [b, setB] = useState<ElementoEntrada>(inicial)
  const [guardando, setGuardando] = useState(false)
  const [descartar, setDescartar] = useState(false)
  const [etiquetaNueva, setEtiquetaNueva] = useState('')
  const titulo = useRef<HTMLInputElement>(null)
  const sucio = JSON.stringify(b) !== JSON.stringify(inicial)
  const cat = categoria(b.categoria)

  useEffect(() => titulo.current?.focus(), [])

  const todasLasEtiquetas = useMemo(
    () => [...new Set(elementos.flatMap((e) => e.etiquetas))].filter((t) => !b.etiquetas.includes(t)).sort((x, y) => x.localeCompare(y, 'es')),
    [elementos, b.etiquetas]
  )

  const cambiarCampo = (sid: string, cid: string, cambios: Partial<Campo>): void =>
    setB((x) => ({
      ...x,
      secciones: x.secciones.map((s) => (s.id !== sid ? s : { ...s, campos: s.campos.map((c) => (c.id === cid ? { ...c, ...cambios } : c)) }))
    }))

  const quitarCampo = (sid: string, cid: string): void =>
    setB((x) => ({ ...x, secciones: x.secciones.map((s) => (s.id !== sid ? s : { ...s, campos: s.campos.filter((c) => c.id !== cid) })) }))

  const anadirCampo = (tipo: TipoCampo, sid?: string): void =>
    setB((x) => {
      const destino = sid ?? x.secciones[x.secciones.length - 1].id
      return {
        ...x,
        secciones: x.secciones.map((s) =>
          s.id !== destino ? s : { ...s, campos: [...s.campos, { id: nuevoId(), etiqueta: ETIQUETA_TIPO[tipo], tipo, valor: '' }] }
        )
      }
    })

  const guardar = async (): Promise<void> => {
    if (guardando) return
    setGuardando(true)
    const hecho = await run(() => api.elementos.guardar({ ...b, webs: b.webs.filter((w) => w.trim()) }))
    setGuardando(false)
    if (hecho) {
      toast(elemento ? 'Guardado' : `«${hecho.titulo}» creado`)
      alTerminar(hecho.id)
    }
  }

  const cancelar = (): void => (sucio ? setDescartar(true) : alCancelar())

  // Ctrl+S guarda y Escape cancela, salvo que haya un cuadro encima.
  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      if (document.querySelector('.overlay')) return
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void guardar()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancelar()
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  const generarSsh = async (): Promise<void> => {
    const par = await run(() => api.ssh.generar(b.titulo.trim() || 'clac'))
    if (!par) return
    setB((x) => ({
      ...x,
      secciones: x.secciones.map((s, i) =>
        i !== 0
          ? s
          : {
              ...s,
              campos: s.campos.map((c) =>
                c.clave === 'privada' ? { ...c, valor: par.privada } : c.clave === 'publica' ? { ...c, valor: par.publica } : c.clave === 'huella' ? { ...c, valor: par.huella } : c.clave === 'tipo' ? { ...c, valor: par.tipo } : c
              )
            }
      )
    }))
    toast('Clave Ed25519 generada. La pública es la que se copia al servidor.')
  }

  return (
    <div className="detalle editor">
      <div className="detalle-cabecera">
        <Avatar titulo={b.titulo} categoria={b.categoria} webs={b.webs} tamano={52} />
        <div className="detalle-titulos">
          <input
            ref={titulo}
            className="input editor-titulo"
            value={b.titulo}
            placeholder={cat.nombre}
            aria-label="Título"
            onChange={(e) => setB({ ...b, titulo: e.target.value })}
          />
          <div className="detalle-meta">
            <span className="small muted">{cat.nombre}</span>
            <span className="small subtle">en</span>
            <select
              className="select mini"
              value={b.bovedaId}
              onChange={(e) => setB({ ...b, bovedaId: e.target.value })}
              aria-label="Caja fuerte"
            >
              {bovedas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="detalle-botones">
          <button className="btn" onClick={cancelar} disabled={guardando}>
            Cancelar
          </button>
          <button className="btn primary" onClick={() => void guardar()} disabled={guardando} title="Guardar (Ctrl+S)">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      <div className="detalle-cuerpo">
        {b.categoria === 'ssh' && (
          <button className="btn contorno small" onClick={() => void generarSsh()}>
            <KeyRound size={14} /> Generar una clave nueva
          </button>
        )}

        {b.secciones.map((s, i) => (
          <section key={s.id} className="card detalle-seccion">
            {i > 0 && (
              <div className="editor-seccion-cabecera">
                <input
                  className="input editor-seccion-titulo"
                  value={s.titulo}
                  placeholder="Título de la sección"
                  aria-label="Título de la sección"
                  onChange={(e) => setB({ ...b, secciones: b.secciones.map((x) => (x.id === s.id ? { ...x, titulo: e.target.value } : x)) })}
                />
                <button
                  className="btn ghost icon small"
                  title="Quitar la sección"
                  aria-label="Quitar la sección"
                  onClick={() => setB({ ...b, secciones: b.secciones.filter((x) => x.id !== s.id) })}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}
            {s.campos.map((c) => (
              <CampoEditor key={c.id} campo={c} alCambiar={(cambios) => cambiarCampo(s.id, c.id, cambios)} alQuitar={() => quitarCampo(s.id, c.id)} />
            ))}
            <div className="fila-anadir">
              <MenuDesplegable
                titulo="Añadir un campo"
                clase="btn ghost small"
                boton={
                  <>
                    <Plus size={15} /> Añadir un campo
                  </>
                }
                opciones={TIPOS.map((t) => ({ etiqueta: t.nombre, alPulsar: () => anadirCampo(t.tipo, s.id) }))}
              />
            </div>
          </section>
        ))}

        <button
          className="btn small contorno anadir-archivo"
          onClick={() => setB({ ...b, secciones: [...b.secciones, { id: nuevoId(), titulo: '', campos: [{ id: nuevoId(), etiqueta: 'Texto', tipo: 'texto', valor: '' }] }] })}
        >
          <Plus size={14} /> Añadir una sección
        </button>

        {(cat.webs || b.webs.length > 0) && (
          <section className="card detalle-seccion">
            <div className="detalle-seccion-titulo">Webs</div>
            {b.webs.map((w, i) => (
              <div key={i} className="editor-fila">
                <input
                  className="input"
                  value={w}
                  placeholder="ejemplo.es"
                  aria-label="Dirección web"
                  spellCheck={false}
                  onChange={(e) => setB({ ...b, webs: b.webs.map((x, j) => (j === i ? e.target.value : x)) })}
                />
                <button
                  className="btn ghost icon small"
                  title="Quitar"
                  aria-label="Quitar la web"
                  onClick={() => setB({ ...b, webs: b.webs.filter((_, j) => j !== i) })}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            <button className="link small" onClick={() => setB({ ...b, webs: [...b.webs, ''] })}>
              + Añadir otra web
            </button>
          </section>
        )}

        <section className="card detalle-seccion">
          <div className="detalle-seccion-titulo">Notas</div>
          <textarea
            className="textarea"
            value={b.notas}
            rows={b.categoria === 'nota' ? 12 : 4}
            placeholder={b.categoria === 'nota' ? 'Escribe aquí la nota' : 'Lo que quieras apuntar'}
            aria-label="Notas"
            onChange={(e) => setB({ ...b, notas: e.target.value })}
          />
        </section>

        <section className="card detalle-seccion">
          <div className="detalle-seccion-titulo">Etiquetas</div>
          <div className="row wrap">
            {b.etiquetas.map((t) => (
              <span key={t} className="pill">
                {t}
                <button className="pill-quitar" aria-label={`Quitar ${t}`} onClick={() => setB({ ...b, etiquetas: b.etiquetas.filter((x) => x !== t) })}>
                  <X size={11} />
                </button>
              </span>
            ))}
            <input
              className="input editor-etiqueta"
              list="etiquetas-existentes"
              value={etiquetaNueva}
              placeholder="Añadir etiqueta"
              aria-label="Añadir etiqueta"
              onChange={(e) => setEtiquetaNueva(e.target.value)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ',') && etiquetaNueva.trim()) {
                  e.preventDefault()
                  const t = etiquetaNueva.trim()
                  if (!b.etiquetas.includes(t)) setB({ ...b, etiquetas: [...b.etiquetas, t] })
                  setEtiquetaNueva('')
                }
              }}
            />
            <datalist id="etiquetas-existentes">
              {todasLasEtiquetas.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        </section>

        {!elemento && <p className="small subtle">Los archivos se pueden adjuntar en cuanto lo guardes.</p>}
      </div>

      {descartar && (
        <Confirm
          title="Descartar los cambios"
          message="Lo que has cambiado no se ha guardado y se perderá."
          confirmLabel="Descartar"
          destructive
          onCancel={() => setDescartar(false)}
          onConfirm={() => {
            setDescartar(false)
            alCancelar()
          }}
        />
      )}
    </div>
  )
}

/* ---------- Un campo en edición ---------- */

function CampoEditor({
  campo,
  alCambiar,
  alQuitar
}: {
  campo: Campo
  alCambiar: (cambios: Partial<Campo>) => void
  alQuitar: () => void
}): ReactNode {
  const [ver, setVer] = useState(campo.valor === '')
  const [generando, setGenerando] = useState(false)
  const oculto = campo.tipo === 'oculto'
  const esFecha = campo.tipo === 'fecha' && (/^\d{4}-\d{2}-\d{2}$/.test(campo.valor) || campo.valor === '')
  const esMes = campo.tipo === 'mesAnio' && (/^\d{4}-\d{2}$/.test(campo.valor) || campo.valor === '')

  let control: ReactNode
  if (campo.tipo === 'multilinea' || campo.tipo === 'ocultoMultilinea') {
    control = (
      <textarea
        className={`textarea${campo.tipo === 'ocultoMultilinea' ? ' mono' : ''}`}
        value={campo.valor}
        rows={campo.tipo === 'ocultoMultilinea' ? 5 : 3}
        spellCheck={false}
        aria-label={campo.etiqueta}
        onChange={(e) => alCambiar({ valor: e.target.value })}
      />
    )
  } else {
    const tipoInput = oculto && !ver ? 'password' : esFecha ? 'date' : esMes ? 'month' : campo.tipo === 'correo' ? 'email' : campo.tipo === 'telefono' ? 'tel' : 'text'
    control = (
      <input
        className={`input${oculto ? ' mono' : ''}`}
        type={tipoInput}
        value={campo.valor}
        spellCheck={false}
        autoComplete="off"
        aria-label={campo.etiqueta}
        placeholder={campo.tipo === 'totp' ? 'otpauth://… o el secreto que da la web' : campo.tipo === 'url' ? 'ejemplo.es' : undefined}
        onChange={(e) => alCambiar({ valor: e.target.value })}
      />
    )
  }

  return (
    <div className="campo-editor">
      <input
        className="campo-editor-etiqueta"
        value={campo.etiqueta}
        aria-label="Nombre del campo"
        onChange={(e) => alCambiar({ etiqueta: e.target.value })}
      />
      <div className="editor-fila">
        {control}
        {oculto && (
          <>
            <button type="button" className="btn ghost icon small" onClick={() => setVer(!ver)} title={ver ? 'Ocultar' : 'Mostrar'} aria-label={ver ? 'Ocultar' : 'Mostrar'}>
              {ver ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            <button
              type="button"
              className={`btn ghost icon small${generando ? ' activo' : ''}`}
              onClick={() => setGenerando(!generando)}
              title="Generar una contraseña"
              aria-label="Generar una contraseña"
              aria-expanded={generando}
            >
              <WandSparkles size={15} />
            </button>
          </>
        )}
        <button type="button" className="btn ghost icon small" onClick={alQuitar} title="Quitar el campo" aria-label="Quitar el campo">
          <Trash2 size={15} />
        </button>
      </div>
      {oculto && campo.clave === 'contrasena' && campo.valor && !generando && <Medidor fortaleza={fortaleza(campo.valor)} />}
      {campo.tipo === 'totp' && campo.valor && (leerTotp(campo.valor) ? <CodigoTotp secreto={campo.valor} /> : <span className="field-error">No se entiende: pega la dirección otpauth:// o el secreto en letras y números.</span>)}
      {generando && (
        <div className="generador-junto">
          <PanelGenerador
            alUsar={(valor) => {
              alCambiar({ valor })
              setVer(true)
              setGenerando(false)
            }}
          />
        </div>
      )}
    </div>
  )
}
