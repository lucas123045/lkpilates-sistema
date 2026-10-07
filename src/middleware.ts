import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { paginaInicial, podeAcessar, rotaPublica, type Nivel } from '@/lib/acesso'

/**
 * Login obrigatorio e nivel de acesso por rota.
 * As APIs conferem o proprio acesso (exigirNivel); o banco tem as policies.
 */
export async function middleware(req: NextRequest) {
  let resposta = NextResponse.next({ request: req })

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: lista => {
        lista.forEach(({ name, value }) => req.cookies.set(name, value))
        resposta = NextResponse.next({ request: req })
        lista.forEach(({ name, value, options }) => resposta.cookies.set(name, value, options))
      }
    }
  })

  // renova a sessao (e os cookies) a cada navegacao
  const {
    data: { user }
  } = await supabase.auth.getUser()

  const caminho = req.nextUrl.pathname
  if (caminho.startsWith('/api/')) return resposta

  const redirecionar = (destino: string) => {
    const url = req.nextUrl.clone()
    const [pathname, busca] = destino.split('?')
    url.pathname = pathname
    url.search = busca ? `?${busca}` : ''
    const r = NextResponse.redirect(url)
    resposta.cookies.getAll().forEach(c => r.cookies.set(c))
    return r
  }

  const nivelDoUsuario = async (): Promise<Nivel | null> => {
    if (!user) return null
    const { data } = await supabase.from('usuarios_acesso').select('nivel, ativo').eq('user_id', user.id).maybeSingle()
    return data?.ativo ? (data.nivel as Nivel) : null
  }

  if (caminho === '/login' && user) return redirecionar(paginaInicial(await nivelDoUsuario()))
  if (rotaPublica(caminho)) return resposta

  if (!user) return redirecionar(`/login?volta=${encodeURIComponent(caminho + req.nextUrl.search)}`)

  const nivel = await nivelDoUsuario()
  if (podeAcessar(nivel, caminho)) return resposta
  // Inicio do nivel 1 e a agenda; o resto fora do nivel vai para "sem acesso"
  if (nivel !== null && caminho === '/dashboard') return redirecionar(paginaInicial(nivel))
  return redirecionar(`/sem-acesso?de=${encodeURIComponent(caminho)}`)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)']
}
