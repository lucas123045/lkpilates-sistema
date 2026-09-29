import { describe, expect, it } from 'vitest'
import {
  diaSemanaISO,
  diasDaSemana,
  formatarData,
  hojeEstudio,
  inicioSemana,
  momentoMs,
  sobrepoe
} from '@/lib/agenda/datas'
import {
  calcularDesmarcacao,
  conflitoDoAluno,
  conflitosDeProfessor,
  creditoServeParaData,
  creditoVencendo,
  dataExpiracaoCredito,
  excedePlano,
  frequenciaDoPlano,
  horarioBloqueado,
  iniciais,
  ocupacao,
  professorEfetivo,
  resumoDoDia,
  sugerirDiasFixos,
  situacaoCredito,
  verificarCapacidade
} from '@/lib/agenda/regras'

describe('datas no fuso do estudio', () => {
  it('semana comeca na segunda', () => {
    expect(diaSemanaISO('2026-09-28')).toBe(1)
    expect(diaSemanaISO('2026-10-04')).toBe(7)
    expect(inicioSemana('2026-10-04')).toBe('2026-09-28')
    expect(diasDaSemana('2026-09-30')).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'
    ])
  })

  it('hoje e calculado em America/Sao_Paulo, nao em UTC', () => {
    // 02:30 UTC de 30/09 ainda e 29/09 23:30 em Sao Paulo
    expect(hojeEstudio(new Date('2026-09-30T02:30:00Z'))).toBe('2026-09-29')
  })

  it('formata dd/mm/aaaa e detecta sobreposicao', () => {
    expect(formatarData('2026-09-29')).toBe('29/09/2026')
    expect(sobrepoe('18:00', 55, '18:30', 55)).toBe(true)
    expect(sobrepoe('18:00', 55, '18:55', 55)).toBe(false)
  })
})

describe('desmarcacao e antecedencia', () => {
  const aula = { data: '2026-09-29', hora: '18:00:00', tipo: 'fixo' as const }

  it('exatamente no limite ainda esta no prazo', () => {
    const r = calcularDesmarcacao(aula, 3, momentoMs('2026-09-29', '15:00'))
    expect(r).toEqual({ horasAntecedencia: 3, dentroPrazo: true, geraCredito: true, novoStatus: 'falta_justificada' })
  })

  it('fora do prazo vira falta sem credito', () => {
    const r = calcularDesmarcacao(aula, 3, momentoMs('2026-09-29', '15:01'))
    expect(r.dentroPrazo).toBe(false)
    expect(r.novoStatus).toBe('falta')
    expect(r.geraCredito).toBe(false)
  })

  it('credito pode ser concedido manualmente', () => {
    expect(calcularDesmarcacao(aula, 3, momentoMs('2026-09-29', '17:30'), true).novoStatus).toBe('falta_justificada')
  })

  it('experimental e avulsa so desmarcam', () => {
    expect(calcularDesmarcacao({ ...aula, tipo: 'experimental' }, 3, momentoMs('2026-09-28', '10:00')))
      .toMatchObject({ novoStatus: 'desmarcado', geraCredito: false })
  })
})

describe('validade do credito', () => {
  const credito = { usado_em: null, cancelado_em: null, expira_em: '2026-10-29' }

  it('expira N dias apos a aula (ou hoje, se a aula ja passou)', () => {
    expect(dataExpiracaoCredito('2026-09-29', '2026-09-28', 30)).toBe('2026-10-29')
    expect(dataExpiracaoCredito('2026-09-01', '2026-09-28', 30)).toBe('2026-10-28')
  })

  it('serve ate o dia da expiracao inclusive', () => {
    expect(creditoServeParaData(credito, '2026-10-29')).toBe(true)
    expect(creditoServeParaData(credito, '2026-10-30')).toBe(false)
    expect(creditoServeParaData({ ...credito, usado_em: '2026-10-01' }, '2026-10-02')).toBe(false)
  })

  it('situacao e alerta de vencimento', () => {
    expect(situacaoCredito(credito, '2026-10-29')).toBe('ativo')
    expect(situacaoCredito(credito, '2026-10-30')).toBe('vencido')
    expect(situacaoCredito({ ...credito, cancelado_em: 'x' }, '2026-10-01')).toBe('cancelado')
    expect(creditoVencendo(credito, '2026-10-22')).toBe(true)
    expect(creditoVencendo(credito, '2026-10-21')).toBe(false)
  })
})

