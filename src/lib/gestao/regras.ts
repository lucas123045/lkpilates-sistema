// Regras puras da gestao (sem banco), usadas pelas telas e testadas.

import type { CategoriaDespesa, Cliente, FormaPagamento, FuncaoProfissional, Periodicidade } from './tipos'

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatarMoeda(valor: number | null | undefined) {
  return moeda.format(Number(valor ?? 0))
}

export type SituacaoVencimento = 'em_dia' | 'vencido' | 'sem_vencimento'

/** Vencido quando a data de vencimento ja passou (vence hoje ainda esta em dia). */
export function situacaoVencimento(vencimento: string | null | undefined, hoje: string): SituacaoVencimento {
  if (!vencimento) return 'sem_vencimento'
  return vencimento < hoje ? 'vencido' : 'em_dia'
}

export function pagamentoAtrasado(c: Pick<Cliente, 'ativo' | 'vencimento'>, hoje: string) {
  return c.ativo && situacaoVencimento(c.vencimento, hoje) === 'vencido'
}

/** Aniversario no mes de `hoje` (AAAA-MM-DD). */
export function aniversarioNoMes(nascimento: string | null | undefined, hoje: string) {
  return !!nascimento && nascimento.slice(5, 7) === hoje.slice(5, 7)
}

export function aniversarioHoje(nascimento: string | null | undefined, hoje: string) {
  return !!nascimento && nascimento.slice(5, 10) === hoje.slice(5, 10)
}

/** "dd/mm" do aniversario. */
export function formatarAniversario(nascimento: string | null | undefined) {
  if (!nascimento) return ''
  const [, m, d] = nascimento.slice(0, 10).split('-')
  return `${d}/${m}`
}

export function novoNoMes(criadoEm: string, hoje: string) {
  return criadoEm.slice(0, 7) === hoje.slice(0, 7)
}

/**
 * Soma meses como o Postgres (date + interval 'N months'):
 * 31/01 + 1 mes = 28/02 (ou 29/02 em ano bissexto).
 */
export function somarMeses(dataISO: string, meses: number) {
  const [a, m, d] = dataISO.slice(0, 10).split('-').map(Number)
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1))
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  alvo.setUTCDate(Math.min(d, ultimoDia))
  return alvo.toISOString().slice(0, 10)
}

/**
 * Quantos meses um pagamento cobre: valor / preco mensal do plano, arredondado,
 * entre 1 e 12. Sem preco conhecido, 1 mes.
 */
export function mesesSugeridos(valor: number, precoMensal: number | null | undefined) {
  if (!precoMensal || precoMensal <= 0 || !valor || valor <= 0) return 1
  return Math.min(12, Math.max(1, Math.round(valor / precoMensal)))
}

/** Novo vencimento: a partir do vencimento atual ou, sem ele, da data do pagamento. */
export function proximoVencimento(vencimentoAtual: string | null | undefined, dataPagamento: string, meses: number) {
  return somarMeses(vencimentoAtual || dataPagamento, meses)
}

export function inicial(nome: string | null | undefined) {
  return (nome ?? '?').trim().charAt(0).toUpperCase() || '?'
}

export const ROTULO_FORMA: Record<FormaPagamento, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  transferencia: 'Transferência'
}

export const ROTULO_CATEGORIA: Record<CategoriaDespesa, string> = {
  aluguel: 'Aluguel',
  energia: 'Energia',
  equipamentos: 'Equipamentos',
  comissoes: 'Comissões',
  outros: 'Outros'
}

export const ROTULO_PERIODICIDADE: Record<Periodicidade, string> = {
  mensal: 'Mensal',
  bimestral: 'Bimestral',
  trimestral: 'Trimestral',
  quadrimestral: 'Quadrimestral',
  semestral: 'Semestral',
  anual: 'Anual',
  avulso: 'Avulso'
}

export const MESES_PERIODICIDADE: Record<Periodicidade, number> = {
  mensal: 1,
  bimestral: 2,
  trimestral: 3,
  quadrimestral: 4,
  semestral: 6,
  anual: 12,
  avulso: 1
}

export const ROTULO_FUNCAO: Record<FuncaoProfissional, string> = {
  administrador: 'Administrador',
  nivel2: 'Nível 2'
}

/** Nome sugerido de plano: "Semestral 2x/semana". */
export function nomePlano(periodicidade: Periodicidade, aulasSemana: number | null) {
  return `${ROTULO_PERIODICIDADE[periodicidade]}${aulasSemana ? ` ${aulasSemana}x/semana` : ''}`
}

/** Ultimos N dias (inclui hoje): [inicio, hoje]. */
export function ultimosDias(hoje: string, dias: number) {
  const [a, m, d] = hoje.split('-').map(Number)
  const inicio = new Date(Date.UTC(a, m - 1, d - (dias - 1))).toISOString().slice(0, 10)
  return { inicio, fim: hoje }
}
