import { createBrowserClient } from '@supabase/ssr'

// Sessao em cookie (e nao em localStorage) para o middleware enxergar o login.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
