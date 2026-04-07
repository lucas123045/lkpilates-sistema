'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Alunos() {
  const [nome, setNome] = useState('')
  const [plano, setPlano] = useState('')
  const [total, setTotal] = useState<number>(0)
  const [valor, setValor] = useState<number>(0)
  const [pagouEm, setPagouEm] = useState('')

  /* ================== SALVAR ================== */

  async function salvar() {
    if (!nome || !plano || total <= 0) {
      alert('Preencha todos os campos obrigatórios')
      return
    }

    const { error } = await supabase
      .from('alunos')
      .insert({
        nome,
        plano,
        total_aulas: total,
        aulas_restantes: total,
        valor_plano: valor,
        pagou_em: pagouEm || null,
        ativo: true
      })

    if (error) {
      console.error(error)
      alert('Erro ao cadastrar aluno')
      return
    }

    alert('Aluno cadastrado com sucesso')

    // limpar formulário
    setNome('')
    setPlano('')
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
        Preencha os dados do aluno para iniciar o plano
      </p>

      <div className="form-card">
        <input
          className="input"
          placeholder="Nome do aluno"
          value={nome}
          onChange={e => setNome(e.target.value)}
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
    </div>
  )
}