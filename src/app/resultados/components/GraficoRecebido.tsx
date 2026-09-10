'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMoney } from '../lib/calculos'

type Ponto = { mes: string; valor: number }

export default function GraficoRecebido({ data, comDados }: { data: Ponto[]; comDados: boolean }) {
  if (!comDados) {
    return (
      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#98a2b3', fontSize: 13.5, textAlign: 'center', padding: '0 20px' }}>
        Sem datas de pagamento suficientes para mostrar a evolução de recebimentos.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f8" />
        <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#667085' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: '#667085' }} axisLine={false} tickLine={false} width={0} hide />
        <Tooltip formatter={(v: number) => formatMoney(v)} contentStyle={{ borderRadius: 10, border: '1px solid #eaecf1', fontSize: 13 }} />
        <Bar dataKey="valor" name="Recebido" fill="#f7931e" radius={[6, 6, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}
