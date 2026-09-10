'use client'

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type Ponto = { mes: string; frequencia: number | null }

export default function GraficoFrequencia({ data }: { data: Ponto[] }) {
  const temDados = data.some(d => d.frequencia !== null)

  if (!temDados) {
    return (
      <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#98a2b3', fontSize: 13.5 }}>
        Ainda não há aulas suficientes para mostrar a evolução da frequência.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="freqGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1f4fd8" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#1f4fd8" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f8" />
        <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#667085' }} axisLine={false} tickLine={false} />
        <YAxis
          domain={[0, 100]}
          tickFormatter={v => `${v}%`}
          tick={{ fontSize: 12, fill: '#667085' }}
          axisLine={false}
          tickLine={false}
          width={42}
        />
        <Tooltip
          formatter={(value: number | null) => (value === null ? ['sem dados', 'Frequência'] : [`${value}%`, 'Frequência'])}
          contentStyle={{ borderRadius: 10, border: '1px solid #eaecf1', fontSize: 13 }}
        />
        <Area
          type="monotone"
          dataKey="frequencia"
          stroke="#1f4fd8"
          strokeWidth={2.5}
          fill="url(#freqGradient)"
          connectNulls
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
