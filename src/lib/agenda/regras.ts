// Regras de negocio puras (sem banco). Espelham as funcoes SQL em
// supabase/migrations/202609260002_agenda_funcoes.sql e servem para a tela
// mostrar previas (ex.: "vai gerar credito?") antes de chamar o banco.

import { agoraEstudioMs, diaSemanaISO, diferencaDias, inicioSemana as inicioSemanaISO, momentoMs, sobrepoe, somarDias as somarDiasISO } from './datas'
import type {
  Agendamento,
  Bloqueio,
  Credito,
  Horario,
  OrigemProfessor,
  StatusAgendamento,
  TipoAgendamento
} from './tipos'

export const STATUS_QUE_OCUPAM: StatusAgendamento[] = ['agendado', 'presente', 'falta']

export function ocupaVaga(status: StatusAgendamento) {
  return STATUS_QUE_OCUPAM.includes(status)
}

/* ---------------- Desmarcacao / credito ---------------- */

export type PreviaDesmarcacao = {
  horasAntecedencia: number
  dentroPrazo: boolean
  geraCredito: boolean
  novoStatus: StatusAgendamento
}

export function calcularDesmarcacao(
  aula: { data: string; hora: string; tipo: TipoAgendamento },
  antecedenciaHoras: number,
  agoraMs = agoraEstudioMs(),
  forcarCredito?: boolean
): PreviaDesmarcacao {
  const horas = Math.round(((momentoMs(aula.data, aula.hora) - agoraMs) / 3600000) * 100) / 100
  const dentroPrazo = horas >= antecedenciaHoras

  if (aula.tipo === 'experimental' || aula.tipo === 'avulsa') {
    return { horasAntecedencia: horas, dentroPrazo, geraCredito: false, novoStatus: 'desmarcado' }
  }

  const geraCredito = forcarCredito ?? dentroPrazo
  return {
    horasAntecedencia: horas,
    dentroPrazo,
    geraCredito,
    novoStatus: geraCredito ? 'falta_justificada' : 'falta'
  }
}

export type SituacaoCredito = 'ativo' | 'usado' | 'vencido' | 'cancelado'

export function situacaoCredito(credito: Pick<Credito, 'usado_em' | 'cancelado_em' | 'expira_em'>, hoje: string): SituacaoCredito {
  if (credito.cancelado_em) return 'cancelado'
  if (credito.usado_em) return 'usado'
  if (credito.expira_em < hoje) return 'vencido'
  return 'ativo'
}

/** O credito pode ser usado numa aula nesta data? */
export function creditoServeParaData(credito: Pick<Credito, 'usado_em' | 'cancelado_em' | 'expira_em'>, dataAula: string) {
  return !credito.usado_em && !credito.cancelado_em && dataAula <= credito.expira_em
}

export function creditoVencendo(credito: Pick<Credito, 'usado_em' | 'cancelado_em' | 'expira_em'>, hoje: string, dias = 7) {
  return situacaoCredito(credito, hoje) === 'ativo' && diferencaDias(hoje, credito.expira_em) <= dias
}

export function dataExpiracaoCredito(dataAula: string, hoje: string, validadeDias: number) {
  const base = dataAula > hoje ? dataAula : hoje
  const [a, m, d] = base.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + validadeDias)).toISOString().slice(0, 10)
}

/* ---------------- Capacidade / ocupacao ---------------- */

export type NivelOcupacao = 'livre' | 'quase' | 'lotado' | 'bloqueado'

export function ocupacao(capacidade: number, agendamentos: Pick<Agendamento, 'status'>[], bloqueado = false) {
  const ocupados = agendamentos.filter(a => ocupaVaga(a.status)).length
  const vagas = Math.max(capacidade - ocupados, 0)
  let nivel: NivelOcupacao = 'livre'
  if (bloqueado) nivel = 'bloqueado'
  else if (ocupados >= capacidade) nivel = 'lotado'
  else if (vagas === 1 && capacidade > 1) nivel = 'quase'
  return { ocupados, capacidade, vagas, nivel }
}

export type ResultadoCapacidade = 'ok' | 'encaixe' | 'lotado'

