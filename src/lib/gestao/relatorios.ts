// Agregacoes dos relatorios de gestao (puras, testadas).

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Ultimos N meses ate o mes de `hoje`, em ordem: ['2025-10', ..., '2026-09']. */
export function ultimosMeses(hoje: string, n = 12) {
  const [a, m] = hoje.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - (n - 1 - i), 1))
    return d.toISOString().slice(0, 7)
  })
}

export function rotuloMes(mes: string) {
  const [a, m] = mes.split('-')
  return `${MESES_CURTOS[Number(m) - 1]}/${a.slice(2)}`
}

export type LinhaFinanceira = { mes: string; rotulo: string; receita: number; despesa: number; saldo: number }

export function financeiroMensal(
  meses: string[],
  pagamentos: { data: string; valor: number }[],
  despesas: { data: string; valor: number }[]
): LinhaFinanceira[] {
  const r = new Map(meses.map(m => [m, 0]))
  const d = new Map(meses.map(m => [m, 0]))
  for (const p of pagamentos) if (r.has(p.data.slice(0, 7))) r.set(p.data.slice(0, 7), r.get(p.data.slice(0, 7))! + Number(p.valor))
  for (const x of despesas) if (d.has(x.data.slice(0, 7))) d.set(x.data.slice(0, 7), d.get(x.data.slice(0, 7))! + Number(x.valor))
  return meses.map(m => {
    const receita = arred(r.get(m)!)
    const despesa = arred(d.get(m)!)
    return { mes: m, rotulo: rotuloMes(m), receita, despesa, saldo: arred(receita - despesa) }
  })
}

export function receitaPorProfissional(
  pagamentos: { valor: number; profissional_id: string | null }[],
  profissionais: { id: string; nome: string; cor: string }[]
) {
  const soma = new Map<string, number>()
  for (const p of pagamentos) {
    const k = p.profissional_id ?? '__sem'
    soma.set(k, (soma.get(k) ?? 0) + Number(p.valor))
  }
  return [...soma.entries()]
    .map(([id, valor]) => {
      const prof = profissionais.find(x => x.id === id)
      return { id, nome: prof?.nome ?? 'Sem profissional', cor: prof?.cor ?? '#98a2b3', valor: arred(valor) }
    })
    .sort((a, b) => b.valor - a.valor)
}

export function clientesPorPlano(alunos: { plano_id: string | null }[], planos: { id: string; nome: string }[]) {
  const c = new Map<string, number>()
  for (const a of alunos) {
    const k = a.plano_id ?? '__sem'
    c.set(k, (c.get(k) ?? 0) + 1)
  }
  return [...c.entries()]
    .map(([id, qtd]) => ({ id, nome: planos.find(p => p.id === id)?.nome ?? 'Sem plano', qtd }))
    .sort((a, b) => b.qtd - a.qtd)
}

/**
 * Taxa de faltas por mes = faltas / (presencas + faltas), a partir do registro
 * de aulas (status veio / reposicao = presenca, faltou = falta).
 * Meses sem aula ficam com taxa nula (lacuna, nao zero).
 */
export function faltasMensais(meses: string[], aulas: { data: string; status: string }[]) {
  const pres = new Map(meses.map(m => [m, 0]))
  const falt = new Map(meses.map(m => [m, 0]))
  for (const a of aulas) {
    const m = a.data.slice(0, 7)
    if (!pres.has(m)) continue
    if (a.status === 'faltou') falt.set(m, falt.get(m)! + 1)
    else if (a.status === 'veio' || a.status === 'reposicao') pres.set(m, pres.get(m)! + 1)
  }
  return meses.map(m => {
    const total = pres.get(m)! + falt.get(m)!
    return { mes: m, rotulo: rotuloMes(m), faltas: falt.get(m)!, total, taxa: total ? Math.round((falt.get(m)! / total) * 1000) / 10 : null }
  })
}

function arred(v: number) {
  return Math.round(v * 100) / 100
}
