// Acesso a dados dos modulos de gestao (Profissionais, Servicos, Planos,
// Clientes, Financeiro, Empresa). Regras com efeito colateral ficam no banco.

import { supabase } from '../supabase'
import { falhar, rpc } from '../agenda/servico'
import { somenteDigitos } from '../cadastro'
import type { Agendamento, Credito } from '../agenda/tipos'
import type { CategoriaDespesa, Cliente, Despesa, Empresa, FormaPagamento, Pagamento, Plano, Profissional, Servico } from './tipos'

async function lista<T>(q: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>): Promise<T[]> {
  const { data, error } = await q
  if (error) falhar(error)
  return (data ?? []) as T[]
}

async function executar(q: PromiseLike<{ error: { message: string; code?: string } | null }>) {
  const { error } = await q
  if (error) falhar(error)
}

const agora = () => new Date().toISOString()

/* ======================= Profissionais ======================= */

export function listarProfissionais() {
  return lista<Profissional>(supabase.from('professores').select('*').order('nome'))
}

export function salvarProfissional(p: Partial<Profissional> & Pick<Profissional, 'nome' | 'cor' | 'funcao'>) {
  const { id, ...dados } = p
  const d = { ...dados, email: dados.email?.trim() || null, telefone: dados.telefone?.trim() || null, data_nascimento: dados.data_nascimento || null }
  return executar(id ? supabase.from('professores').update({ ...d, updated_at: agora() }).eq('id', id) : supabase.from('professores').insert(d))
}

/* ======================= Tipos de servico ======================= */

export function listarServicos() {
  return lista<Servico>(supabase.from('modalidades').select('*').order('nome'))
}

export function salvarServico(s: Partial<Servico> & Pick<Servico, 'nome' | 'duracao_padrao_min'>) {
  const { id, ...dados } = s
  return executar(id ? supabase.from('modalidades').update(dados).eq('id', id) : supabase.from('modalidades').insert(dados))
}

/* ======================= Planos ======================= */

export function listarPlanos() {
  return lista<Plano>(supabase.from('planos').select('*').order('nome'))
}

export async function clientesPorPlano(): Promise<Record<string, number>> {
  const linhas = await lista<{ plano_id: string | null }>(supabase.from('alunos').select('plano_id').eq('ativo', true).not('plano_id', 'is', null))
  const c: Record<string, number> = {}
  for (const l of linhas) if (l.plano_id) c[l.plano_id] = (c[l.plano_id] ?? 0) + 1
  return c
}

export function salvarPlano(p: Partial<Plano> & Pick<Plano, 'nome' | 'periodicidade' | 'meses' | 'preco_mensal'>) {
  const { id, ...dados } = p
  return executar(id ? supabase.from('planos').update({ ...dados, updated_at: agora() }).eq('id', id) : supabase.from('planos').insert(dados))
}

/* ======================= Clientes ======================= */

// string unica: o supabase-js tipa o resultado a partir do texto do select
const CAMPOS_CLIENTE =
  'id, nome, ativo, created_at, plano, plano_id, vencimento, data_nascimento, etiquetas, observacoes, telefone, professor_id, frequencia_semanal, total_aulas, aulas_restantes, valor_plano, pagou_em, cpf, email, cep, logradouro, numero, complemento, bairro, cidade, uf, profissao, como_conheceu, objetivo, saude, aceite_lgpd_em, cadastrado_por, autocadastro_visto_em'

export function listarClientes() {
  return lista<Cliente>(supabase.from('alunos').select(CAMPOS_CLIENTE).order('nome'))
}

export async function carregarCliente(id: string): Promise<Cliente | null> {
  const { data, error } = await supabase.from('alunos').select(CAMPOS_CLIENTE).eq('id', id).maybeSingle()
  if (error) falhar(error)
  return data as Cliente | null
}

export type DadosCliente = Partial<Omit<Cliente, 'id' | 'created_at' | 'aceite_lgpd_em' | 'cadastrado_por'>> & { nome: string }

const textoOuNulo = (v: string | null | undefined) => v?.trim() || null

function falharCliente(error: { message: string; code?: string }): never {
  if (error.code === '23505' && error.message.includes('cpf')) throw new Error('Já existe um cliente com este CPF.')
  if (error.code === '23514' && error.message.includes('cpf')) throw new Error('CPF inválido: use os 11 números.')
  falhar(error)
}

