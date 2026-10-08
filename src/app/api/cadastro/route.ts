import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { respostaDeErro, supabaseAdmin } from '@/lib/supabaseServidor'
import { validarCadastro } from '@/lib/cadastro'
import { hojeEstudio } from '@/lib/agenda/datas'

/**
 * Autocadastro publico (sem login). O navegador nunca toca no banco: a
 * validacao e refeita aqui e a gravacao passa pela funcao autocadastro(),
 * que so a service role executa.
 */

/** O link esta aberto? (e o nome do estudio para o cabecalho) */
export async function GET() {
  try {
    const { data } = await supabaseAdmin().from('empresa').select('nome, cadastro_link_ativo').eq('id', 1).maybeSingle()
    return NextResponse.json({ aberto: !!data?.cadastro_link_ativo, estudio: data?.nome ?? 'LK Pilates' })
  } catch (e) {
    return respostaDeErro(e)
  }
}

const MENSAGENS: Record<string, { status: number; erro: string }> = {
  ja_cadastrado: { status: 409, erro: 'Você já está cadastrado(a). Fale com o estúdio para atualizar seus dados.' },
  fechado: { status: 403, erro: 'O cadastro pelo link está fechado no momento. Fale com o estúdio.' },
  limite: { status: 429, erro: 'Muitas tentativas. Aguarde um pouco e tente de novo.' }
}

export async function POST(req: Request) {
  try {
    const corpo = await req.json().catch(() => null)
    if (!corpo || typeof corpo !== 'object') return NextResponse.json({ erro: 'Dados inválidos.' }, { status: 400 })

    // campo escondido: so robo preenche. Responde "ok" sem gravar nada.
    if (typeof corpo.site === 'string' && corpo.site.trim()) return NextResponse.json({ ok: true })

    const { erros, dados } = validarCadastro(corpo, hojeEstudio())
    if (Object.keys(erros).length) return NextResponse.json({ erro: 'Confira os campos destacados.', erros }, { status: 400 })

    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'desconhecido'
    const ipHash = createHash('sha256').update(`lk-cadastro:${ip}`).digest('hex')

    const { data, error } = await supabaseAdmin().rpc('autocadastro', { dados, ip_hash_input: ipHash })
    if (error) throw new Error(error.message)

    const status = (data as { status?: string } | null)?.status
    if (status === 'ok') return NextResponse.json({ ok: true })
    const m = MENSAGENS[status ?? '']
    if (m) return NextResponse.json({ erro: m.erro, motivo: status }, { status: m.status })
    throw new Error(`autocadastro: resposta inesperada ${JSON.stringify(data)}`)
  } catch (e) {
    return respostaDeErro(e)
  }
}
