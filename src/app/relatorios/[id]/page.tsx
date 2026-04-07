'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'

type Aula = {
  id: number
  data: string
  status: 'veio' | 'faltou'
}

type Aluno = {
  id: string
  nome: string
  plano: string
  total_aulas: number
  aulas_restantes: number
  valor_plano: number
  pagou_em: string | null
  aulas: Aula[]
}

function formatarDataBR(data: string) {
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}/${ano}`
}

export default function RelatorioCompleto() {
  const { id } = useParams()
  const router = useRouter()

  const [aluno, setAluno] = useState<Aluno | null>(null)

  async function carregarAluno() {
    const { data, error } = await supabase
      .from('alunos')
      .select(`
        id,
        nome,
        plano,
        total_aulas,
        aulas_restantes,
        valor_plano,
        pagou_em,
        aulas (
          id,
          data,
          status
        )
      `)
      .eq('id', id)
      .single()

    if (!error && data) {
      const aulasOrdenadas = [...(data.aulas || [])].sort(
        (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime()
      )

      setAluno({ ...data, aulas: aulasOrdenadas })
    }
  }

  useEffect(() => {
    carregarAluno()
  }, [])

  if (!aluno) return <p style={{ padding: 40 }}>Carregando...</p>

  return (
    <div className="container">
      <button className="btn btn-sec" onClick={() => router.back()}>
        ← Voltar
      </button>

      <h1 style={{ marginTop: 20 }}>Relatório Completo</h1>

      <div className="card" style={{ marginTop: 20 }}>
        <strong>{aluno.nome}</strong>

        <p><b>Plano:</b> {aluno.plano}</p>
        <p><b>Aulas:</b> {aluno.aulas_restantes} / {aluno.total_aulas}</p>
        <p><b>Valor:</b> R$ {aluno.valor_plano}</p>
        <p><b>Pagamento:</b> {aluno.pagou_em || '—'}</p>

        {/* DATAS ORGANIZADAS */}
        <h3 style={{ marginTop: 20 }}>Histórico de Aulas</h3>

       <div
  style={{
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '12px',
    maxWidth: '100%',
    overflow: 'hidden'
  }}
>
 {aluno.aulas.map(aula => (
  <span
    key={aula.id}
    style={{
      padding: '6px 10px',
      borderRadius: '999px',
      fontSize: '13px',
      whiteSpace: 'nowrap',
      maxWidth: '100%',
      backgroundColor:
        aula.status === 'veio'
          ? '#d1fae5' // verde
          : aula.status === 'faltou'
          ? '#fee2e2' // vermelho
          : aula.status === 'reposicao'
          ? '#FFD700' //  amarelo
          : aula.status === 'reinicio'
          ? '#ccc' // cinza
          : '#eee',
      color:
        aula.status === 'veio'
          ? '#065f46'
          : aula.status === 'faltou'
          ? '#991b1b'
          : aula.status === 'reposicao'
          ? '#000'
          : aula.status === 'reinicio'
          ? '#555'
          : '#000'
    }}
    >
      {formatarDataBR(aula.data)}
    </span>
  ))}
</div>

      </div>
    </div>
  )
}