export async function salvarCliente(id: string | null, c: DadosCliente): Promise<string> {
  const dados = {
    ...c,
    nome: c.nome.trim(),
    telefone: c.telefone?.trim() || null,
    vencimento: c.vencimento || null,
    data_nascimento: c.data_nascimento || null,
    observacoes: c.observacoes?.trim() || null,
    ...('cpf' in c ? { cpf: somenteDigitos(c.cpf) || null } : {}),
    ...('cep' in c ? { cep: somenteDigitos(c.cep) || null } : {}),
    ...('email' in c ? { email: c.email?.trim().toLowerCase() || null } : {}),
    ...Object.fromEntries(
      (['logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'profissao', 'como_conheceu', 'objetivo', 'saude'] as const)
        .filter(k => k in c)
        .map(k => [k, textoOuNulo(c[k])])
    ),
    etiquetas: (c.etiquetas ?? []).map(e => e.trim()).filter(Boolean)
  }
  if (id) {
    const { error } = await supabase.from('alunos').update(dados).eq('id', id)
    if (error) falharCliente(error)
    return id
  }
  const { data, error } = await supabase
    .from('alunos')
    .insert({ total_aulas: 0, aulas_restantes: 0, ativo: true, ...dados })
    .select('id')
    .single()
  if (error) falharCliente(error)
  return data.id as string
}

/** Autocadastros pelo link ainda nao conferidos pelo estudio. */
export async function contarNovosAutocadastros(): Promise<number> {
  const { count, error } = await supabase
    .from('alunos')
    .select('id', { count: 'exact', head: true })
    .eq('cadastrado_por', 'autocadastro')
    .is('autocadastro_visto_em', null)
  if (error) falhar(error)
  return count ?? 0
}

export function marcarAutocadastroVisto(ids: string[]) {
  return executar(supabase.from('alunos').update({ autocadastro_visto_em: agora() }).in('id', ids))
}

export function historicoAulasCliente(id: string, limite = 80) {
  return lista<Agendamento>(
    supabase.from('agenda').select('*').eq('aluno_id', id).eq('excluida', false).order('data', { ascending: false }).order('hora', { ascending: false }).limit(limite)
  )
}

export function pagamentosDoCliente(id: string) {
  return lista<Pagamento>(supabase.from('pagamentos').select('*').eq('aluno_id', id).order('data', { ascending: false }))
}

export function creditosCliente(id: string) {
  return lista<Credito>(supabase.from('creditos_reposicao').select('*').eq('aluno_id', id).order('expira_em', { ascending: false }))
}

/* ======================= Financeiro ======================= */

export type FiltroPeriodo = { inicio?: string; fim?: string }

export function listarPagamentos(f: FiltroPeriodo & { profissionalId?: string; servicoId?: string } = {}) {
  let q = supabase.from('pagamentos').select('*').order('data', { ascending: false }).order('created_at', { ascending: false }).limit(500)
  if (f.inicio) q = q.gte('data', f.inicio)
  if (f.fim) q = q.lte('data', f.fim)
  if (f.profissionalId) q = q.eq('profissional_id', f.profissionalId)
  if (f.servicoId) q = q.eq('servico_id', f.servicoId)
  return lista<Pagamento>(q)
}

export type NovoPagamento = {
  data: string
  valor: number
  forma: FormaPagamento
  alunoId?: string | null
  profissionalId?: string | null
  servicoId?: string | null
  descricao?: string
  avancarMeses?: number
}

export function registrarPagamento(p: NovoPagamento) {
  return rpc<Pagamento>('registrar_pagamento', {
    data_input: p.data,
    valor_input: p.valor,
    forma_input: p.forma,
    aluno_id_input: p.alunoId ?? null,
    profissional_id_input: p.profissionalId ?? null,
    servico_id_input: p.servicoId ?? null,
    descricao_input: p.descricao ?? null,
    avancar_meses_input: p.avancarMeses ?? 0
  })
}

/** Edita os dados do lancamento (nao mexe no vencimento ja avancado). */
export function editarPagamento(id: string, p: Omit<NovoPagamento, 'avancarMeses'>) {
  return executar(
    supabase
      .from('pagamentos')
      .update({
        data: p.data,
        valor: p.valor,
        forma: p.forma,
        aluno_id: p.alunoId ?? null,
        profissional_id: p.profissionalId ?? null,
        servico_id: p.servicoId ?? null,
        descricao: p.descricao?.trim() || null,
        updated_at: agora()
      })
      .eq('id', id)
  )
}

export function excluirPagamento(id: string) {
  return rpc<{ vencimento_devolvido: boolean }>('excluir_pagamento', { pagamento_id_input: id })
}

export function listarDespesas(f: FiltroPeriodo = {}) {
  let q = supabase.from('despesas').select('*').order('data', { ascending: false }).limit(500)
  if (f.inicio) q = q.gte('data', f.inicio)
  if (f.fim) q = q.lte('data', f.fim)
  return lista<Despesa>(q)
}

export type NovaDespesa = { data: string; valor: number; categoria: CategoriaDespesa; descricao?: string; recorrente: boolean }

export function salvarDespesa(id: string | null, d: NovaDespesa) {
  const dados = { ...d, descricao: d.descricao?.trim() || null, frequencia: d.recorrente ? 'mensal' : null }
  return executar(id ? supabase.from('despesas').update({ ...dados, updated_at: agora() }).eq('id', id) : supabase.from('despesas').insert(dados))
}

export function excluirDespesa(id: string) {
  return executar(supabase.from('despesas').delete().eq('id', id))
}

/* ======================= Empresa ======================= */

export async function carregarEmpresa(): Promise<Empresa> {
  const { data, error } = await supabase.from('empresa').select('*').eq('id', 1).single()
  if (error) falhar(error)
  return data as Empresa
}

export function salvarEmpresa(e: Partial<Empresa>) {
  return executar(supabase.from('empresa').update({ ...e, updated_at: agora() }).eq('id', 1))
}

/* ======================= Recorrencias / historico legado ======================= */

export type Recorrencia = {
  id: string
  aluno_id: string | null
  nome_livre: string | null
  dias_semana: number[]
  hora_inicio: string
  hora_fim: string
  profissional_id: string | null
  servico_id: string | null
  cor: string | null
  observacao: string | null
  data_inicio: string
  data_fim: string | null
  ativo: boolean
}

export function recorrenciasDoCliente(id: string) {
  return lista<Recorrencia>(supabase.from('recorrencias').select('*').eq('aluno_id', id).eq('ativo', true).order('data_inicio', { ascending: false }))
}

export function recorrenciasAtivas(hoje: string) {
  return lista<Recorrencia>(supabase.from('recorrencias').select('*').eq('ativo', true).or(`data_fim.is.null,data_fim.gte.${hoje}`))
}

/** Registro de presencas/faltas da tela "Registro de aulas" (tabela aulas). */
export function presencasDoCliente(id: string) {
  return lista<{ id: number; data: string; status: string; tipo: string | null }>(
    supabase.from('aulas').select('id, data, status, tipo').eq('aluno_id', id).is('deleted_at', null).order('data', { ascending: false }).limit(200)
  )
}

export function listarBloqueios() {
  return lista<{ id: string; data: string; data_fim: string | null; horario_id: string | null; motivo: string }>(
    supabase.from('bloqueios').select('*').is('horario_id', null).order('data', { ascending: false }).limit(60)
  )
}

export async function carregarRegrasAgenda() {
  const { data, error } = await supabase.from('configuracoes_estudio').select('*').eq('id', 1).single()
  if (error) falhar(error)
  return data as { antecedencia_desmarcacao_horas: number; validade_credito_dias: number; limite_reposicoes_mes: number | null }
}

/* ======================= Relatorios ======================= */

async function todasAsLinhas<T>(montar: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>): Promise<T[]> {
  const pagina = 1000
  const tudo: T[] = []
  for (let de = 0; ; de += pagina) {
    const { data, error } = await montar(de, de + pagina - 1)
    if (error) falhar(error)
    const linhas = (data ?? []) as T[]
    tudo.push(...linhas)
    if (linhas.length < pagina) return tudo
  }
}

export async function dadosRelatorios(inicio: string) {
  const [pagamentos, despesas, aulas, alunos, planos, profissionais] = await Promise.all([
    todasAsLinhas<{ data: string; valor: number; profissional_id: string | null }>((de, ate) =>
      supabase.from('pagamentos').select('data, valor, profissional_id').gte('data', inicio).order('id').range(de, ate)
    ),
    todasAsLinhas<{ data: string; valor: number; categoria: string }>((de, ate) =>
      supabase.from('despesas').select('data, valor, categoria').gte('data', inicio).order('id').range(de, ate)
    ),
    todasAsLinhas<{ data: string; status: string }>((de, ate) =>
      supabase.from('aulas').select('data, status').gte('data', inicio).is('deleted_at', null).order('id').range(de, ate)
    ),
    lista<{ plano_id: string | null }>(supabase.from('alunos').select('plano_id').eq('ativo', true)),
    listarPlanos(),
    listarProfissionais()
  ])
  return { pagamentos, despesas, aulas, alunos, planos, profissionais }
}
