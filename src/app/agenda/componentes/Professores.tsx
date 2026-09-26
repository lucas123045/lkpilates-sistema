'use client'

import { DESCRICAO_ORIGEM_PROFESSOR, iniciais } from '@/lib/agenda/regras'
import type { OrigemProfessor, Professor } from '@/lib/agenda/tipos'
import { SEM_PROFESSOR } from '../util'

const COR_SEM_PROFESSOR = '#98a2b3'

export function corProfessor(p: Professor | null | undefined) {
  return p?.cor ?? COR_SEM_PROFESSOR
}

/** Fundo bem suave derivado da cor do professor (hex + alfa). */
export function fundoSuave(cor: string) {
  return /^#[0-9a-f]{6}$/i.test(cor) ? `${cor}12` : 'transparent'
}

export function AvatarProfessor({
  professor,
  origem,
  pequeno
}: {
  professor: Professor | null | undefined
  origem?: OrigemProfessor | null
  pequeno?: boolean
}) {
  const titulo = professor
    ? `${professor.nome}${origem ? ` — ${DESCRICAO_ORIGEM_PROFESSOR[origem]}` : ''}`
    : 'Sem professor definido'
  return (
    <span className={`ag-avatar${pequeno ? ' pequeno' : ''}`} style={{ background: corProfessor(professor) }} title={titulo}>
      {professor ? iniciais(professor.nome) : '—'}
    </span>
  )
}

/** Nome + iniciais + de onde veio o professor (nunca depende so da cor). */
export function EtiquetaProfessor({ professor, origem }: { professor: Professor | null | undefined; origem?: OrigemProfessor | null }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <AvatarProfessor professor={professor} origem={origem} pequeno />
      <span>
        {professor?.nome ?? 'Sem professor'}
        {origem === 'dia' && <em style={{ color: '#b4480b', fontStyle: 'normal' }}> · só hoje</em>}
        {origem === 'aluno' && <span style={{ color: 'var(--ink-400)' }}> · do aluno</span>}
      </span>
    </span>
  )
}

/** Legenda de cores que tambem funciona como filtro (clique para mostrar so um ou mais). */
export function LegendaProfessores({
  professores,
  selecionados,
  onAlternar,
  onLimpar
}: {
  professores: Professor[]
  selecionados: string[]
  onAlternar: (id: string) => void
  onLimpar: () => void
}) {
  const ativos = professores.filter(p => p.ativo)
  if (!ativos.length) return null

  return (
    <div className="ag-legenda" role="group" aria-label="Filtrar por professor">
      <span className="ag-legenda-titulo">Professores</span>
      {[...ativos, { id: SEM_PROFESSOR, nome: 'Sem professor', cor: COR_SEM_PROFESSOR } as Professor].map(p => {
        const marcado = selecionados.includes(p.id)
        const apagado = selecionados.length > 0 && !marcado
        return (
          <button
            key={p.id}
            className={`ag-prof-chip${marcado ? ' selecionado' : ''}${apagado ? ' inativo' : ''}`}
            onClick={() => onAlternar(p.id)}
            aria-pressed={marcado}
          >
            <span className="ag-avatar pequeno" style={{ background: p.cor }}>
              {p.id === SEM_PROFESSOR ? '—' : iniciais(p.nome)}
            </span>
            {p.nome}
          </button>
        )
      })}
      {selecionados.length > 0 && (
        <button className="btn btn-sec btn-sm" onClick={onLimpar}>
          Mostrar todos
        </button>
      )}
    </div>
  )
}
