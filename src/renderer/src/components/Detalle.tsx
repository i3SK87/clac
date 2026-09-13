/**
 * La ficha de un elemento, en modo lectura.
 *
 * Pulsar un valor lo copia, como en 1Password. Los campos ocultos salen con
 * puntos hasta que se piden; la contraseña, además, con su medidor debajo y la
 * opción de verla en grande. Todo lo que se copia pasa por el proceso
 * principal, que descifra, copia sin dejar rastro en el historial de Windows y
 * vacía el portapapeles al rato.
 *
 * Cada campo tiene también clic derecho, con lo mismo que sus botones.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Archive,
  ArchiveRestore,
  Copy,
  CopyPlus,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FolderInput,
  History,
  Image as ImageIcon,
  Maximize2,
  MoreHorizontal,
  Paperclip,
  Pencil,
  RotateCcw,
  Trash2
} from 'lucide-react'
import { Confirm, Modal, useAvisos } from 'casa/ui'
import { MenuContextual, type OpcionMenu } from 'casa/menu'
import { categoria } from '@shared/categorias'
import { dominioDe, normalizarWeb } from '@shared/webs'
import { fortaleza } from '@shared/fortaleza'
import { haceCuanto, mostrarFecha } from '@shared/fechas'
import type { Campo, Elemento, ResultadoCopia, VersionHistorial } from '@shared/tipos'
import { api, useStore } from '../lib/store'
import { Avatar, CodigoTotp, ContrasenaPintada, EnGrande, Medidor, MenuDesplegable } from './piezas'
import { Icono } from '../lib/iconos'

const PUNTOS = '••••••••••'

export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('es-ES', { maximumFractionDigits: 0 })} KB`
  return `${(bytes / 1024 / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`
}

export function avisoCopia(que: string, r: ResultadoCopia): string {
  return r.segundos > 0 ? `${que} copiado. Se borrará del portapapeles en ${r.segundos} s.` : `${que} copiado.`
}

/* ---------- Un campo ---------- */

