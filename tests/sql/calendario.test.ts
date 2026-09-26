import { beforeEach, describe, expect, it } from 'vitest'
import { codigoErro, criarBanco, fixarAgora, todos, um, type Banco } from './banco'

const ANA = '00000000-0000-0000-0000-000000000001'
const BIA = '00000000-0000-0000-0000-000000000002'
const CAIO = '00000000-0000-0000-0000-000000000003'

// 29/09/2026 = terca, 01/10 = quinta, 06/10 = terca seguinte
const LEGADO = `
  insert into alunos (id, nome, plano, total_aulas, aulas_restantes) values
    ('${ANA}', 'Ana', '2x', 48, 40), ('${BIA}', 'Bia', '1x', 8, 8), ('${CAIO}', 'Caio', '1x', 8, 8);
  insert into horarios_aluno (aluno_id, dia_semana, horario) values
    ('${ANA}', 'ter', '18:00'), ('${BIA}', 'ter', '18:00'), ('${ANA}', 'qui', '18:00'), ('${CAIO}', 'qua', '07:00');
`

let db: Banco
let ter18: string
let qui18: string

async function linhas(sql: string, p: unknown[] = []) {
  return todos(db, sql, p)
}

async function mover(horario: string, data: string, novaData: string, hora: string, dur: number, escopo: string) {
  return (await um(db, `select mover_aula($1, $2, $3, $4, $5, $6) r`, [horario, data, novaData, hora, dur, escopo])).r
}

beforeEach(async () => {
  db = await criarBanco(LEGADO)
  await db.exec(`update horarios_aluno set data_inicio = '2026-09-01'; update horarios set vigente_desde = '2026-09-01'`)
  await fixarAgora(db, '2026-09-28 10:00')
  ter18 = (await um(db, `select id from horarios where dia_semana = 2`)).id
  qui18 = (await um(db, `select id from horarios where dia_semana = 4`)).id
  await um(db, `select sincronizar_agenda('2026-09-28', '2026-10-11')`)
})

describe('criar aula', () => {
  it('aula unica aparece so na data; semanal repete', async () => {
    const u = (await um(db, `select to_jsonb(r) r from criar_aula('2026-09-30', '10:00', 50, 2) r`)).r
    expect(u).toMatchObject({ origem: 'aula_unica', vigente_desde: '2026-09-30', vigente_ate: '2026-09-30', dia_semana: 3 })
    await um(db, `select agendar($1, $2, '2026-09-30', 'avulsa')`, [BIA, u.id])
    expect(await codigoErro(db.query(`select agendar($1, $2, '2026-10-07', 'avulsa')`, [BIA, u.id]))).toBe('LK010')

    const s = (await um(db, `select to_jsonb(r) r from criar_aula('2026-09-30', '11:00', 50, 2, repetir_input => true) r`)).r
    expect(s.vigente_ate).toBeNull()
  })

  it('nao cria aula unica em dia bloqueado', async () => {
    await db.exec(`insert into bloqueios (data, motivo) values ('2026-10-12', 'Feriado')`)
    expect(await codigoErro(db.query(`select criar_aula('2026-10-12', '10:00', 50, 2)`))).toBe('LK003')
  })
})