export function verificarCapacidade(ocupados: number, capacidade: number, permitirEncaixe: boolean): ResultadoCapacidade {
  if (ocupados < capacidade) return 'ok'
  return permitirEncaixe ? 'encaixe' : 'lotado'
}

/** Aluno ja tem outra aula que se sobrepoe a este horario nesta data? */
export function conflitoDoAluno(
  agendamentosDoAluno: Pick<Agendamento, 'id' | 'data' | 'hora' | 'duracao_min' | 'status' | 'horario_id'>[],
  data: string,
  hora: string,
  duracaoMin: number,
  ignorarId?: string
) {
  return agendamentosDoAluno.find(
    a =>
      a.id !== ignorarId &&
      a.data === data &&
      ocupaVaga(a.status) &&
      sobrepoe(a.hora, a.duracao_min, hora, duracaoMin)
  )
}

export function horarioBloqueado(bloqueios: Bloqueio[], horarioId: string, data: string) {
  return bloqueios.find(
    b => data >= b.data && data <= (b.data_fim ?? b.data) && (!b.horario_id || b.horario_id === horarioId)
  )
}

/* ---------------- Professores ---------------- */

/** Prioridade: dia especifico > aluno > horario. */
export function professorEfetivo(niveis: {
  dia?: string | null
  temSubstituicaoNoDia?: boolean
  aluno?: string | null
  horario?: string | null
}): { professorId: string | null; origem: OrigemProfessor | null } {
  if (niveis.temSubstituicaoNoDia || niveis.dia) return { professorId: niveis.dia ?? null, origem: 'dia' }
  if (niveis.aluno) return { professorId: niveis.aluno, origem: 'aluno' }
  if (niveis.horario) return { professorId: niveis.horario, origem: 'horario' }
  return { professorId: null, origem: null }
}

export const DESCRICAO_ORIGEM_PROFESSOR: Record<OrigemProfessor, string> = {
  dia: 'troca só neste dia',
  aluno: 'professor do aluno',
  horario: 'professor da turma'
}

export type ConflitoProfessor = {
  professorId: string
  data: string
  a: { horarioId: string; hora: string }
  b: { horarioId: string; hora: string }
}

/** Professor dando aula em duas turmas sobrepostas no mesmo dia. */
export function conflitosDeProfessor(
  agendamentos: Pick<Agendamento, 'professor_id' | 'data' | 'hora' | 'duracao_min' | 'horario_id' | 'status'>[]
): ConflitoProfessor[] {
  const turmas = new Map<string, { professorId: string; data: string; horarioId: string; hora: string; duracao: number }>()
  for (const a of agendamentos) {
    if (!a.professor_id || !a.horario_id || !ocupaVaga(a.status)) continue
    const chave = `${a.professor_id}|${a.data}|${a.horario_id}`
    if (!turmas.has(chave)) {
      turmas.set(chave, { professorId: a.professor_id, data: a.data, horarioId: a.horario_id, hora: a.hora, duracao: a.duracao_min })
    }
  }

  const lista = [...turmas.values()]
  const conflitos: ConflitoProfessor[] = []
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      const x = lista[i]
      const y = lista[j]
      if (x.professorId === y.professorId && x.data === y.data && x.horarioId !== y.horarioId && sobrepoe(x.hora, x.duracao, y.hora, y.duracao)) {
        conflitos.push({
          professorId: x.professorId,
          data: x.data,
          a: { horarioId: x.horarioId, hora: x.hora },
          b: { horarioId: y.horarioId, hora: y.hora }
        })
      }
    }
  }
  return conflitos
}

/* ---------------- Plano ---------------- */

/** "semestral 2x" -> 2; null se nao identificar. */
export function frequenciaDoPlano(plano: string | null | undefined) {
  const m = (plano ?? '').toLowerCase().match(/(\d)\s*x(?!\d)/) // "6x411" = parcelas, nao frequencia
  return m ? Number(m[1]) : null
}

export function excedePlano(frequenciaSemanal: number | null | undefined, quantidade: number) {
  return frequenciaSemanal != null && quantidade > frequenciaSemanal
}

/* ---------------- Resumo do dia ---------------- */

