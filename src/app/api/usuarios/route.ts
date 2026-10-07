import { NextResponse } from 'next/server'
import { exigirNivel, respostaDeErro, supabaseAdmin, ErroAcesso } from '@/lib/supabaseServidor'
import { erroDoBanco, validarEmail, validarNivel, validarNome, validarSenha } from './validacao'

/** Cria um login (so nivel 2). A lista e lida direto da tabela, pelas policies. */
export async function POST(req: Request) {
  try {
    await exigirNivel(2)
    const corpo = await req.json().catch(() => ({}))
    const nome = validarNome(corpo.nome)
    const email = validarEmail(corpo.email)
    const senha = validarSenha(corpo.senha)
    const nivel = validarNivel(corpo.nivel)
    const profissionalId = typeof corpo.profissional_id === 'string' && corpo.profissional_id ? corpo.profissional_id : null

    const admin = supabaseAdmin()
    const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } })
    if (error || !data.user) {
      if (error?.code === 'email_exists' || /already/i.test(error?.message ?? '')) throw new ErroAcesso(409, 'Já existe um login com este e-mail.')
      throw new Error(error?.message ?? 'Falha ao criar o login.')
    }

    const { error: erroAcesso } = await admin
      .from('usuarios_acesso')
      .insert({ user_id: data.user.id, nome, email, nivel, profissional_id: profissionalId })
    if (erroAcesso) {
      // nao deixa login sem nivel para tras
      await admin.auth.admin.deleteUser(data.user.id).catch(() => {})
      erroDoBanco(erroAcesso)
    }

    return NextResponse.json({ id: data.user.id })
  } catch (e) {
    return respostaDeErro(e)
  }
}
