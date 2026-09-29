import { beforeEach, describe, expect, it } from 'vitest'
import { codigoErro, criarBanco, fixarAgora, todos, um, type Banco } from './banco'

// Dados ficticios. 28/09/2026 = segunda.
const ANA = '00000000-0000-0000-0000-0000000000a1'
const BIA = '00000000-0000-0000-0000-0000000000b1'

let db: Banco

const restantes = async (id: string) => (await um(db, `select aulas_restantes n from alunos where id = $1`, [id])).n
const registros = async (id: string) =>
  todos(db, `select status, horario::text from aulas where aluno_id = $1 and deleted_at is null and status <> 'reinicio' order by id`, [id])
const statusAgenda = async (id: string) => (await um(db, `select status from agenda where id = $1`, [id])).status

async function aulaNaAgenda(aluno: string, hora = '07:00', fim = '08:00') {
  return (await um(db, `select criar_aula_cliente($1, null, null, '2026-09-28', $2, $3) r`, [aluno, hora, fim])).r.agenda_id as string
}

beforeEach(async () => {
  db = await criarBanco(`
    insert into alunos (id, nome, plano, total_aulas, aulas_restantes) values
      ('${ANA}', 'Ana Teste', 'mensal 2x', 8, 8), ('${BIA}', 'Bia Teste', 'mensal 1x', 4, 4);
  `)
  await fixarAgora(db, '2026-09-28 06:00')
})

describe('a mesma aula nunca conta duas vezes', () => {
  it('Relatorio: segundo "Veio" no mesmo dia e recusado', async () => {
    await um(db, `select registrar_presenca_dia($1, '2026-09-28', 'veio')`, [BIA])
    expect(await codigoErro(db.query(`select registrar_presenca_dia($1, '2026-09-28', 'veio')`, [BIA]))).toBe('23505')
    expect(await codigoErro(db.query(`select registrar_presenca_dia($1, '2026-09-28', 'faltou')`, [BIA]))).toBe('23505')
    expect(await restantes(BIA)).toBe(3)
  })

  it('Relatorio com aula na agenda: marca a aula da agenda, debita uma vez', async () => {
    const id = await aulaNaAgenda(ANA)
    const r = (await um(db, `select registrar_presenca_dia($1, '2026-09-28', 'veio') r`, [ANA])).r
    expect(r).toMatchObject({ origem: 'agenda', agenda_id: id })
    expect(await statusAgenda(id)).toBe('presente')
    expect(await registros(ANA)).toEqual([{ status: 'veio', horario: '07:00:00' }])
    expect(await restantes(ANA)).toBe(7)
    // depois disso a agenda nao marca de novo
    expect(await codigoErro(db.query(`select registrar_presenca_dia($1, '2026-09-28', 'veio')`, [ANA]))).toBe('23505')
  })

  it('Relatorio antes, agenda depois: a agenda aproveita o registro (sem debitar de novo)', async () => {
    await um(db, `select registrar_aula($1, '2026-09-28', 'veio')`, [ANA]) // caminho antigo, sem horario
    const id = await aulaNaAgenda(ANA)
    await um(db, `select marcar_status($1, 'presente')`, [id])
    expect(await registros(ANA)).toEqual([{ status: 'veio', horario: '07:00:00' }])
    expect(await restantes(ANA)).toBe(7)
  })

  it('Relatorio disse "faltou" e a agenda tenta "presente": bloqueia', async () => {
    await um(db, `select registrar_aula($1, '2026-09-28', 'faltou')`, [ANA])
    const id = await aulaNaAgenda(ANA)
    expect(await codigoErro(db.query(`select marcar_status($1, 'presente')`, [id]))).toBe('LK008')
    expect(await restantes(ANA)).toBe(7)
  })

  it('Agenda antes, Relatorio depois: recusado', async () => {
    const id = await aulaNaAgenda(ANA)
    await um(db, `select marcar_status($1, 'presente')`, [id])
    expect(await codigoErro(db.query(`select registrar_presenca_dia($1, '2026-09-28', 'veio')`, [ANA]))).toBe('23505')
    expect(await codigoErro(db.query(`select registrar_aula($1, '2026-09-28', 'veio')`, [ANA]))).toBe('23505')
    expect(await restantes(ANA)).toBe(7)
  })

  it('duas aulas diferentes no mesmo dia (horarios distintos na agenda) continuam permitidas', async () => {
    const manha = await aulaNaAgenda(ANA, '07:00', '08:00')
    const tarde = await aulaNaAgenda(ANA, '18:00', '19:00')
    await um(db, `select marcar_status($1, 'presente')`, [manha])
    await um(db, `select marcar_status($1, 'presente')`, [tarde])
    expect((await registros(ANA)).length).toBe(2)
    expect(await restantes(ANA)).toBe(6)
    // e o Relatorio nao cria uma terceira
    expect(await codigoErro(db.query(`select registrar_presenca_dia($1, '2026-09-28', 'veio')`, [ANA]))).toBe('23505')
  })

  it('"Desfazer ultima" no Relatorio devolve a aula da agenda para agendada', async () => {
    const id = await aulaNaAgenda(ANA)
    await um(db, `select registrar_presenca_dia($1, '2026-09-28', 'veio')`, [ANA])
    const aula = await um(db, `select id from aulas where aluno_id = $1 and deleted_at is null`, [ANA])
    await um(db, `select desfazer_aula($1)`, [aula.id])
    expect(await statusAgenda(id)).toBe('agendado')
    expect(await restantes(ANA)).toBe(8)
    // e pode registrar de novo
    await um(db, `select registrar_presenca_dia($1, '2026-09-28', 'veio')`, [ANA])
    expect(await statusAgenda(id)).toBe('presente')
  })

  it('reinicio do plano nao conta como aula', async () => {
    await um(db, `select registrar_aula($1, '2026-09-28', 'reinicio')`, [BIA])
    await um(db, `select registrar_presenca_dia($1, '2026-09-28', 'veio')`, [BIA])
    expect(await restantes(BIA)).toBe(3)
  })

  it('lista de possiveis duplicadas do historico antigo', async () => {
    await db.exec(`insert into aulas (aluno_id, data, status) values ('${BIA}', '2026-09-01', 'veio'), ('${BIA}', '2026-09-01', 'veio')`)
    const d = await todos(db, `select data::text, registros from aulas_possiveis_duplicadas`)
    expect(d).toEqual([{ data: '2026-09-01', registros: 2 }])
  })
})
