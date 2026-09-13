import { useMemo, useState, type ReactNode } from 'react'
import { Modal } from 'casa/ui'
import { CATEGORIAS } from '@shared/categorias'
import { Icono } from '../lib/iconos'
import type { CategoriaId } from '@shared/tipos'

/**
 * El primer paso de un elemento nuevo: qué es. Las más usadas arriba, y un
 * buscador para no leerse las veintidós.
 */
const PRIMERAS: CategoriaId[] = ['login', 'contrasena', 'nota', 'tarjeta', 'identidad', 'dni']

export function ElegirCategoria({ alElegir, alCerrar }: { alElegir: (c: CategoriaId) => void; alCerrar: () => void }): ReactNode {
  const [q, setQ] = useState('')
  const llano = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const lista = useMemo(() => {
    const ordenadas = [...CATEGORIAS].sort(
      (a, b) =>
        (PRIMERAS.includes(a.id) ? PRIMERAS.indexOf(a.id) : 99) - (PRIMERAS.includes(b.id) ? PRIMERAS.indexOf(b.id) : 99) ||
        a.nombre.localeCompare(b.nombre, 'es')
    )
    return q.trim() ? ordenadas.filter((c) => llano(`${c.nombre} ${c.plural}`).includes(llano(q.trim()))) : ordenadas
  }, [q])

  return (
    <Modal title="Nuevo elemento" onClose={alCerrar} wide>
      <input
        className="input"
        placeholder="Buscar un tipo: tarjeta, wifi, pasaporte…"
        value={q}
        autoFocus
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && lista[0]) alElegir(lista[0].id)
        }}
        aria-label="Buscar un tipo de elemento"
      />
      <div className="rejilla-categorias">
        {lista.map((c) => (
          <button key={c.id} type="button" className="tarjeta-categoria" onClick={() => alElegir(c.id)}>
            <span className="avatar-elemento" style={{ background: c.color, width: 34, height: 34, borderRadius: 10 }}>
              <Icono nombre={c.icono} size={18} color="#fff" />
            </span>
            <span>{c.nombre}</span>
          </button>
        ))}
        {!lista.length && <p className="muted small">Ningún tipo se llama así.</p>}
      </div>
    </Modal>
  )
}
