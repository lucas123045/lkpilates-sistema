import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { codigoErro, criarBanco, fixarAgora, todos, um, type Banco } from './banco'

// Dados ficticios. 28/09/2026 = segunda.
const ANA = '00000000-0000-0000-0000-0000000000a1'
const FUNC = '00000000-0000-0000-0000-00000000f001'

let db: Banco

const restantes = async () => (await um(db, `select aulas_restantes n from alunos where id = $1`, [ANA])).n
const registros = async () =>
  todos(db, `select status, tipo from aulas where aluno_id = $1 and deleted_at is null and status <> 'reinicio' order by id`, [ANA])
const statusAgenda = async (id: string) => (await um(db, `select status from agenda where id = $1`, [id])).status

async function aulaNaAgenda(hora = '07:00', fim = '08:00') {
  return (await um(db, `select criar_aula_cliente($1, null, null, '2026-09-28', $2, $3) r`, [ANA, hora, fim])).r.agenda_id as string
}

beforeEach(async () => {
  db = await criarBanco(`
    insert into alunos (id, nome, plano, total_aulas, aulas_restantes) values ('${ANA}', 'Ana Teste', 'mensal 2x', 8, 8);
  `)
  await fixarAgora(db, '2026-09-28 06:00')
})

afterEach(async () => {
  await db.exec('reset role')
})

describe('reposicao aparece como reposicao (amarelo)', () => {
  it('Relatorio sem aula na agenda: registro de reposicao, debita 1', async () => {
    await um(db, `select registrar_presenca_dia($1, '2026-09-28', 'reposicao')`, [ANA])
    expect(await registros()).toEqual([{ status: 'reposicao', tipo: 'reposicao' }])
    expect(await restantes()).toBe(7)
  })

  it('Relatorio com aula na agenda no dia: marca a aula como presente, mas o registro e reposicao', async () => {
    const id = await aulaNaAgenda()
    const r = (await um(db, `select registrar_presenca_dia($1, '2026-09-28', 'reposicao') r`, [ANA])).r
    expect(r).toMatchObject({ origem: 'agenda', agenda_id: id })
    expect(await statusAgenda(id)).toBe('presente')
    expect(await registros()).toEqual([{ status: 'reposicao', tipo: 'reposicao' }])
    expect(await restantes()).toBe(7)
  })

  it('Agenda: botao Reposicao numa aula agendada', async () => {
    const id = await aulaNaAgenda()
    await um(db, `select marcar_reposicao($1)`, [id])
    expect(await statusAgenda(id)).toBe('presente')
    expect(await registros()).toEqual([{ status: 'reposicao', tipo: 'reposicao' }])
    expect(await restantes()).toBe(7)
  })

  it('Agenda: de falta para reposicao nao debita duas vezes', async () => {
    const id = await aulaNaAgenda()
    await um(db, `select marcar_status($1, 'falta')`, [id])
    await um(db, `select marcar_reposicao($1)`, [id])
    expect(await registros()).toEqual([{ status: 'reposicao', tipo: 'reposicao' }])
    expect(await restantes()).toBe(7)
  })

  it('Agenda: de presente para reposicao so troca a cor, sem debitar de novo', async () => {
    const id = await aulaNaAgenda()
    await um(db, `select marcar_status($1, 'presente')`, [id])
    await um(db, `select marcar_reposicao($1)`, [id])
    expect(await registros()).toEqual([{ status: 'reposicao', tipo: 'reposicao' }])
    expect(await restantes()).toBe(7)
  })

  it('voltar para agendado desfaz a reposicao e devolve ao pacote', async () => {
    const id = await aulaNaAgenda()
    await um(db, `select marcar_reposicao($1)`, [id])
    await um(db, `select marcar_status($1, 'agendado')`, [id])
    expect(await registros()).toEqual([])
    expect(await restantes()).toBe(8)
  })

  it('nao vale para aula experimental', async () => {
    const id = (await um(db, `select criar_aula_cliente(null, 'Visitante', null, '2026-09-28', '09:00', '10:00') r`)).r.agenda_id
    expect(await codigoErro(db.query(`select marcar_reposicao($1)`, [id]))).toBe('LK010')
  })

  it('funcionario (nivel 1) pode marcar reposicao; sem login nao', async () => {
    const id = await aulaNaAgenda()
    await db.exec(`
      insert into auth.users (id, email) values ('${FUNC}', 'func@teste.com');
      insert into usuarios_acesso (user_id, nome, email, nivel) values ('${FUNC}', 'Func', 'func@teste.com', 1);
    `)
    await db.exec(`set role anon`)
    expect(await codigoErro(db.query(`select marcar_reposicao($1)`, [id]))).toBe('42501')
    await db.exec(`reset role; set request.jwt.claim.sub = '${FUNC}'; set role authenticated`)
    await um(db, `select marcar_reposicao($1)`, [id])
    await db.exec('reset role')
    expect(await registros()).toEqual([{ status: 'reposicao', tipo: 'reposicao' }])
  })
})
