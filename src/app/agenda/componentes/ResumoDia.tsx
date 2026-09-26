'use client'

import type { ResumoDia as Resumo } from '@/lib/agenda/regras'

export default function ResumoDia({ resumo, creditosAtivos }: { resumo: Resumo; creditosAtivos: number }) {
  const itens: [string, React.ReactNode][] = [
    ['Aulas', resumo.totalAulas],
    [
      'Ocupação',
      <>
        {resumo.ocupacaoPct === null ? '—' : `${resumo.ocupacaoPct}%`}
        <small>
          {resumo.ocupados}/{resumo.capacidadeTotal}
        </small>
      </>
    ],
    ['Presenças', resumo.presencas],
    [
      'Faltas',
      <>
        {resumo.faltas}
        {resumo.faltasJustificadas > 0 && <small>+{resumo.faltasJustificadas} just.</small>}
      </>
    ],
    ['Experimentais', resumo.experimentais],
    ['Vagas livres', resumo.vagasLivres],
    ['Reposições pendentes', creditosAtivos]
  ]

  return (
    <div className="ag-resumo">
      {itens.map(([rotulo, valor]) => (
        <div key={rotulo} className="ag-kpi" title={rotulo === 'Reposições pendentes' ? 'Créditos de reposição ativos no estúdio' : undefined}>
          <span>{rotulo}</span>
          <strong>{valor}</strong>
        </div>
      ))}
    </div>
  )
}