export type ResumoDia = {
  totalAulas: number
  capacidadeTotal: number
  ocupados: number
  ocupacaoPct: number | null
  presencas: number
  faltas: number
  faltasJustificadas: number
  experimentais: number
  vagasLivres: number
}

export function resumoDoDia(
  horariosDoDia: Pick<Horario, 'id' | 'capacidade'>[],
  agendamentosDoDia: Pick<Agendamento, 'horario_id' | 'status' | 'tipo'>[],
  horariosBloqueados: Set<string> = new Set()
): ResumoDia {
  const abertos = horariosDoDia.filter(h => !horariosBloqueados.has(h.id))
  const capacidadeTotal = abertos.reduce((s, h) => s + h.capacidade, 0)
  let ocupados = 0
  let vagasLivres = 0
  for (const h of abertos) {
    const oc = agendamentosDoDia.filter(a => a.horario_id === h.id && ocupaVaga(a.status)).length
    ocupados += oc
    vagasLivres += Math.max(h.capacidade - oc, 0)
  }
  const conta = (s: StatusAgendamento) => agendamentosDoDia.filter(a => a.status === s).length

  return {
    totalAulas: abertos.length,
    capacidadeTotal,
    ocupados,
    ocupacaoPct: capacidadeTotal ? Math.round((ocupados / capacidadeTotal) * 100) : null,
    presencas: conta('presente'),
    faltas: conta('falta'),
    faltasJustificadas: conta('falta_justificada'),
    experimentais: agendamentosDoDia.filter(a => a.tipo === 'experimental' && ocupaVaga(a.status)).length,
    vagasLivres
  }
}

/* ---------------- Textos ---------------- */

export const ROTULO_STATUS: Record<StatusAgendamento, string> = {
  agendado: 'Agendado',
  presente: 'Presente',
  falta: 'Falta',
  falta_justificada: 'Falta justificada',
  desmarcado: 'Desmarcado',
  cancelado_estudio: 'Cancelado pelo estúdio'
}

export const ROTULO_TIPO: Record<TipoAgendamento, string> = {
  fixo: 'Fixo',
  aula: 'Aula',
  reposicao: 'Reposição',
  experimental: 'Experimental',
  avulsa: 'Avulsa'
}

/** Paleta padrao de professores: cores bem distintas e com bom contraste no tema claro. */
export const PALETA_PROFESSORES = [
  '#1f4fd8', // azul
  '#ea580c', // laranja
  '#1e3a8a', // azul-marinho (verde fica reservado para "presente" na agenda)
  '#9333ea', // roxo
  '#db2777', // rosa
  '#0e7490', // petroleo
  '#a16207', // mostarda
  '#a21caf', // magenta (vermelho fica reservado para "falta")
  '#7c2d12', // marrom
  '#111827' // preto (cinza fica reservado para "desmarcada")
]

export function iniciais(nome: string | null | undefined) {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

/* ---------------- Sugestao de horario fixo pelo historico ---------------- */

export type SugestaoDia = { dia: number; vezes: number; semanas: number }

/**
 * Dias da semana em que o aluno costuma vir, a partir das datas de aulas
 * registradas (presencas e faltas) nas ultimas `semanas` semanas.
 * Um dia entra na sugestao se apareceu em pelo menos 40% das semanas com aula.
 */
export function sugerirDiasFixos(datas: string[], hoje: string, semanas = 8): SugestaoDia[] {
  const inicio = somarDiasISO(hoje, -semanas * 7)
  const recentes = datas.filter(d => d >= inicio && d <= hoje)
  const semanasComAula = new Set(recentes.map(d => inicioSemanaISO(d))).size
  if (!semanasComAula) return []

  const porDia = new Map<number, Set<string>>()
  for (const d of recentes) {
    const dia = diaSemanaISO(d)
    if (!porDia.has(dia)) porDia.set(dia, new Set())
    porDia.get(dia)!.add(inicioSemanaISO(d))
  }

  return [...porDia.entries()]
    .map(([dia, sem]) => ({ dia, vezes: sem.size, semanas: semanasComAula }))
    .filter(s => s.vezes >= 2 && s.vezes / semanasComAula >= 0.4)
    .sort((a, b) => b.vezes - a.vezes || a.dia - b.dia)
}
