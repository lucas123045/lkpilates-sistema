'use client'

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

type Props = {
  veio: number
  reposicao: number
  faltou: number
}

const CORES = { veio: '#2ecc71', reposicao: '#f7931e', faltou: '#e74c3c' }

export default function GraficoDistribuicao({ veio, reposicao, faltou }: Props) {
  const total = veio + reposicao + faltou

  if (total === 0) {
    return (
      <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#98a2b3', fontSize: 13.5 }}>
        Sem aulas no período selecionado.
      </div>
    )
  }

  const data = [
    { nome: 'Presenças', valor: veio, cor: CORES.veio },
    { nome: 'Reposições', valor: reposicao, cor: CORES.reposicao },
    { nome: 'Faltas', valor: faltou, cor: CORES.faltou }
  ].filter(d => d.valor > 0)

  return (
    <div style={{ position: 'relative' }}>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="valor" nameKey="nome" innerRadius={58} outerRadius={86} paddingAngle={3} strokeWidth={0} isAnimationActive={false}>
            {data.map(d => (
              <Cell key={d.nome} fill={d.cor} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, nome: string) => [`${value} (${((value / total) * 100).toFixed(0)}%)`, nome]}
            contentStyle={{ borderRadius: 10, border: '1px solid #eaecf1', fontSize: 13 }}
          />
        </PieChart>
      </ResponsiveContainer>

      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          pointerEvents: 'none'
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 800, color: '#101828' }}>{total}</div>
        <div style={{ fontSize: 11.5, color: '#98a2b3' }}>aulas</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
        {data.map(d => (
          <span key={d.nome} style={{ fontSize: 12, color: '#475467', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: d.cor, display: 'inline-block' }} />
            {d.nome} ({d.valor})
          </span>
        ))}
      </div>
    </div>
  )
}
