/**
 * Una vista de lista —todos, una categoría, una caja fuerte, el archivo…— con
 * la ficha del elemento elegido al lado.
 *
 * Los atajos son los de 1Password en Windows: flechas para moverse, Ctrl+C
 * copia el usuario, Ctrl+Mayús+C la contraseña, Ctrl+Alt+C el código, Ctrl+E
 * edita, Supr archiva y Ctrl+Supr manda a la papelera.
 *
 * Y clic derecho en cada fila, como en BONK, con lo mismo y sin tener que
 * elegirla antes: copiar, abrir la web, editar, mover, archivar, borrar.
 */
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import {
  Archive,
  ArchiveRestore,
  Clock,
  CopyPlus,
  ExternalLink,
  FolderInput,
  KeyRound,
  Pencil,
  Plus,
  RotateCcw,
  SearchX,
  Trash2,
  User
} from 'lucide-react'
import { Confirm, EmptyState, useAvisos } from 'casa/ui'
import { MenuContextual, type OpcionMenu } from 'casa/menu'
import { contrasenaDe, usuarioDe } from '@shared/categorias'
import { normalizarWeb } from '@shared/webs'
import { api, useStore } from '../lib/store'
import { visibles } from '../lib/filtrar'
import { Lista } from '../components/Lista'
import { Detalle, MoverA, avisoCopia } from '../components/Detalle'
import { Editor } from '../components/Editor'
import { ElegirCategoria } from '../components/ElegirCategoria'
import type { CategoriaId, Elemento, ElementoLista } from '@shared/tipos'

/** Si el foco está en un campo de texto, las teclas son suyas. */
function escribiendo(): boolean {
  const a = document.activeElement
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a as HTMLElement).isContentEditable)
}

