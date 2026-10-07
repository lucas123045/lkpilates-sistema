'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Nivel } from '@/lib/acesso'

export { podeAcessar, paginaInicial } from '@/lib/acesso'

export type Usuario = {
  carregado: boolean
  logado: boolean
  id: string | null
  nome: string | null
  email: string | null
  /** null = sem cadastro em usuarios_acesso ou inativo: sem acesso */
  nivel: Nivel | null
  profissionalId: string | null
  estudio: string
}

const PADRAO: Usuario = {
  carregado: false,
  logado: false,
  id: null,
  nome: null,
  email: null,
  nivel: null,
  profissionalId: null,
  estudio: 'LK Pilates'
}

const Contexto = createContext<Usuario>(PADRAO)

/** Identifica quem esta usando o sistema e o nivel de acesso (tabela usuarios_acesso). */
export function UsuarioProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario>(PADRAO)

  useEffect(() => {
    let vivo = true

    async function carregar() {
      const { data: sessao } = await supabase.auth.getSession()
      const user = sessao.session?.user ?? null
      let acesso: { nome: string; nivel: Nivel; ativo: boolean; profissional_id: string | null } | null = null
      let estudio: string | null = null
      if (user) {
        const [{ data }, { data: nome }] = await Promise.all([
          supabase.from('usuarios_acesso').select('nome, nivel, ativo, profissional_id').eq('user_id', user.id).maybeSingle(),
          supabase.rpc('nome_estudio')
        ])
        acesso = data as typeof acesso
        estudio = nome as string | null
      }
      if (!vivo) return
      const email = user?.email ?? null
      setUsuario({
        carregado: true,
        logado: !!user,
        id: user?.id ?? null,
        email,
        nome: acesso?.nome ?? (email ? email.split('@')[0] : null),
        nivel: acesso?.ativo ? acesso.nivel : null,
        profissionalId: acesso?.profissional_id ?? null,
        estudio: estudio ?? 'LK Pilates'
      })
    }

    carregar().catch(() => vivo && setUsuario(u => ({ ...u, carregado: true })))
    const { data: escuta } = supabase.auth.onAuthStateChange(evento => {
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT' || evento === 'USER_UPDATED') carregar().catch(() => {})
    })
    return () => {
      vivo = false
      escuta.subscription.unsubscribe()
    }
  }, [])

  return <Contexto.Provider value={usuario}>{children}</Contexto.Provider>
}

export function useUsuario() {
  return useContext(Contexto)
}

/** Encerra a sessao e volta para o login (recarrega a pagina para limpar o estado). */
export async function sair() {
  await supabase.auth.signOut().catch(() => {})
  window.location.assign('/login')
}
