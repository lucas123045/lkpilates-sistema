import { diaSemanaISO } from '@/lib/agenda/datas'
import type { Agendamento, DadosPeriodo, Horario } from '@/lib/agenda/tipos'

export function nomePessoa(a: Agendamento) {
  return a.aluno?.nome ?? a.experimental_nome ?? 'Sem nome'
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
