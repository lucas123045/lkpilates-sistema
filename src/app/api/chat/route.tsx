import OpenAI from "openai"
import { NextResponse } from "next/server"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function POST(req: Request) {

  try {

    const body = await req.json()

    const pergunta = body.pergunta
    const contexto = body.contexto
    console.log("KEY:", process.env.OPENAI_API_KEY)
    const completion =
      await openai.chat.completions.create({

        model: "gpt-3.5-turbo",

        messages: [
          {
            role: "system",
            content: `
Você é a IA do sistema LK Pilates.

Responda de forma inteligente, curta e profissional.

Contexto:
${JSON.stringify(contexto)}
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