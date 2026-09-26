import { diaSemanaISO } from '@/lib/agenda/datas'
import { horarioBloqueado, ocupacao } from '@/lib/agenda/regras'
import type { Agendamento, DadosPeriodo, Horario, Professor } from '@/lib/agenda/tipos'

export type Filtros = {
  professores: string[] // vazio = todos
  modalidadeId: string // '' = todas
}

export const FILTROS_VAZIOS: Filtros = { professores: [], modalidadeId: '' }

export const SEM_PROFESSOR = '__sem__'

export function nomePessoa(a: Agendamento) {
  return a.aluno?.nome ?? a.experimental_nome ?? 'Sem nome'
}

export function mapaProfessores(professores: Professor[]) {
  return new Map(professores.map(p => [p.id, p]))
}

/** Turmas que acontecem na data (grade vigente + turmas que tenham agendamento nela). */
export function turmasDoDia(dados: DadosPeriodo, data: string): Horario[] {
  const dia = diaSemanaISO(data)
  const comAgendamento = new Set(dados.agendamentos.filter(a => a.data === data && a.horario_id).map(a => a.horario_id))
  return dados.horarios
    .filter(
      h =>
        comAgendamento.has(h.id) ||
        (h.ativo && h.dia_semana === dia && data >= h.vigente_desde && (!h.vigente_ate || data <= h.vigente_ate))
    )
    .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
}

export function agendamentosDaTurma(dados: DadosPeriodo, horarioId: string, data: string) {
  const ordem: Record<string, number> = { agendado: 0, presente: 0, falta: 1, falta_justificada: 2, desmarcado: 3, cancelado_estudio: 3 }
  return dados.agendamentos
    .filter(a => a.horario_id === horarioId && a.data === data)
    .sort((a, b) => ordem[a.status] - ordem[b.status] || nomePessoa(a).localeCompare(nomePessoa(b)))
}

export function passaFiltroProfessor(filtros: Filtros, professorId: string | null) {
  if (!filtros.professores.length) return true
  return filtros.professores.includes(professorId ?? SEM_PROFESSOR)
}

export type TurmaNoDia = {
  horario: Horario
  data: string
  agendamentos: Agendamento[]
  visiveis: Agendamento[]
  bloqueio: string | null
  ocupacao: ReturnType<typeof ocupacao>
  espera: number
}

/** Monta as turmas do dia ja com filtros aplicados. */
export function montarDia(dados: DadosPeriodo, data: string, filtros: Filtros): TurmaNoDia[] {
  return turmasDoDia(dados, data)
    .filter(h => !filtros.modalidadeId || h.modalidade_id === filtros.modalidadeId)
    .map(h => {
      const agendamentos = agendamentosDaTurma(dados, h.id, data)
      const bloqueio = horarioBloqueado(dados.bloqueios, h.id, data)?.motivo ?? null
      return {
        horario: h,
        data,
        agendamentos,
        visiveis: agendamentos.filter(a => passaFiltroProfessor(filtros, a.professor_id)),
        bloqueio,
        ocupacao: ocupacao(h.capacidade, agendamentos, !!bloqueio),
        espera: dados.listaEspera.filter(e => e.horario_id === h.id && (!e.data || e.data === data)).length
      }
    })
    .filter(t => {
      if (!filtros.professores.length) return true
      return t.visiveis.length > 0 || passaFiltroProfessor(filtros, t.horario.professor_id)
    })
}

