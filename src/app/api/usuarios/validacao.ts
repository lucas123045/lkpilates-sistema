import { ErroAcesso } from '@/lib/supabaseServidor'
import type { Nivel } from '@/lib/acesso'

export const SENHA_MINIMA = 6

export function validarNome(v: unknown) {
  const nome = typeof v === 'string' ? v.trim() : ''
  if (!nome) throw new ErroAcesso(400, 'Informe o nome.')
  return nome
}

export function validarEmail(v: unknown) {
  const email = typeof v === 'string' ? v.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErroAcesso(400, 'Informe um e-mail válido.')
  return email
}

export function validarSenha(v: unknown) {
  const senha = typeof v === 'string' ? v : ''
  if (senha.length < SENHA_MINIMA) throw new ErroAcesso(400, `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`)
  return senha
}

export function validarNivel(v: unknown): Nivel {
  if (v !== 1 && v !== 2) throw new ErroAcesso(400, 'Nível de acesso inválido.')
  return v
}

/** Erro do banco ao gravar usuarios_acesso -> mensagem para a tela. */
export function erroDoBanco(e: { code?: string; message: string }): never {
  if (e.code === 'LK020') throw new ErroAcesso(409, 'O sistema precisa de pelo menos um usuário de nível 2 ativo.')
  if (e.code === '23505') throw new ErroAcesso(409, 'Já existe um login com este e-mail.')
  throw new Error(e.message)
}
