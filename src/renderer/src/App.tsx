import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { useStore, esVistaDeLista, api } from './lib/store'
import { tituloDeVista } from './lib/filtrar'
import { BarraLateral } from './components/BarraLateral'
import { Bienvenida } from './views/Bienvenida'
import { Bloqueo } from './views/Bloqueo'
import { Caja } from './views/Caja'
import { VistaWatchtower } from './views/Watchtower'
import { VistaGenerador } from './views/Generador'
import { VistaAjustes } from './views/Ajustes'

export function App(): ReactNode {
  const { sesion } = useStore()
  // La bienvenida sigue en pantalla aunque la caja ya esté creada: falta el
  // paso de la clave secreta, y ese no se salta.
  const [configurando, setConfigurando] = useState(false)
  useEffect(() => {
    if (sesion === 'nueva') setConfigurando(true)
  }, [sesion])

  if (sesion === null) return <div className="puerta" />
  if (configurando || sesion === 'nueva') return <Bienvenida alTerminar={() => setConfigurando(false)} />
  if (sesion === 'bloqueada' || sesion === 'sinClave') return <Bloqueo sinClave={sesion === 'sinClave'} />
  return <Principal />
}

function Principal(): ReactNode {
  const { vista, bovedas, busqueda, setBusqueda, setCreando, irA, seleccionar } = useStore()
  const buscador = useRef<HTMLInputElement>(null)
  const deLista = esVistaDeLista(vista)

  // Lo que llega del menú de la aplicación y del acceso rápido.
  useEffect(() => {
    const quitar = [
      api.en.menu((accion) => {
        if (accion === 'nuevo') {
          if (!esVistaDeLista(vista) || vista.tipo === 'papelera' || vista.tipo === 'archivo') irA({ tipo: 'todos' })
          setCreando(true)
        } else if (accion === 'importar') {
          irA({ tipo: 'ajustes' })
        }
      }),
      api.en.abrirElemento((id) => {
        irA({ tipo: 'todos' })
        setBusqueda('')
        // Después de que la vista haya cambiado, que irA deja la selección vacía.
        setTimeout(() => seleccionar(id), 0)
      })
    ]
    return () => quitar.forEach((q) => q())
  }, [vista, irA, setCreando, setBusqueda, seleccionar])

  // Ctrl+F busca desde cualquier sitio; Escape vacía la búsqueda.
  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        if (!esVistaDeLista(vista)) irA({ tipo: 'todos' })
        setTimeout(() => buscador.current?.focus(), 0)
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [vista, irA])

  return (
    <div className="app">
      <BarraLateral />
      <main className={`main${deLista ? ' main-caja' : ''}`}>
        <header className="topbar">
          <h1>{tituloDeVista(vista, bovedas)}</h1>
          {deLista && (
            <div className="buscador">
              <Search size={15} className="buscador-lupa" />
              <input
                ref={buscador}
                className="input buscador-input"
                value={busqueda}
                placeholder="Buscar (Ctrl+F)"
                aria-label="Buscar"
                spellCheck={false}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation()
                    setBusqueda('')
                    buscador.current?.blur()
                  }
                }}
              />
              {busqueda && (
                <button className="buscador-borrar" onClick={() => setBusqueda('')} aria-label="Vaciar la búsqueda">
                  <X size={13} />
                </button>
              )}
            </div>
          )}
          {deLista && vista.tipo !== 'papelera' && (
            <button className="btn primary" onClick={() => setCreando(true)} title="Nuevo elemento (Ctrl+N)">
              <Plus size={16} /> Nuevo elemento
            </button>
          )}
        </header>
        {deLista && <Caja />}
        {vista.tipo === 'watchtower' && <VistaWatchtower />}
        {vista.tipo === 'generador' && <VistaGenerador />}
        {vista.tipo === 'ajustes' && <VistaAjustes />}
      </main>
    </div>
  )
}
