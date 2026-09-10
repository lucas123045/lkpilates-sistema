import type { Aluno, Aula, Insight, Metricas, PeriodoPreset, PeriodoRange, Variacao } from './types'

// ============================================================
// DATAS
// ============================================================
// Supabase devolve "YYYY-MM-DD" (ou timestamp) para colunas de data.
// `new Date("2025-09-01")` é interpretado como UTC 00:00, o que em
// horario do Brasil (UTC-3) "volta" para o dia anterior. Por isso toda
// data é sempre montada a partir dos componentes ano/mes/dia em horario
// local, nunca via `new Date(string)` direto.
export function parseDataLocal(dataStr: string | null | undefined): Date | null {
  if (!dataStr) return null

  const isoMatch = dataStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const [, ano, mes, dia] = isoMatch
    return new Date(Number(ano), Number(mes) - 1, Number(dia))
  }

  if (dataStr.includes('/')) {
    const [dia, mes, ano] = dataStr.split('/')
    if (dia && mes && ano) {
      return new Date(Number(ano), Number(mes) - 1, Number(dia))
    }
  }

  const d = new Date(dataStr)
  return isNaN(d.getTime()) ? null : d
}

export function formatDataCurta(date: Date) {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const NOMES_MES = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'
]

// ============================================================
// PERÍODOS
// ============================================================
export function calcularPeriodo(
  preset: PeriodoPreset,
  hoje = new Date(),
  custom?: { inicio: string; fim: string }
): PeriodoRange {
  const fimHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999)
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())

  switch (preset) {
    case 'hoje':
      return { inicio: inicioHoje, fim: fimHoje, label: 'Hoje' }

    case '7d': {
      const inicio = new Date(inicioHoje)
      inicio.setDate(inicio.getDate() - 6)
      return { inicio, fim: fimHoje, label: 'Últimos 7 dias' }
    }

    case '30d': {
      const inicio = new Date(inicioHoje)
      inicio.setDate(inicio.getDate() - 29)
      return { inicio, fim: fimHoje, label: 'Últimos 30 dias' }
    }

    case 'mes_atual': {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
      return { inicio, fim: fimHoje, label: 'Este mês' }
    }

    case 'mes_passado': {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
      const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0, 23, 59, 59, 999)
      return { inicio, fim, label: 'Mês passado' }
    }

    case '3m': {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1)
      return { inicio, fim: fimHoje, label: 'Últimos 3 meses' }
    }

    case 'ano': {
      const inicio = new Date(hoje.getFullYear(), 0, 1)
      return { inicio, fim: fimHoje, label: 'Este ano' }
    }

    case 'personalizado': {
      const inicioCustom = custom?.inicio ? parseDataLocal(custom.inicio) : null
      const fimCustom = custom?.fim ? parseDataLocal(custom.fim) : null
      const inicio = inicioCustom || inicioHoje
      const fimBase = fimCustom || fimHoje
      const fim = new Date(fimBase.getFullYear(), fimBase.getMonth(), fimBase.getDate(), 23, 59, 59, 999)
      return { inicio, fim, label: 'Período personalizado' }
    }

    default:
      return { inicio: inicioHoje, fim: fimHoje, label: 'Hoje' }
  }
}

/** Período imediatamente anterior, com a mesma duração do período atual. */
export function periodoAnterior(range: PeriodoRange): PeriodoRange {
  const duracaoMs = range.fim.getTime() - range.inicio.getTime()
  const fim = new Date(range.inicio.getTime() - 1)
  const inicio = new Date(fim.getTime() - duracaoMs)
  return { inicio, fim, label: 'Período anterior' }
}

// ============================================================
// STATUS DE AULA
// ============================================================
export function isPresente(status: string) {
  const s = (status || '').toLowerCase()
  return s === 'veio' || s === 'reposicao' || s === 'reposição'
}

export function isFalta(status: string) {
  return (status || '').toLowerCase() === 'faltou'
}

export function isReposicao(status: string) {
  const s = (status || '').toLowerCase()
  return s === 'reposicao' || s === 'reposição'
}

