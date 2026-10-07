import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { aplicarMigrations, codigoErro, criarBanco, fixarAgora, todos, um, type Banco } from './banco'

// Dados ficticios. 28/09/2026 = segunda.
const ANA = '00000000-0000-0000-0000-0000000000a1'
const DONA = '00000000-0000-0000-0000-00000000d0a2'
const FUNC = '00000000-0000-0000-0000-00000000f001'
const INATIVO = '00000000-0000-0000-0000-00000000f002'
const SEM_CADASTRO = '00000000-0000-0000-0000-00000000f003'

let db: Banco

/** Roda como o papel do Supabase: anon (sem login) ou authenticated com o usuario dado. */
async function como(usuario: string | null) {
  await db.exec(`reset role; set request.jwt.claim.sub = '${usuario ?? ''}'`)
  await db.exec(usuario ? 'set role authenticated' : 'set role anon')
}

beforeEach(async () => {
  db = await criarBanco(`
    insert into alunos (id, nome, plano, total_aulas, aulas_restantes) values ('${ANA}', 'Ana Teste', 'mensal 2x', 8, 8);
  `)
  await fixarAgora(db, '2026-09-28 06:00')
  await db.exec(`
    insert into auth.users (id, email) values
      ('${DONA}', 'dona@teste.com'), ('${FUNC}', 'func@teste.com'),
      ('${INATIVO}', 'inativo@teste.com'), ('${SEM_CADASTRO}', 'sem@teste.com');
    insert into usuarios_acesso (user_id, nome, email, nivel, ativo) values
      ('${DONA}', 'Dona', 'dona@teste.com', 2, true),
      ('${FUNC}', 'Func', 'func@teste.com', 1, true),
      ('${INATIVO}', 'Inativo', 'inativo@teste.com', 1, false);
    insert into pagamentos (data, valor, forma, aluno_id) values ('2026-09-01', 300, 'pix', '${ANA}');
    insert into despesas (data, valor, categoria) values ('2026-09-01', 1000, 'aluguel');
  `)
})

afterEach(async () => {
  await db.exec('reset role')
})

describe('sem login (anon)', () => {
  it('nao le, nao grava e nao executa nada', async () => {
    await como(null)
    expect(await codigoErro(db.query(`select * from alunos`))).toBe('42501')
    expect(await codigoErro(db.query(`select * from agenda`))).toBe('42501')
    expect(await codigoErro(db.query(`select * from pagamentos`))).toBe('42501')
    expect(await codigoErro(db.query(`select * from usuarios_acesso`))).toBe('42501')
    expect(await codigoErro(db.query(`select * from agenda_relatorio`))).toBe('42501')
    expect(await codigoErro(db.query(`insert into alunos (nome) values ('Intruso')`))).toBe('42501')
    expect(await codigoErro(db.query(`select registrar_presenca_dia($1, '2026-09-28', 'veio')`, [ANA]))).toBe('42501')
    expect(await codigoErro(db.query(`select nome_estudio()`))).toBe('42501')
  })
})

