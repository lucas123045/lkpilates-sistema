'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { dataLocalISO, registrarAula, type StatusAula } from '@/lib/aulas'

type Aluno = {
  id: string
  nome: string
  plano: string
  aulas_restantes: number
}

export default function Aulas() {
  const [busca, setBusca] = useState('')
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [salvando, setSalvando] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState('')

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

  async function marcarPresenca(alunoId: string, status: StatusAula) {
    if (salvando) return
    setSalvando(alunoId)
    setMensagem('')

    try {
      await registrarAula(alunoId, status, dataLocalISO())
      setMensagem('Aula registrada com sucesso.')
      await carregarAlunos()
    } catch (error) {
      setMensagem(error instanceof Error ? error.message : 'Nao foi possivel salvar a aula.')
    } finally {
      setSalvando(null)
    }
  }

  return (
    <div className="container">
      <h1 className="titulo">Aulas do Dia</h1>
      {mensagem && <p role="status">{mensagem}</p>}

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
                disabled={salvando === aluno.id}
                onClick={() => marcarPresenca(aluno.id, 'veio')}
              >
                ✅ Veio
              </button>

              <button
                className="btn btn-faltou"
                disabled={salvando === aluno.id}
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
