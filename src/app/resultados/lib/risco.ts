import { aulasValidas, isFalta, isPresente, parseDataLocal } from './calculos'
import type { Aluno } from './types'

export type NivelRisco = 'alto' | 'medio' | 'baixo'

export type RiscoAluno = {
  id: string
  nome: string
  nivel: NivelRisco
  score: number
  faltas: number
  presencas: number
  diasSemVir: number | null
  motivo: string
  sugestao: string
}

/**
 * Score de risco de cancelamento nos últimos `janelaDias` dias.
 * Combina 3 sinais reais: quantidade de faltas, frequência baixa e tempo
 * sem aparecer. Não usa nenhum dado fora do histórico de aulas do aluno.
 */
export function calcularRiscoAluno(aluno: Aluno, janelaDias = 30, hoje = new Date()): RiscoAluno {
  const limite = new Date(hoje)
  limite.setDate(limite.getDate() - janelaDias)

  const aulas = aulasValidas(aluno.aulas).filter(a => {
    const d = parseDataLocal(a.data)
    return d !== null && d >= limite && d <= hoje
  })

  const faltas = aulas.filter(a => isFalta(a.status)).length
  const presencas = aulas.filter(a => isPresente(a.status)).length
  const total = faltas + presencas
  const freq = total > 0 ? presencas / total : null

  const datasOrdenadas = aulas
    .map(a => parseDataLocal(a.data))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())

  const ultimaAula = datasOrdenadas[0] || null
  const diasSemVir = ultimaAula
    ? Math.floor((hoje.getTime() - ultimaAula.getTime()) / (1000 * 60 * 60 * 24))
    : null

  const score =
    faltas * 2 +
    (freq !== null ? (1 - freq) * 10 : 0) +
    (diasSemVir !== null && diasSemVir > 10 ? 5 : 0) +
    (diasSemVir === null && aluno.ativo ? 6 : 0)

  let nivel: NivelRisco = 'baixo'
  let motivo = 'Frequência saudável'
  let sugestao = 'Manter relacionamento'

  if (score > 15) {
    nivel = 'alto'
    if (diasSemVir === null) {
      motivo = 'Nenhuma aula registrada no período'
      sugestao = 'Confirmar se o aluno continua ativo'
    } else if (diasSemVir > 10) {
      motivo = `Não vem há ${diasSemVir} dias`
      sugestao = 'Chamar no WhatsApp'
    } else if (faltas > presencas) {
      motivo = 'Mais faltas que presenças'
      sugestao = 'Reavaliar plano com o aluno'
    } else {
      motivo = 'Queda de frequência'
      sugestao = 'Oferecer incentivo ou reposição'
    }
  } else if (score > 8) {
    nivel = 'medio'
    if (freq !== null && freq < 0.6) {
      motivo = 'Baixo engajamento'
      sugestao = 'Acompanhar nas próximas semanas'
    } else {
      motivo = 'Oscilação de frequência'
      sugestao = 'Oferecer reposição'
    }
  }

  return {
    id: aluno.id,
    nome: aluno.nome,
    nivel,
    score: Math.round(score),
    faltas,
    presencas,
    diasSemVir,
    motivo,
    sugestao
  }
}

export function calcularRiscoTodos(alunos: Aluno[], janelaDias = 30, hoje = new Date()): RiscoAluno[] {
  return alunos
    .filter(a => a.ativo)
    .map(a => calcularRiscoAluno(a, janelaDias, hoje))
    .sort((a, b) => b.score - a.score)
}
