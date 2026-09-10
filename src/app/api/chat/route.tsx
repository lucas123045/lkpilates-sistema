import { NextResponse } from "next/server"
import OpenAI from "openai"

export async function POST(req: Request) {

  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { erro: 'A integração de IA não está configurada.' },
        { status: 503 }
      )
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const body = await req.json()

    const pergunta = body.pergunta
    const contexto = body.contexto

    const completion =
      await openai.chat.completions.create({

        model: "gpt-3.5-turbo",
        temperature: 0.2,

        messages: [
          {
            role: "system",
            content: `
Você é a IA da página de Resultados do sistema LK Pilates (estúdio de pilates).

Regras obrigatórias:
- Use APENAS os números do "CONTEXTO" abaixo. Nunca invente aluno, número, tendência ou estatística que não esteja explicitamente ali.
- Se o contexto não tiver dado suficiente para responder, diga claramente algo como "Não há dados suficientes para responder isso no período selecionado." em vez de supor.
- "frequência" = presenças / (presenças + faltas) * 100. Presença inclui reposição.
- Nunca confunda variação percentual com pontos percentuais (p.p.). Frequência é sempre comparada em p.p.; contagens (aulas, faltas) são comparadas em %.
- Responda em português, de forma curta, direta e profissional (no máximo 3-4 frases). Use R$ no formato brasileiro para valores em dinheiro.
- Nunca use emojis na resposta.

CONTEXTO (dados reais já calculados do período "${contexto?.periodoLabel ?? 'selecionado'}"):
${JSON.stringify(contexto, null, 2)}
`
          },

          {
            role: "user",
            content: pergunta
          }
        ]
      })

    return NextResponse.json({
      resposta:
        completion.choices[0].message.content
    })

  } catch (error: any) {

    console.error(error)

    return NextResponse.json(
      {
        erro: error.message || "Erro interno"
      },
      {
        status: 500
      }
    )
  }
}