'use client'

import { useEffect, useState } from 'react'
import { buscarAlunos } from '@/lib/agenda/servico'
import type { AlunoResumo } from '@/lib/agenda/tipos'

function useAlunosBusca(termo: string, apenasAtivos = false) {
  const [alunos, setAlunos] = useState<AlunoResumo[]>([])
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    if (termo.trim().length < 2) {
      setAlunos([])
      return
    }
    let vivo = true
    setCarregando(true)
    const t = setTimeout(async () => {
      try {
        const r = await buscarAlunos(termo, apenasAtivos)
        if (vivo) setAlunos(r)
      } finally {
        if (vivo) setCarregando(false)
      }
    }, 250)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [termo, apenasAtivos])

  return { alunos, carregando }
}

/** Campo de busca de aluno para formularios. */
export function SeletorAluno({
  selecionado,
  onSelecionar
}: {
  selecionado: AlunoResumo | null
  onSelecionar: (a: AlunoResumo | null) => void
}) {
  const [termo, setTermo] = useState('')
  const { alunos, carregando } = useAlunosBusca(termo)

  if (selecionado) {
    return (
      <div className="ui-alerta ui-alerta-info" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span>
          <strong>{selecionado.nome}</strong>
          {selecionado.plano ? ` · ${selecionado.plano}` : ''}
          {!selecionado.ativo && ' · inativo'}
        </span>
        <button className="btn btn-sec btn-sm" onClick={() => onSelecionar(null)}>
          Trocar
        </button>
      </div>
    )
  }

  return (
    <div className="ui-campo">
      <input className="input" placeholder="Digite o nome do aluno..." value={termo} onChange={e => setTermo(e.target.value)} autoFocus />
      {termo.trim().length >= 2 && (
        <div className="ui-lista-opcoes" style={{ marginTop: 6 }}>
          {carregando && <div style={{ padding: 10, color: 'var(--ink-500)' }}>Buscando...</div>}
          {!carregando && !alunos.length && <div style={{ padding: 10, color: 'var(--ink-500)' }}>Nenhum aluno encontrado.</div>}
          {alunos.map(a => (
            <button key={a.id} onClick={() => onSelecionar(a)}>
              <span>{a.nome}</span>
              <span className={`ui-chip ${a.ativo ? '' : 'ui-chip-vermelho'}`}>{a.ativo ? a.plano || 'sem plano' : 'inativo'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