/** Remove aulas canceladas (deleted_at) e o marcador de reinício de plano, que não é um resultado de aula. */
export function aulasValidas(aulas: Aula[]): Aula[] {
  return aulas.filter(a => !a.deleted_at && a.status !== 'reinicio')
}

export function aulasNoPeriodo(aulas: Aula[], range: PeriodoRange): Aula[] {
  return aulasValidas(aulas).filter(a => {
    const d = parseDataLocal(a.data)
    return d !== null && d >= range.inicio && d <= range.fim
  })
}

// ============================================================
// MÉTRICAS
// ============================================================
// Frequência = presenças / (presenças + faltas). Reposições contam como
// presença (o aluno esteve na aula); "reinicio" nunca entra na conta.
export function calcularMetricas(aulas: Aula[]): Metricas {
  const presencas = aulas.filter(a => isPresente(a.status)).length
  const faltas = aulas.filter(a => isFalta(a.status)).length
  const reposicoes = aulas.filter(a => isReposicao(a.status)).length
  const base = presencas + faltas
  const frequencia = base > 0 ? (presencas / base) * 100 : null

  return { totalAulas: aulas.length, presencas, faltas, reposicoes, frequencia }
}

/**
 * Contagem por status SEM sobreposição (veio / reposição / faltou são
 * mutuamente exclusivos). Usado nos gráficos empilhados, onde somar
 * "presenças" (que já inclui reposição) com "reposições" duplicaria a barra.
 */
export function contarPorStatusExclusivo(aulas: Aula[]) {
  let veio = 0
  let reposicao = 0
  let faltou = 0

  aulas.forEach(a => {
    const s = (a.status || '').toLowerCase()
    if (s === 'faltou') faltou++
    else if (s === 'reposicao' || s === 'reposição') reposicao++
    else if (s === 'veio') veio++
  })

  return { veio, reposicao, faltou }
}

/**
 * Variação percentual entre dois valores absolutos (ex.: total de aulas).
 * Sem período anterior para comparar (anterior = 0), a variação fica indisponível
 * em vez de mostrar um "+Infinity%" sem sentido.
 */
export function variacaoPercentual(atual: number, anterior: number): Variacao {
  if (anterior === 0) return { tipo: 'indisponivel', valor: null }
  return { tipo: 'percentual', valor: ((atual - anterior) / anterior) * 100 }
}

/**
 * Diferença em pontos percentuais entre duas taxas (ex.: frequência).
 * NUNCA deve ser confundida com variação percentual: 40% -> 44% é
 * "+4 p.p.", não "+10%".
 */
export function variacaoPontos(atualPct: number | null, anteriorPct: number | null): Variacao {
  if (atualPct === null || anteriorPct === null) return { tipo: 'indisponivel', valor: null }
  return { tipo: 'pontos', valor: atualPct - anteriorPct }
}

// ============================================================
// SÉRIES TEMPORAIS (para os gráficos)
// ============================================================
export function serieMensal(aulas: Aula[], meses = 6, referencia = new Date()) {
  const validas = aulasValidas(aulas)

  const buckets = Array.from({ length: meses }, (_, idx) => {
    const i = meses - 1 - idx
    const d = new Date(referencia.getFullYear(), referencia.getMonth() - i, 1)
    return { ano: d.getFullYear(), mes: d.getMonth(), label: NOMES_MES[d.getMonth()] }
  })

  return buckets.map(b => {
    const doMes = validas.filter(a => {
      const d = parseDataLocal(a.data)
      return d && d.getFullYear() === b.ano && d.getMonth() === b.mes
    })
    const m = calcularMetricas(doMes)
    const exclusivo = contarPorStatusExclusivo(doMes)
    return {
      mes: b.label,
      presencas: exclusivo.veio,
      faltas: exclusivo.faltou,
      reposicoes: exclusivo.reposicao,
      totalAulas: m.totalAulas,
      frequencia: m.frequencia !== null ? Math.round(m.frequencia * 10) / 10 : null
    }
  })
}

