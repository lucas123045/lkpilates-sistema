import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// O cadastro de alunos agora e a tela de Clientes (mantem links antigos funcionando).
export default function AlunosPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) if (typeof v === 'string') q.set(k, v)
  redirect(`/clientes${q.toString() ? `?${q}` : ''}`)
}
