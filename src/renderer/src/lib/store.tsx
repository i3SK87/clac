/**
 * El estado de la ventana: qué caja está abierta, qué se está mirando y qué hay
 * seleccionado. Los datos viven en el proceso principal; aquí solo se guarda la
 * lista de resúmenes, que es lo que hace falta para pintar la barra lateral y
 * la lista, y se vuelve a pedir cada vez que algo cambia.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAvisos } from 'casa/ui'
import { recordarTema, vestir, seguirAlSistema } from 'casa/tema'
import { AJUSTES_INICIALES } from './ajustesIniciales'
import type { Ajustes, Boveda, CategoriaId, ElementoLista, EstadoSesion } from '@shared/tipos'

const api = window.clac

export type Vista =
  | { tipo: 'todos' }
  | { tipo: 'favoritos' }
  | { tipo: 'categoria'; id: CategoriaId }
  | { tipo: 'boveda'; id: string }
  | { tipo: 'etiqueta'; nombre: string }
  | { tipo: 'archivo' }
  | { tipo: 'papelera' }
  | { tipo: 'watchtower' }
  | { tipo: 'generador' }
  | { tipo: 'ajustes' }

/** Las vistas que son una lista de elementos, y no una pantalla propia. */
export function esVistaDeLista(v: Vista): boolean {
  return !['watchtower', 'generador', 'ajustes'].includes(v.tipo)
}

interface Store {
  sesion: EstadoSesion | null
  ajustes: Ajustes
  bovedas: Boveda[]
  elementos: ElementoLista[]
  /** Sube cada vez que cambian los datos: los que tienen algo abierto lo recargan. */
  revision: number
  vista: Vista
  seleccion: string | null
  busqueda: string
  /** Pedido desde fuera de la lista: «nuevo elemento» en el menú o en la cabecera. */
  creando: boolean
  irA: (vista: Vista) => void
  seleccionar: (id: string | null) => void
  setBusqueda: (texto: string) => void
  setCreando: (valor: boolean) => void
  recargar: () => Promise<void>
  cambiarAjustes: (cambios: Partial<Ajustes>) => Promise<void>
  /** Ejecuta algo del puente y, si falla, lo cuenta en un aviso. */
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }): ReactNode {
  const { fail } = useAvisos()
  const [sesion, setSesion] = useState<EstadoSesion | null>(null)
  const [ajustes, setAjustes] = useState<Ajustes>(AJUSTES_INICIALES)
  const [bovedas, setBovedas] = useState<Boveda[]>([])
  const [elementos, setElementos] = useState<ElementoLista[]>([])
  const [revision, setRevision] = useState(0)
  const [vista, setVista] = useState<Vista>({ tipo: 'todos' })
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [creando, setCreando] = useState(false)
  const ajustesRef = useRef(ajustes)
  ajustesRef.current = ajustes

  const aplicarAjustes = useCallback((a: Ajustes) => {
    setAjustes(a)
    vestir(a.theme, a.palette)
    recordarTema('clac', a.theme, a.palette)
  }, [])

  const recargar = useCallback(async () => {
    const estado = await api.sesion.estado()
    setSesion(estado)
    if (estado !== 'abierta') {
      setElementos([])
      setBovedas([])
      return
    }
    const [e, b] = await Promise.all([api.elementos.listar(), api.bovedas.listar()])
    setElementos(e)
    setBovedas(b)
    setRevision((r) => r + 1)
  }, [])

  useEffect(() => {
    void api.ajustes.leer().then(aplicarAjustes)
    void recargar()
    const quitar = [
      api.en.sesion((estado) => {
        setSesion(estado)
        if (estado !== 'abierta') {
          // Bloqueada, no queda nada de la caja en la ventana: ni la lista ni la selección.
          setElementos([])
          setBovedas([])
          setSeleccion(null)
          setBusqueda('')
          setCreando(false)
        } else {
          void recargar()
        }
      }),
      api.en.datos(() => void recargar()),
      api.en.ajustes(aplicarAjustes),
      seguirAlSistema(() => ajustesRef.current)
    ]
    return () => quitar.forEach((q) => q())
  }, [aplicarAjustes, recargar])

  const cambiarAjustes = useCallback(
    async (cambios: Partial<Ajustes>) => {
      try {
        aplicarAjustes(await api.ajustes.guardar(cambios))
      } catch (error) {
        fail(error)
      }
    },
    [aplicarAjustes, fail]
  )

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await fn()
      } catch (error) {
        fail(error)
        return undefined
      }
    },
    [fail]
  )

  const irA = useCallback((v: Vista) => {
    setVista(v)
    setSeleccion(null)
    setCreando(false)
  }, [])

  const valor = useMemo<Store>(
    () => ({
      sesion,
      ajustes,
      bovedas,
      elementos,
      revision,
      vista,
      seleccion,
      busqueda,
      creando,
      irA,
      seleccionar: setSeleccion,
      setBusqueda,
      setCreando,
      recargar,
      cambiarAjustes,
      run
    }),
    [sesion, ajustes, bovedas, elementos, revision, vista, seleccion, busqueda, creando, irA, recargar, cambiarAjustes, run]
  )

  return <StoreContext.Provider value={valor}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const s = useContext(StoreContext)
  if (!s) throw new Error('useStore necesita un StoreProvider por encima')
  return s
}

export { api }
