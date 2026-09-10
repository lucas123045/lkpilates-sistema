'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type Ponto = { label: string; total: number }

export default function GraficoDiaSemana({ data }: { data: Ponto[] }) {
  const temDados = data.some(d => d.total > 0)

  if (!temDados) {
    return (
      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#98a2b3', fontSize: 13.5 }}>
        Sem aulas suficientes para essa análise.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f8" />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#667085' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: '#667085' }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #eaecf1', fontSize: 13 }} />
        <Bar dataKey="total" name="Aulas" fill="#1f4fd8" radius={[6, 6, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}
