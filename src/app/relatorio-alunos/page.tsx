'use client'

import PageHeader from '@/app/components/shell/PageHeader'
import RelatoriosAlunos from '../relatorios/RelatoriosAlunos'

/** Relatorio de alunos: tela principal do dia a dia (presenca, pacote, historico, PDF). */
export default function RelatorioAlunosPage() {
  return (
    <>
      <PageHeader trilha={[{ rotulo: 'Relatório de alunos' }]} />
      <div className="ph-corpo">
        <div className="painel relatorio-alunos">
          <RelatoriosAlunos />
        </div>
      </div>
    </>
  )
}
