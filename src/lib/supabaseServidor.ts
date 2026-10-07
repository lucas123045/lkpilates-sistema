import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import type { Nivel } from './acesso'

/**
 * Clientes Supabase do lado do servidor (Route Handlers). Nao importar em
 * componentes do navegador: a service role key ignora todas as policies.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export class ErroAcesso extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem)
  }
}

/** Cliente com a sessao de quem fez a requisicao (respeita as policies). */
export function supabaseDaRequisicao() {
  const loja = cookies()
  return createServerClient(URL, ANON, {
    cookies: {
      getAll: () => loja.getAll(),
      setAll: lista => {
        try {
          lista.forEach(({ name, value, options }) => loja.set(name, value, options))
        } catch {
          /* chamado fora de Route Handler: o middleware renova a sessao */
        }
      }
    }
  })
}

/** Cliente administrador (service role): so depois de conferir o nivel de quem chamou. */
export function supabaseAdmin() {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!chave) throw new ErroAcesso(503, 'Falta configurar SUPABASE_SERVICE_ROLE_KEY no servidor.')
  return createClient(URL, chave, { auth: { persistSession: false, autoRefreshToken: false } })
}

export type UsuarioServidor = { id: string; email: string | null; nivel: Nivel | null }

export async function usuarioDaRequisicao(): Promise<UsuarioServidor | null> {
  const sb = supabaseDaRequisicao()
  const {
    data: { user }
  } = await sb.auth.getUser()
  if (!user) return null
  const { data } = await sb.from('usuarios_acesso').select('nivel, ativo').eq('user_id', user.id).maybeSingle()
  return { id: user.id, email: user.email ?? null, nivel: data?.ativo ? (data.nivel as Nivel) : null }
}

/** Exige login ativo com pelo menos o nivel dado. */
export async function exigirNivel(nivel: Nivel): Promise<UsuarioServidor> {
  const u = await usuarioDaRequisicao()
  if (!u) throw new ErroAcesso(401, 'Faça login para continuar.')
  if (u.nivel === null || u.nivel < nivel) throw new ErroAcesso(403, 'Seu nível de acesso não permite esta ação.')
  return u
}

export function respostaDeErro(e: unknown) {
  if (e instanceof ErroAcesso) return NextResponse.json({ erro: e.message }, { status: e.status })
  console.error(e)
  return NextResponse.json({ erro: 'Erro interno. Tente de novo.' }, { status: 500 })
}
