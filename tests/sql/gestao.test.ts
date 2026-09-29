import { beforeEach, describe, expect, it } from 'vitest'
import { codigoErro, criarBanco, fixarAgora, todos, um, type Banco } from './banco'

// Dados ficticios. 28/09/2026 = segunda; 30/09 = quarta; 05/10 = segunda seguinte.
const ANA = '00000000-0000-0000-0000-00000000000a'
const BIA = '00000000-0000-0000-0000-00000000000b'
const INATIVA = '00000000-0000-0000-0000-00000000000c'

const LEGADO = `
  insert into alunos (id, nome, plano, total_aulas, aulas_restantes, valor_plano, ativo) values
    ('${ANA}', 'Ana Teste', 'semestral 2x', 48, 40, 411, true),
    ('${BIA}', 'Bia Teste', 'Mensal 1x ', 4, 4, 330, true),
    ('${INATIVA}', 'Carla Teste', 'plano estranho', 4, 0, 0, false);
`

let db: Banco

async function criarAula(p: Record<string, unknown>) {
  const r = await um(db, `select criar_aula_cliente(
      $1::uuid, $2, $3, $4::date, $5::time, $6::time, $7::smallint[], null, null, null, $8, $9) r`,
    [p.aluno ?? null, p.nome ?? null, p.tel ?? null, p.data, p.das, p.ate, p.dias ?? null, p.obs ?? null, p.forcar ?? false])
  return r.r
}

async function aulas(aluno: string) {
  return todos(db, `select id, data::text, hora::text, status, excecao, excluida, tipo from agenda where aluno_id = $1 order by data, hora`, [aluno])
}

beforeEach(async () => {
  db = await criarBanco(LEGADO)
  await fixarAgora(db, '2026-09-28 06:00')
})

describe('planos convertidos do texto livre', () => {
  it('cria um plano por periodicidade/frequencia com o preco mais comum e liga os alunos', async () => {
    const planos = await todos(db, `select nome, periodicidade, meses, aulas_semana, preco_mensal::float from planos order by nome`)
    expect(planos).toEqual([
      { nome: 'Mensal 1x/semana', periodicidade: 'mensal', meses: 1, aulas_semana: 1, preco_mensal: 330 },
      { nome: 'Semestral 2x/semana', periodicidade: 'semestral', meses: 6, aulas_semana: 2, preco_mensal: 411 }
    ])
    const ana = await um(db, `select p.nome from alunos a join planos p on p.id = a.plano_id where a.id = $1`, [ANA])
    expect(ana.nome).toBe('Semestral 2x/semana')
  })
})

describe('aula recorrente', () => {
  it('gera as ocorrencias nos dias escolhidos e e idempotente', async () => {
    const r = await criarAula({ aluno: ANA, data: '2026-09-28', das: '07:00', ate: '08:00', dias: '{1,3}' })
    expect(r.recorrencia_id).toBeTruthy()
    const lista = await aulas(ANA)
    expect(lista.slice(0, 3).map(a => a.data)).toEqual(['2026-09-28', '2026-09-30', '2026-10-05'])
    expect(lista.every(a => a.tipo === 'fixo' && a.hora === '07:00:00')).toBe(true)
    const antes = lista.length
    await um(db, `select sincronizar_agenda('2026-09-28', '2026-11-20')`)
    await um(db, `select sincronizar_agenda('2026-09-28', '2026-11-20')`)
    expect((await aulas(ANA)).length).toBeGreaterThanOrEqual(antes)
    const dup = await um(db, `select count(*)::int n from (select data from agenda where aluno_id = $1 group by data having count(*) > 1) x`, [ANA])
    expect(dup.n).toBe(0)
  })

  it('pula feriado e nao gera para cliente inativo', async () => {
    await db.exec(`insert into bloqueios (data, motivo) values ('2026-09-30', 'Feriado')`)
    await criarAula({ aluno: ANA, data: '2026-09-28', das: '07:00', ate: '08:00', dias: '{1,3}' })
    expect((await aulas(ANA)).map(a => a.data)).not.toContain('2026-09-30')
    await criarAula({ aluno: INATIVA, data: '2026-09-28', das: '09:00', ate: '10:00', dias: '{1}' })
    expect(await aulas(INATIVA)).toHaveLength(0)
  })

  it('cliente nao cadastrado (experimental) com nome livre', async () => {
    const r = await criarAula({ nome: 'Pessoa Experimental', tel: '11999990000', data: '2026-09-29', das: '10:00', ate: '11:00' })
    const a = await um(db, `select tipo, experimental_nome, aluno_id from agenda where id = $1`, [r.agenda_id])
    expect(a).toEqual({ tipo: 'experimental', experimental_nome: 'Pessoa Experimental', aluno_id: null })
  })

  it('avisa conflito do mesmo cliente e permite forcar', async () => {
    await criarAula({ aluno: BIA, data: '2026-09-28', das: '07:00', ate: '08:00', dias: '{1}' })
    expect(await codigoErro(criarAula({ aluno: BIA, data: '2026-10-05', das: '07:30', ate: '08:30' }))).toBe('LK002')
    expect(await codigoErro(criarAula({ aluno: BIA, data: '2026-10-01', das: '07:30', ate: '08:30', dias: '{1,4}' }))).toBe('LK002')
    const ok = await criarAula({ aluno: BIA, data: '2026-10-05', das: '07:30', ate: '08:30', forcar: true })
    expect(ok.conflitos.length).toBe(1)
    // aula avulsa tambem conta como conflito para outra avulsa
    await criarAula({ aluno: ANA, data: '2026-10-02', das: '15:00', ate: '16:00' })
    expect(await codigoErro(criarAula({ aluno: ANA, data: '2026-10-02', das: '15:30', ate: '16:30' }))).toBe('LK002')
  })
})

