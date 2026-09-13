/**
 * Watchtower: la puntuación arriba, los problemas agrupados debajo, y aparte la
 * única comprobación que sale a internet, con su explicación y su botón.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { CalendarClock, CircleAlert, Copy, Globe, KeyRound, Radar, Repeat, ShieldCheck, ShieldX } from 'lucide-react'
import { Loading, useAvisos } from 'casa/ui'
import { haceCuanto } from '@shared/fechas'
import type { InformeWatchtower, TipoAlerta } from '@shared/tipos'
import { api, useStore } from '../lib/store'
import { Avatar } from '../components/piezas'

const ALERTAS: Record<TipoAlerta, { titulo: string; explicacion: string; icono: ReactNode; tono: 'mal' | 'aviso' }> = {
  filtrada: {
    titulo: 'Contraseñas filtradas',
    explicacion: 'Han aparecido en filtraciones públicas. Cámbialas cuanto antes: están en las listas con las que se prueba primero.',
    icono: <ShieldX size={18} />,
    tono: 'mal'
  },
  caducada: {
    titulo: 'Caducados',
    explicacion: 'Documentos y tarjetas que ya no valen.',
    icono: <CalendarClock size={18} />,
    tono: 'mal'
  },
  debil: {
    titulo: 'Contraseñas débiles',
    explicacion: 'Se adivinan en poco tiempo. Cámbialas por una generada.',
    icono: <KeyRound size={18} />,
    tono: 'mal'
  },
  repetida: {
    titulo: 'Contraseñas repetidas',
    explicacion: 'Si una web la filtra, sirve para entrar en las demás. Cada web, la suya.',
    icono: <Repeat size={18} />,
    tono: 'aviso'
  },
  sinCifrar: {
    titulo: 'Webs sin cifrar',
    explicacion: 'La dirección empieza por http:// y la contraseña viajaría a la vista. Comprueba si la web tiene versión https://.',
    icono: <Globe size={18} />,
    tono: 'aviso'
  },
  caduca: {
    titulo: 'Caducan pronto',
    explicacion: 'Con tiempo para renovarlos: dos meses antes para tarjetas y carnés, diez para el DNI y el pasaporte.',
    icono: <CalendarClock size={18} />,
    tono: 'aviso'
  },
  duplicado: {
    titulo: 'Duplicados',
    explicacion: 'Elementos idénticos en la misma caja fuerte. Sobra uno de cada.',
    icono: <Copy size={18} />,
    tono: 'aviso'
  }
}

export function VistaWatchtower(): ReactNode {
  const { toast, fail } = useAvisos()
  const { revision, irA, seleccionar } = useStore()
  const [inf, setInf] = useState<InformeWatchtower | null>(null)
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null)

  useEffect(() => {
    void api.watchtower.informe().then(setInf).catch(fail)
  }, [revision, fail])

  useEffect(() => api.en.progresoFiltradas((hechas, total) => setProgreso({ hechas, total })), [])

  const comprobar = async (): Promise<void> => {
    setProgreso({ hechas: 0, total: 0 })
    try {
      const r = await api.watchtower.filtradas()
      setInf(r)
      const n = r.grupos.find((g) => g.tipo === 'filtrada')?.elementos.length ?? 0
      toast(n ? `${n} ${n === 1 ? 'contraseña ha salido' : 'contraseñas han salido'} en filtraciones` : 'Ninguna contraseña aparece en filtraciones')
    } catch (e) {
      fail(e)
    } finally {
      setProgreso(null)
    }
  }

  const abrir = (id: string): void => {
    irA({ tipo: 'todos' })
    setTimeout(() => seleccionar(id), 0)
  }

  if (!inf) return <Loading />

  const tono = inf.puntuacion >= 90 ? 'ok' : inf.puntuacion >= 60 ? 'aviso' : 'mal'

  return (
    <div className="content watchtower">
      <div className="card watchtower-cabecera">
        <div className={`puntuacion tono-${tono}`}>
          <svg viewBox="0 0 120 120" aria-hidden>
            <circle cx="60" cy="60" r="52" className="pista" />
            <circle
              cx="60"
              cy="60"
              r="52"
              className="arco"
              strokeDasharray={`${((2 * Math.PI * 52 * inf.puntuacion) / 100).toFixed(1)} 400`}
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div className="puntuacion-cifra">
            <strong className="tabular">{inf.puntuacion}</strong>
            <span>de 100</span>
          </div>
        </div>
        <div className="watchtower-resumen">
          <h2>
            {inf.revisados === 0
              ? 'Nada que revisar todavía'
              : inf.conProblemas === 0
                ? 'Todo en orden'
                : `${inf.conProblemas} de ${inf.revisados} ${inf.revisados === 1 ? 'elemento necesita' : 'elementos necesitan'} atención`}
          </h2>
          <p className="muted">
            La puntuación es la parte de tu caja fuerte que no tiene ningún problema. Se revisa sin salir de este equipo cada vez que entras aquí.
          </p>
          <div className="row wrap watchtower-contadores">
            {inf.grupos.map((g) => (
              <a key={g.tipo} className={`pill ${ALERTAS[g.tipo].tono}`} href={`#alerta-${g.tipo}`}>
                {ALERTAS[g.tipo].titulo}: {g.elementos.length}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="card watchtower-filtradas">
        <Radar size={22} className="subtle" />
        <div className="col" style={{ gap: 4, flex: 1 }}>
          <h3>¿Han salido tus contraseñas en alguna filtración?</h3>
          <p className="small muted">
            Es lo único que CLAC consulta sobre tus contraseñas, y solo si lo pides. Se pregunta a Have I Been Pwned sin mandar ninguna contraseña: de cada una
            viajan solo los cinco primeros caracteres de su huella SHA-1, y la comparación se hace aquí.
          </p>
          <p className="small subtle">
            {inf.filtradasRevisadasEn ? `Última comprobación: ${haceCuanto(inf.filtradasRevisadasEn)}.` : 'Nunca se ha comprobado.'}
          </p>
        </div>
        <button className="btn primary" disabled={progreso != null} onClick={() => void comprobar()}>
          {progreso ? (progreso.total ? `Comprobando… ${progreso.hechas} de ${progreso.total}` : 'Comprobando…') : 'Comprobar ahora'}
        </button>
      </div>

      {inf.grupos.length === 0 && inf.revisados > 0 && (
        <div className="card">
          <div className="empty">
            <div className="empty-icon" style={{ color: 'var(--positive)' }}>
              <ShieldCheck size={24} />
            </div>
            <h3>Ningún problema</h3>
            <p>Ni contraseñas débiles ni repetidas, ni webs sin cifrar, ni nada a punto de caducar.</p>
          </div>
        </div>
      )}

      {inf.grupos.map((g) => {
        const a = ALERTAS[g.tipo]
        return (
          <section key={g.tipo} id={`alerta-${g.tipo}`} className="card flush">
            <div className="card-header">
              <span className={`icono-alerta tono-${a.tono}`}>{a.icono}</span>
              <div className="col" style={{ gap: 2, marginRight: 'auto' }}>
                <h3>
                  {a.titulo} <span className="subtle tabular">· {g.elementos.length}</span>
                </h3>
                <span className="small muted">{a.explicacion}</span>
              </div>
            </div>
            {g.elementos.map((e, i) => (
              <button
                key={`${e.id}-${i}`}
                className={`fila-alerta${g.tipo === 'repetida' && i > 0 && g.elementos[i - 1].grupo !== e.grupo ? ' nuevo-grupo' : ''}`}
                onClick={() => abrir(e.id)}
              >
                <Avatar titulo={e.titulo} categoria={e.categoria} webs={e.webs} />
                <span className="fila-textos">
                  <span className="fila-titulo truncate">{e.titulo}</span>
                  <span className="fila-sub truncate">{e.subtitulo || ' '}</span>
                </span>
                {e.nota && (
                  <span className={`small nota-alerta tono-${a.tono}`}>
                    <CircleAlert size={13} /> {e.nota}
                  </span>
                )}
              </button>
            ))}
          </section>
        )
      })}
    </div>
  )
}
