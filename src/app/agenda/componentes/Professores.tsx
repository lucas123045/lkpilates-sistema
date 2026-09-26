'use client'

import { DESCRICAO_ORIGEM_PROFESSOR, iniciais } from '@/lib/agenda/regras'
import type { OrigemProfessor, Professor } from '@/lib/agenda/tipos'

const COR_SEM_PROFESSOR = '#98a2b3'

export function corProfessor(p: Professor | null | undefined) {
  return p?.cor ?? COR_SEM_PROFESSOR
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
