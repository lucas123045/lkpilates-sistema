'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Aluno = {
  id: string
  nome: string
  plano: string
  aulas_restantes: number
}

export default function Aulas() {
  const [busca, setBusca] = useState('')
  const [alunos, setAlunos] = useState<Aluno[]>([])

  const alunosFiltrados = alunos.filter(aluno =>
    aluno.nome.toLowerCase().includes(busca.toLowerCase())
  )

  useEffect(() => {
    carregarAlunos()
  }, [])

  async function carregarAlunos() {
    const { data, error } = await supabase
      .from('alunos')
      .select('id, nome, plano, aulas_restantes')
      .eq('ativo', true)
      .order('nome')

    if (error) {
      alert(error.message)
      return
    }

    setAlunos(data || [])
  }

  async function marcarPresenca(alunoId: string, status: 'veio' | 'faltou') {
    const hoje = new Date().toISOString().split('T')[0]

    const { error } = await supabase.from('aulas').insert({
      aluno_id: alunoId,
      data: hoje,
      status
    })

    if (error) {
      alert(error.message)
      return
    }

    if (status === 'veio') {
      await supabase.rpc('descontar_aula', {
        aluno_id_input: alunoId
      })
    }

    carregarAlunos()
  }

  return (
    <div className="container">
      <h1 className="titulo">Aulas do Dia</h1>

      <input
        className="search"
        type="text"
        placeholder="Pesquisar aluno..."
        value={busca}
        onChange={e => setBusca(e.target.value)}
      />

      {alunosFiltrados.length === 0 && (
        <p className="vazio">Nenhum aluno encontrado.</p>
      )}

      <div className="lista">
        {alunosFiltrados.map(aluno => (
          <div key={aluno.id} className="card">
            <div className="card-header">
              <strong>{aluno.nome}</strong>
              <span className="plano">{aluno.plano}</span>
            </div>

            <p className="restantes">
              Aulas restantes: <b>{aluno.aulas_restantes}</b>
            </p>

            <div className="botoes">
              <button
                className="btn btn-veio"
                onClick={() => marcarPresenca(aluno.id, 'veio')}
              >
                ✅ Veio
              </button>

              <button
                className="btn btn-faltou"
                onClick={() => marcarPresenca(aluno.id, 'faltou')}
              >
                ❌ Faltou
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
