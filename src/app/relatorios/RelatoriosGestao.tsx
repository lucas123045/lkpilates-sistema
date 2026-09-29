'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { Table2 } from 'lucide-react'
import { mensagemDeErro } from '@/app/components/ui/Feedback'
import { Kpi } from '@/app/components/shell/PageHeader'
import { hojeEstudio } from '@/lib/agenda/datas'
import { formatarMoeda } from '@/lib/gestao/regras'
import { clientesPorPlano, faltasMensais, financeiroMensal, receitaPorProfissional, ultimosMeses } from '@/lib/gestao/relatorios'
import { dadosRelatorios } from '@/lib/gestao/servico'
import './relatorios.css'

// Cores validadas (validate_palette.js, tema claro): azul x laranja escuro da marca; saldo azul x vermelho.
const COR = {
  receita: '#1f4fd8',
  despesa: '#ea580c',
  positivo: '#1f4fd8',
  negativo: '#e34948',
  unica: '#1f4fd8',
  grade: '#eef0f5',
  eixo: '#667085'
}

type Dados = Awaited<ReturnType<typeof dadosRelatorios>>

const moedaCurta = (v: number) =>
  Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : `R$ ${v.toLocaleString('pt-BR')}`

export default function RelatoriosGestao() {
  const hoje = hojeEstudio()
  const meses = useMemo(() => ultimosMeses(hoje, 12), [hoje])
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    dadosRelatorios(`${meses[0]}-01`)
      .then(setDados)
      .catch(e => setErro(mensagemDeErro(e)))
  }, [meses])

  const fin = useMemo(() => (dados ? financeiroMensal(meses, dados.pagamentos, dados.despesas) : []), [dados, meses])
  const porProf = useMemo(() => (dados ? receitaPorProfissional(dados.pagamentos, dados.profissionais) : []), [dados])
  const porPlano = useMemo(() => (dados ? clientesPorPlano(dados.alunos, dados.planos) : []), [dados])
  const faltas = useMemo(() => (dados ? faltasMensais(meses, dados.aulas) : []), [dados, meses])

  if (erro) return <div className="ui-alerta ui-alerta-erro">{erro}</div>
  if (!dados) return <div className="ui-skeleton" style={{ height: 360 }} />

  const receita = fin.reduce((s, m) => s + m.receita, 0)
  const despesa = fin.reduce((s, m) => s + m.despesa, 0)
  const totalAulas = faltas.reduce((s, m) => s + m.total, 0)
  const totalFaltas = faltas.reduce((s, m) => s + m.faltas, 0)
  const semFinanceiro = receita === 0 && despesa === 0

  return (
    <div className="rel">
      <div className="rel-kpis">
        <Kpi titulo="Receita · 12 meses" valor={formatarMoeda(receita)} />
        <Kpi titulo="Despesas · 12 meses" valor={formatarMoeda(despesa)} />
        <Kpi titulo="Saldo · 12 meses" valor={formatarMoeda(receita - despesa)} detalhe={receita - despesa < 0 ? 'Negativo no período' : undefined} />
        <Kpi titulo="Taxa de faltas · 12 meses" valor={totalAulas ? `${((totalFaltas / totalAulas) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'} detalhe={`${totalFaltas} faltas em ${totalAulas} aulas`} />
      </div>

      {semFinanceiro && (
        <div className="ui-alerta ui-alerta-info">
          Ainda não há pagamentos nem despesas lançados. Os gráficos financeiros aparecem conforme você registrar em Financeiro → Entradas e Saídas.
        </div>
      )}

      <div className="rel-grade">
        <Grafico
          titulo="Receita x despesa por mês"
          tabela={{ colunas: ['Mês', 'Receita', 'Despesa'], linhas: fin.map(m => [m.rotulo, formatarMoeda(m.receita), formatarMoeda(m.despesa)]) }}
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={fin} barGap={2} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={COR.grade} />
              <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tick={{ fill: COR.eixo, fontSize: 12 }} />
              <YAxis tickFormatter={moedaCurta} tickLine={false} axisLine={false} width={80} tick={{ fill: COR.eixo, fontSize: 12 }} />
              <Tooltip content={<DicaMoeda />} cursor={{ fill: 'rgba(31,79,216,0.06)' }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} formatter={(v: string) => <span style={{ color: '#384057' }}>{v}</span>} />
              <Bar dataKey="receita" name="Receita" fill={COR.receita} radius={[4, 4, 0, 0]} maxBarSize={18} />
              <Bar dataKey="despesa" name="Despesa" fill={COR.despesa} radius={[4, 4, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </Grafico>

        <Grafico
          titulo="Saldo mensal"
          subtitulo="Receita menos despesa. Barras vermelhas = mês no negativo."
          tabela={{ colunas: ['Mês', 'Saldo'], linhas: fin.map(m => [m.rotulo, formatarMoeda(m.saldo)]) }}
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={fin} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={COR.grade} />
              <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tick={{ fill: COR.eixo, fontSize: 12 }} />
              <YAxis tickFormatter={moedaCurta} tickLine={false} axisLine={false} width={80} tick={{ fill: COR.eixo, fontSize: 12 }} />
              <ReferenceLine y={0} stroke="#98a2b3" />
              <Tooltip content={<DicaMoeda />} cursor={{ fill: 'rgba(31,79,216,0.06)' }} />
              <Bar dataKey="saldo" name="Saldo" radius={[4, 4, 4, 4]} maxBarSize={22}>
                {fin.map(m => (
                  <Cell key={m.mes} fill={m.saldo < 0 ? COR.negativo : COR.positivo} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Grafico>

        <Grafico
          titulo="Receita por profissional"
          subtitulo="Últimos 12 meses"
          tabela={{ colunas: ['Profissional', 'Receita'], linhas: porProf.map(p => [p.nome, formatarMoeda(p.valor)]) }}
        >
          {porProf.length ? (
            <ResponsiveContainer width="100%" height={Math.max(120, porProf.length * 44 + 20)}>
              <BarChart data={porProf} layout="vertical" margin={{ top: 4, right: 90, left: 8, bottom: 4 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="nome" width={150} tickLine={false} axisLine={false} tick={<RotuloProfissional itens={porProf} />} />
                <Tooltip content={<DicaMoeda />} cursor={{ fill: 'rgba(31,79,216,0.06)' }} />
                <Bar dataKey="valor" name="Receita" fill={COR.unica} radius={[0, 4, 4, 0]} maxBarSize={18}>
                  <LabelList dataKey="valor" position="right" formatter={(v: unknown) => formatarMoeda(Number(v))} style={{ fill: '#384057', fontSize: 12 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="rel-vazio">Sem pagamentos com profissional no período.</p>
          )}
        </Grafico>

        <Grafico
          titulo="Clientes ativos por plano"
          tabela={{ colunas: ['Plano', 'Clientes'], linhas: porPlano.map(p => [p.nome, String(p.qtd)]) }}
        >
          <ResponsiveContainer width="100%" height={Math.max(120, porPlano.length * 40 + 20)}>
            <BarChart data={porPlano} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="nome" width={170} tickLine={false} axisLine={false} tick={{ fill: '#384057', fontSize: 12.5 }} />
              <Tooltip content={<DicaNumero sufixo="cliente(s)" />} cursor={{ fill: 'rgba(31,79,216,0.06)' }} />
              <Bar dataKey="qtd" name="Clientes" fill={COR.unica} radius={[0, 4, 4, 0]} maxBarSize={16}>
                <LabelList dataKey="qtd" position="right" style={{ fill: '#384057', fontSize: 12 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Grafico>

        <Grafico
          titulo="Taxa de faltas por mês"
          subtitulo="Faltas ÷ (presenças + faltas), pelo registro de aulas. Reposição conta como presença."
          largo
          tabela={{ colunas: ['Mês', 'Faltas', 'Aulas', 'Taxa'], linhas: faltas.map(m => [m.rotulo, String(m.faltas), String(m.total), m.taxa === null ? '—' : `${m.taxa}%`]) }}
        >
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={faltas} margin={{ top: 12, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={COR.grade} />
              <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tick={{ fill: COR.eixo, fontSize: 12 }} />
              <YAxis tickFormatter={v => `${v}%`} tickLine={false} axisLine={false} width={48} tick={{ fill: COR.eixo, fontSize: 12 }} allowDecimals={false} />
              <Tooltip content={<DicaFaltas />} cursor={{ stroke: '#98a2b3', strokeDasharray: '3 3' }} />
              <Line type="monotone" dataKey="taxa" name="Taxa de faltas" stroke={COR.unica} strokeWidth={2} dot={{ r: 4, fill: COR.unica, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </Grafico>
      </div>
    </div>
  )
}

function Grafico({ titulo, subtitulo, children, tabela, largo }: { titulo: string; subtitulo?: string; children: React.ReactNode; tabela: { colunas: string[]; linhas: string[][] }; largo?: boolean }) {
  const [verTabela, setVerTabela] = useState(false)
  return (
    <section className={`painel rel-card${largo ? ' largo' : ''}`}>
      <div className="rel-card-topo">
        <div>
          <h3>{titulo}</h3>
          {subtitulo && <p>{subtitulo}</p>}
        </div>
        <button className="btn btn-sec btn-sm" onClick={() => setVerTabela(v => !v)} aria-pressed={verTabela}>
          <Table2 size={14} /> {verTabela ? 'Gráfico' : 'Tabela'}
        </button>
      </div>
      {verTabela ? (
        <div className="tabela-scroll">
          <table className="tabela">
            <thead>
              <tr>{tabela.colunas.map(c => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {tabela.linhas.map((l, i) => (
                <tr key={i}>{l.map((v, j) => <td key={j}>{v}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rel-plot">{children}</div>
      )}
    </section>
  )
}

type ItemDica = { name?: string; value?: number | null; color?: string; payload?: Record<string, unknown> }

function DicaMoeda({ active, payload, label }: { active?: boolean; payload?: ItemDica[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rel-dica">
      <strong>{label ?? String(payload[0].payload?.nome ?? '')}</strong>
      {payload.map(p => (
        <div key={p.name}>
          <i style={{ background: p.color }} /> {p.name}: <b>{formatarMoeda(Number(p.value ?? 0))}</b>
        </div>
      ))}
    </div>
  )
}

function DicaNumero({ active, payload, sufixo }: { active?: boolean; payload?: ItemDica[]; sufixo: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rel-dica">
      <strong>{String(payload[0].payload?.nome ?? '')}</strong>
      <div><b>{payload[0].value}</b> {sufixo}</div>
    </div>
  )
}

function DicaFaltas({ active, payload, label }: { active?: boolean; payload?: ItemDica[]; label?: string }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as { faltas: number; total: number; taxa: number | null }
  return (
    <div className="rel-dica">
      <strong>{label}</strong>
      <div>{d.taxa === null ? 'Sem aulas registradas' : <><b>{d.taxa}%</b> de faltas ({d.faltas} de {d.total})</>}</div>
    </div>
  )
}

/** Nome do profissional com a bolinha da cor dele (a mesma da agenda). */
function RotuloProfissional({ x, y, payload, itens }: { x?: number; y?: number; payload?: { value: string }; itens: { nome: string; cor: string }[] }) {
  const cor = itens.find(i => i.nome === payload?.value)?.cor ?? '#98a2b3'
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <circle cx={-142} cy={0} r={5} fill={cor} />
      <text x={-132} y={4} fill="#384057" fontSize={12.5} textAnchor="start">
        {payload?.value}
      </text>
    </g>
  )
}
