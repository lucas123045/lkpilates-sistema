export type ContextoIA = {
  periodoLabel: string
  totalAulas: number
  presencas: number
  faltas: number
  reposicoes: number
  frequencia: number | null
  frequenciaAnterior: number | null
  faturamentoMensal: number
  alunosAtivos: number
  topPresenca: { nome: string; presencas: number } | null
  topFaltas: { nome: string; faltas: number } | null
  altoRisco: number
  medioRisco: number
  riscosDetalhe: { nome: string; nivel: string; motivo: string }[]
  temDadosSuficientes: boolean
}