describe('editar e excluir aula recorrente', () => {
  let serie: string
  beforeEach(async () => {
    serie = (await criarAula({ aluno: ANA, data: '2026-09-28', das: '07:00', ate: '08:00', dias: '{1,3}' })).recorrencia_id
  })

  it('somente esta: muda so a ocorrencia e a sincronizacao nao desfaz', async () => {
    const qua = await um(db, `select id from agenda where aluno_id = $1 and data = '2026-09-30'`, [ANA])
    await um(db, `select editar_aula_cliente($1, 'esta', '2026-09-30', '09:00', '10:00')`, [qua.id])
    await um(db, `select sincronizar_agenda('2026-09-28', '2026-10-11')`)
    const l = await aulas(ANA)
    expect(l.find(a => a.data === '2026-09-30')).toMatchObject({ hora: '09:00:00', excecao: true })
    expect(l.find(a => a.data === '2026-10-07')).toMatchObject({ hora: '07:00:00' })
  })

  it('esta e as proximas: divide a serie; o passado fica', async () => {
    await fixarAgora(db, '2026-10-01 06:00')
    const seg = await um(db, `select id from agenda where aluno_id = $1 and data = '2026-10-05'`, [ANA])
    const r = (await um(db, `select editar_aula_cliente($1, 'proximas', '2026-10-05', '18:00', '19:00', '{2}') r`, [seg.id])).r
    expect(r.recorrencia_id).not.toBe(serie)
    expect((await um(db, `select data_fim::text f from recorrencias where id = $1`, [serie])).f).toBe('2026-10-04')
    const l = await aulas(ANA)
    expect(l.filter(a => a.data <= '2026-09-30').map(a => [a.data, a.hora])).toEqual([['2026-09-28', '07:00:00'], ['2026-09-30', '07:00:00']])
    const depois = l.filter(a => a.data >= '2026-10-05')
    expect(depois.length).toBeGreaterThan(0)
    expect(depois.every(a => a.hora === '18:00:00')).toBe(true)
    expect(depois[0].data).toBe('2026-10-06') // terca
  })

  it('excluir somente esta some da agenda e nao volta', async () => {
    const qua = await um(db, `select id from agenda where aluno_id = $1 and data = '2026-09-30'`, [ANA])
    await um(db, `select excluir_aula_cliente($1, 'esta')`, [qua.id])
    await um(db, `select sincronizar_agenda('2026-09-28', '2026-10-11')`)
    expect((await aulas(ANA)).find(a => a.data === '2026-09-30')).toMatchObject({ excluida: true })
  })

  it('excluir esta e as proximas encerra a serie', async () => {
    const seg = await um(db, `select id from agenda where aluno_id = $1 and data = '2026-10-05'`, [ANA])
    await um(db, `select excluir_aula_cliente($1, 'proximas')`, [seg.id])
    await um(db, `select sincronizar_agenda('2026-09-28', '2026-11-20')`)
    expect((await aulas(ANA)).map(a => a.data)).toEqual(['2026-09-28', '2026-09-30'])
  })

  it('nao exclui aula com presenca marcada', async () => {
    const seg = await um(db, `select id from agenda where aluno_id = $1 and data = '2026-09-28'`, [ANA])
    await um(db, `select marcar_status($1, 'presente')`, [seg.id])
    expect((await um(db, `select aulas_restantes from alunos where id = $1`, [ANA])).aulas_restantes).toBe(39)
    expect(await codigoErro(db.query(`select excluir_aula_cliente($1, 'esta')`, [seg.id]))).toBe('LK006')
  })

  it('falta justificada em aula da serie gera credito', async () => {
    const qua = await um(db, `select id from agenda where aluno_id = $1 and data = '2026-09-30'`, [ANA])
    const r = (await um(db, `select desmarcar($1) r`, [qua.id])).r
    expect(r).toMatchObject({ status: 'falta_justificada', dentro_prazo: true })
    expect(r.credito_id).toBeTruthy()
  })
})

describe('pagamentos e vencimento', () => {
  it('avanca o vencimento N meses e devolve ao excluir', async () => {
    await db.exec(`update alunos set vencimento = '2026-09-10' where id = '${ANA}'`)
    const p = (await um(db, `select to_jsonb(r) r from registrar_pagamento('2026-09-26', 822, 'pix', $1, null, null, 'pago set e out', 2) r`, [ANA])).r
    expect(p).toMatchObject({ vencimento_anterior: '2026-09-10', vencimento_novo: '2026-11-10', meses_vencimento: 2 })
    expect((await um(db, `select vencimento::text v from alunos where id = $1`, [ANA])).v).toBe('2026-11-10')

    const r = (await um(db, `select excluir_pagamento($1) r`, [p.id])).r
    expect(r.vencimento_devolvido).toBe(true)
    expect((await um(db, `select vencimento::text v from alunos where id = $1`, [ANA])).v).toBe('2026-09-10')
  })

  it('sem vencimento anterior, conta a partir da data do pagamento', async () => {
    await um(db, `select registrar_pagamento('2026-09-26', 330, 'dinheiro', $1, null, null, null, 1)`, [BIA])
    expect((await um(db, `select vencimento::text v from alunos where id = $1`, [BIA])).v).toBe('2026-10-26')
  })

  it('pagamento sem avancar nao mexe no vencimento', async () => {
    await um(db, `select registrar_pagamento('2026-09-26', 50, 'pix', $1)`, [BIA])
    expect((await um(db, `select vencimento from alunos where id = $1`, [BIA])).vencimento).toBeNull()
  })
})
