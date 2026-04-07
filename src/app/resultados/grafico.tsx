"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts"

export default function GraficoFaturamento({ data }) {
  return (
    <div style={{
      width: "100%",
      height: 300,
      background: "#fff",
      borderRadius: 12,
      padding: 20,
      marginTop: 20
    }}>
      <h3>📈 Faturamento ao longo do tempo</h3>

      <ResponsiveContainer width="100%" height="90%">
        <LineChart data={data}>
          <XAxis dataKey="label" />
          <YAxis />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="valor"
            stroke="#2563eb"
            strokeWidth={3}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}