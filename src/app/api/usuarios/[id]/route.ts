import { NextResponse } from 'next/server'
import { ErroAcesso, exigirNivel, respostaDeErro, supabaseAdmin } from '@/lib/supabaseServidor'
import { erroDoBanco, validarNivel, validarNome, validarSenha } from '../validacao'

/** Altera nome, nivel, situacao ou senha de um login (so nivel 2). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const eu = await exigirNivel(2)
    const corpo = await req.json().catch(() => ({}))
    const id = params.id
    const admin = supabaseAdmin()

    const mudancas: Record<string, unknown> = {}
    if ('nome' in corpo) mudancas.nome = validarNome(corpo.nome)
    if ('nivel' in corpo) mudancas.nivel = validarNivel(corpo.nivel)
    if ('ativo' in corpo) mudancas.ativo = corpo.ativo === true
    if ('profissional_id' in corpo) mudancas.profissional_id = corpo.profissional_id || null
    const senha = 'senha' in corpo ? validarSenha(corpo.senha) : null

    if (id === eu.id && (mudancas.ativo === false || mudancas.nivel === 1)) {
      throw new ErroAcesso(409, 'Você não pode desativar nem rebaixar o próprio login.')
    }

    if (Object.keys(mudancas).length) {
      const { data, error } = await admin.from('usuarios_acesso').update(mudancas).eq('user_id', id).select('user_id')
      if (error) erroDoBanco(error)
      if (!data?.length) throw new ErroAcesso(404, 'Usuário não encontrado.')
    }

    const auth: { password?: string; ban_duration?: string } = {}
    if (senha) auth.password = senha
    // desativado nao consegue nem entrar (alem das policies, que ja bloqueiam tudo)
    if ('ativo' in mudancas) auth.ban_duration = mudancas.ativo ? 'none' : '876000h'
    if (Object.keys(auth).length) {
      const { error } = await admin.auth.admin.updateUserById(id, auth)
      if (error) throw new Error(error.message)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return respostaDeErro(e)
  }
}
