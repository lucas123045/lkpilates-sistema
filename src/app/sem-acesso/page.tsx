'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { paginaInicial, type Nivel } from '@/lib/acesso'
import { sair } from '@/app/components/shell/Usuario'

/** Destino do middleware para rotas fora do nivel (ou login sem acesso liberado). */
export default function SemAcesso() {
  const [estado, setEstado] = useState<{ logado: boolean; nivel: Nivel | null } | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user
      if (!user) return setEstado({ logado: false, nivel: null })
      const { data: acesso } = await supabase.from('usuarios_acesso').select('nivel, ativo').eq('user_id', user.id).maybeSingle()
      setEstado({ logado: true, nivel: acesso?.ativo ? (acesso.nivel as Nivel) : null })
    })().catch(() => setEstado({ logado: false, nivel: null }))
  }, [])

  return (
    <div className="form-container">
      <img src="/logo-lk-pilates.png" alt="LK Pilates" className="form-logo" />
      <div className="form-card" style={{ textAlign: 'center' }}>
        <Lock size={28} style={{ color: 'var(--ink-500)', marginBottom: 8 }} />
        {!estado ? (
          <p>Carregando...</p>
        ) : estado.nivel ? (
          <>
            <h2 style={{ marginBottom: 6 }}>Acesso restrito</h2>
            <p style={{ marginBottom: 16 }}>Seu nível de acesso não inclui esta área. Fale com a responsável pelo estúdio.</p>
            <Link href={paginaInicial(estado.nivel)} className="btn-primary" style={{ display: 'block' }}>
              Voltar ao início
            </Link>
          </>
        ) : estado.logado ? (
          <>
            <h2 style={{ marginBottom: 6 }}>Login sem acesso liberado</h2>
            <p style={{ marginBottom: 16 }}>Seu login ainda não foi liberado ou está desativado. Fale com a responsável pelo estúdio.</p>
            <button className="btn-primary" onClick={sair}>Sair</button>
          </>
        ) : (
          <>
            <h2 style={{ marginBottom: 16 }}>Faça login para continuar</h2>
            <Link href="/login" className="btn-primary" style={{ display: 'block' }}>
              Entrar
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
