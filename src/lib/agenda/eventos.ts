// Converte os dados da agenda em "eventos" de calendario (independente da
// biblioteca de UI). Cada evento = uma turma numa data e, se houver alunos de
// professores diferentes, um bloco por professor (exibidos lado a lado).

import { diaSemanaISO, horaFim, momentoMs, somarDias } from './datas'
import { horarioBloqueado, ocupaVaga } from './regras'
import type { Agendamento, Bloqueio, DadosPeriodo, Horario, TipoAgendamento } from './tipos'

export const SEM_PROFESSOR = '__sem__'

export type TipoFiltro = TipoAgendamento | 'bloqueios'

export type FiltrosCalendario = {
  professoresOcultos: string[]
  tiposOcultos: TipoFiltro[]
}

export type EventoAula = {
  id: string
  horario: Horario
  data: string
  inicio: string // AAAA-MM-DDTHH:MM
  fim: string
  professorId: string | null
  /** alunos que ocupam vaga neste bloco (ja filtrados por tipo) */
  alunos: Agendamento[]
  /** todos os agendamentos da turma nesta data (para o popover) */
  todos: Agendamento[]
  ocupados: number
  capacidade: number
  lotado: boolean
  bloqueio: Bloqueio | null
  cancelada: boolean
  passada: boolean
  unica: boolean
  /** quantos blocos (professores) a turma tem nesta data */
  blocos: number
}

export type EventoBloqueio = {
  id: string
  bloqueio: Bloqueio
  data: string
}

export function ehAulaUnica(h: Pick<Horario, 'vigente_desde' | 'vigente_ate' | 'origem'>) {
  return h.origem === 'aula_unica' || (!!h.vigente_ate && h.vigente_ate === h.vigente_desde)
}

function turmaAconteceEm(h: Horario, data: string) {
  return h.ativo && h.dia_semana === diaSemanaISO(data) && data >= h.vigente_desde && (!h.vigente_ate || data <= h.vigente_ate)
}

function datasEntre(inicio: string, fimExclusivo: string) {
  const r: string[] = []
  for (let d = inicio; d < fimExclusivo; d = somarDias(d, 1)) r.push(d)
  return r
}

/**
 * @param inicio primeira data visivel (AAAA-MM-DD)
 * @param fimExclusivo dia seguinte a ultima data visivel
 */
export function montarEventos(
  dados: DadosPeriodo,
  inicio: string,
  fimExclusivo: string,
  filtros: FiltrosCalendario,
  agoraMs: number
): { aulas: EventoAula[]; bloqueios: EventoBloqueio[] } {
  const profOculto = new Set(filtros.professoresOcultos)
  const tipoOculto = new Set(filtros.tiposOcultos)
  const filtrandoTipo = [...tipoOculto].some(t => t !== 'bloqueios')
  const mostrarBloqueios = !tipoOculto.has('bloqueios')

  const porTurmaData = new Map<string, Agendamento[]>()
  for (const a of dados.agendamentos) {
    if (!a.horario_id) continue
    const k = `${a.horario_id}|${a.data}`
    if (!porTurmaData.has(k)) porTurmaData.set(k, [])
    porTurmaData.get(k)!.push(a)
  }

  const aulas: EventoAula[] = []
  const bloqueiosDia: EventoBloqueio[] = []

  for (const data of datasEntre(inicio, fimExclusivo)) {
    for (const b of dados.bloqueios) {
      if (!b.horario_id && data >= b.data && data <= (b.data_fim ?? b.data) && mostrarBloqueios) {
        bloqueiosDia.push({ id: `bloq|${b.id}|${data}`, bloqueio: b, data })
      }
    }

    for (const h of dados.horarios) {
      const todos = porTurmaData.get(`${h.id}|${data}`) ?? []
      if (!todos.length && !turmaAconteceEm(h, data)) continue

      const bloqueio = horarioBloqueado(dados.bloqueios, h.id, data) ?? null
      const ocupantes = todos.filter(a => ocupaVaga(a.status))
      const cancelada = !!bloqueio || (todos.length > 0 && todos.every(a => a.status === 'cancelado_estudio'))
      // Ocorrencia que foi movida para outro horario: so a aula no destino aparece
      if (bloqueio?.horario_id && bloqueio.motivo.startsWith('Aula movida') && !ocupantes.length) continue
      if (cancelada && !mostrarBloqueios) continue

      const fim = horaFim(h.hora_inicio, h.duracao_min)
      const base = {
        horario: h,
        data,
        inicio: `${data}T${h.hora_inicio.slice(0, 5)}`,
        fim: `${data}T${fim}`,
        todos,
        ocupados: ocupantes.length,
        capacidade: h.capacidade,
        lotado: ocupantes.length >= h.capacidade,
        bloqueio,
        cancelada,
        passada: momentoMs(data, fim) < agoraMs,
        unica: ehAulaUnica(h)
      }

      // Agrupa por professor efetivo (um bloco por professor)
      const grupos = new Map<string, Agendamento[]>()
      for (const a of ocupantes) {
        const k = a.professor_id ?? SEM_PROFESSOR
        if (!grupos.has(k)) grupos.set(k, [])
        grupos.get(k)!.push(a)
      }
      if (!grupos.size) {
        const profPadrao = todos.find(a => a.professor_id)?.professor_id ?? h.professor_id
        grupos.set(profPadrao ?? SEM_PROFESSOR, [])
      }

      const blocos: EventoAula[] = []
      for (const [prof, alunosDoProf] of grupos) {
        if (profOculto.has(prof)) continue
        const visiveis = alunosDoProf.filter(a => !tipoOculto.has(a.tipo))
        if (alunosDoProf.length && !visiveis.length) continue
        if (!alunosDoProf.length && filtrandoTipo && !cancelada) continue
        blocos.push({
          ...base,
          id: `${h.id}|${data}|${prof}`,
          professorId: prof === SEM_PROFESSOR ? null : prof,
          alunos: visiveis,
          blocos: grupos.size
        })
      }
      aulas.push(...blocos)
    }
  }

  aulas.sort((a, b) => a.inicio.localeCompare(b.inicio) || (a.professorId ?? '').localeCompare(b.professorId ?? ''))
  return { aulas, bloqueios: bloqueiosDia }
}

/** "Maria Souza Lima" -> "Maria L." */
export function nomeCurto(nome: string) {
  const p = nome.trim().split(/\s+/)
  return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0]
}