export function Caja(): ReactNode {
  const { toast, fail } = useAvisos()
  const { elementos, bovedas, vista, busqueda, ajustes, seleccion, seleccionar, cambiarAjustes, creando, setCreando, run } = useStore()
  const [editando, setEditando] = useState<Elemento | null>(null)
  const [nuevo, setNuevo] = useState<CategoriaId | null>(null)
  const [vaciando, setVaciando] = useState(false)
  const [menu, setMenu] = useState<{ e: Elemento; x: number; y: number } | null>(null)
  const [moviendo, setMoviendo] = useState<Elemento | null>(null)
  const [borrando, setBorrando] = useState<Elemento | null>(null)

  const lista = useMemo(() => visibles(elementos, vista, busqueda, ajustes.ordenLista), [elementos, vista, busqueda, ajustes.ordenLista])

  // Al buscar, o si lo elegido desaparece de la vista, se elige el primero.
  useEffect(() => {
    if (editando || nuevo) return
    if (!seleccion || !lista.some((e) => e.id === seleccion)) seleccionar(lista[0]?.id ?? null)
  }, [lista, seleccion, seleccionar, editando, nuevo])

  // Cambiar de vista cierra la edición.
  useEffect(() => {
    setEditando(null)
    setNuevo(null)
  }, [vista])

  const editar = async (): Promise<void> => {
    if (!seleccion) return
    const e = await run(() => api.elementos.obtener(seleccion))
    if (e && e.estado !== 'eliminado') setEditando(e)
  }

  useEffect(() => {
    const tecla = (ev: KeyboardEvent): void => {
      // Con un menú del clic derecho abierto, las flechas y Supr son suyas.
      if (document.querySelector('.overlay, .menu-contextual') || editando || nuevo) return
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        if (escribiendo() && !(document.activeElement as HTMLElement)?.classList.contains('buscador-input')) return
        ev.preventDefault()
        const i = lista.findIndex((e) => e.id === seleccion)
        const j = ev.key === 'ArrowDown' ? Math.min(lista.length - 1, i + 1) : Math.max(0, i - 1)
        if (lista[j]) seleccionar(lista[j].id)
        return
      }
      if (escribiendo() || !seleccion) return
      const clave = ev.key.toLowerCase()
      if (ev.ctrlKey && clave === 'c' && !window.getSelection()?.toString()) {
        ev.preventDefault()
        const que = ev.altKey ? 'totp' : ev.shiftKey ? 'contrasena' : 'usuario'
        const nombre = que === 'totp' ? 'Código' : que === 'contrasena' ? 'Contraseña' : 'Usuario'
        api.copiar
          .rapido(seleccion, que)
          .then((r) => toast(avisoCopia(nombre, r)))
          .catch(fail)
      } else if (ev.ctrlKey && clave === 'e') {
        ev.preventDefault()
        void editar()
      } else if (ev.key === 'Delete') {
        const e = lista.find((x) => x.id === seleccion)
        if (!e || e.estado === 'eliminado') return
        ev.preventDefault()
        const estado = ev.ctrlKey || e.estado === 'archivado' ? 'eliminado' : 'archivado'
        void run(() => api.elementos.estado([seleccion], estado)).then(() =>
          toast(estado === 'archivado' ? 'Archivado. Lo tienes en «Archivo».' : 'A la papelera. Se borrará solo dentro de 30 días.')
        )
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  const bovedaInicial = vista.tipo === 'boveda' ? vista.id : bovedas[0]?.id ?? ''

  /*
   * El menú sale con el elemento entero ya descifrado: así solo ofrece copiar lo
   * que de verdad tiene. Pedirlo es local y tarda lo que un parpadeo.
   */
  const abrirMenu = (item: ElementoLista) => (ev: MouseEvent): void => {
    ev.preventDefault()
    if (editando || nuevo) return
    const { clientX: x, clientY: y } = ev
    api.elementos
      .obtener(item.id)
      .then((e) => setMenu({ e, x, y }))
      .catch(fail)
  }

  const copiarRapido = (id: string, que: 'usuario' | 'contrasena' | 'totp'): void => {
    const nombre = que === 'totp' ? 'Código' : que === 'contrasena' ? 'Contraseña' : 'Usuario'
    api.copiar
      .rapido(id, que)
      .then((r) => toast(avisoCopia(nombre, r)))
      .catch(fail)
  }

  const cambiarEstado = (id: string, estado: 'activo' | 'archivado' | 'eliminado', texto: string): void => {
    void run(() => api.elementos.estado([id], estado).then(() => true)).then((ok) => ok && toast(texto))
  }

  const opcionesDe = (e: Elemento): OpcionMenu[] => {
    if (e.estado === 'eliminado') {
      return [
        { etiqueta: 'Recuperar', icono: RotateCcw, onElegir: () => cambiarEstado(e.id, 'activo', 'Elemento recuperado') },
        { etiqueta: 'Borrar para siempre…', icono: Trash2, peligrosa: true, onElegir: () => setBorrando(e) }
      ]
    }
    const web = e.webs.find((w) => normalizarWeb(w))
    return [
      ...(usuarioDe(e) ? [{ etiqueta: 'Copiar el usuario', icono: User, pista: 'Ctrl+C', onElegir: () => copiarRapido(e.id, 'usuario') }] : []),
      ...(contrasenaDe(e) ? [{ etiqueta: 'Copiar la contraseña', icono: KeyRound, pista: 'Ctrl+Mayús+C', onElegir: () => copiarRapido(e.id, 'contrasena') }] : []),
      ...(e.tieneTotp ? [{ etiqueta: 'Copiar el código', icono: Clock, pista: 'Ctrl+Alt+C', onElegir: () => copiarRapido(e.id, 'totp') }] : []),
      ...(web ? [{ etiqueta: 'Abrir la web', icono: ExternalLink, onElegir: () => void run(() => api.web.abrir(web)) }] : []),
      {
        etiqueta: 'Editar',
        icono: Pencil,
        pista: 'Ctrl+E',
        onElegir: () => {
          seleccionar(e.id)
          setEditando(e)
        }
      },
      { etiqueta: 'Duplicar', icono: CopyPlus, onElegir: () => void run(() => api.elementos.duplicar(e.id)).then((c) => c && seleccionar(c.id)) },
      ...(bovedas.length > 1 ? [{ etiqueta: 'Mover a otra caja fuerte…', icono: FolderInput, onElegir: () => setMoviendo(e) }] : []),
      e.estado === 'archivado'
        ? { etiqueta: 'Sacar del archivo', icono: ArchiveRestore, onElegir: () => cambiarEstado(e.id, 'activo', 'Vuelve a estar con los demás') }
        : { etiqueta: 'Archivar', icono: Archive, pista: 'Supr', onElegir: () => cambiarEstado(e.id, 'archivado', 'Archivado. Lo tienes en «Archivo».') },
      {
        etiqueta: 'Mover a la papelera',
        icono: Trash2,
        pista: 'Ctrl+Supr',
        peligrosa: true,
        onElegir: () => cambiarEstado(e.id, 'eliminado', 'A la papelera. Se borrará solo dentro de 30 días.')
      }
    ]
  }

  const vacia = busqueda.trim() ? (
    <EmptyState icon={SearchX} title="Nada coincide" message={`No hay nada que se llame «${busqueda}» aquí.`} />
  ) : vista.tipo === 'archivo' ? (
    <EmptyState icon={Archive} title="El archivo está vacío" message="Lo que archives sale de las listas y del acceso rápido, pero se queda aquí." />
  ) : vista.tipo === 'papelera' ? (
    <EmptyState icon={Trash2} title="La papelera está vacía" message="Lo que se borra se queda aquí treinta días antes de irse del todo." />
  ) : (
    <EmptyState
      icon={KeyRound}
      title="Todavía no hay nada"
      message="Crea tu primer elemento o tráete las contraseñas del navegador desde Ajustes ▸ Importar."
      action={
        <button className="btn primary" onClick={() => setCreando(true)}>
          <Plus size={15} /> Nuevo elemento
        </button>
      }
    />
  )

  return (
    <div className="caja">
      <div className="caja-lista">
        <Lista
          elementos={lista}
          seleccion={seleccion}
          orden={ajustes.ordenLista}
          buscando={busqueda.trim() !== ''}
          vacia={vacia}
          papelera={vista.tipo === 'papelera'}
          alSeleccionar={(id) => {
            if (editando || nuevo) return
            seleccionar(id)
          }}
          alOrdenar={(ordenLista) => void cambiarAjustes({ ordenLista })}
          alMenu={abrirMenu}
          conMenu={menu?.e.id ?? null}
        />
        {vista.tipo === 'papelera' && lista.length > 0 && (
          <div className="lista-pie">
            <button className="btn small ghost danger" onClick={() => setVaciando(true)}>
              <Trash2 size={14} /> Vaciar la papelera
            </button>
          </div>
        )}
      </div>

      <div className="caja-detalle">
        {nuevo || editando ? (
          <Editor
            key={editando?.id ?? `nuevo-${nuevo}`}
            elemento={editando}
            nuevo={nuevo}
            bovedaInicial={bovedaInicial}
            alTerminar={(id) => {
              setEditando(null)
              setNuevo(null)
              seleccionar(id)
            }}
            alCancelar={() => {
              setEditando(null)
              setNuevo(null)
            }}
          />
        ) : seleccion ? (
          <Detalle id={seleccion} alEditar={() => void editar()} />
        ) : (
          <div className="detalle detalle-vacio">
            <KeyRound size={40} strokeWidth={1.2} />
          </div>
        )}
      </div>

      {creando && (
        <ElegirCategoria
          alCerrar={() => setCreando(false)}
          alElegir={(c) => {
            setCreando(false)
            setEditando(null)
            setNuevo(c)
          }}
        />
      )}
      {menu && <MenuContextual x={menu.x} y={menu.y} opciones={opcionesDe(menu.e)} onCerrar={() => setMenu(null)} />}
      {moviendo && <MoverA elemento={moviendo} alCerrar={() => setMoviendo(null)} />}
      {borrando && (
        <Confirm
          title="Borrar para siempre"
          message={`«${borrando.titulo}» se borrará del todo, con su historial y sus archivos. Esto no se puede deshacer.`}
          confirmLabel="Borrar para siempre"
          destructive
          onCancel={() => setBorrando(null)}
          onConfirm={() => {
            const id = borrando.id
            setBorrando(null)
            void run(() => api.elementos.eliminarDefinitivamente([id])).then((n) => n && toast('Borrado para siempre'))
          }}
        />
      )}
      {vaciando && (
        <Confirm
          title="Vaciar la papelera"
          message={`Se borrarán para siempre ${lista.length} ${lista.length === 1 ? 'elemento' : 'elementos'}, con su historial y sus archivos. No se puede deshacer.`}
          confirmLabel="Vaciar"
          destructive
          onCancel={() => setVaciando(false)}
          onConfirm={() => {
            setVaciando(false)
            void run(() => api.elementos.vaciarPapelera()).then((n) => n != null && toast(`Borrados para siempre: ${n}`))
          }}
        />
      )}
    </div>
  )
}