describe('capacidade e conflitos', () => {
  it('ocupacao conta so status que ocupam vaga', () => {
    const lista = [{ status: 'agendado' }, { status: 'presente' }, { status: 'falta_justificada' }, { status: 'desmarcado' }] as any
    expect(ocupacao(3, lista)).toEqual({ ocupados: 2, capacidade: 3, vagas: 1, nivel: 'quase' })
    expect(ocupacao(2, lista).nivel).toBe('lotado')
    expect(ocupacao(3, lista, true).nivel).toBe('bloqueado')
    expect(ocupacao(1, []).nivel).toBe('livre')
  })

  it('capacidade: encaixe so com permissao', () => {
    expect(verificarCapacidade(2, 3, false)).toBe('ok')
    expect(verificarCapacidade(3, 3, false)).toBe('lotado')
    expect(verificarCapacidade(3, 3, true)).toBe('encaixe')
  })

  it('conflito do aluno ignora desmarcados e o proprio agendamento', () => {
    const doAluno = [
      { id: 'a1', data: '2026-09-29', hora: '18:00', duracao_min: 55, status: 'agendado', horario_id: 'a' },
      { id: 'a2', data: '2026-09-29', hora: '07:00', duracao_min: 55, status: 'desmarcado', horario_id: 'b' }
    ] as any
    expect(conflitoDoAluno(doAluno, '2026-09-29', '18:30', 55)?.id).toBe('a1')
    expect(conflitoDoAluno(doAluno, '2026-09-29', '18:30', 55, 'a1')).toBeUndefined()
    expect(conflitoDoAluno(doAluno, '2026-09-29', '07:00', 55)).toBeUndefined()
  })

  it('bloqueio de dia inteiro, periodo e de um horario', () => {
    const bloqueios = [
      { id: '1', data: '2026-10-12', data_fim: null, horario_id: null, motivo: 'Feriado' },
      { id: '2', data: '2026-12-20', data_fim: '2027-01-05', horario_id: null, motivo: 'Recesso' },
      { id: '3', data: '2026-09-29', data_fim: null, horario_id: 'h1', motivo: 'Manutenção' }
    ]
    expect(horarioBloqueado(bloqueios, 'hx', '2026-10-12')?.motivo).toBe('Feriado')
    expect(horarioBloqueado(bloqueios, 'hx', '2027-01-02')?.motivo).toBe('Recesso')
    expect(horarioBloqueado(bloqueios, 'h1', '2026-09-29')?.motivo).toBe('Manutenção')
    expect(horarioBloqueado(bloqueios, 'h2', '2026-09-29')).toBeUndefined()
  })
})

describe('professores', () => {
  it('prioridade dia > aluno > horario', () => {
    expect(professorEfetivo({ dia: 'C', aluno: 'B', horario: 'A' })).toEqual({ professorId: 'C', origem: 'dia' })
    expect(professorEfetivo({ aluno: 'B', horario: 'A' })).toEqual({ professorId: 'B', origem: 'aluno' })
    expect(professorEfetivo({ horario: 'A' })).toEqual({ professorId: 'A', origem: 'horario' })
    expect(professorEfetivo({})).toEqual({ professorId: null, origem: null })
  })

  it('detecta professor em duas turmas sobrepostas', () => {
    const ags = [
      { professor_id: 'p1', data: '2026-09-29', hora: '18:00', duracao_min: 55, horario_id: 'h1', status: 'agendado' },
      { professor_id: 'p1', data: '2026-09-29', hora: '18:00', duracao_min: 55, horario_id: 'h1', status: 'agendado' },
      { professor_id: 'p1', data: '2026-09-29', hora: '18:30', duracao_min: 55, horario_id: 'h2', status: 'agendado' },
      { professor_id: 'p1', data: '2026-09-29', hora: '19:00', duracao_min: 55, horario_id: 'h3', status: 'agendado' },
      { professor_id: 'p2', data: '2026-09-29', hora: '18:00', duracao_min: 55, horario_id: 'h4', status: 'agendado' }
    ] as any
    const c = conflitosDeProfessor(ags)
    expect(c.map(x => [x.a.horarioId, x.b.horarioId])).toEqual([['h1', 'h2'], ['h2', 'h3']])
  })

  it('iniciais', () => {
    expect(iniciais('Maria da Silva')).toBe('MS')
    expect(iniciais('Lu')).toBe('LU')
  })
})

describe('plano e resumo', () => {
  it('frequencia a partir do texto do plano', () => {
    expect(frequenciaDoPlano('semestral 2x')).toBe(2)
    expect(frequenciaDoPlano('3 x por semana')).toBe(3)
    expect(frequenciaDoPlano('mensal')).toBeNull()
    expect(frequenciaDoPlano('pago fev a julho 6x411')).toBeNull()
    expect(frequenciaDoPlano('mensal 2x 474')).toBe(2)
    expect(excedePlano(2, 3)).toBe(true)
    expect(excedePlano(null, 5)).toBe(false)
  })

  it('resumo do dia desconsidera horarios bloqueados', () => {
    const horarios = [{ id: 'a', capacidade: 3 }, { id: 'b', capacidade: 2 }, { id: 'c', capacidade: 3 }]
    const ags = [
      { horario_id: 'a', status: 'presente', tipo: 'fixo' },
      { horario_id: 'a', status: 'falta', tipo: 'fixo' },
      { horario_id: 'a', status: 'falta_justificada', tipo: 'fixo' },
      { horario_id: 'b', status: 'agendado', tipo: 'experimental' }
    ] as any
    expect(resumoDoDia(horarios, ags, new Set(['c']))).toEqual({
      totalAulas: 2,
      capacidadeTotal: 5,
      ocupados: 3,
      ocupacaoPct: 60,
      presencas: 1,
      faltas: 1,
      faltasJustificadas: 1,
      experimentais: 1,
      vagasLivres: 2
    })
  })
})

describe('sugestao de dias fixos pelo historico', () => {
  it('pega os dias recorrentes e ignora aulas esporadicas e antigas', () => {
    const datas = [
      // terca e quinta nas ultimas 6 semanas (29/09/2026 = terca)
      '2026-08-25', '2026-08-27', '2026-09-01', '2026-09-03', '2026-09-08', '2026-09-10',
      '2026-09-15', '2026-09-17', '2026-09-22', '2026-09-24',
      '2026-09-12', // um sabado de reposicao
      '2026-03-02', '2026-03-09', '2026-03-16' // segundas antigas
    ]
    expect(sugerirDiasFixos(datas, '2026-09-26')).toEqual([
      { dia: 2, vezes: 5, semanas: 5 },
      { dia: 4, vezes: 5, semanas: 5 }
    ])
  })

  it('sem historico recente nao sugere nada', () => {
    expect(sugerirDiasFixos(['2025-01-07'], '2026-09-26')).toEqual([])
  })
})