describe('mover somente esta aula', () => {
  it('leva os alunos para uma aula unica, fecha a original e sobrevive a sincronizacao', async () => {
    const r = await mover(ter18, '2026-09-29', '2026-09-30', '19:00', 55, 'esta')
    expect(r).toMatchObject({ movidos: 2, modo: 'esta' })

    const movidos = await linhas(`select aluno_id, data::text, hora::text from agenda where horario_id = $1 order by aluno_id`, [r.horario_id])
    expect(movidos).toEqual([
      { aluno_id: ANA, data: '2026-09-30', hora: '19:00:00' },
      { aluno_id: BIA, data: '2026-09-30', hora: '19:00:00' }
    ])

    await um(db, `select sincronizar_agenda('2026-09-28', '2026-10-11')`)
    expect((await um(db, `select count(*)::int n from agenda where horario_id = $1`, [r.horario_id])).n).toBe(2)
    expect((await um(db, `select count(*)::int n from agenda where horario_id = $1 and data = '2026-09-29'`, [ter18])).n).toBe(0)
    // semana seguinte continua normal
    expect((await um(db, `select count(*)::int n from agenda where horario_id = $1 and data = '2026-10-06'`, [ter18])).n).toBe(2)
  })

  it('desfazer devolve tudo ao lugar', async () => {
    const r = await mover(ter18, '2026-09-29', '2026-09-30', '19:00', 55, 'esta')
    await um(db, `select desfazer_movimento($1)`, [r.movimento_id])
    expect((await um(db, `select count(*)::int n from agenda where horario_id = $1 and data = '2026-09-29'`, [ter18])).n).toBe(2)
    expect((await um(db, `select count(*)::int n from bloqueios`)).n).toBe(0)
    expect((await um(db, `select count(*)::int n from horarios where id = $1`, [r.horario_id])).n).toBe(0)
    expect(await codigoErro(db.query(`select desfazer_movimento($1)`, [r.movimento_id]))).toBe('LK006')
  })

  it('redimensionar aula unica altera no lugar', async () => {
    const u = (await um(db, `select to_jsonb(r) r from criar_aula('2026-09-30', '10:00', 50, 2) r`)).r
    const r = await mover(u.id, '2026-09-30', '2026-09-30', '10:00', 80, 'seguintes')
    expect(r).toMatchObject({ modo: 'unica', horario_id: u.id })
    expect((await um(db, `select duracao_min from horarios where id = $1`, [u.id])).duracao_min).toBe(80)
  })

  it('valida passado, presenca marcada, bloqueio e conflito', async () => {
    expect(await codigoErro(mover(ter18, '2026-09-22', '2026-09-30', '19:00', 55, 'esta'))).toBe('LK006')
    expect(await codigoErro(mover(ter18, '2026-09-29', '2026-09-27', '19:00', 55, 'esta'))).toBe('LK006')

    await db.exec(`insert into bloqueios (data, motivo) values ('2026-10-02', 'Feriado')`)
    expect(await codigoErro(mover(ter18, '2026-09-29', '2026-10-02', '18:00', 55, 'esta'))).toBe('LK003')

    // Ana tem quinta 18:00: mover a terca para quinta 18:30 conflita
    expect(await codigoErro(mover(ter18, '2026-09-29', '2026-10-01', '18:30', 55, 'esta'))).toBe('LK002')

    const a = await um(db, `select id from agenda where aluno_id = $1 and data = '2026-09-29'`, [BIA])
    await um(db, `select marcar_status($1, 'falta_justificada')`, [a.id])
    expect(await codigoErro(mover(ter18, '2026-09-29', '2026-09-30', '19:00', 55, 'esta'))).toBe('LK006')
  })
})