function CampoLectura({
  campo,
  revelarTodo,
  alCopiar
}: {
  campo: Campo
  revelarTodo: boolean
  alCopiar: (campo: Campo) => void
}): ReactNode {
  const [revelado, setRevelado] = useState(false)
  const [grande, setGrande] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const oculto = campo.tipo === 'oculto' || campo.tipo === 'ocultoMultilinea'
  const visible = !oculto || revelado || revelarTodo
  const esContrasena = campo.clave === 'contrasena' || campo.tipo === 'oculto'

  let valor: ReactNode
  if (campo.tipo === 'totp') {
    valor = <CodigoTotp secreto={campo.valor} alCopiar={() => alCopiar(campo)} />
  } else if (!visible) {
    valor = <span className="valor-puntos">{PUNTOS}</span>
  } else if (campo.tipo === 'oculto') {
    valor = (
      <span className="mono valor-secreto">
        <ContrasenaPintada valor={campo.valor} />
      </span>
    )
  } else if (campo.tipo === 'ocultoMultilinea' || campo.tipo === 'multilinea') {
    valor = <span className={`valor-largo${campo.tipo === 'ocultoMultilinea' ? ' mono' : ''}`}>{campo.valor}</span>
  } else if (campo.tipo === 'fecha' || campo.tipo === 'mesAnio') {
    valor = mostrarFecha(campo.valor, campo.tipo)
  } else {
    valor = campo.valor
  }

  const web = campo.tipo === 'url' && normalizarWeb(campo.valor)
  const opciones: OpcionMenu[] = [
    { etiqueta: campo.tipo === 'totp' ? 'Copiar el código' : 'Copiar', icono: Copy, onElegir: () => alCopiar(campo) },
    ...(oculto ? [{ etiqueta: visible ? 'Ocultar' : 'Mostrar', icono: visible ? EyeOff : Eye, onElegir: () => setRevelado(!visible) }] : []),
    ...(campo.tipo === 'oculto' ? [{ etiqueta: 'Ver en grande', icono: Maximize2, onElegir: () => setGrande(true) }] : []),
    ...(web ? [{ etiqueta: 'Abrir en el navegador', icono: ExternalLink, onElegir: () => void api.web.abrir(campo.valor) }] : [])
  ]

  return (
    <div
      className={`campo-lectura${menu ? ' marcada' : ''}`}
      onContextMenu={(ev) => {
        ev.preventDefault()
        setMenu({ x: ev.clientX, y: ev.clientY })
      }}
    >
      <div className="rotulo">{campo.etiqueta}</div>
      <div className="campo-fila">
        {campo.tipo === 'totp' ? (
          <div className="campo-valor">{valor}</div>
        ) : (
          <button type="button" className="campo-valor boton-valor" onClick={() => alCopiar(campo)} title="Pulsa para copiar">
            {valor}
          </button>
        )}
        <div className="campo-acciones">
          {oculto && (
            <button
              type="button"
              className="btn ghost icon small"
              onClick={() => setRevelado(!revelado)}
              title={visible ? 'Ocultar' : 'Mostrar'}
              aria-label={visible ? 'Ocultar' : 'Mostrar'}
            >
              {visible ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          )}
          {campo.tipo === 'oculto' && (
            <button type="button" className="btn ghost icon small" onClick={() => setGrande(true)} title="Ver en grande" aria-label="Ver en grande">
              <Maximize2 size={15} />
            </button>
          )}
          {campo.tipo === 'url' && normalizarWeb(campo.valor) && (
            <button type="button" className="btn ghost icon small" onClick={() => void api.web.abrir(campo.valor)} title="Abrir" aria-label="Abrir">
              <ExternalLink size={15} />
            </button>
          )}
          <button type="button" className="btn ghost icon small" onClick={() => alCopiar(campo)} title="Copiar" aria-label="Copiar">
            <Copy size={15} />
          </button>
        </div>
      </div>
      {esContrasena && campo.clave === 'contrasena' && campo.valor && <Medidor fortaleza={fortaleza(campo.valor)} />}
      {grande && <EnGrande valor={campo.valor} alCerrar={() => setGrande(false)} />}
      {menu && <MenuContextual x={menu.x} y={menu.y} opciones={opciones} onCerrar={() => setMenu(null)} />}
    </div>
  )
}

/* ---------- La ficha ---------- */

export function Detalle({ id, alEditar }: { id: string; alEditar: () => void }): ReactNode {
  const { toast, fail } = useAvisos()
  const { revision, bovedas, irA, run, seleccionar } = useStore()
  const [e, setE] = useState<Elemento | null>(null)
  const [revelarTodo, setRevelarTodo] = useState(false)
  const [moviendo, setMoviendo] = useState(false)
  const [historial, setHistorial] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [vista, setVista] = useState<string | null>(null)
  const [quitarAdjunto, setQuitarAdjunto] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    api.elementos
      .obtener(id)
      .then((x) => vivo && setE(x))
      .catch((err) => {
        if (vivo) {
          setE(null)
          fail(err)
        }
      })
    return () => {
      vivo = false
    }
  }, [id, revision, fail])

  // Cambiar de elemento vuelve a esconderlo todo.
  useEffect(() => setRevelarTodo(false), [id])

  const copiarCampo = useCallback(
    async (campo: Campo) => {
      if (!e) return
      try {
        const r = await api.copiar.campo(e.id, campo.id)
        toast(avisoCopia(campo.tipo === 'totp' ? 'Código' : campo.etiqueta, r))
      } catch (err) {
        fail(err)
      }
    },
    [e, toast, fail]
  )

  // Ctrl+R muestra u oculta todo lo oculto de la ficha, como en 1Password.
  useEffect(() => {
    const tecla = (ev: KeyboardEvent): void => {
      if (ev.ctrlKey && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === 'r') {
        ev.preventDefault()
        setRevelarTodo((v) => !v)
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  if (!e) return <div className="detalle" />

  const cat = categoria(e.categoria)
  const boveda = bovedas.find((b) => b.id === e.bovedaId)
  const enPapelera = e.estado === 'eliminado'
  const archivado = e.estado === 'archivado'
  const secciones = e.secciones.filter((s) => s.campos.some((c) => c.valor.trim() !== ''))

  const cambiarEstado = async (estado: 'activo' | 'archivado' | 'eliminado', texto: string): Promise<void> => {
    const ok = await run(() => api.elementos.estado([e.id], estado).then(() => true))
    if (ok) {
      toast(texto)
      seleccionar(null)
    }
  }

  return (
    <div className="detalle">
      <div className="detalle-cabecera">
        <Avatar titulo={e.titulo} categoria={e.categoria} webs={e.webs} tamano={52} />
        <div className="detalle-titulos">
          <h2 className="detalle-titulo">{e.titulo}</h2>
          <div className="detalle-meta">
            {boveda && (
              <span className="pill">
                <Icono nombre={boveda.icono} size={12} color={boveda.color} /> {boveda.nombre}
              </span>
            )}
            <span className="small muted">{cat.nombre}</span>
            {archivado && <span className="pill aviso">Archivado</span>}
            {enPapelera && <span className="pill mal">En la papelera</span>}
          </div>
        </div>
        <div className="detalle-botones">
          {!enPapelera && (
            <button className="btn" onClick={alEditar} title="Editar (Ctrl+E)">
              <Pencil size={15} /> Editar
            </button>
          )}
          {enPapelera && (
            <button className="btn" onClick={() => void cambiarEstado('activo', 'Elemento recuperado')}>
              <RotateCcw size={15} /> Recuperar
            </button>
          )}
          <MenuDesplegable
            boton={<MoreHorizontal size={17} />}
            opciones={[
              { etiqueta: 'Mostrar lo oculto', atajo: 'Ctrl+R', icono: <Eye size={15} />, alPulsar: () => setRevelarTodo((v) => !v), oculto: enPapelera },
              { etiqueta: 'Duplicar', icono: <CopyPlus size={15} />, alPulsar: () => void run(() => api.elementos.duplicar(e.id)).then((c) => c && seleccionar(c.id)), oculto: enPapelera },
              { etiqueta: 'Mover a otra caja fuerte…', icono: <FolderInput size={15} />, alPulsar: () => setMoviendo(true), oculto: enPapelera || bovedas.length < 2 },
              { etiqueta: 'Historial de cambios', icono: <History size={15} />, alPulsar: () => setHistorial(true) },
              'separador',
              { etiqueta: 'Archivar', atajo: 'Supr', icono: <Archive size={15} />, alPulsar: () => void cambiarEstado('archivado', 'Archivado. Lo tienes en «Archivo».'), oculto: archivado || enPapelera },
              { etiqueta: 'Sacar del archivo', icono: <ArchiveRestore size={15} />, alPulsar: () => void cambiarEstado('activo', 'Vuelve a estar con los demás'), oculto: !archivado },
              { etiqueta: 'Mover a la papelera', atajo: 'Ctrl+Supr', icono: <Trash2 size={15} />, peligro: true, alPulsar: () => void cambiarEstado('eliminado', 'A la papelera. Se borrará solo dentro de 30 días.'), oculto: enPapelera },
              { etiqueta: 'Borrar para siempre', icono: <Trash2 size={15} />, peligro: true, alPulsar: () => setBorrando(true), oculto: !enPapelera }
            ]}
          />
        </div>
      </div>

      <div className="detalle-cuerpo">
        {secciones.map((s) => (
          <section key={s.id} className="card detalle-seccion">
            {s.titulo && <div className="detalle-seccion-titulo">{s.titulo}</div>}
            {s.campos
              .filter((c) => c.valor.trim() !== '')
              .map((c) => (
                <CampoLectura key={c.id} campo={c} revelarTodo={revelarTodo} alCopiar={(campo) => void copiarCampo(campo)} />
              ))}
          </section>
        ))}

        {e.webs.length > 0 && (
          <section className="card detalle-seccion">
            <div className="detalle-seccion-titulo">{e.webs.length === 1 ? 'Web' : 'Webs'}</div>
            {e.webs.map((w) => (
              <div key={w} className="campo-lectura">
                <div className="campo-fila">
                  <button type="button" className="campo-valor boton-valor web" onClick={() => void run(() => api.web.abrir(w))} title="Abrir en el navegador">
                    <span className="truncate">{dominioDe(w) || w}</span>
                    <span className="small subtle truncate">{w}</span>
                  </button>
                  <div className="campo-acciones visibles">
                    <button type="button" className="btn small" onClick={() => void run(() => api.web.abrir(w))}>
                      <ExternalLink size={14} /> Abrir
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        {e.notas.trim() && (
          <section className="card detalle-seccion">
            <div className="detalle-seccion-titulo">Notas</div>
            <div className="detalle-notas">{e.notas}</div>
          </section>
        )}

        {e.adjuntosInfo.length > 0 && (
          <section className="card detalle-seccion">
            <div className="detalle-seccion-titulo">Archivos</div>
            {e.adjuntosInfo.map((a) => (
              <div key={a.id} className="adjunto">
                <Paperclip size={15} className="subtle" />
                <span className="truncate">{a.nombre}</span>
                <span className="small subtle tabular">{tamanoLegible(a.tamano)}</span>
                <span className="spacer" />
                {a.tipo.startsWith('image/') && (
                  <button className="btn ghost icon small" title="Ver" aria-label="Ver" onClick={() => void run(() => api.adjuntos.vistaPrevia(a.id)).then((u) => u && setVista(u))}>
                    <ImageIcon size={15} />
                  </button>
                )}
                <button
                  className="btn ghost icon small"
                  title="Guardar una copia"
                  aria-label="Guardar una copia"
                  onClick={() => void run(() => api.adjuntos.guardar(a.id)).then((r) => r && toast('Archivo guardado'))}
                >
                  <Download size={15} />
                </button>
                {!enPapelera && (
                  <button className="btn ghost icon small" title="Quitar" aria-label="Quitar" onClick={() => setQuitarAdjunto(a.id)}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </section>
        )}

        {!enPapelera && (
          <button
            className="btn small contorno anadir-archivo"
            onClick={() => void run(() => api.adjuntos.anadir(e.id)).then((r) => r?.length && toast(r.length === 1 ? 'Archivo adjuntado' : `${r.length} archivos adjuntados`))}
          >
            <Paperclip size={14} /> Adjuntar archivo
          </button>
        )}

        {e.etiquetas.length > 0 && (
          <div className="row wrap detalle-etiquetas">
            {e.etiquetas.map((t) => (
              <button key={t} className="pill boton-pill" onClick={() => irA({ tipo: 'etiqueta', nombre: t })}>
                {t}
              </button>
            ))}
          </div>
        )}

        <p className="detalle-pie small subtle">
          Modificado {haceCuanto(e.modificado)} · Creado {haceCuanto(e.creado)}
          {e.usos > 0 && ` · Usado ${e.usos} ${e.usos === 1 ? 'vez' : 'veces'}`}
          {enPapelera && e.eliminadoEn && ` · Se borrará del todo 30 días después de ir a la papelera`}
        </p>
      </div>

      {moviendo && <MoverA elemento={e} alCerrar={() => setMoviendo(false)} />}
      {historial && <Historial elemento={e} alCerrar={() => setHistorial(false)} />}
      {vista && (
        <Modal title="Vista previa" onClose={() => setVista(null)} wide>
          <img src={vista} alt="" className="vista-previa" />
        </Modal>
      )}
      {quitarAdjunto && (
        <Confirm
          title="Quitar el archivo"
          message="El archivo se borrará de la caja fuerte. Si no tienes otra copia, se perderá."
          confirmLabel="Quitar"
          destructive
          onCancel={() => setQuitarAdjunto(null)}
          onConfirm={() => {
            const aid = quitarAdjunto
            setQuitarAdjunto(null)
            void run(() => api.adjuntos.eliminar(aid)).then(() => toast('Archivo quitado'))
          }}
        />
      )}
      {borrando && (
        <Confirm
          title="Borrar para siempre"
          message={`«${e.titulo}» se borrará del todo, con su historial y sus archivos. Esto no se puede deshacer.`}
          confirmLabel="Borrar para siempre"
          destructive
          onCancel={() => setBorrando(false)}
          onConfirm={() => {
            setBorrando(false)
            void run(() => api.elementos.eliminarDefinitivamente([e.id])).then((n) => {
              if (n) {
                toast('Borrado para siempre')
                seleccionar(null)
              }
            })
          }}
        />
      )}
    </div>
  )
}

/* ---------- Mover ---------- */

export function MoverA({ elemento, alCerrar }: { elemento: Elemento; alCerrar: () => void }): ReactNode {
  const { bovedas, run } = useStore()
  const { toast } = useAvisos()
  return (
    <Modal title="Mover a otra caja fuerte" onClose={alCerrar} sobre>
      <p className="small muted">Se vuelve a cifrar con la clave de la caja de destino, con su historial y sus archivos.</p>
      <div className="col">
        {bovedas
          .filter((b) => b.id !== elemento.bovedaId)
          .map((b) => (
            <button
              key={b.id}
              className="opcion-boveda"
              onClick={() =>
                void run(() => api.elementos.mover([elemento.id], b.id)).then(() => {
                  toast(`Movido a «${b.nombre}»`)
                  alCerrar()
                })
              }
            >
              <Icono nombre={b.icono} size={18} color={b.color} />
              <span>{b.nombre}</span>
            </button>
          ))}
      </div>
    </Modal>
  )
}

/* ---------- Historial ---------- */

function Historial({ elemento, alCerrar }: { elemento: Elemento; alCerrar: () => void }): ReactNode {
  const { run } = useStore()
  const { toast } = useAvisos()
  const [versiones, setVersiones] = useState<VersionHistorial[] | null>(null)
  const [elegida, setElegida] = useState<VersionHistorial | null>(null)
  const [ver, setVer] = useState(false)

  useEffect(() => {
    void run(() => api.elementos.historial(elemento.id)).then((v) => {
      setVersiones(v ?? [])
      setElegida(v?.[0] ?? null)
    })
  }, [elemento.id, run])

  return (
    <Modal
      title="Historial de cambios"
      onClose={alCerrar}
      wide
      footer={
        elegida && (
          <>
            <button className="btn ghost" onClick={() => setVer(!ver)}>
              {ver ? <EyeOff size={15} /> : <Eye size={15} />} {ver ? 'Ocultar' : 'Mostrar lo oculto'}
            </button>
            <span className="spacer" />
            <button className="btn" onClick={alCerrar}>
              Cerrar
            </button>
            <button
              className="btn primary"
              onClick={() =>
                void run(() => api.elementos.restaurarVersion(elemento.id, elegida.id)).then((r) => {
                  if (r) {
                    toast('Versión restaurada. Lo que había queda también en el historial.')
                    alCerrar()
                  }
                })
              }
            >
              <RotateCcw size={15} /> Restaurar esta versión
            </button>
          </>
        )
      }
    >
      {versiones && versiones.length === 0 && (
        <p className="muted small">Todavía no hay versiones anteriores: se guarda una cada vez que editas el elemento.</p>
      )}
      {versiones && versiones.length > 0 && (
        <div className="historial">
          <div className="historial-lista">
            {versiones.map((v) => (
              <button key={v.id} className={`historial-fila${elegida?.id === v.id ? ' elegida' : ''}`} onClick={() => setElegida(v)}>
                <span className="truncate">{v.titulo}</span>
                <span className="small subtle">{haceCuanto(v.fecha)}</span>
              </button>
            ))}
          </div>
          {elegida && (
            <div className="historial-version">
              {elegida.detalle.secciones.flatMap((s) => s.campos).filter((c) => c.valor.trim()).map((c) => (
                <div key={c.id} className="campo-lectura">
                  <div className="rotulo">{c.etiqueta}</div>
                  <div className={c.tipo.startsWith('oculto') ? 'mono' : undefined}>
                    {c.tipo.startsWith('oculto') && !ver ? PUNTOS : c.valor}
                  </div>
                </div>
              ))}
              {elegida.resumen.webs.map((w) => (
                <div key={w} className="campo-lectura">
                  <div className="rotulo">Web</div>
                  <div>{w}</div>
                </div>
              ))}
              {elegida.detalle.notas && (
                <div className="campo-lectura">
                  <div className="rotulo">Notas</div>
                  <div className="detalle-notas">{elegida.detalle.notas}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
