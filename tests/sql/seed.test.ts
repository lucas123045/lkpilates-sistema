import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { criarBanco, um } from './banco'

const SEED = readFileSync(join(__dirname, '..', '..', 'supabase', 'seed.sql'), 'utf8')

describe('seed de desenvolvimento', () => {
  it('popula um banco vazio e gera a agenda', async () => {
    const db = await criarBanco()
    await db.exec(SEED)
    expect((await um(db, 'select count(*)::int n from professores')).n).toBe(3)
    expect((await um(db, 'select count(*)::int n from agenda')).n).toBeGreaterThan(0)
  })

  it('recusa rodar em banco com alunos reais', async () => {
    const db = await criarBanco(`insert into alunos (nome) values ('Aluna real')`)
    await expect(db.exec(SEED)).rejects.toThrow(/alunos reais/)
    expect((await um(db, 'select count(*)::int n from professores')).n).toBe(0)
  })
})
