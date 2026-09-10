export type StatusAula = 'veio' | 'faltou' | 'reposicao' | 'reinicio' | string

export type Aula = {
  id: number
  data: string
  status: StatusAula
  deleted_at?: string | null
}

export type Aluno = {
  id: string
  nome: string
  ativo: boolean
  plano: string
  total_aulas: number
  aulas_restantes: number
  valor_plano: number
  pagou_em: string | null
  aulas: Aula[]
}

export type PeriodoPreset =
  | 'hoje'
  | '7d'
  | '30d'
  | 'mes_atual'
  | 'mes_passado'
  | '3m'
  | 'ano'
  | 'personalizado'

export type PeriodoRange = {
  inicio: Date
  fim: Date
  label: string
}

export type Metricas = {
  totalAulas: number
  presencas: number
  faltas: number
  reposicoes: number
  /** 0-100, ou null quando não há presenças nem faltas para calcular */
  frequencia: number | null
}

export type Variacao = {
  tipo: 'percentual' | 'pontos' | 'indisponivel'
  valor: number | null
}

export type Insight = {
  titulo: string
  descricao: string
  categoria: 'tendencia' | 'atencao' | 'desempenho' | 'oportunidade'
}
