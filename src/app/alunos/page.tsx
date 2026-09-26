'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CalendarClock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { frequenciaDoPlano } from '@/lib/agenda/regras'
import { buscarAlunos, marcarExperimentalConvertido } from '@/lib/agenda/servico'
import type { AlunoResumo } from '@/lib/agenda/tipos'

export default function AlunosPage() {
  return (
    <Suspense fallback={null}>
      <Alunos />
    </Suspense>
  )
}

function Alunos() {
  const params = useSearchParams()
  const experimentalId = params.get('experimental')

  const [nome, setNome] = useState(params.get('nome') ?? '')
  const [telefone, setTelefone] = useState(params.get('telefone') ?? '')
  const [plano, setPlano] = useState('')
  const [frequencia, setFrequencia] = useState<number | ''>('')
  const [total, setTotal] = useState<number>(0)
  const [valor, setValor] = useState<number>(0)
  const [pagouEm, setPagouEm] = useState('')
  const [salvo, setSalvo] = useState<{ id: string; nome: string } | null>(null)

  /* ================== SALVAR ================== */

  async function salvar() {
    if (!nome || !plano || total <= 0) {
      alert('Preencha todos os campos obrigatórios')
      return
    }

    const { data, error } = await supabase
      .from('alunos')
      .insert({
        nome,
        plano,
        total_aulas: total,
        aulas_restantes: total,
        valor_plano: valor,
        pagou_em: pagouEm || null,
        telefone: telefone || null,
        frequencia_semanal: frequencia === '' ? frequenciaDoPlano(plano) : frequencia,
        ativo: true
      })
      .select('id, nome')
      .single()

    if (error) {
      console.error(error)
      alert('Erro ao cadastrar aluno')
      return
    }

    // Aula experimental convertida: registra a conversao (taxa de conversao nos relatorios)
    if (experimentalId) {
      try {
        await marcarExperimentalConvertido(Number(experimentalId), data.id)
      } catch (e) {
        console.error(e)
      }
    }

    setSalvo(data)

    // limpar formulário
    setNome('')
    setTelefone('')
    setPlano('')
    setFrequencia('')
    setTotal(0)
    setValor(0)
    setPagouEm('')
  }

  /* ================== JSX ================== */

  return (
    <div className="form-container">
      <img
        src="/logo-lk-pilates.png"
        alt="LK Pilates"
        className="form-logo"
      />

      <h1 className="form-title">Cadastro de Alunos</h1>
      <p className="form-subtitle">
        {experimentalId
          ? 'Convertendo aula experimental em aluno'
          : 'Preencha os dados do aluno para iniciar o plano'}
      </p>

      {salvo && (
        <div className="form-card" style={{ marginBottom: 16, textAlign: 'center' }}>
          <p style={{ marginBottom: 10 }}>
            <b>{salvo.nome}</b> cadastrado com sucesso.
          </p>
          <Link href={`/alunos/${salvo.id}`} className="btn btn-veio" style={{ textDecoration: 'none' }}>
            <CalendarClock size={15} /> Definir horários fixos
          </Link>
        </div>
      )}

      <div className="form-card">
        <input
          className="input"
          placeholder="Nome do aluno"
          value={nome}
          onChange={e => setNome(e.target.value)}
        />

        <input
          className="input"
          placeholder="Telefone / WhatsApp"
          inputMode="tel"
          value={telefone}
          onChange={e => setTelefone(e.target.value)}
        />

        <input
          className="input"
          placeholder="Plano (ex: mensal, semestral)"
          value={plano}
          onChange={e => setPlano(e.target.value)}
        />

        <input
          className="input"
          type="number"
          min={1}
          max={7}
          placeholder={`Aulas por semana${frequenciaDoPlano(plano) ? ` (do plano: ${frequenciaDoPlano(plano)}x)` : ''}`}
          value={frequencia}
          onChange={e => setFrequencia(e.target.value === '' ? '' : Number(e.target.value))}
        />

        <input
          className="input"
          type="number"
          placeholder="Total de aulas"
          value={total || ''}
          onChange={e => setTotal(Number(e.target.value))}
        />

        <input
          className="input"
          type="number"
          placeholder="Valor do plano (R$)"
          value={valor || ''}
          onChange={e => setValor(Number(e.target.value))}
        />

        <label className="label">Pagou em:</label>
        <input
          className="input"
          placeholder="Ex: 2x em julho, Pix dia 05"
          value={pagouEm}
          onChange={e => setPagouEm(e.target.value)}
        />

        <button
          className="btn-primary"
          onClick={salvar}
          style={{ marginTop: 20 }}
        >
          Salvar aluno
        </button>
      </div>

      <AlunosCadastrados />
    </div>
  )
}

/* ================== ALUNOS CADASTRADOS ================== */

function AlunosCadastrados() {
  const [busca, setBusca] = useState('')
  const [alunos, setAlunos] = useState<AlunoResumo[]>([])

  useEffect(() => {
    const t = setTimeout(() => {
      buscarAlunos(busca).then(setAlunos).catch(console.error)
    }, 250)
    return () => clearTimeout(t)
  }, [busca])

  return (
    <div className="form-card" style={{ marginTop: 24 }}>
      <h2 style={{ marginBottom: 4 }}>Horários fixos e agenda</h2>
      <p style={{ fontSize: 13.5, marginBottom: 10 }}>Escolha um aluno para ver ou alterar os horários fixos, créditos e histórico.</p>
      <input
        className="input"
        placeholder="Pesquisar aluno..."
        value={busca}
        onChange={e => setBusca(e.target.value)}
      />
      {alunos.map(a => (
        <Link
          key={a.id}
          href={`/alunos/${a.id}`}
          style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 2px', borderBottom: '1px solid var(--line)', textDecoration: 'none' }}
        >
          <span>{a.nome}</span>
          <span style={{ color: 'var(--ink-500)', fontSize: 13 }}>{a.ativo ? a.plano : 'inativo'}</span>
        </Link>
      ))}
    </div>
  )
}
