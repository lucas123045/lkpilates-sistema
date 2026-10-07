import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(__dirname, '..', '..')
const MIGRATIONS = join(RAIZ, 'supabase', 'migrations')

export type Banco = PGlite

/**
 * Cria um Postgres em memoria com o schema atual de producao,
 * roda `antesDasMigrations` (dados "legados") e aplica todas as migrations.
 */
export async function criarBanco(antesDasMigrations = ''): Promise<Banco> {
  const db = new PGlite()
  await db.exec(readFileSync(join(__dirname, 'schema_existente.sql'), 'utf8'))
  if (antesDasMigrations) await db.exec(antesDasMigrations)
  // nos testes nao ha login de nivel 2 antes de fechar o acesso anonimo (202610070002)
  await db.exec(`set lk.ignorar_bootstrap = 'on'`)
  await aplicarMigrations(db)
  return db
}

export async function aplicarMigrations(db: Banco) {
  const arquivos = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
  for (const arquivo of arquivos) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS, arquivo), 'utf8'))
    } catch (e) {
      throw new Error(`Falha na migration ${arquivo}: ${(e as Error).message}`)
    }
  }
}

/** Fixa o "agora" do estudio (horario de Sao Paulo), ex.: '2026-09-28 10:00'. */
export async function fixarAgora(db: Banco, agora: string) {
  await db.exec(`set lk.agora = '${agora}'`)
}

export async function um<T = any>(db: Banco, sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<T>(sql, params)
  return r.rows[0]
}

export async function todos<T = any>(db: Banco, sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await db.query<T>(sql, params)
  return r.rows
}

/** Captura o codigo SQLSTATE de um erro esperado. */
export async function codigoErro(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p
  } catch (e) {
    return (e as { code?: string }).code
  }
  return undefined
}
