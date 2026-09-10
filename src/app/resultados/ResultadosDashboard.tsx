'use client'

import { useMemo, useState } from 'react'
import {
  AlertOctagon,
  BarChart3,
  CalendarRange,
  ChartPie,
  CircleDollarSign,
  LineChart as LineChartIcon,
  Repeat2,
  Ticket,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  XCircle
} from 'lucide-react'
import ChatBot from './ChatBot'
import Filtros, { type StatusFiltro } from './components/Filtros'
import KpiCard from './components/KpiCard'
import GraficoFrequencia from './components/GraficoFrequencia'
import GraficoAulasPorStatus from './components/GraficoAulasPorStatus'
import GraficoDistribuicao from './components/GraficoDistribuicao'
import GraficoDiaSemana from './components/GraficoDiaSemana'
import GraficoRecebido from './components/GraficoRecebido'
import Ranking from './components/Ranking'
import InsightsPanel from './components/InsightsPanel'
import RiscoCancelamento from './components/RiscoCancelamento'
import { EstadoVazio } from './components/EstadoVazio'
import {
  aulasNoPeriodo,
  calcularMetricas,
  calcularPeriodo,
  contarPorStatusExclusivo,
  distribuicaoPorDiaSemana,
  faturamentoRecorrente,
  formatMoney,
  isFalta,
  isPresente,
  periodoAnterior,
  recebidoPorMes,
  serieMensal,
  variacaoPercentual,
  variacaoPontos
} from './lib/calculos'
import { gerarInsights } from './lib/insights'
import { calcularRiscoTodos } from './lib/risco'
import type { Aluno, PeriodoPreset } from './lib/types'
import type { ContextoIA } from './lib/contextoIA'
import styles from './resultados.module.css'

function statusBate(status: string, filtro: StatusFiltro) {
  const s = (status || '').toLowerCase()
  if (filtro === 'todos') return true
  if (filtro === 'reposicao') return s === 'reposicao' || s === 'reposição'
  return s === filtro
}

const LABEL_STATUS: Record<StatusFiltro, string> = {
  todos: 'Total de aulas',
  veio: 'Presenças',
  faltou: 'Faltas',
  reposicao: 'Reposições'
}

