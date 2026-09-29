// Operacoes da agenda. Toda regra de negocio mora nas funcoes do banco;
// aqui ficam as chamadas, para a tela (e integracoes futuras) usarem.

import { supabase } from '../supabase'
import type {
  Agendamento,
  AlunoResumo,
  Bloqueio,
  ConfiguracaoEstudio,
  Credito,
  DadosPeriodo,
  Horario,
  HorarioFixo,
  ItemListaEspera,
  Modalidade,
  Professor,
  ResultadoDesmarcacao,
  StatusAgendamento,
  TipoAgendamento,
  VerificacaoAgendamento
} from './tipos'

export type CodigoErroAgenda =
  | 'LOTADO'
  | 'CONFLITO'
  | 'BLOQUEADO'
  | 'SEM_CREDITO'
  | 'JA_AGENDADO'
  | 'NAO_PERMITIDO'
  | 'CREDITO_USADO'
  | 'INVALIDO'
  | 'DESCONHECIDO'

const CODIGOS: Record<string, CodigoErroAgenda> = {
  LK001: 'LOTADO',
  LK002: 'CONFLITO',
  LK003: 'BLOQUEADO',
  LK004: 'SEM_CREDITO',
  LK005: 'JA_AGENDADO',
  LK006: 'NAO_PERMITIDO',
  LK007: 'CREDITO_USADO',
  LK010: 'INVALIDO'
}

export class ErroAgenda extends Error {
  codigo: CodigoErroAgenda
  constructor(mensagem: string, codigo: CodigoErroAgenda) {
    super(mensagem)
    this.codigo = codigo
  }
}

export function falhar(error: { message: string; code?: string }): never {
  // PGRST202 = funcao inexistente, PGRST205 = tabela inexistente: migrations da agenda nao aplicadas
  if (error.code === 'PGRST202' || error.code === 'PGRST205') {
    throw new ErroAgenda(
      'A agenda ainda não foi instalada no banco. Rode as migrations 202609260001, 002 e 003 no SQL Editor do Supabase (veja docs/agenda.md).',
      'DESCONHECIDO'
    )
  }
  throw new ErroAgenda(error.message, CODIGOS[error.code ?? ''] ?? 'DESCONHECIDO')
}

export async function rpc<T>(nome: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nome, args)
  if (error) falhar(error)
  return data as T
}

const CAMPOS_ALUNO = 'id, nome, ativo, plano, frequencia_semanal, aulas_restantes, telefone, professor_id, vencimento'

/* ======================= Leitura por periodo ======================= */

export async function carregarPeriodo(inicio: string, fim: string): Promise<DadosPeriodo> {
  // Materializa os fixos do periodo (idempotente) antes de ler.
  await rpc('sincronizar_agenda', { inicio_input: inicio, fim_input: fim })

  const [horarios, agendamentos, professores, modalidades, bloqueios, espera, config, creditos] = await Promise.all([
    supabase.from('horarios').select('*').order('hora_inicio'),
    supabase
      .from('agenda')
      .select(`*, aluno:alunos!agenda_aluno_id_fkey(${CAMPOS_ALUNO})`)
      .gte('data', inicio)
      .lte('data', fim)
      .eq('excluida', false)
      .order('hora'),
    supabase.from('professores').select('*').order('nome'),
    supabase.from('modalidades').select('*').order('nome'),
    supabase
      .from('bloqueios')
      .select('*')
      .lte('data', fim)
      .or(`data_fim.gte.${inicio},and(data_fim.is.null,data.gte.${inicio})`),
    supabase
      .from('lista_espera')
      .select('*, aluno:alunos(id, nome)')
      .is('atendido_em', null)
      .is('cancelado_em', null)
      .or(`data.is.null,and(data.gte.${inicio},data.lte.${fim})`)
      .order('created_at'),
    supabase.from('configuracoes_estudio').select('*').eq('id', 1).single(),
    supabase.from('creditos_reposicao_situacao').select('id', { count: 'exact', head: true }).eq('situacao', 'ativo')
  ])

  for (const r of [horarios, agendamentos, professores, modalidades, bloqueios, espera, config, creditos]) {
    if (r.error) falhar(r.error)
  }

  return {
    inicio,
    fim,
    horarios: (horarios.data ?? []) as Horario[],
    agendamentos: (agendamentos.data ?? []) as Agendamento[],
    professores: (professores.data ?? []) as Professor[],
    modalidades: (modalidades.data ?? []) as Modalidade[],
    bloqueios: (bloqueios.data ?? []) as Bloqueio[],
    listaEspera: (espera.data ?? []) as ItemListaEspera[],
    configuracao: config.data as ConfiguracaoEstudio,
    creditosAtivos: creditos.count ?? 0
  }
}

