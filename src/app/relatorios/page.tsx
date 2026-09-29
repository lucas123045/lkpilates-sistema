'use client'

import { useState } from 'react'
import PageHeader from '@/app/components/shell/PageHeader'
import RelatoriosAlunos from './RelatoriosAlunos'
import RelatoriosGestao from './RelatoriosGestao'
import '@/app/components/ui/ui.css'

export default function RelatoriosPage() {
  const [aba, setAba] = useState<'gestao' | 'alunos'>('gestao')
  return (
    <>
      <PageHeader trilha={[{ rotulo: 'Relatórios' }, { rotulo: aba === 'gestao' ? 'Gestão' : 'Alunos' }]} />
      <div className="ph-corpo">
        <div className="painel" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="ui-segmentos">
            <button className={aba === 'gestao' ? 'ativo' : ''} onClick={() => setAba('gestao')}>Gestão do estúdio</button>
            <button className={aba === 'alunos' ? 'ativo' : ''} onClick={() => setAba('alunos')}>Alunos e aulas</button>
          </div>
          <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>
            {aba === 'gestao' ? 'Receita, despesas, saldo, profissionais, planos e faltas' : 'Histórico, PDF e backup por aluno'}
          </span>
        </div>
        {aba === 'gestao' ? <RelatoriosGestao /> : <RelatoriosAlunos />}
      </div>
    </>
  )
}
