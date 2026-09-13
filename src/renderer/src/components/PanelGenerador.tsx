/**
 * El generador: la pantalla propia y el que se despliega junto a un campo de
 * contraseña son el mismo panel. Las opciones elegidas se recuerdan en el
 * navegador —no son secretas— para que la próxima vez salga como la dejaste.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Copy, RefreshCw } from 'lucide-react'
import { Checkbox, Segmented } from 'casa/ui'
import { LIMITES, OPCIONES_POR_DEFECTO, generar, type Generada, type OpcionesGenerador, type Separador } from '@shared/generador'
import { nivelDeBits } from '@shared/fortaleza'
import { ContrasenaPintada, Medidor } from './piezas'

const CLAVE = 'clac:generador'

function opcionesGuardadas(): OpcionesGenerador {
  try {
    const t = localStorage.getItem(CLAVE)
    if (t) return { ...OPCIONES_POR_DEFECTO, ...(JSON.parse(t) as Partial<OpcionesGenerador>) }
  } catch {
    // Sin almacén, las de fábrica.
  }
  return OPCIONES_POR_DEFECTO
}

const SEPARADORES: Array<{ value: Separador; label: string }> = [
  { value: 'guion', label: 'Guion  -' },
  { value: 'punto', label: 'Punto  .' },
  { value: 'espacio', label: 'Espacio' },
  { value: 'coma', label: 'Coma  ,' },
  { value: 'bajo', label: 'Guion bajo  _' },
  { value: 'numeros', label: 'Cifras' }
]

export function PanelGenerador({
  alUsar,
  alCopiar,
  etiquetaUsar = 'Usar esta'
}: {
  alUsar?: (valor: string) => void
  alCopiar?: (valor: string) => void
  etiquetaUsar?: string
}): ReactNode {
  const [op, setOp] = useState<OpcionesGenerador>(opcionesGuardadas)
  const [actual, setActual] = useState<Generada>(() => generar(op))

  const cambiar = useCallback((cambios: Partial<OpcionesGenerador>) => {
    setOp((anterior) => {
      const nuevas = { ...anterior, ...cambios }
      try {
        localStorage.setItem(CLAVE, JSON.stringify(nuevas))
      } catch {
        // Se vive sin recordarlo.
      }
      return nuevas
    })
  }, [])

  // Cada cambio de opciones saca una contraseña nueva.
  useEffect(() => setActual(generar(op)), [op])

  const f = nivelDeBits(actual.bits)
  const [minimo, maximo] =
    op.tipo === 'aleatoria' ? LIMITES.largo : op.tipo === 'memorable' ? LIMITES.palabras : LIMITES.digitos
  const valorDeslizador = op.tipo === 'aleatoria' ? op.largo : op.tipo === 'memorable' ? op.palabras : op.digitos
  const nombreDeslizador =
    op.tipo === 'aleatoria' ? 'Caracteres' : op.tipo === 'memorable' ? 'Palabras' : 'Cifras'

  return (
    <div className="generador">
      <Segmented
        value={op.tipo}
        onChange={(tipo) => cambiar({ tipo })}
        options={[
          { value: 'aleatoria', label: 'Aleatoria' },
          { value: 'memorable', label: 'Memorable' },
          { value: 'pin', label: 'PIN' }
        ]}
      />

      <div className="generador-salida mono" aria-live="polite">
        <ContrasenaPintada valor={actual.valor} />
      </div>
      <div className="row">
        <Medidor fortaleza={f} bits />
        <span className="spacer" />
        <button type="button" className="btn ghost icon" title="Otra" aria-label="Generar otra" onClick={() => setActual(generar(op))}>
          <RefreshCw size={16} />
        </button>
        {alCopiar && (
          <button type="button" className="btn small" onClick={() => alCopiar(actual.valor)}>
            <Copy size={14} /> Copiar
          </button>
        )}
        {alUsar && (
          <button type="button" className="btn small primary" onClick={() => alUsar(actual.valor)}>
            {etiquetaUsar}
          </button>
        )}
      </div>

      <div className="generador-opciones">
        <label className="deslizador-fila" htmlFor="gen-largo">
          <span>{nombreDeslizador}</span>
          <input
            id="gen-largo"
            className="deslizador"
            type="range"
            min={minimo}
            max={maximo}
            value={valorDeslizador}
            onChange={(e) => {
              const n = Number(e.target.value)
              cambiar(op.tipo === 'aleatoria' ? { largo: n } : op.tipo === 'memorable' ? { palabras: n } : { digitos: n })
            }}
          />
          <strong className="tabular">{valorDeslizador}</strong>
        </label>

        {op.tipo === 'aleatoria' && (
          <div className="row wrap" style={{ gap: 18 }}>
            <Checkbox checked={op.numeros} onChange={(numeros) => cambiar({ numeros })} label="Cifras" />
            <Checkbox checked={op.simbolos} onChange={(simbolos) => cambiar({ simbolos })} label="Símbolos" />
          </div>
        )}

        {op.tipo === 'memorable' && (
          <>
            <label className="deslizador-fila" htmlFor="gen-separador">
              <span>Separador</span>
              <select
                id="gen-separador"
                className="select"
                value={op.separador}
                onChange={(e) => cambiar({ separador: e.target.value as Separador })}
              >
                {SEPARADORES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="row wrap" style={{ gap: 18 }}>
              <Checkbox checked={op.mayusculas} onChange={(mayusculas) => cambiar({ mayusculas })} label="Mayúscula inicial" />
              <Checkbox
                checked={op.conTildes}
                onChange={(conTildes) => cambiar({ conTildes })}
                label="Con tildes y eñes"
                hint="Solo si vas a teclearla siempre en un teclado español"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