export function distribuicaoPorDiaSemana(aulas: Aula[]) {
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const contagem = dias.map(label => ({ label, total: 0 }))

  aulasValidas(aulas).forEach(a => {
    const d = parseDataLocal(a.data)
    if (!d) return
    contagem[d.getDay()].total++
  })

  return contagem
}

// ============================================================
// FATURAMENTO
// ============================================================
// MRR: soma do valor de plano dos alunos atualmente ativos. É uma
// estimativa de receita recorrente mensal, não uma medição histórica
// (o sistema não guarda o valor do plano ao longo do tempo).
export function faturamentoRecorrente(alunos: Aluno[]): number {
  return alunos.filter(a => a.ativo).reduce((soma, a) => soma + (a.valor_plano || 0), 0)
}

export function recebidoPorMes(alunos: Aluno[], meses = 6, referencia = new Date()) {
  const buckets = Array.from({ length: meses }, (_, idx) => {
    const i = meses - 1 - idx
    const d = new Date(referencia.getFullYear(), referencia.getMonth() - i, 1)
    return { ano: d.getFullYear(), mes: d.getMonth(), label: NOMES_MES[d.getMonth()], valor: 0 }
  })

  let semData = 0
  alunos.forEach(a => {
    const d = parseDataLocal(a.pagou_em)
    if (!d) {
      if (a.pagou_em) semData++
      return
    }
    const bucket = buckets.find(b => b.ano === d.getFullYear() && b.mes === d.getMonth())
    if (bucket) bucket.valor += a.valor_plano || 0
  })

  return {
    serie: buckets.map(b => ({ mes: b.label, valor: Math.round(b.valor) })),
    semData,
    comDados: buckets.some(b => b.valor > 0)
  }
}

// ============================================================
// DETECÇÃO DE ANOMALIAS (estatística simples, sem inventar tendência)
// ============================================================
export function detectarAnomalias(aulas: Aula[], referencia = new Date()): Insight[] {
  const validas = aulasValidas(aulas)
  const anomalias: Insight[] = []

  const semanas: number[] = []
  for (let i = 8; i >= 0; i--) {
    const fimSemana = new Date(referencia)
    fimSemana.setDate(fimSemana.getDate() - i * 7)
    const inicioSemana = new Date(fimSemana)
    inicioSemana.setDate(inicioSemana.getDate() - 6)

    const faltasSemana = validas.filter(a => {
      if (!isFalta(a.status)) return false
      const d = parseDataLocal(a.data)
      return d && d >= inicioSemana && d <= fimSemana
    }).length

    semanas.push(faltasSemana)
  }

  const atual = semanas[semanas.length - 1]
  const historico = semanas.slice(0, -1)

  if (historico.length >= 4) {
    const media = historico.reduce((s, v) => s + v, 0) / historico.length
    const variancia = historico.reduce((s, v) => s + (v - media) ** 2, 0) / historico.length
    const desvio = Math.sqrt(variancia)
    const limite = media + Math.max(1.5 * desvio, 2)

    if (atual >= 3 && atual > limite) {
      anomalias.push({
        titulo: 'Aumento incomum de faltas',
        descricao: `Esta semana teve ${atual} falta${atual === 1 ? '' : 's'}, acima da média recente de ${media.toFixed(1)} por semana.`,
        categoria: 'atencao'
      })
    }
  }

  return anomalias
}

// ============================================================
// FORMATAÇÃO
// ============================================================
export function formatMoney(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatPercent(v: number | null, casas = 1) {
  if (v === null || isNaN(v)) return '—'
  return `${v.toFixed(casas)}%`
}

export function formatVariacao(v: Variacao): string {
  if (v.tipo === 'indisponivel' || v.valor === null) return 'sem período anterior'
  const sinal = v.valor > 0 ? '+' : ''
  if (v.tipo === 'pontos') return `${sinal}${v.valor.toFixed(1)} p.p.`
  return `${sinal}${v.valor.toFixed(1)}%`
}
