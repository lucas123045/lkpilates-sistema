'use client'

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type Ponto = { mes: string; presencas: number; faltas: number; reposicoes: number }

export default function GraficoAulasPorStatus({ data }: { data: Ponto[] }) {
  const temDados = data.some(d => d.presencas + d.faltas + d.reposicoes > 0)

  if (!temDados) {
    return (
      <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#98a2b3', fontSize: 13.5 }}>
        Nenhuma aula registrada nesses meses ainda.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f8" />
        <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#667085' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: '#667085' }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #eaecf1', fontSize: 13 }} />
        <Legend wrapperStyle={{ fontSize: 12.5 }} />
        <Bar dataKey="presencas" name="Presenças" stackId="a" fill="#2ecc71" radius={[0, 0, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="reposicoes" name="Reposições" stackId="a" fill="#f7931e" radius={[0, 0, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="faltas" name="Faltas" stackId="a" fill="#e74c3c" radius={[6, 6, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}
