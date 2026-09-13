/**
 * Una vista de lista —todos, una categoría, una caja fuerte, el archivo…— con
 * la ficha del elemento elegido al lado.
 *
 * Los atajos son los de 1Password en Windows: flechas para moverse, Ctrl+C
 * copia el usuario, Ctrl+Mayús+C la contraseña, Ctrl+Alt+C el código, Ctrl+E
 * edita, Supr archiva y Ctrl+Supr manda a la papelera.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Archive, KeyRound, Plus, SearchX, Star, Trash2 } from 'lucide-react'
import { Confirm, EmptyState, useAvisos } from 'casa/ui'
import { api, useStore } from '../lib/store'
import { visibles } from '../lib/filtrar'
import { Lista } from '../components/Lista'
import { Detalle, avisoCopia } from '../components/Detalle'
import { Editor } from '../components/Editor'
import { ElegirCategoria } from '../components/ElegirCategoria'
import type { CategoriaId, Elemento } from '@shared/tipos'

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
      if (document.querySelector('.overlay') || editando || nuevo) return
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

  const vacia = busqueda.trim() ? (
    <EmptyState icon={SearchX} title="Nada coincide" message={`No hay nada que se llame «${busqueda}» aquí.`} />
  ) : vista.tipo === 'favoritos' ? (
    <EmptyState icon={Star} title="Sin favoritos" message="Marca con la estrella lo que más usas y lo tendrás aquí y el primero en el acceso rápido." />
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