/* ======================= Operacoes ======================= */

export type NovoAgendamento = {
  alunoId?: string | null
  horarioId: string
  data: string
  tipo: TipoAgendamento
  creditoId?: string | null
  experimentalNome?: string
  experimentalTelefone?: string
  observacao?: string
  forcarEncaixe?: boolean
}

export function agendar(n: NovoAgendamento) {
  return rpc<Agendamento>('agendar', {
    aluno_id_input: n.alunoId ?? null,
    horario_id_input: n.horarioId,
    data_input: n.data,
    tipo_input: n.tipo,
    credito_id_input: n.creditoId ?? null,
    experimental_nome_input: n.experimentalNome ?? null,
    experimental_telefone_input: n.experimentalTelefone ?? null,
    observacao_input: n.observacao ?? null,
    forcar_encaixe_input: n.forcarEncaixe ?? false
  })
}

export function verificarAgendamento(alunoId: string | null, horarioId: string, data: string) {
  return rpc<VerificacaoAgendamento>('verificar_agendamento', {
    aluno_id_input: alunoId,
    horario_id_input: horarioId,
    data_input: data
  })
}

export function marcarStatus(agendamentoId: number, status: Extract<StatusAgendamento, 'agendado' | 'presente' | 'falta' | 'falta_justificada'>, observacao?: string) {
  return rpc<Agendamento>('marcar_status', {
    agenda_id_input: agendamentoId,
    status_input: status,
    observacao_input: observacao ?? null
  })
}

export function marcarTodosPresentes(horarioId: string, data: string) {
  return rpc<{ marcados: number; erros: { agenda_id: number; nome: string; erro: string }[] }>('marcar_todos_presentes', {
    horario_id_input: horarioId,
    data_input: data
  })
}

export function desmarcar(agendamentoId: number, opcoes: { gerarCredito?: boolean | null; motivo?: string } = {}) {
  return rpc<ResultadoDesmarcacao>('desmarcar', {
    agenda_id_input: agendamentoId,
    gerar_credito_input: opcoes.gerarCredito ?? null,
    motivo_input: opcoes.motivo ?? null
  })
}

export function remarcar(agendamentoId: number, horarioId: string, data: string, forcarEncaixe = false) {
  return rpc<Agendamento>('remarcar', {
    agenda_id_input: agendamentoId,
    horario_id_input: horarioId,
    data_input: data,
    forcar_encaixe_input: forcarEncaixe
  })
}

export function bloquear(b: { data: string; dataFim?: string | null; horarioId?: string | null; motivo: string; gerarCredito?: boolean }) {
  return rpc<{ bloqueio_id: string; cancelados: number; creditos: number }>('bloquear', {
    data_input: b.data,
    data_fim_input: b.dataFim ?? null,
    horario_id_input: b.horarioId ?? null,
    motivo_input: b.motivo,
    gerar_credito_input: b.gerarCredito ?? true
  })
}

export async function removerBloqueio(id: string) {
  const { error } = await supabase.from('bloqueios').delete().eq('id', id)
  if (error) falhar(error)
}

export function trocarProfessor(t: {
  professorId: string | null
  escopo: 'dia' | 'permanente'
  agendamentoId?: number
  horarioId?: string
  data?: string
}) {
  return rpc<{ atualizados: number }>('trocar_professor', {
    professor_id_input: t.professorId,
    escopo_input: t.escopo,
    agenda_id_input: t.agendamentoId ?? null,
    horario_id_input: t.horarioId ?? null,
    data_input: t.data ?? null
  })
}

