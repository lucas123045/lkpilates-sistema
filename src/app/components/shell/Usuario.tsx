'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type Funcao = 'administrador' | 'nivel2'

export type Usuario = {
  carregado: boolean
  logado: boolean
  nome: string | null
  email: string | null
  funcao: Funcao
  profissionalId: string | null
  estudio: string
}

const PADRAO: Usuario = {
  carregado: false,
  logado: false,
  nome: null,
  email: null,
  funcao: 'administrador',
  profissionalId: null,
  estudio: 'LK Pilates'
}

const Contexto = createContext<Usuario>(PADRAO)

/**
 * Identifica quem esta usando o sistema: o e-mail do login e procurado no
 * cadastro de Profissionais para saber o nome e a funcao.
 * Sem login (uso atual do estudio) ou com e-mail nao cadastrado: acesso de administrador.
 */
export function UsuarioProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario>(PADRAO)

  useEffect(() => {
    let vivo = true

    async function carregar() {
      const [{ data: sessao }, { data: empresa }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.from('empresa').select('nome').eq('id', 1).maybeSingle()
      ])
      const email = sessao.session?.user.email ?? null
      let prof: { id: string; nome: string; funcao: Funcao } | null = null
      if (email) {
        const { data } = await supabase.from('professores').select('id, nome, funcao').ilike('email', email).maybeSingle()
        prof = data as typeof prof
      }
      if (!vivo) return
      setUsuario({
        carregado: true,
        logado: !!email,
        email,
        nome: prof?.nome ?? (email ? email.split('@')[0] : null),
        funcao: prof?.funcao ?? 'administrador',
        profissionalId: prof?.id ?? null,
        estudio: empresa?.nome ?? 'LK Pilates'
      })
    }

    carregar().catch(() => vivo && setUsuario(u => ({ ...u, carregado: true })))
    const { data: escuta } = supabase.auth.onAuthStateChange(() => carregar().catch(() => {}))
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

/** Rotas que so o administrador acessa (Nivel 2 ve agenda e clientes, sem financeiro). */
export const ROTAS_ADMIN = ['/financeiro', '/relatorios', '/resultados', '/planos', '/servicos', '/profissionais', '/empresa']

export function podeAcessar(funcao: Funcao, caminho: string) {
  if (funcao === 'administrador') return true
  return !ROTAS_ADMIN.some(r => caminho === r || caminho.startsWith(r + '/'))
}
