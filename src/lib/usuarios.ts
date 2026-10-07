// Logins do sistema (tela Usuarios e acessos). A lista vem direto da tabela
// (policies: so nivel 2 ve todos); criar e alterar passa pelas APIs do
// servidor, que usam a service role do Supabase Auth.

import { supabase } from './supabase'
import type { Nivel } from './acesso'

export type UsuarioSistema = {
  user_id: string
  nome: string
  email: string
  nivel: Nivel
  ativo: boolean
  profissional_id: string | null
  created_at: string
}

export async function listarUsuarios(): Promise<UsuarioSistema[]> {
  const { data, error } = await supabase.from('usuarios_acesso').select('*').order('nome')
  if (error) throw new Error(error.message)
  return (data ?? []) as UsuarioSistema[]
}

async function chamar(url: string, metodo: 'POST' | 'PATCH', corpo: unknown) {
  const r = await fetch(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  const dados = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(dados.erro ?? 'Não foi possível concluir a operação.')
  return dados
}

export function criarUsuario(u: { nome: string; email: string; senha: string; nivel: Nivel; profissional_id?: string | null }) {
  return chamar('/api/usuarios', 'POST', u)
}

export function alterarUsuario(id: string, mudancas: Partial<{ nome: string; nivel: Nivel; ativo: boolean; senha: string; profissional_id: string | null }>) {
  return chamar(`/api/usuarios/${id}`, 'PATCH', mudancas)
}

/** Troca a senha de quem esta logado (qualquer nivel). */
export async function trocarMinhaSenha(senha: string) {
  const { error } = await supabase.auth.updateUser({ password: senha })
  if (error) throw new Error(error.message.includes('different') ? 'A nova senha precisa ser diferente da atual.' : error.message)
}
