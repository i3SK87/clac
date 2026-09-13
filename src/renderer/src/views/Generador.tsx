import type { ReactNode } from 'react'
import { useAvisos } from 'casa/ui'
import { seccionesDePlantilla } from '@shared/categorias'
import { api, useStore } from '../lib/store'
import { PanelGenerador } from '../components/PanelGenerador'
import { avisoCopia } from '../components/Detalle'

/**
 * El generador suelto, para cuando la contraseña es para algo que todavía no
 * está en la caja: se copia, o se guarda directamente como elemento.
 */
export function VistaGenerador(): ReactNode {
  const { toast, fail } = useAvisos()
  const { bovedas, run, irA, seleccionar } = useStore()

  const guardar = async (valor: string): Promise<void> => {
    const secciones = seccionesDePlantilla('contrasena')
    secciones[0].campos[0].valor = valor
    const e = await run(() =>
      api.elementos.guardar({
        bovedaId: bovedas[0]?.id ?? '',
        categoria: 'contrasena',
        titulo: 'Contraseña generada',
        webs: [],
        etiquetas: [],
        favorito: false,
        secciones,
        notas: ''
      })
    )
    if (e) {
      toast('Guardada como «Contraseña generada». Cámbiale el título cuando sepas para qué es.')
      irA({ tipo: 'todos' })
      setTimeout(() => seleccionar(e.id), 0)
    }
  }

  return (
    <div className="content">
      <div className="card generador-vista">
        <PanelGenerador
          etiquetaUsar="Guardar como elemento"
          alCopiar={(valor) =>
            api.copiar
              .texto(valor)
              .then((r) => toast(avisoCopia('Contraseña', r)))
              .catch(fail)
          }
          alUsar={(valor) => void guardar(valor)}
        />
      </div>
      <p className="small subtle generador-nota">
        Aleatoria para las webs, que no tienes que recordar; memorable para lo que se teclea a mano, como la contraseña del ordenador o la del wifi.
        Los bits son el azar de verdad que lleva: a partir de 60 es muy difícil de adivinar, y a partir de 80 es imposible en la práctica.
      </p>
    </div>
  )
}
