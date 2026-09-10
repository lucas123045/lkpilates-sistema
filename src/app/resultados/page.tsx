import { supabase } from '@/lib/supabase'
import ResultadosDashboard from './ResultadosDashboard'
import { EstadoErro } from './components/EstadoVazio'
import type { Aluno } from './lib/types'
import styles from './resultados.module.css'

export const dynamic = 'force-dynamic'

// Contas de teste/desenvolvimento que não devem entrar nas análises reais.
function ehContaDeTeste(nome: string) {
  const n = nome.toLowerCase()
  return n.includes('teste') || n.includes('das') || n.includes('lucas klein') || n.includes('veiga')
}

export default async function ResultadosPage() {
  const { data, error } = await supabase
    .from('alunos')
    .select(
      `
      id,
      nome,
      ativo,
      plano,
      total_aulas,
      aulas_restantes,
      valor_plano,
      pagou_em,
      aulas: aulas (
        id,
        data,
        status,
        deleted_at
      )
    `
    )
    .order('nome')

  if (error || !data) {
    console.error('ERRO SUPABASE (resultados):', error)
    return (
      <div className={styles.page}>
        <div className={styles.wrap}>
          <EstadoErro texto="Não foi possível carregar os dados do Supabase agora. Tente recarregar a página em instantes." />
        </div>
      </div>
    )
  }

  const alunos: Aluno[] = data
    .filter(a => a.nome && a.nome.trim() !== '' && !ehContaDeTeste(a.nome))
    .map(a => ({
      ...a,
      aulas: a.aulas || []
    }))

  return <ResultadosDashboard alunos={alunos} />
}
