import { detectarAnomalias, formatVariacao, variacaoPercentual, variacaoPontos } from './calculos'
import type { RiscoAluno } from './risco'
import type { Aula, Insight, Metricas } from './types'

type Params = {
  atual: Metricas
  anterior: Metricas
  aulasCompletas: Aula[]
  riscos: RiscoAluno[]
  referencia: Date
}

/**
 * Gera os insights automáticos da página. É determinístico (sem chamada a
 * modelo de IA) para nunca inventar números: cada frase aqui é derivada
 * diretamente das métricas já calculadas em calculos.ts/risco.ts.
 */
export function gerarInsights({ atual, anterior, aulasCompletas, riscos, referencia }: Params): Insight[] {
  const insights: Insight[] = []

  const varFrequencia = variacaoPontos(atual.frequencia, anterior.frequencia)
  if (varFrequencia.tipo === 'pontos' && varFrequencia.valor !== null) {
    if (varFrequencia.valor >= 2) {
      insights.push({
        titulo: 'Frequência em alta',
        descricao: `A frequência subiu ${formatVariacao(varFrequencia)} em relação ao período anterior.`,
        categoria: 'tendencia'
      })
    } else if (varFrequencia.valor <= -2) {
      insights.push({
        titulo: 'Frequência em queda',
        descricao: `A frequência caiu ${formatVariacao(varFrequencia)} em relação ao período anterior.`,
        categoria: 'atencao'
      })
    }
  }

  const varFaltas = variacaoPercentual(atual.faltas, anterior.faltas)
  if (varFaltas.tipo === 'percentual' && varFaltas.valor !== null && varFaltas.valor >= 25 && atual.faltas >= 3) {
    insights.push({
      titulo: 'Faltas cresceram no período',
      descricao: `O número de faltas subiu ${formatVariacao(varFaltas)} em relação ao período anterior (${anterior.faltas} → ${atual.faltas}).`,
      categoria: 'atencao'
    })
  }

  insights.push(...detectarAnomalias(aulasCompletas, referencia))

  const altoRisco = riscos.filter(r => r.nivel === 'alto')
  if (altoRisco.length > 0) {
    insights.push({
      titulo: `${altoRisco.length} aluno${altoRisco.length > 1 ? 's' : ''} em alto risco de cancelamento`,
      descricao: 'Faltas frequentes ou muitos dias sem vir às aulas. Veja a lista de risco para agir.',
      categoria: 'atencao'
    })
  }

  const medioRisco = riscos.filter(r => r.nivel === 'medio')
  if (medioRisco.length >= 3) {
    insights.push({
      titulo: `${medioRisco.length} alunos com frequência irregular`,
      descricao: 'Podem evoluir para risco alto se a frequência não melhorar.',
      categoria: 'oportunidade'
    })
  }

  if (atual.totalAulas > 0 && atual.frequencia !== null) {
    insights.push({
      titulo: 'Resumo do período',
      descricao: `${atual.totalAulas} aula${atual.totalAulas === 1 ? '' : 's'} registrada${atual.totalAulas === 1 ? '' : 's'}, ${formatVariacao(varFrequencia).includes('sem') ? `frequência de ${atual.frequencia.toFixed(1)}%` : `frequência de ${atual.frequencia.toFixed(1)}% (${formatVariacao(varFrequencia)})`}.`,
      categoria: 'desempenho'
    })
  }

  return insights
}
