export type StatusAgendamento =
  | 'agendado'
  | 'presente'
  | 'falta'
  | 'falta_justificada'
  | 'desmarcado'
  | 'cancelado_estudio'

export type TipoAgendamento = 'fixo' | 'aula' | 'reposicao' | 'experimental' | 'avulsa'

export type OrigemProfessor = 'dia' | 'aluno' | 'horario'

export type Professor = {
  id: string
  nome: string
  telefone: string | null
  cor: string
  ativo: boolean
}

export type Modalidade = {
  id: string
  nome: string
  capacidade_padrao: number
  ativo: boolean
}

/** Turma recorrente da grade. dia_semana: 1 = segunda ... 7 = domingo. */
export type Horario = {
  id: string
  dia_semana: number
  hora_inicio: string
  duracao_min: number
  professor_id: string | null
  modalidade_id: string | null
  capacidade: number
  ativo: boolean
  vigente_desde: string
  vigente_ate: string | null
  observacao: string | null
  /** 'manual' | 'conversao' | 'aula_unica' */
  origem?: string
}

export type AlunoResumo = {
  id: string
  nome: string
  ativo: boolean
  plano: string | null
  frequencia_semanal: number | null
  aulas_restantes: number
  telefone: string | null
  professor_id?: string | null
  vencimento?: string | null
}

export type Agendamento = {
  /** uuid no banco */
  id: string
  aluno_id: string | null
  horario_id: string | null
  data: string
  hora: string
  duracao_min: number
  tipo: TipoAgendamento
  status: StatusAgendamento
  professor_id: string | null
  professor_origem: OrigemProfessor | null
  experimental_nome: string | null
  experimental_telefone: string | null
  aluno_convertido_id: string | null
  observacao: string | null
  encaixe: boolean
  aula_id: number | null
  credito_usado_id: string | null
  cancelamento_motivo: string | null
  remarcado_de_id: string | null
  recorrencia_id?: string | null
  servico_id?: string | null
  cor?: string | null
  excecao?: boolean
  excluida?: boolean
  aluno?: AlunoResumo | null
}

export type Bloqueio = {
  id: string
  data: string
  data_fim: string | null
  horario_id: string | null
  motivo: string
}

export type Credito = {
  id: string
  aluno_id: string
  agendamento_origem_id: string | null
  agendamento_destino_id: string | null
  criado_em: string
  expira_em: string
  usado_em: string | null
  cancelado_em: string | null
}

export type ItemListaEspera = {
  id: string
  aluno_id: string
  horario_id: string
  data: string | null
  observacao: string | null
  created_at: string
  aluno?: { id: string; nome: string } | null
}

export type HorarioFixo = {
  id: number | string
  aluno_id: string
  horario_id: string | null
  dia_semana: string | null
  horario: string | null
  data_inicio: string | null
  data_fim: string | null
  professor_id: string | null
}

export type ConfiguracaoEstudio = {
  hora_abertura: string
  hora_fechamento: string
  dias_funcionamento: number[]
  duracao_padrao_min: number
  antecedencia_desmarcacao_horas: number
  validade_credito_dias: number
  limite_reposicoes_mes: number | null
}

export type VerificacaoAgendamento = {
  capacidade: number
  ocupados: number
  vagas: number
  lotado: boolean
  bloqueio: string | null
  dia_invalido: boolean
  conflito: boolean
  ja_agendado: boolean
  aluno_inativo: boolean
  aulas_na_semana: number
  frequencia_semanal: number | null
  excede_plano: boolean
  aulas_restantes: number | null
  reposicoes_no_mes: number
  limite_reposicoes_mes: number | null
  creditos: { id: string; expira_em: string }[]
  lista_espera: number
}

export type ResultadoDesmarcacao = {
  status: StatusAgendamento
  dentro_prazo: boolean
  horas_antecedencia: number
  credito_id: string | null
  lista_espera: number
}

/** Dados de um periodo (dia ou semana) carregados de uma vez. */
export type DadosPeriodo = {
  inicio: string
  fim: string
  horarios: Horario[]
  agendamentos: Agendamento[]
  professores: Professor[]
  modalidades: Modalidade[]
  bloqueios: Bloqueio[]
  listaEspera: ItemListaEspera[]
  configuracao: ConfiguracaoEstudio
  creditosAtivos: number
}
