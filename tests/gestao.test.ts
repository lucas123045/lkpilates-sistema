import { describe, expect, it } from 'vitest'
import {
  aniversarioHoje,
  aniversarioNoMes,
  formatarMoeda,
  mesesSugeridos,
  nomePlano,
  pagamentoAtrasado,
  proximoVencimento,
  situacaoVencimento,
  somarMeses,
  ultimosDias
} from '@/lib/gestao/regras'
import { clientesPorPlano, faltasMensais, financeiroMensal, receitaPorProfissional, ultimosMeses } from '@/lib/gestao/relatorios'

describe('vencimento', () => {
  it('vence hoje ainda esta em dia; ontem esta vencido', () => {
    expect(situacaoVencimento('2026-09-28', '2026-09-28')).toBe('em_dia')
    expect(situacaoVencimento('2026-09-27', '2026-09-28')).toBe('vencido')
    expect(situacaoVencimento(null, '2026-09-28')).toBe('sem_vencimento')
    expect(pagamentoAtrasado({ ativo: false, vencimento: '2026-01-01' }, '2026-09-28')).toBe(false)
  })

  it('soma meses como o banco (fim de mes)', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28')
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29')
    expect(somarMeses('2026-09-10', 2)).toBe('2026-11-10')
    expect(somarMeses('2026-11-15', 3)).toBe('2027-02-15')
  })

  it('meses cobertos pelo pagamento e proximo vencimento', () => {
    expect(mesesSugeridos(2466, 411)).toBe(6)
    expect(mesesSugeridos(411, 411)).toBe(1)
    expect(mesesSugeridos(50, 411)).toBe(1)
    expect(mesesSugeridos(99999, 100)).toBe(12)
    expect(mesesSugeridos(300, null)).toBe(1)
    expect(proximoVencimento('2026-09-10', '2026-09-26', 1)).toBe('2026-10-10')
    expect(proximoVencimento(null, '2026-09-26', 1)).toBe('2026-10-26')
  })
})

describe('aniversarios e formatos', () => {
  it('aniversario no mes e hoje', () => {
    expect(aniversarioNoMes('1990-09-02', '2026-09-28')).toBe(true)
    expect(aniversarioNoMes('1990-10-02', '2026-09-28')).toBe(false)
    expect(aniversarioHoje('1985-09-28', '2026-09-28')).toBe(true)
  })

  it('moeda, nome de plano e periodo', () => {
    expect(formatarMoeda(411).replace(/\s/g, ' ')).toBe('R$ 411,00')
    expect(nomePlano('semestral', 2)).toBe('Semestral 2x/semana')
    expect(ultimosDias('2026-09-28', 30)).toEqual({ inicio: '2026-08-30', fim: '2026-09-28' })
  })
})


describe('relatorios de gestao', () => {
  it('12 meses terminando no mes atual', () => {
    const m = ultimosMeses('2026-09-28')
    expect(m).toHaveLength(12)
    expect([m[0], m[11]]).toEqual(['2025-10', '2026-09'])
  })

  it('receita x despesa e saldo por mes, ignorando fora do periodo', () => {
    const r = financeiroMensal(['2026-08', '2026-09'], [
      { data: '2026-08-05', valor: 411 }, { data: '2026-09-01', valor: 330 }, { data: '2026-09-20', valor: 474.5 }, { data: '2025-01-01', valor: 999 }
    ], [{ data: '2026-09-10', valor: 1200 }])
    expect(r).toEqual([
      { mes: '2026-08', rotulo: 'ago/26', receita: 411, despesa: 0, saldo: 411 },
      { mes: '2026-09', rotulo: 'set/26', receita: 804.5, despesa: 1200, saldo: -395.5 }
    ])
  })

  it('receita por profissional e clientes por plano, em ordem decrescente', () => {
    const profs = [{ id: 'p1', nome: 'Prof A', cor: '#111111' }]
    expect(receitaPorProfissional([{ valor: 100, profissional_id: 'p1' }, { valor: 50, profissional_id: null }, { valor: 30, profissional_id: 'p1' }], profs)).toEqual([
      { id: 'p1', nome: 'Prof A', cor: '#111111', valor: 130 },
      { id: '__sem', nome: 'Sem profissional', cor: '#98a2b3', valor: 50 }
    ])
    expect(clientesPorPlano([{ plano_id: 'x' }, { plano_id: null }, { plano_id: 'x' }], [{ id: 'x', nome: 'Mensal 2x/semana' }])).toEqual([
      { id: 'x', nome: 'Mensal 2x/semana', qtd: 2 },
      { id: '__sem', nome: 'Sem plano', qtd: 1 }
    ])
  })

  it('taxa de faltas: reposicao conta como presenca, reinicio e ignorado, mes vazio = null', () => {
    const r = faltasMensais(['2026-08', '2026-09'], [
      { data: '2026-09-01', status: 'veio' }, { data: '2026-09-02', status: 'faltou' },
      { data: '2026-09-03', status: 'reposicao' }, { data: '2026-09-04', status: 'reinicio' }
    ])
    expect(r[0].taxa).toBeNull()
    expect(r[1]).toMatchObject({ faltas: 1, total: 3, taxa: 33.3 })
  })
})
