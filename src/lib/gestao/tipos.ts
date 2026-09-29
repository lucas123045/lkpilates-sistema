import type { Modalidade, Professor } from '../agenda/tipos'

export type FuncaoProfissional = 'administrador' | 'nivel2'

export type Profissional = Professor & {
  funcao: FuncaoProfissional
  data_nascimento: string | null
  email: string | null
}

/** Tipo de servico (tabela modalidades). */
export type Servico = Modalidade & {
  duracao_padrao_min: number
  cor: string
}

export type Periodicidade = 'mensal' | 'bimestral' | 'trimestral' | 'quadrimestral' | 'semestral' | 'anual' | 'avulso'

export type Plano = {
  id: string
  nome: string
  periodicidade: Periodicidade
  meses: number
  aulas_semana: number | null
  preco_mensal: number
  ativo: boolean
}

export type Cliente = {
  id: string
  nome: string
  ativo: boolean
  created_at: string
  plano: string | null
  plano_id: string | null
  vencimento: string | null
  data_nascimento: string | null
  etiquetas: string[]
  observacoes: string | null
  telefone: string | null
  professor_id: string | null
  frequencia_semanal: number | null
  total_aulas: number
  aulas_restantes: number
  valor_plano: number | null
  pagou_em: string | null
}

export type FormaPagamento = 'pix' | 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'transferencia'

export type Pagamento = {
  id: string
  data: string
  valor: number
  forma: FormaPagamento
  aluno_id: string | null
  profissional_id: string | null
  servico_id: string | null
  descricao: string | null
  meses_vencimento: number
  vencimento_anterior: string | null
  vencimento_novo: string | null
}

export type CategoriaDespesa = 'aluguel' | 'energia' | 'equipamentos' | 'comissoes' | 'outros'

export type Despesa = {
  id: string
  data: string
  valor: number
  categoria: CategoriaDespesa
  descricao: string | null
  recorrente: boolean
  frequencia: 'mensal' | null
}

export type Empresa = {
  nome: string
  telefone: string | null
  endereco: string | null
  documento: string | null
  avisos_whatsapp: boolean
  avisos_email: boolean
  avisos_dias_antes: number
}
