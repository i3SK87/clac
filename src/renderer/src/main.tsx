import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { aplicarTemaGuardado } from 'casa/tema'
import { AvisosProvider } from 'casa/ui'
import { StoreProvider } from './lib/store'
import { App } from './App'
import 'casa/paletas.css'
import 'casa/base.css'
import './styles.css'

// Antes de montar nada: si no, el primer fotograma sale en claro y da un fogonazo.
aplicarTemaGuardado('clac')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AvisosProvider>
      <StoreProvider>
        <App />
      </StoreProvider>
    </AvisosProvider>
  </StrictMode>
)
