"use client"

import { useState } from "react"

type Props = {
  insightsTexto: string[]

  topFaltas: {
    nome: string
    faltas: number
  }

  topPresenca: {
    nome: string
    presencas: number
  }

  altoRisco: number

  faturamento: number
}

export default function ChatBot({
  insightsTexto,
topFaltas,
topPresenca,
altoRisco,
faturamento
}: Props) {

    const [contexto, setContexto] = useState<any>(null)
  const [mensagens, setMensagens] = useState([
    {
      autor: "bot",
      texto: "Olá 👋 Sou a IA da LK Pilates. Pergunte algo sobre os alunos, faturamento ou riscos."
    }
  ])

  const [input, setInput] = useState("")

  function responder(pergunta: string) {

  const p = pergunta.toLowerCase()

  // 💰 faturamento
  if (p.includes("faturamento")) {

    return `💰 O estúdio faturou ${faturamento.toLocaleString(
      "pt-BR",
      {
        style: "currency",
        currency: "BRL"
      }
    )} nos últimos 30 dias.`
  }

  // 🧠 contexto da conversa
  if (
    contexto?.tipo === "faltas" &&
    (
      p.includes("risco") ||
      p.includes("ela") ||
      p.includes("ele")
    )
  ) {

    if (altoRisco > 0) {
      return `🚨 Sim, ${contexto.aluno} está sendo monitorado por risco de cancelamento.`
    }

    return `✅ ${contexto.aluno} não apresenta risco elevado atualmente.`
  }

  // ⚠️ quem mais falta
  if (p.includes("mais falta")) {

    setContexto({
      tipo: "faltas",
      aluno: topFaltas.nome
    })

    return `⚠️ ${topFaltas.nome} é quem mais faltou recentemente (${topFaltas.faltas} faltas).`
  }

  // 🏆 quem mais vai
  if (
    p.includes("mais vai") ||
    p.includes("mais frequente")
  ) {

    return `🏆 ${topPresenca.nome} é atualmente o aluno mais frequente, com ${topPresenca.presencas} presenças no período analisado.`
  }

  // 🚨 risco
  if (p.includes("risco")) {

    if (altoRisco === 0) {
      return "✅ Nenhum aluno está em alto risco atualmente."
    }

    return `🚨 Atualmente existem ${altoRisco} alunos classificados em alto risco de cancelamento.`
  }

  // 📉 insights
  if (p.includes("insight")) {

    return `
📉 Insights atuais do sistema:

${insightsTexto.map(i => `• ${i}`).join("\n")}
`
  }

  // fallback
  return "🤖 Ainda não sei responder isso, mas estou aprendendo 👀"
}

  async function enviarMensagem() {

  if (!input.trim()) return

  const pergunta = input

  setMensagens(prev => [
    ...prev,
    {
      autor: "user",
      texto: pergunta
    }
  ])

  setInput("")

  // loading
  setMensagens(prev => [
    ...prev,
    {
      autor: "bot",
      texto: "🤖 Pensando..."
    }
  ])

  const response = await fetch("/api/chat", {
    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      pergunta,

      contexto: {
        faturamento,
        insightsTexto,
        topFaltas,
        topPresenca,
        altoRisco
      }
    })
  })

const data = await response.json()

if (!response.ok) {

  console.error(data)

  setMensagens(prev => {
    const novas = [...prev]

    novas[novas.length - 1] = {
      autor: "bot",
      texto: "❌ Erro ao falar com a IA."
    }

    return novas
  })

  return
}

  setMensagens(prev => {
    const novas = [...prev]

    novas[novas.length - 1] = {
      autor: "bot",
      texto: data.resposta
    }

    return novas
  })
}

  return (
    <div style={{
      marginTop: 40,
      background: "#fff",
      borderRadius: 16,
      padding: 20,
      boxShadow: "0 2px 10px rgba(0,0,0,0.08)"
    }}>

      <h2>🤖 LK IA Assistant</h2>

      <div style={{
        height: 350,
        overflowY: "auto",
        marginTop: 20,
        marginBottom: 20,
        padding: 10,
        background: "#f7f7f7",
        borderRadius: 12
      }}>

        {mensagens.map((m, i) => (

          <div
            key={i}
            style={{
              marginBottom: 14,
              textAlign:
                m.autor === "user"
                  ? "right"
                  : "left"
            }}
          >

            <div style={{
              display: "inline-block",
              padding: "10px 14px",
              borderRadius: 12,
              background:
                m.autor === "user"
                  ? "#2563eb"
                  : "#e5e7eb",
              color:
                m.autor === "user"
                  ? "#fff"
                  : "#111"
            }}>
              {m.texto}
            </div>

          </div>

        ))}

      </div>
        <div
  style={{
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 15
  }}
>

  {[
    "💰 Faturamento",
    "⚠️ Riscos",
    "🏆 Mais frequente",
    "📉 Insights"
  ].map((texto, i) => (

    <button
      key={i}
      onClick={() => {
        setInput(texto)
      }}
      style={{
        border: "none",
        padding: "8px 12px",
        borderRadius: 999,
        background: "#e5e7eb",
        cursor: "pointer"
      }}
    >
      {texto}
    </button>

  ))}

</div>
      <div style={{
        display: "flex",
        gap: 10
      }}>

        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Pergunte algo..."
          style={{
            flex: 1,
            padding: 14,
            borderRadius: 10,
            border: "1px solid #ddd"
          }}
        />

        <button
          onClick={enviarMensagem}
          style={{
            padding: "0 20px",
            borderRadius: 10,
            border: "none",
            background: "#2563eb",
            color: "#fff",
            cursor: "pointer"
          }}
        >
          Enviar
        </button>

      </div>

    </div>
  )
}