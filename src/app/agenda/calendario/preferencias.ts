'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { TipoFiltro } from '@/lib/agenda/eventos'

export type Visao = 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth' | 'programacao' | 'tresDias'

export type Preferencias = {
  visao: Visao | null // null = padrao do dispositivo
  professoresOcultos: string[]
  tiposOcultos: TipoFiltro[]
  dia24h: boolean
  lateralAberta: boolean
}

const PADRAO: Preferencias = {
  visao: null,
  professoresOcultos: [],
  tiposOcultos: [],
  dia24h: false,
  lateralAberta: true
}

function ler(chave: string): Preferencias {
  try {
    const bruto = localStorage.getItem(chave)
    return bruto ? { ...PADRAO, ...JSON.parse(bruto) } : PADRAO
  } catch {
    return PADRAO
  }
}

/** Preferencias da agenda por usuario (ou por aparelho, sem login). */
export function usePreferencias() {
  const [chave, setChave] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<Preferencias>(PADRAO)
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    let vivo = true
    supabase.auth
      .getSession()
      .then(({ data }) => data.session?.user.id ?? 'local')
      .catch(() => 'local')
      .then(id => {
        if (!vivo) return
        const k = `lk-agenda-prefs:${id}`
        setChave(k)
        setPrefs(ler(k))
        setPronto(true)
      })
    return () => {
      vivo = false
    }
  }, [])

  const atualizar = useCallback(
    (mudanca: Partial<Preferencias> | ((p: Preferencias) => Partial<Preferencias>)) => {
      setPrefs(atual => {
        const novo = { ...atual, ...(typeof mudanca === 'function' ? mudanca(atual) : mudanca) }
        try {
          if (chave) localStorage.setItem(chave, JSON.stringify(novo))
        } catch {
          /* armazenamento indisponivel: segue so em memoria */
        }
        return novo
      })
    },
    [chave]
  )

  return { prefs, atualizar, pronto }
}