export default function ResultadosDashboard({ alunos }: { alunos: Aluno[] }) {
  const [periodo, setPeriodo] = useState<PeriodoPreset>('30d')
  const [customInicio, setCustomInicio] = useState('')
  const [customFim, setCustomFim] = useState('')
  const [alunoId, setAlunoId] = useState('todos')
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>('todos')

  const hoje = useMemo(() => new Date(), [])
  const modoAluno = alunoId !== 'todos'

  const alunosSelecionados = useMemo(
    () => (modoAluno ? alunos.filter(a => a.id === alunoId) : alunos),
    [alunos, alunoId, modoAluno]
  )

  const range = useMemo(
    () => calcularPeriodo(periodo, hoje, { inicio: customInicio, fim: customFim }),
    [periodo, customInicio, customFim, hoje]
  )
  const rangeAnterior = useMemo(() => periodoAnterior(range), [range])

  const aulasPeriodo = useMemo(
    () => alunosSelecionados.flatMap(a => aulasNoPeriodo(a.aulas, range).map(aula => ({ ...aula, aluno: a }))),
    [alunosSelecionados, range]
  )

  const aulasPeriodoAnterior = useMemo(
    () => alunosSelecionados.flatMap(a => aulasNoPeriodo(a.aulas, rangeAnterior)),
    [alunosSelecionados, rangeAnterior]
  )

  const metricasAtual = useMemo(() => calcularMetricas(aulasPeriodo), [aulasPeriodo])
  const metricasAnterior = useMemo(() => calcularMetricas(aulasPeriodoAnterior), [aulasPeriodoAnterior])

  const contagemAtual = useMemo(() => aulasPeriodo.filter(a => statusBate(a.status, statusFiltro)).length, [aulasPeriodo, statusFiltro])
  const contagemAnterior = useMemo(
    () => aulasPeriodoAnterior.filter(a => statusBate(a.status, statusFiltro)).length,
    [aulasPeriodoAnterior, statusFiltro]
  )

  const variacaoContagem = variacaoPercentual(contagemAtual, contagemAnterior)
  const variacaoFrequencia = variacaoPontos(metricasAtual.frequencia, metricasAnterior.frequencia)
  const variacaoFaltas = variacaoPercentual(metricasAtual.faltas, metricasAnterior.faltas)
  const variacaoReposicoes = variacaoPercentual(metricasAtual.reposicoes, metricasAnterior.reposicoes)

  const faturamentoMRR = useMemo(() => faturamentoRecorrente(alunosSelecionados), [alunosSelecionados])
  const alunosAtivos = useMemo(() => alunosSelecionados.filter(a => a.ativo).length, [alunosSelecionados])

  const serieFrequencia = useMemo(
    () => serieMensal(alunosSelecionados.flatMap(a => a.aulas), 6, hoje),
    [alunosSelecionados, hoje]
  )

  const distribuicaoStatus = useMemo(() => contarPorStatusExclusivo(aulasPeriodo), [aulasPeriodo])
  const distribuicaoSemana = useMemo(() => distribuicaoPorDiaSemana(aulasPeriodo), [aulasPeriodo])
  const recebido = useMemo(() => recebidoPorMes(alunosSelecionados, 6, hoje), [alunosSelecionados, hoje])

  const riscos = useMemo(() => calcularRiscoTodos(alunosSelecionados, 30, hoje), [alunosSelecionados, hoje])
  const altoRisco = riscos.filter(r => r.nivel === 'alto').length
  const medioRisco = riscos.filter(r => r.nivel === 'medio').length

  const rankingValor = useMemo(
    () =>
      [...alunosSelecionados]
        .filter(a => a.ativo)
        .sort((a, b) => (b.valor_plano || 0) - (a.valor_plano || 0))
        .slice(0, 5)
        .map(a => ({ nome: a.nome, valor: formatMoney(a.valor_plano || 0) })),
    [alunosSelecionados]
  )

  const rankingPresenca = useMemo(() => {
    const contagem = new Map<string, number>()
    aulasPeriodo.forEach(a => {
      if (isPresente(a.status)) contagem.set(a.aluno.nome, (contagem.get(a.aluno.nome) || 0) + 1)
    })
    return [...contagem.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([nome, presencas]) => ({ nome, valor: `${presencas} aulas` }))
  }, [aulasPeriodo])

  const rankingFaltas = useMemo(() => {
    const contagem = new Map<string, number>()
    aulasPeriodo.forEach(a => {
      if (isFalta(a.status)) contagem.set(a.aluno.nome, (contagem.get(a.aluno.nome) || 0) + 1)
    })
    return [...contagem.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([nome, faltas]) => ({ nome, valor: `${faltas} faltas` }))
  }, [aulasPeriodo])

  const insights = useMemo(
    () =>
      gerarInsights({
        atual: metricasAtual,
        anterior: metricasAnterior,
        aulasCompletas: alunosSelecionados.flatMap(a => a.aulas),
        riscos,
        referencia: hoje
      }),
    [metricasAtual, metricasAnterior, alunosSelecionados, riscos, hoje]
  )

  const contextoIA: ContextoIA = useMemo(
    () => ({
      periodoLabel: range.label,
      totalAulas: metricasAtual.totalAulas,
      presencas: metricasAtual.presencas,
      faltas: metricasAtual.faltas,
      reposicoes: metricasAtual.reposicoes,
      frequencia: metricasAtual.frequencia,
      frequenciaAnterior: metricasAnterior.frequencia,
      faturamentoMensal: faturamentoMRR,
      alunosAtivos,
      topPresenca:
        rankingPresenca[0] && metricasAtual.presencas > 0
          ? { nome: rankingPresenca[0].nome, presencas: Number(rankingPresenca[0].valor.split(' ')[0]) }
          : null,
      topFaltas:
        rankingFaltas[0] && metricasAtual.faltas > 0
          ? { nome: rankingFaltas[0].nome, faltas: Number(rankingFaltas[0].valor.split(' ')[0]) }
          : null,
      altoRisco,
      medioRisco,
      riscosDetalhe: riscos
        .filter(r => r.nivel !== 'baixo')
        .slice(0, 5)
        .map(r => ({ nome: r.nome, nivel: r.nivel, motivo: r.motivo })),
      temDadosSuficientes: metricasAtual.totalAulas > 0
    }),
    [range, metricasAtual, metricasAnterior, faturamentoMRR, alunosAtivos, rankingPresenca, rankingFaltas, altoRisco, medioRisco, riscos]
  )

  if (alunos.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.wrap}>
          <EstadoVazio
            titulo="Ainda não há dados suficientes"
            texto="Cadastre alunos e registre aulas para que os Resultados sejam calculados."
          />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Resultados</h1>
            <p className={styles.subtitle}>Central de análise de desempenho do LK Pilates · {range.label}</p>
          </div>
        </div>

        <Filtros
          periodo={periodo}
          onPeriodoChange={setPeriodo}
          customInicio={customInicio}
          customFim={customFim}
          onCustomInicioChange={setCustomInicio}
          onCustomFimChange={setCustomFim}
          alunoId={alunoId}
          onAlunoChange={setAlunoId}
          alunos={alunos.map(a => ({ id: a.id, nome: a.nome }))}
          statusFiltro={statusFiltro}
          onStatusChange={setStatusFiltro}
        />

        {/* KPIs */}
        <div className={styles.kpiGrid}>
          {!modoAluno && (
            <KpiCard icone={<Users size={17} strokeWidth={1.75} />} label="Alunos ativos" valor={String(alunosAtivos)} caption="Alunos com status ativo" />
          )}

          <KpiCard
            icone={<BarChart3 size={17} strokeWidth={1.75} />}
            label={LABEL_STATUS[statusFiltro]}
            valor={String(contagemAtual)}
            variacao={variacaoContagem}
            caption={`no período: ${range.label.toLowerCase()}`}
          />

          <KpiCard
            icone={<TrendingUp size={17} strokeWidth={1.75} />}
            label="Frequência"
            valor={metricasAtual.frequencia !== null ? `${metricasAtual.frequencia.toFixed(1)}%` : '—'}
            variacao={variacaoFrequencia}
            caption="presenças / (presenças + faltas)"
          />

          <KpiCard
            icone={<XCircle size={17} strokeWidth={1.75} />}
            label="Faltas"
            valor={String(metricasAtual.faltas)}
            variacao={variacaoFaltas}
            invertido
            caption="no período selecionado"
          />

          <KpiCard
            icone={<Repeat2 size={17} strokeWidth={1.75} />}
            label="Reposições"
            valor={String(metricasAtual.reposicoes)}
            variacao={variacaoReposicoes}
            caption="no período selecionado"
          />

          {modoAluno ? (
            <KpiCard
              icone={<Ticket size={17} strokeWidth={1.75} />}
              label="Aulas restantes"
              valor={String(alunosSelecionados[0]?.aulas_restantes ?? 0)}
              caption={`Plano: ${alunosSelecionados[0]?.plano ?? '—'}`}
            />
          ) : (
            <KpiCard icone={<Wallet size={17} strokeWidth={1.75} />} label="Faturamento (MRR)" valor={formatMoney(faturamentoMRR)} caption="soma dos planos ativos" />
          )}
        </div>

        {/* GRÁFICOS PRINCIPAIS */}
        <div className={styles.grid2}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>
                <LineChartIcon size={16} strokeWidth={1.75} /> Evolução da frequência
              </span>
              <span className={styles.cardCaption}>Últimos 6 meses</span>
            </div>
            <GraficoFrequencia data={serieFrequencia} />
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>
                <ChartPie size={16} strokeWidth={1.75} /> Distribuição no período
              </span>
            </div>
            <GraficoDistribuicao veio={distribuicaoStatus.veio} reposicao={distribuicaoStatus.reposicao} faltou={distribuicaoStatus.faltou} />
          </div>
        </div>

        <div className={styles.grid2}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>
                <BarChart3 size={16} strokeWidth={1.75} /> Aulas por status ao longo do tempo
              </span>
              <span className={styles.cardCaption}>Últimos 6 meses</span>
            </div>
            <GraficoAulasPorStatus data={serieFrequencia} />
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>
                <CalendarRange size={16} strokeWidth={1.75} /> Aulas por dia da semana
              </span>
              <span className={styles.cardCaption}>No período selecionado</span>
            </div>
            <GraficoDiaSemana data={distribuicaoSemana} />
          </div>
        </div>

        {!modoAluno && (
          <div className={styles.card} style={{ marginBottom: 16 }}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>
                <CircleDollarSign size={16} strokeWidth={1.75} /> Recebido por mês
              </span>
              <span className={styles.cardCaption}>Baseado na data de pagamento registrada de cada aluno</span>
            </div>
            <GraficoRecebido data={recebido.serie} comDados={recebido.comDados} />
          </div>
        )}

        {/* INSIGHTS */}
        <div style={{ marginBottom: 16 }}>
          <InsightsPanel insights={insights} />
        </div>

        {/* RANKINGS */}
        {!modoAluno && (
          <div className={styles.grid3}>
            <Ranking titulo="Quem paga mais" icone={<Wallet size={16} strokeWidth={1.75} />} itens={rankingValor} />
            <Ranking titulo="Mais frequente" icone={<Trophy size={16} strokeWidth={1.75} />} itens={rankingPresenca} />
            <Ranking titulo="Quem mais falta" icone={<AlertOctagon size={16} strokeWidth={1.75} />} itens={rankingFaltas} />
          </div>
        )}

        {/* RISCO */}
        <div style={{ marginBottom: 24 }}>
          <RiscoCancelamento riscos={riscos} />
        </div>

        <ChatBot contexto={contextoIA} />
      </div>
    </div>
  )
}