describe('mover esta e as seguintes', () => {
  it('divide a turma e leva os horarios fixos a partir da data', async () => {
    const r = await mover(ter18, '2026-10-06', '2026-10-07', '07:00', 55, 'seguintes')
    expect(r.modo).toBe('seguintes')

    expect((await um(db, `select vigente_ate::text v from horarios where id = $1`, [ter18])).v).toBe('2026-10-05')
    const nova = await um(db, `select dia_semana, hora_inicio::text h, vigente_desde::text v from horarios where id = $1`, [r.horario_id])
    expect(nova).toEqual({ dia_semana: 3, h: '07:00:00', v: '2026-10-07' })

    // terca 29/09 continua com os dois; terca 06/10 some; quarta 07/10 07:00 tem Ana e Bia (+ Caio da outra turma)
    expect((await um(db, `select count(*)::int n from agenda where horario_id = $1 and data = '2026-09-29'`, [ter18])).n).toBe(2)
    expect((await um(db, `select count(*)::int n from agenda where horario_id = $1 and data = '2026-10-06'`, [ter18])).n).toBe(0)
    expect((await um(db, `select count(*)::int n from agenda where horario_id = $1 and data = '2026-10-07'`, [r.horario_id])).n).toBe(2)

    const fixosAna = await linhas(`select horario_id, data_fim::text from horarios_aluno where aluno_id = $1 and dia_semana in ('ter', '3') order by data_inicio`, [ANA])
    expect(fixosAna).toEqual([
      { horario_id: ter18, data_fim: '2026-10-05' },
      { horario_id: r.horario_id, data_fim: null }
    ])
  })

  it('desfazer restaura turma, fixos e agenda', async () => {
    const r = await mover(ter18, '2026-10-06', '2026-10-07', '07:00', 55, 'seguintes')
    await um(db, `select desfazer_movimento($1)`, [r.movimento_id])
    expect((await um(db, `select vigente_ate from horarios where id = $1`, [ter18])).vigente_ate).toBeNull()
    expect((await um(db, `select count(*)::int n from horarios_aluno where horario_id = $1`, [ter18])).n).toBe(2)
    expect((await um(db, `select count(*)::int n from horarios_aluno where data_fim is not null`)).n).toBe(0)
    expect((await um(db, `select count(*)::int n from agenda where horario_id = $1 and data = '2026-10-06'`, [ter18])).n).toBe(2)
    expect((await um(db, `select count(*)::int n from horarios where id = $1`, [r.horario_id])).n).toBe(0)
  })

  it('recusa se um aluno fixo tiver outra turma sobreposta no novo horario', async () => {
    // Ana tem quinta 18:00; levar a terca para quinta 18:00 conflita
    expect(await codigoErro(mover(ter18, '2026-10-06', '2026-10-08', '18:00', 55, 'seguintes'))).toBe('LK002')
  })
})

describe('mover todas as aulas', () => {
  it('altera a turma no lugar e mantem o passado', async () => {
    await um(db, `select sincronizar_agenda('2026-09-21', '2026-09-27')`)
    const r = await mover(ter18, '2026-09-29', '2026-09-29', '19:00', 55, 'todas')
    expect(r).toMatchObject({ modo: 'todas', horario_id: ter18 })
    expect((await um(db, `select hora::text h from agenda where horario_id = $1 and data = '2026-09-22' limit 1`, [ter18])).h).toBe('18:00:00')
    expect((await um(db, `select hora::text h from agenda where horario_id = $1 and data = '2026-10-06' limit 1`, [ter18])).h).toBe('19:00:00')
  })

  it('reposicao futura acompanha a mudanca de dia', async () => {
    const caio = await um(db, `select id from agenda where aluno_id = $1 and data = '2026-09-30'`, [CAIO])
    await um(db, `select desmarcar($1)`, [caio.id])
    const rep = (await um(db, `select to_jsonb(r) r from agendar($1, $2, '2026-10-06', 'reposicao') r`, [CAIO, ter18])).r
    await mover(ter18, '2026-10-06', '2026-10-07', '19:00', 55, 'todas')
    expect(await um(db, `select data::text, hora::text, horario_id from agenda where id = $1`, [rep.id]))
      .toEqual({ data: '2026-10-07', hora: '19:00:00', horario_id: ter18 })
  })
})

describe('cancelar e desfazer', () => {
  it('desfazer_bloqueio reativa os alunos e cancela os creditos gerados', async () => {
    const b = (await um(db, `select bloquear('2026-09-29', null, $1, 'Instrutora doente') r`, [ter18])).r
    expect(b.cancelados).toBe(2)
    expect((await um(db, `select count(*)::int n from creditos_reposicao where cancelado_em is null`)).n).toBe(2)

    const d = (await um(db, `select desfazer_bloqueio($1) r`, [b.bloqueio_id])).r
    expect(d.restaurados).toBe(2)
    expect((await um(db, `select count(*)::int n from agenda where horario_id = $1 and data = '2026-09-29' and status = 'agendado'`, [ter18])).n).toBe(2)
    expect((await um(db, `select count(*)::int n from creditos_reposicao where cancelado_em is null`)).n).toBe(0)
    expect((await um(db, `select count(*)::int n from bloqueios`)).n).toBe(0)
  })
})