describe('nivel 1 (funcionario)', () => {
  it('usa a agenda e o relatorio de alunos', async () => {
    await como(FUNC)
    expect(await todos(db, `select nome from alunos`)).toEqual([{ nome: 'Ana Teste' }])
    const r = (await um(db, `select criar_aula_cliente($1, null, null, '2026-09-28', '07:00', '08:00') r`, [ANA])).r
    await um(db, `select marcar_status($1, 'presente')`, [r.agenda_id])
    expect((await um(db, `select aulas_restantes n from alunos where id = $1`, [ANA])).n).toBe(7)
    expect((await todos(db, `select * from aulas where aluno_id = $1`, [ANA])).length).toBe(1)
    expect((await todos(db, `select * from agenda_relatorio`)).length).toBeGreaterThan(0)
    expect(await todos(db, `select nome from professores`)).toBeDefined()
    expect((await um(db, `select nome_estudio() n`)).n).toBe('LK Pilates')
  })

  it('nao ve nem grava financeiro, empresa e planos', async () => {
    await como(FUNC)
    expect(await todos(db, `select * from pagamentos`)).toEqual([])
    expect(await todos(db, `select * from despesas`)).toEqual([])
    expect(await todos(db, `select * from empresa`)).toEqual([])
    expect(await todos(db, `select * from planos`)).toEqual([])
    expect(await codigoErro(db.query(`insert into despesas (data, valor, categoria) values ('2026-09-02', 10, 'outros')`))).toBe('42501')
    expect(await codigoErro(db.query(`select registrar_pagamento('2026-09-02', 50, 'pix', $1)`, [ANA]))).toBe('42501')
    expect(await codigoErro(db.query(`update empresa set nome = 'Outro'`))).toBeUndefined() // RLS: atualiza 0 linhas
    await db.exec('reset role')
    expect((await um(db, `select nome from empresa`)).nome).toBe('LK Pilates')
  })

  it('le cadastros de apoio, mas nao altera', async () => {
    await como(FUNC)
    expect(await codigoErro(db.query(`insert into modalidades (nome) values ('Nova')`))).toBe('42501')
    expect(await codigoErro(db.query(`insert into professores (nome, cor) values ('Novo', '#000000')`))).toBe('42501')
  })

  it('so ve a propria linha de usuarios e nao muda o proprio nivel', async () => {
    await como(FUNC)
    expect(await todos(db, `select nome from usuarios_acesso`)).toEqual([{ nome: 'Func' }])
    await db.query(`update usuarios_acesso set nivel = 2 where user_id = $1`, [FUNC])
    await db.exec('reset role')
    expect((await um(db, `select nivel from usuarios_acesso where user_id = $1`, [FUNC])).nivel).toBe(1)
  })
})

describe('nivel 2 (dona)', () => {
  it('acessa tudo e gerencia usuarios', async () => {
    await como(DONA)
    expect((await todos(db, `select * from pagamentos`)).length).toBe(1)
    expect((await todos(db, `select * from despesas`)).length).toBe(1)
    await db.query(`insert into despesas (data, valor, categoria) values ('2026-09-02', 10, 'outros')`)
    await db.query(`update empresa set nome = 'LK Pilates MG'`)
    expect((await um(db, `select nome_estudio() n`)).n).toBe('LK Pilates MG')
    expect((await todos(db, `select * from usuarios_acesso`)).length).toBe(3)
    await db.query(`update usuarios_acesso set nivel = 2 where user_id = $1`, [FUNC])
    expect((await um(db, `select nivel from usuarios_acesso where user_id = $1`, [FUNC])).nivel).toBe(2)
  })

  it('o ultimo nivel 2 ativo nao pode ser rebaixado, desativado nem excluido', async () => {
    await como(DONA)
    expect(await codigoErro(db.query(`update usuarios_acesso set nivel = 1 where user_id = $1`, [DONA]))).toBe('LK020')
    expect(await codigoErro(db.query(`update usuarios_acesso set ativo = false where user_id = $1`, [DONA]))).toBe('LK020')
    expect(await codigoErro(db.query(`delete from usuarios_acesso where user_id = $1`, [DONA]))).toBe('LK020')
    // com outro nivel 2 ativo, pode
    await db.query(`update usuarios_acesso set nivel = 2 where user_id = $1`, [FUNC])
    await db.query(`update usuarios_acesso set nivel = 1 where user_id = $1`, [DONA])
  })
})

describe('usuario inativo ou sem cadastro', () => {
  it('nao acessa nada', async () => {
    for (const u of [INATIVO, SEM_CADASTRO]) {
      await como(u)
      expect(await todos(db, `select * from alunos`)).toEqual([])
      expect(await todos(db, `select * from agenda_relatorio`)).toEqual([])
      expect(await todos(db, `select * from pagamentos`)).toEqual([])
      expect(await codigoErro(db.query(`insert into alunos (nome) values ('X')`))).toBe('42501')
      expect((await um(db, `select nome_estudio() n`)).n).toBeNull()
    }
  })
})

describe('bootstrap', () => {
  it('fechar o acesso anonimo sem nenhum nivel 2 para com erro e nao altera nada', async () => {
    const novo = new PGlite()
    await novo.exec(readFileSync(join(__dirname, 'schema_existente.sql'), 'utf8'))
    await expect(aplicarMigrations(novo)).rejects.toThrow(/202610070002.*nivel 2/)
    // a migration anterior (usuarios_acesso) foi aplicada; o acesso anonimo continua como estava
    expect((await um(novo, `select count(*)::int n from pg_policies where tablename = 'agenda' and 'anon' = any(roles)`)).n).toBe(1)
  })
})
