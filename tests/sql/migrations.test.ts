import { describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { aplicarMigrations, criarBanco, um } from './banco'

describe('seguranca das migrations', () => {
  it('podem ser aplicadas duas vezes sem erro e sem duplicar dados', async () => {
    const db = await criarBanco(`
      insert into alunos (id, nome, plano, total_aulas, aulas_restantes)
        values ('00000000-0000-0000-0000-000000000001', 'Ana', '2x', 8, 8);
      insert into horarios_aluno (aluno_id, dia_semana, horario)
        values ('00000000-0000-0000-0000-000000000001', 'seg', '07:00');
    `)
    await aplicarMigrations(db)
    expect((await um(db, 'select count(*)::int n from horarios')).n).toBe(1)
    expect((await um(db, 'select count(*)::int n from modalidades')).n).toBe(5)
    expect((await um(db, 'select count(*)::int n from configuracoes_estudio')).n).toBe(1)
    expect((await um(db, 'select count(*)::int n from alunos')).n).toBe(1)
  })

  it('nao converte tipos de "agenda" se a tabela ja tiver dados', async () => {
    const db = new PGlite()
    await db.exec(readFileSync(join(__dirname, 'schema_existente.sql'), 'utf8'))
    await db.exec(`
      insert into alunos (id, nome) values ('00000000-0000-0000-0000-000000000001', 'Ana');
      insert into agenda (aluno_id, hora, data, tipo) values ('00000000-0000-0000-0000-000000000001', '18h', '29/09', 'x');
    `)
    await expect(aplicarMigrations(db)).rejects.toThrow(/agenda\.data .* tem 1 linhas/)
    expect((await um(db, `select data from agenda`)).data).toBe('29/09')
  })
})
