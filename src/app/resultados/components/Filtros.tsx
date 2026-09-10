'use client'

import type { PeriodoPreset } from '../lib/types'
import styles from '../resultados.module.css'

const PRESETS: { valor: PeriodoPreset; label: string }[] = [
  { valor: 'hoje', label: 'Hoje' },
  { valor: '7d', label: '7 dias' },
  { valor: '30d', label: '30 dias' },
  { valor: 'mes_atual', label: 'Este mês' },
  { valor: 'mes_passado', label: 'Mês passado' },
  { valor: '3m', label: '3 meses' },
  { valor: 'ano', label: 'Este ano' },
  { valor: 'personalizado', label: 'Personalizado' }
]

export type StatusFiltro = 'todos' | 'veio' | 'faltou' | 'reposicao'

type Props = {
  periodo: PeriodoPreset
  onPeriodoChange: (p: PeriodoPreset) => void
  customInicio: string
  customFim: string
  onCustomInicioChange: (v: string) => void
  onCustomFimChange: (v: string) => void
  alunoId: string
  onAlunoChange: (id: string) => void
  alunos: { id: string; nome: string }[]
  statusFiltro: StatusFiltro
  onStatusChange: (s: StatusFiltro) => void
}

export default function Filtros({
  periodo,
  onPeriodoChange,
  customInicio,
  customFim,
  onCustomInicioChange,
  onCustomFimChange,
  alunoId,
  onAlunoChange,
  alunos,
  statusFiltro,
  onStatusChange
}: Props) {
  return (
    <div className={styles.filtros}>
      <span className={styles.filtroLabel}>Período</span>
      <div className={styles.filtroGrupo}>
        {PRESETS.map(p => (
          <button
            key={p.valor}
            className={`${styles.chip} ${periodo === p.valor ? styles.chipAtivo : ''}`}
            onClick={() => onPeriodoChange(p.valor)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {periodo === 'personalizado' && (
        <>
          <input
            type="date"
            className={styles.dateInput}
            value={customInicio}
            onChange={e => onCustomInicioChange(e.target.value)}
          />
          <span style={{ color: '#98a2b3' }}>até</span>
          <input
            type="date"
            className={styles.dateInput}
            value={customFim}
            onChange={e => onCustomFimChange(e.target.value)}
          />
        </>
      )}

      <div className={styles.divider} />

      <span className={styles.filtroLabel}>Aluno</span>
      <select className={styles.select} value={alunoId} onChange={e => onAlunoChange(e.target.value)}>
        <option value="todos">Todos os alunos</option>
        {alunos.map(a => (
          <option key={a.id} value={a.id}>
            {a.nome}
          </option>
        ))}
      </select>

      <div className={styles.divider} />

      <span className={styles.filtroLabel}>Status</span>
      <select
        className={styles.select}
        value={statusFiltro}
        onChange={e => onStatusChange(e.target.value as StatusFiltro)}
      >
        <option value="todos">Todos</option>
        <option value="veio">Presenças</option>
        <option value="faltou">Faltas</option>
        <option value="reposicao">Reposições</option>
      </select>
    </div>
  )
}