export async function salvarObservacao(agendamentoId: number, observacao: string) {
  const { error } = await supabase
    .from('agenda')
    .update({ observacao: observacao.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', agendamentoId)
  if (error) falhar(error)
}

export async function entrarListaEspera(alunoId: string, horarioId: string, data: string | null, observacao?: string) {
  const { error } = await supabase
    .from('lista_espera')
    .insert({ aluno_id: alunoId, horario_id: horarioId, data, observacao: observacao || null })
  if (error) falhar(error)
}

export async function sairListaEspera(id: string) {
  const { error } = await supabase.from('lista_espera').update({ cancelado_em: new Date().toISOString() }).eq('id', id)
  if (error) falhar(error)
}

export async function marcarExperimentalConvertido(agendamentoId: number, alunoId: string) {
  const { error } = await supabase.from('agenda').update({ aluno_convertido_id: alunoId }).eq('id', agendamentoId)
  if (error) falhar(error)
}

/* ======================= Alunos ======================= */

export async function buscarAlunos(termo: string, apenasAtivos = false): Promise<AlunoResumo[]> {
  let q = supabase.from('alunos').select(CAMPOS_ALUNO).order('nome').limit(20)
  if (termo.trim()) q = q.ilike('nome', `%${termo.trim()}%`)
  if (apenasAtivos) q = q.eq('ativo', true)
  const { data, error } = await q
  if (error) falhar(error)
  return (data ?? []) as AlunoResumo[]
}

export async function carregarAluno(alunoId: string): Promise<AlunoResumo | null> {
  const { data, error } = await supabase.from('alunos').select(CAMPOS_ALUNO).eq('id', alunoId).maybeSingle()
  if (error) falhar(error)
  return data as AlunoResumo | null
}

export async function atualizarAluno(alunoId: string, dados: Partial<Pick<AlunoResumo, 'telefone' | 'frequencia_semanal' | 'professor_id'>>) {
  const { error } = await supabase.from('alunos').update(dados).eq('id', alunoId)
  if (error) falhar(error)
}

export async function creditosDoAluno(alunoId: string): Promise<Credito[]> {
  const { data, error } = await supabase
    .from('creditos_reposicao')
    .select('*')
    .eq('aluno_id', alunoId)
    .order('expira_em', { ascending: false })
  if (error) falhar(error)
  return (data ?? []) as Credito[]
}

export async function historicoAgendaAluno(alunoId: string, limite = 60): Promise<Agendamento[]> {
  const { data, error } = await supabase
    .from('agenda')
    .select('*')
    .eq('aluno_id', alunoId)
    .order('data', { ascending: false })
    .order('hora', { ascending: false })
    .limit(limite)
  if (error) falhar(error)
  return (data ?? []) as Agendamento[]
}

/** Proximas aulas do aluno (busca rapida "em que horarios a Maria esta?"). */
export async function proximasAulasAluno(alunoId: string, aPartirDe: string, limite = 10): Promise<Agendamento[]> {
  const { data, error } = await supabase
    .from('agenda')
    .select('*')
    .eq('aluno_id', alunoId)
    .gte('data', aPartirDe)
    .in('status', ['agendado', 'presente', 'falta'])
    .order('data')
    .order('hora')
    .limit(limite)
  if (error) falhar(error)
  return (data ?? []) as Agendamento[]
}

/* ======================= Horarios fixos ======================= */

export async function horariosFixosDoAluno(alunoId: string): Promise<HorarioFixo[]> {
  const { data, error } = await supabase
    .from('horarios_aluno')
    .select('id, aluno_id, horario_id, dia_semana, horario, data_inicio, data_fim, professor_id')
    .eq('aluno_id', alunoId)
    .order('data_inicio', { ascending: false })
  if (error) falhar(error)
  return (data ?? []) as HorarioFixo[]
}

/** Quantos alunos fixos ativos cada turma tem numa data (para mostrar vagas na grade). */
export async function fixosPorHorario(data: string): Promise<Record<string, number>> {
  const { data: linhas, error } = await supabase
    .from('horarios_aluno')
    .select('horario_id, data_inicio, data_fim, aluno:alunos!inner(ativo)')
    .not('horario_id', 'is', null)
    .eq('aluno.ativo', true)
  if (error) falhar(error)
  const contagem: Record<string, number> = {}
  for (const l of (linhas ?? []) as any[]) {
    if (l.data_inicio && l.data_inicio > data) continue
    if (l.data_fim && l.data_fim < data) continue
    contagem[l.horario_id] = (contagem[l.horario_id] ?? 0) + 1
  }
  return contagem
}

export async function adicionarHorarioFixo(f: { alunoId: string; horarioId: string; dataInicio: string; professorId?: string | null }) {
  const { data: turma, error: e1 } = await supabase.from('horarios').select('dia_semana, hora_inicio').eq('id', f.horarioId).single()
  if (e1) falhar(e1)
  const { error } = await supabase.from('horarios_aluno').insert({
    aluno_id: f.alunoId,
    horario_id: f.horarioId,
    // colunas legadas preenchidas para manter o formato antigo legivel
    dia_semana: String(turma.dia_semana),
    horario: String(turma.hora_inicio).slice(0, 5),
    data_inicio: f.dataInicio,
    professor_id: f.professorId ?? null
  })
  if (error) falhar(error)
}

/** Encerra o horario fixo (nao apaga): agendamentos futuros somem na proxima sincronizacao. */
export async function encerrarHorarioFixo(id: number | string, dataFim: string) {
  const { error } = await supabase.from('horarios_aluno').update({ data_fim: dataFim, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) falhar(error)
}

export async function atualizarProfessorDoFixo(id: number | string, professorId: string | null) {
  const { error } = await supabase.from('horarios_aluno').update({ professor_id: professorId, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) falhar(error)
}

/* ======================= Configuracao da grade ======================= */

export async function listarGrade() {
  const [h, p, m, c, b] = await Promise.all([
    supabase.from('horarios').select('*').order('dia_semana').order('hora_inicio'),
    supabase.from('professores').select('*').order('nome'),
    supabase.from('modalidades').select('*').order('nome'),
    supabase.from('configuracoes_estudio').select('*').eq('id', 1).single(),
    supabase.from('bloqueios').select('*').order('data', { ascending: false }).limit(100)
  ])
  for (const r of [h, p, m, c, b]) if (r.error) falhar(r.error)
  return {
    horarios: h.data as Horario[],
    professores: p.data as Professor[],
    modalidades: m.data as Modalidade[],
    configuracao: c.data as ConfiguracaoEstudio,
    bloqueios: b.data as Bloqueio[]
  }
}

export async function salvarHorario(h: Partial<Horario> & Pick<Horario, 'dia_semana' | 'hora_inicio' | 'capacidade' | 'duracao_min'>) {
  const { id, ...dados } = h
  const q = id
    ? supabase.from('horarios').update({ ...dados, updated_at: new Date().toISOString() }).eq('id', id)
    : supabase.from('horarios').insert(dados)
  const { error } = await q
  if (error) falhar(error)
}

export async function salvarProfessor(p: Partial<Professor> & Pick<Professor, 'nome' | 'cor'>) {
  const { id, ...dados } = p
  const q = id
    ? supabase.from('professores').update({ ...dados, updated_at: new Date().toISOString() }).eq('id', id)
    : supabase.from('professores').insert(dados)
  const { error } = await q
  if (error) falhar(error)
}

export async function salvarModalidade(m: Partial<Modalidade> & Pick<Modalidade, 'nome' | 'capacidade_padrao'>) {
  const { id, ...dados } = m
  const q = id ? supabase.from('modalidades').update(dados).eq('id', id) : supabase.from('modalidades').insert(dados)
  const { error } = await q
  if (error) falhar(error)
}

export async function salvarConfiguracao(c: Partial<ConfiguracaoEstudio>) {
  const { error } = await supabase.from('configuracoes_estudio').update({ ...c, updated_at: new Date().toISOString() }).eq('id', 1)
  if (error) falhar(error)
}

/* ======================= Montagem em lote ======================= */

/** Datas de presencas/faltas por aluno desde `desde` (para sugerir dias fixos). */
export async function datasDeAulasPorAluno(desde: string): Promise<Record<string, string[]>> {
  const porAluno: Record<string, string[]> = {}
  const pagina = 1000
  for (let de = 0; ; de += pagina) {
    const { data, error } = await supabase
      .from('aulas')
      .select('aluno_id, data')
      .gte('data', desde)
      .in('status', ['veio', 'faltou'])
      .is('deleted_at', null)
      .order('id')
      .range(de, de + pagina - 1)
    if (error) falhar(error)
    for (const a of data ?? []) (porAluno[a.aluno_id] ??= []).push(String(a.data).slice(0, 10))
    if (!data || data.length < pagina) break
  }
  return porAluno
}

/** Todos os horarios fixos vigentes (para a tela de montagem em lote). */
export async function horariosFixosVigentes(hoje: string): Promise<HorarioFixo[]> {
  const { data, error } = await supabase
    .from('horarios_aluno')
    .select('id, aluno_id, horario_id, dia_semana, horario, data_inicio, data_fim, professor_id')
    .or(`data_fim.is.null,data_fim.gte.${hoje}`)
  if (error) falhar(error)
  return (data ?? []) as HorarioFixo[]
}

export async function alunosAtivos(): Promise<AlunoResumo[]> {
  const { data, error } = await supabase.from('alunos').select(CAMPOS_ALUNO).eq('ativo', true).order('nome')
  if (error) falhar(error)
  return (data ?? []) as AlunoResumo[]
}

/* ======================= Calendario ======================= */

export type EscopoRecorrencia = 'esta' | 'seguintes' | 'todas'

export function criarAula(a: {
  data: string
  hora: string
  duracaoMin: number
  capacidade: number
  modalidadeId?: string | null
  professorId?: string | null
  repetir?: boolean
  observacao?: string
}) {
  return rpc<Horario>('criar_aula', {
    data_input: a.data,
    hora_input: a.hora,
    duracao_input: a.duracaoMin,
    capacidade_input: a.capacidade,
    modalidade_id_input: a.modalidadeId ?? null,
    professor_id_input: a.professorId ?? null,
    repetir_input: a.repetir ?? false,
    observacao_input: a.observacao ?? null
  })
}

export function moverAula(m: {
  horarioId: string
  data: string
  novaData: string
  novaHora: string
  novaDuracao: number
  escopo: EscopoRecorrencia
}) {
  return rpc<{ movimento_id: string; horario_id: string; movidos: number; modo: string }>('mover_aula', {
    horario_id_input: m.horarioId,
    data_input: m.data,
    nova_data_input: m.novaData,
    nova_hora_input: m.novaHora,
    nova_duracao_input: m.novaDuracao,
    escopo_input: m.escopo
  })
}

export function desfazerMovimento(movimentoId: string) {
  return rpc<{ desfeito: boolean }>('desfazer_movimento', { movimento_id_input: movimentoId })
}

export function desfazerBloqueio(bloqueioId: string) {
  return rpc<{ restaurados: number }>('desfazer_bloqueio', { bloqueio_id_input: bloqueioId })
}

/** Aula unica sem alunos: desativa (reversivel). */
export async function definirTurmaAtiva(horarioId: string, ativo: boolean) {
  const { error } = await supabase.from('horarios').update({ ativo, updated_at: new Date().toISOString() }).eq('id', horarioId)
  if (error) falhar(error)
}

export async function proximasAulasProfessor(professorId: string, aPartirDe: string, limite = 15): Promise<Agendamento[]> {
  const { data, error } = await supabase
    .from('agenda')
    .select('*')
    .eq('professor_id', professorId)
    .gte('data', aPartirDe)
    .in('status', ['agendado', 'presente', 'falta'])
    .order('data')
    .order('hora')
    .limit(limite)
  if (error) falhar(error)
  return (data ?? []) as Agendamento[]
}

export async function atualizarTurma(horarioId: string, dados: { capacidade?: number; modalidade_id?: string | null }) {
  const { error } = await supabase.from('horarios').update({ ...dados, updated_at: new Date().toISOString() }).eq('id', horarioId)
  if (error) falhar(error)
}

/* ======================= Agenda por cliente (recorrencia) ======================= */

export type EscopoAula = 'esta' | 'proximas'

export type DadosAula = {
  alunoId: string | null
  nomeLivre?: string
  telefoneLivre?: string
  data: string
  horaInicio: string
  horaFim: string
  dias?: number[] | null
  profissionalId?: string | null
  servicoId?: string | null
  cor?: string | null
  observacao?: string
}

export function criarAulaCliente(a: DadosAula, forcar = false) {
  return rpc<{ recorrencia_id?: string; agenda_id?: number; conflitos: string[] }>('criar_aula_cliente', {
    aluno_id_input: a.alunoId,
    nome_livre_input: a.nomeLivre ?? null,
    telefone_livre_input: a.telefoneLivre ?? null,
    data_input: a.data,
    hora_inicio_input: a.horaInicio,
    hora_fim_input: a.horaFim,
    dias_input: a.dias?.length ? a.dias : null,
    profissional_id_input: a.profissionalId ?? null,
    servico_id_input: a.servicoId ?? null,
    cor_input: a.cor ?? null,
    observacao_input: a.observacao ?? null,
    forcar_input: forcar
  })
}

export function editarAulaCliente(agendaId: number, escopo: EscopoAula, a: Omit<DadosAula, 'alunoId' | 'nomeLivre' | 'telefoneLivre'>, forcar = false) {
  return rpc<{ escopo: string; conflitos: string[] }>('editar_aula_cliente', {
    agenda_id_input: agendaId,
    escopo_input: escopo,
    data_input: a.data,
    hora_inicio_input: a.horaInicio,
    hora_fim_input: a.horaFim,
    dias_input: a.dias?.length ? a.dias : null,
    profissional_id_input: a.profissionalId ?? null,
    servico_id_input: a.servicoId ?? null,
    cor_input: a.cor ?? null,
    observacao_input: a.observacao ?? null,
    forcar_input: forcar
  })
}

export function excluirAulaCliente(agendaId: number, escopo: EscopoAula) {
  return rpc<{ excluidas: number }>('excluir_aula_cliente', { agenda_id_input: agendaId, escopo_input: escopo })
}

export async function carregarRecorrencia(id: string) {
  const { data, error } = await supabase.from('recorrencias').select('*').eq('id', id).maybeSingle()
  if (error) falhar(error)
  return data as { id: string; dias_semana: number[]; hora_inicio: string; hora_fim: string; data_inicio: string; data_fim: string | null } | null
}
