import { describe, expect, it } from 'vitest'
import { momentoMs } from '@/lib/agenda/datas'
import { montarEventos, nomeCurto, SEM_PROFESSOR } from '@/lib/agenda/eventos'
import type { Agendamento, DadosPeriodo, Horario } from '@/lib/agenda/tipos'

const turma = (id: string, dia: number, hora: string, extra: Partial<Horario> = {}): Horario => ({
  id, dia_semana: dia, hora_inicio: hora, duracao_min: 55, professor_id: 'pA', modalidade_id: null,
  capacidade: 3, ativo: true, vigente_desde: '2026-01-01', vigente_ate: null, observacao: null, ...extra
})

let seq = 1
const ag = (horarioId: string, data: string, extra: Partial<Agendamento> = {}): Agendamento => ({
  id: seq++, aluno_id: `al${seq}`, horario_id: horarioId, data, hora: '18:00', duracao_min: 55, tipo: 'fixo',
  status: 'agendado', professor_id: 'pA', professor_origem: 'horario', experimental_nome: null,
  experimental_telefone: null, aluno_convertido_id: null, observacao: null, encaixe: false, aula_id: null,
  credito_usado_id: null, cancelamento_motivo: null, remarcado_de_id: null, aluno: null, ...extra
})

function dados(p: Partial<DadosPeriodo>): DadosPeriodo {
  return {
    inicio: '2026-09-28', fim: '2026-10-04', horarios: [], agendamentos: [], professores: [], modalidades: [],
    bloqueios: [], listaEspera: [], creditosAtivos: 0,
    configuracao: { hora_abertura: '06:00', hora_fechamento: '21:00', dias_funcionamento: [1, 2, 3, 4, 5, 6], duracao_padrao_min: 55, antecedencia_desmarcacao_horas: 3, validade_credito_dias: 30, limite_reposicoes_mes: null },
    ...p
  }
}

const SEM_FILTRO = { professoresOcultos: [], tiposOcultos: [] }
const AGORA = momentoMs('2026-09-28', '10:00')

describe('montarEventos', () => {
  it('uma turma por ocorrencia da semana, com ocupacao e horario', () => {
    const d = dados({ horarios: [turma('t', 2, '18:00')], agendamentos: [ag('t', '2026-09-29'), ag('t', '2026-09-29', { status: 'desmarcado' })] })
    const { aulas } = montarEventos(d, '2026-09-28', '2026-10-05', SEM_FILTRO, AGORA)
    expect(aulas).toHaveLength(1)
    expect(aulas[0]).toMatchObject({ inicio: '2026-09-29T18:00', fim: '2026-09-29T18:55', ocupados: 1, capacidade: 3, lotado: false, blocos: 1 })
  })

  it('divide em blocos quando ha professores diferentes', () => {
    const d = dados({
      horarios: [turma('t', 2, '18:00')],
      agendamentos: [ag('t', '2026-09-29'), ag('t', '2026-09-29', { professor_id: 'pB' }), ag('t', '2026-09-29', { professor_id: 'pB' })]
    })
    const { aulas } = montarEventos(d, '2026-09-29', '2026-09-30', SEM_FILTRO, AGORA)
    expect(aulas.map(a => [a.professorId, a.alunos.length, a.ocupados, a.blocos])).toEqual([['pA', 1, 3, 2], ['pB', 2, 3, 2]])
    expect(aulas.every(a => a.lotado)).toBe(true)
  })

  it('filtro de professor e de tipo', () => {
    const d = dados({
      horarios: [turma('t', 2, '18:00'), turma('u', 2, '19:00')],
      agendamentos: [ag('t', '2026-09-29'), ag('t', '2026-09-29', { professor_id: null, tipo: 'experimental' })]
    })
    const soA = montarEventos(d, '2026-09-29', '2026-09-30', { professoresOcultos: [SEM_PROFESSOR], tiposOcultos: [] }, AGORA).aulas
    expect(soA.map(a => a.horario.id)).toEqual(['t', 'u'])
    const semFixo = montarEventos(d, '2026-09-29', '2026-09-30', { professoresOcultos: [], tiposOcultos: ['fixo'] }, AGORA).aulas
    // turma vazia some quando ha filtro de tipo; bloco do professor A (so fixo) some
    expect(semFixo.map(a => [a.horario.id, a.professorId])).toEqual([['t', null]])
  })

  it('bloqueios: fundo do dia, turma cancelada e aula movida escondida', () => {
    const d = dados({
      horarios: [turma('t', 2, '18:00'), turma('u', 3, '07:00')],
      bloqueios: [
        { id: 'b1', data: '2026-09-30', data_fim: null, horario_id: null, motivo: 'Feriado' },
        { id: 'b2', data: '2026-09-29', data_fim: null, horario_id: 't', motivo: 'Aula movida para 30/09 às 19:00' }
      ]
    })
    const r = montarEventos(d, '2026-09-29', '2026-10-01', SEM_FILTRO, AGORA)
    expect(r.bloqueios.map(b => b.data)).toEqual(['2026-09-30'])
    expect(r.aulas.map(a => [a.horario.id, a.cancelada])).toEqual([['u', true]])
    const sem = montarEventos(d, '2026-09-29', '2026-10-01', { professoresOcultos: [], tiposOcultos: ['bloqueios'] }, AGORA)
    expect(sem.aulas).toHaveLength(0)
    expect(sem.bloqueios).toHaveLength(0)
  })

  it('aula passada e aula unica', () => {
    const d = dados({ horarios: [turma('x', 1, '07:00', { vigente_desde: '2026-09-28', vigente_ate: '2026-09-28', origem: 'aula_unica' })] })
    const { aulas } = montarEventos(d, '2026-09-28', '2026-10-05', SEM_FILTRO, AGORA)
    expect(aulas).toHaveLength(1)
    expect(aulas[0]).toMatchObject({ passada: true, unica: true })
  })

  it('nome curto', () => {
    expect(nomeCurto('Maria Souza Lima')).toBe('Maria L.')
    expect(nomeCurto('Ana')).toBe('Ana')
  })
})
