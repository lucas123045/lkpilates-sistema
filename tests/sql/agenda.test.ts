import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { codigoErro, criarBanco, fixarAgora, todos, um, type Banco } from './banco'

const ANA = '00000000-0000-0000-0000-000000000001'
const BIA = '00000000-0000-0000-0000-000000000002'
const CAIO = '00000000-0000-0000-0000-000000000003'
const DUDA = '00000000-0000-0000-0000-000000000004'
const INATIVO = '00000000-0000-0000-0000-000000000005'

// 29/09/2026 = terca, 01/10/2026 = quinta
const LEGADO = `
  insert into alunos (id, nome, plano, total_aulas, aulas_restantes, ativo) values
    ('${ANA}', 'Ana', 'semestral 2x', 48, 40, true),
    ('${BIA}', 'Bia', 'mensal 1x', 8, 8, true),
    ('${CAIO}', 'Caio', 'trimestral 2x', 24, 10, true),
    ('${DUDA}', 'Duda', 'mensal', 8, 8, true),
    ('${INATIVO}', 'Ex aluno', '1x', 8, 0, false);
  insert into horarios_aluno (aluno_id, dia_semana, horario) values
    ('${ANA}', 'terça', '18:00'),
    ('${ANA}', 'quinta-feira', '18h'),
    ('${BIA}', '2', '18:00:00'),
    ('${CAIO}', 'Ter', '18h'),
    ('${INATIVO}', 'terca', '18:00');
`

async function turma(db: Banco, dia: number, hora: string) {
  return (await um<{ id: string }>(db, 'select id from horarios where dia_semana = $1 and hora_inicio = $2', [dia, hora])).id
}

async function agendamento(db: Banco, aluno: string, data: string, horarioId?: string) {
  return um<any>(
    db,
    `select * from agenda where aluno_id = $1 and data = $2 ${horarioId ? 'and horario_id = $3' : ''}`,
    horarioId ? [aluno, data, horarioId] : [aluno, data]
  )
}

let db: Banco
let ter18: string
let qui18: string

beforeEach(async () => {
  db = await criarBanco(LEGADO)
  // A conversao marca data_inicio = hoje real; nos testes fixamos um inicio conhecido.
  await db.exec(`update horarios_aluno set data_inicio = '2026-09-01'; update horarios set vigente_desde = '2026-09-01'`)
  await fixarAgora(db, '2026-09-28 10:00')
  ter18 = await turma(db, 2, '18:00')
  qui18 = await turma(db, 4, '18:00')
})

describe('conversao dos horarios existentes', () => {
  it('agrupa os alunos nas turmas, preserva as colunas originais e extrai a frequencia', async () => {
    const turmas = await todos(db, 'select dia_semana, hora_inicio from horarios order by dia_semana')
    expect(turmas).toEqual([
      { dia_semana: 2, hora_inicio: '18:00:00' },
      { dia_semana: 4, hora_inicio: '18:00:00' }
    ])
    const originais = await todos(db, `select dia_semana, horario from horarios_aluno where aluno_id = '${ANA}' order by id`)
    expect(originais).toEqual([
      { dia_semana: 'terça', horario: '18:00' },
      { dia_semana: 'quinta-feira', horario: '18h' }
    ])
    expect((await um(db, `select frequencia_semanal from alunos where id = '${ANA}'`)).frequencia_semanal).toBe(2)
    expect((await um(db, `select frequencia_semanal from alunos where id = '${DUDA}'`)).frequencia_semanal).toBeNull()
  })

  it('e idempotente: rodar de novo nao duplica turmas nem vinculos', async () => {
    const sql = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '202609260003_agenda_conversao_horarios.sql'), 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    expect((await um(db, 'select count(*)::int n from horarios')).n).toBe(2)
    const ultima = await todos(db, `select situacao, count(*)::int n from conversao_agenda_log
      where execucao = (select max(execucao) from conversao_agenda_log) and origem = 'horarios_aluno' group by 1`)
    expect(ultima).toEqual([{ situacao: 'ja_convertido', n: 5 }])
  })

  it('a turma convertida ja comporta os alunos fixos (capacidade 3 com 3 ativos)', async () => {
    expect((await um(db, `select capacidade from horarios where id = '${ter18}'`)).capacidade).toBe(3)
  })
})

describe('geracao dos fixos', () => {
  it('gera a semana e e idempotente', async () => {
    const r1 = await um(db, `select sincronizar_agenda('2026-09-28', '2026-10-04') r`)
    expect(r1.r.criados).toBe(4) // ter: Ana, Bia, Caio | qui: Ana (inativo fica de fora)
    const r2 = await um(db, `select sincronizar_agenda('2026-09-28', '2026-10-04') r`)
    expect(r2.r).toEqual({ criados: 0, removidos: 0, atualizados: 0 })
    expect((await um(db, 'select count(*)::int n from agenda')).n).toBe(4)
  })

  it('respeita data de inicio/fim do horario fixo e bloqueios', async () => {
    await db.exec(`update horarios_aluno set data_inicio = '2026-10-01' where aluno_id = '${BIA}'`)
    await db.exec(`insert into bloqueios (data, motivo) values ('2026-10-01', 'Feriado')`)
    await um(db, `select sincronizar_agenda('2026-09-28', '2026-10-04')`)
    const linhas = await todos(db, `select aluno_id, data::text from agenda order by data, aluno_id`)
    expect(linhas).toEqual([
      { aluno_id: ANA, data: '2026-09-29' },
      { aluno_id: CAIO, data: '2026-09-29' }
    ])
  })

  it('mudanca de horario fixo remove so futuros agendados; passado e marcados ficam', async () => {
    await um(db, `select sincronizar_agenda('2026-09-21', '2026-10-04')`)
    const passada = await agendamento(db, ANA, '2026-09-22', ter18)
    const futuraMarcada = await agendamento(db, ANA, '2026-10-01', qui18)
    await um(db, `select marcar_status($1, 'falta_justificada')`, [futuraMarcada.id])

    // Ana deixa a terca e a quinta a partir de hoje
    await db.exec(`update horarios_aluno set data_fim = '2026-09-27' where aluno_id = '${ANA}'`)
    const r = await um(db, `select sincronizar_agenda('2026-09-21', '2026-10-04') r`)
    expect(r.r.removidos).toBe(1) // so a terca 29/09

    expect(await agendamento(db, ANA, '2026-09-22', ter18)).toMatchObject({ id: passada.id, status: 'agendado' })
    expect(await agendamento(db, ANA, '2026-10-01', qui18)).toMatchObject({ status: 'falta_justificada' })
    expect(await agendamento(db, ANA, '2026-09-29', ter18)).toBeUndefined()
  })

  it('ocorrencia desmarcada nao volta a ser gerada', async () => {
    await um(db, `select sincronizar_agenda('2026-09-28', '2026-10-04')`)
    const a = await agendamento(db, BIA, '2026-09-29')
    await um(db, `select desmarcar($1)`, [a.id])
    await um(db, `select sincronizar_agenda('2026-09-28', '2026-10-04')`)
    expect((await um(db, `select count(*)::int n from agenda where aluno_id = '${BIA}'`)).n).toBe(1)
  })
})

describe('desmarcacao, antecedencia e creditos', () => {
  beforeEach(async () => {
    await um(db, `select sincronizar_agenda('2026-09-28', '2026-10-04')`)
  })

  it('dentro do prazo: falta justificada, credito com validade e sem debito do pacote', async () => {
    await fixarAgora(db, '2026-09-29 14:59') // aula 18:00, 3h01 antes
    const a = await agendamento(db, ANA, '2026-09-29')
    const r = (await um(db, `select desmarcar($1) r`, [a.id])).r
    expect(r).toMatchObject({ status: 'falta_justificada', dentro_prazo: true, lista_espera: 0 })
    expect(r.credito_id).toBeTruthy()
    const c = await um(db, `select expira_em::text, usado_em from creditos_reposicao where id = $1`, [r.credito_id])
    expect(c).toEqual({ expira_em: '2026-10-29', usado_em: null })
    expect((await um(db, `select aulas_restantes from alunos where id = '${ANA}'`)).aulas_restantes).toBe(40)
  })

  it('fora do prazo: falta, sem credito e debita o pacote', async () => {
    await fixarAgora(db, '2026-09-29 15:30')
    const a = await agendamento(db, ANA, '2026-09-29')
    const r = (await um(db, `select desmarcar($1) r`, [a.id])).r
    expect(r).toMatchObject({ status: 'falta', dentro_prazo: false, credito_id: null })
    expect((await um(db, `select aulas_restantes from alunos where id = '${ANA}'`)).aulas_restantes).toBe(39)
    expect(await um(db, `select status, horario::text from aulas where aluno_id = '${ANA}'`))
      .toEqual({ status: 'faltou', horario: '18:00:00' })
  })

  it('a instrutora pode conceder o credito fora do prazo', async () => {
    await fixarAgora(db, '2026-09-29 17:00')
    const a = await agendamento(db, ANA, '2026-09-29')
    const r = (await um(db, `select desmarcar($1, true) r`, [a.id])).r
    expect(r).toMatchObject({ status: 'falta_justificada', dentro_prazo: false })
    expect(r.credito_id).toBeTruthy()
  })

  it('reposicao usa credito valido, respeita a validade e o credito nao e usado duas vezes', async () => {
    const a = await agendamento(db, BIA, '2026-09-29')
    const { credito_id } = (await um(db, `select desmarcar($1) r`, [a.id])).r

    // credito expira em 29/10: reposicao em 05/11 (quinta) nao pode
    expect(await codigoErro(db.query(`select agendar($1, $2, '2026-11-05', 'reposicao')`, [BIA, qui18]))).toBe('LK004')

    const rep = (await um(db, `select to_jsonb(r) r from agendar($1, $2, '2026-10-01', 'reposicao') r`, [BIA, qui18])).r
    expect(rep.credito_usado_id).toBe(credito_id)
    expect((await um(db, `select usado_em is not null u from creditos_reposicao where id = $1`, [credito_id])).u).toBe(true)

    expect(await codigoErro(db.query(`select agendar($1, $2, '2026-10-08', 'reposicao')`, [BIA, qui18]))).toBe('LK004')
  })

  it('credito vencido nao serve', async () => {
    const a = await agendamento(db, BIA, '2026-09-29')
    await um(db, `select desmarcar($1)`, [a.id])
    await fixarAgora(db, '2026-10-30 08:00')
    expect(await codigoErro(db.query(`select agendar($1, $2, '2026-11-05', 'reposicao')`, [BIA, qui18]))).toBe('LK004')
    const sit = await um(db, `select situacao from creditos_reposicao_situacao where aluno_id = '${BIA}'`)
    expect(sit.situacao).toBe('vencido')
  })

  it('desmarcar reposicao dentro do prazo devolve o mesmo credito', async () => {
    const a = await agendamento(db, BIA, '2026-09-29')
    const { credito_id } = (await um(db, `select desmarcar($1) r`, [a.id])).r
    const rep = (await um(db, `select to_jsonb(r) r from agendar($1, $2, '2026-10-01', 'reposicao') r`, [BIA, qui18])).r
    const r = (await um(db, `select desmarcar($1) r`, [rep.id])).r
    expect(r.credito_id).toBe(credito_id)
    expect((await um(db, 'select count(*)::int n from creditos_reposicao')).n).toBe(1)
  })

  it('desfazer falta justificada cancela o credito; se ja usado, bloqueia', async () => {
    const a = await agendamento(db, BIA, '2026-09-29')
    const { credito_id } = (await um(db, `select desmarcar($1) r`, [a.id])).r
    await um(db, `select agendar($1, $2, '2026-10-01', 'reposicao')`, [BIA, qui18])
    expect(await codigoErro(db.query(`select marcar_status($1, 'agendado')`, [a.id]))).toBe('LK007')

    const c = await agendamento(db, CAIO, '2026-09-29')
    const r = (await um(db, `select desmarcar($1) r`, [c.id])).r
    await um(db, `select marcar_status($1, 'agendado')`, [c.id])
    expect((await um(db, `select cancelado_em is not null x from creditos_reposicao where id = $1`, [r.credito_id])).x).toBe(true)
    expect(credito_id).not.toBe(r.credito_id)
  })
})

describe('presenca integrada ao pacote (tabela aulas)', () => {
  beforeEach(async () => {
    await um(db, `select sincronizar_agenda('2026-09-28', '2026-10-04')`)
  })

  it('presente debita e desfazer devolve', async () => {
    const a = await agendamento(db, CAIO, '2026-09-29')
    const marcado = (await um(db, `select to_jsonb(r) r from marcar_status($1, 'presente') r`, [a.id])).r
    expect(marcado.aula_id).toBeTruthy()
    expect((await um(db, `select aulas_restantes from alunos where id = '${CAIO}'`)).aulas_restantes).toBe(9)

    await um(db, `select marcar_status($1, 'agendado')`, [a.id])
    expect((await um(db, `select aulas_restantes from alunos where id = '${CAIO}'`)).aulas_restantes).toBe(10)
    expect((await um(db, `select deleted_at is not null d from aulas where id = $1`, [marcado.aula_id])).d).toBe(true)
  })

  it('marcar todos presentes', async () => {
    const r = (await um(db, `select marcar_todos_presentes($1, '2026-09-29') r`, [ter18])).r
    expect(r).toEqual({ marcados: 3, erros: [] })
  })

  it('aluno sem aulas restantes: erro reportado sem travar os outros', async () => {
    await db.exec(`update alunos set aulas_restantes = 0 where id = '${CAIO}'`)
    const r = (await um(db, `select marcar_todos_presentes($1, '2026-09-29') r`, [ter18])).r
    expect(r.marcados).toBe(2)
    expect(r.erros).toHaveLength(1)
    expect(r.erros[0].nome).toBe('Caio')
  })
})

describe('capacidade, conflito e bloqueio', () => {
  beforeEach(async () => {
    await um(db, `select sincronizar_agenda('2026-09-28', '2026-10-04')`)
  })

  it('nao passa da capacidade sem encaixe; com encaixe marca a flag', async () => {
    expect(await codigoErro(db.query(`select agendar($1, $2, '2026-09-29', 'avulsa')`, [DUDA, ter18]))).toBe('LK001')
    const e = (await um(db, `select to_jsonb(r) r from agendar($1, $2, '2026-09-29', 'avulsa', forcar_encaixe_input => true) r`, [DUDA, ter18])).r
    expect(e.encaixe).toBe(true)
  })

  it('vaga liberada por desmarcacao pode ser ocupada e avisa lista de espera', async () => {
    await db.exec(`insert into lista_espera (aluno_id, horario_id, data) values ('${DUDA}', '${ter18}', '2026-09-29')`)
    const a = await agendamento(db, BIA, '2026-09-29')
    const r = (await um(db, `select desmarcar($1) r`, [a.id])).r
    expect(r.lista_espera).toBe(1)
    await um(db, `select agendar($1, $2, '2026-09-29', 'avulsa')`, [DUDA, ter18])
    expect((await um(db, `select atendido_em is not null x from lista_espera`)).x).toBe(true)
  })

  it('impede o mesmo aluno em horarios sobrepostos', async () => {
    const ter1830 = (await um(db, `insert into horarios (dia_semana, hora_inicio, capacidade) values (2, '18:30', 3) returning id`)).id
    expect(await codigoErro(db.query(`select agendar($1, $2, '2026-09-29', 'avulsa')`, [ANA, ter1830]))).toBe('LK002')
    const ter19 = (await um(db, `insert into horarios (dia_semana, hora_inicio, capacidade) values (2, '19:00', 3) returning id`)).id
    await um(db, `select agendar($1, $2, '2026-09-29', 'avulsa')`, [ANA, ter19]) // 18:00 + 55min termina 18:55
  })

  it('nao agenda em horario bloqueado nem em dia errado', async () => {
    await db.exec(`insert into bloqueios (data, horario_id, motivo) values ('2026-10-06', '${ter18}', 'Recesso')`)
    expect(await codigoErro(db.query(`select agendar($1, $2, '2026-10-06', 'avulsa')`, [DUDA, ter18]))).toBe('LK003')
    expect(await codigoErro(db.query(`select agendar($1, $2, '2026-10-07', 'avulsa')`, [DUDA, ter18]))).toBe('LK010')
  })

  it('experimental ocupa vaga sem aluno cadastrado', async () => {
    await um(db, `select marcar_status($1, 'falta_justificada')`, [(await agendamento(db, BIA, '2026-09-29')).id])
    const e = (await um(db, `select to_jsonb(r) r from agendar(null, $1, '2026-09-29', 'experimental', experimental_nome_input => 'Carla', experimental_telefone_input => '31999') r`, [ter18])).r
    expect(e).toMatchObject({ aluno_id: null, experimental_nome: 'Carla', status: 'agendado' })
    await um(db, `select marcar_status($1, 'presente')`, [e.id])
    expect((await um(db, 'select count(*)::int n from aulas')).n).toBe(0)
  })

  it('cancelamento pelo estudio cancela todos e gera credito', async () => {
    const r = (await um(db, `select bloquear('2026-09-29', null, $1, 'Instrutora ausente') r`, [ter18])).r
    expect(r).toMatchObject({ cancelados: 3, creditos: 3 })
    expect((await um(db, `select sincronizar_agenda('2026-09-28', '2026-10-04') r`)).r.criados).toBe(0)
  })

  it('feriado de dia inteiro ainda nao gerado tambem cancela e gera credito', async () => {
    const r = (await um(db, `select bloquear('2026-10-08', null, null, 'Feriado') r`)).r
    expect(r).toMatchObject({ cancelados: 1, creditos: 1 }) // Ana na quinta 08/10
  })

  it('remarcar move para outro horario com vaga', async () => {
    const a = await agendamento(db, BIA, '2026-09-29')
    const novo = (await um(db, `select to_jsonb(r) r from remarcar($1, $2, '2026-10-01') r`, [a.id, qui18])).r
    expect(novo).toMatchObject({ tipo: 'reposicao', status: 'agendado', remarcado_de_id: a.id })
    expect((await agendamento(db, BIA, '2026-09-29')).status).toBe('desmarcado')
  })
})

describe('professor efetivo', () => {
  it('prioridade: dia > aluno > horario, e fica gravado no agendamento', async () => {
    const [a, b, c] = (await todos(db, `insert into professores (nome, cor) values ('Ana Prof', '#111'), ('Beto', '#222'), ('Cris', '#333') returning id`)).map(r => r.id)
    await db.exec(`update horarios set professor_id = '${a}' where id = '${ter18}'`)
    await db.exec(`update horarios_aluno set professor_id = '${b}' where aluno_id = '${CAIO}'`)
    await um(db, `select sincronizar_agenda('2026-09-28', '2026-10-04')`)

    expect(await agendamento(db, ANA, '2026-09-29')).toMatchObject({ professor_id: a, professor_origem: 'horario' })
    expect(await agendamento(db, CAIO, '2026-09-29')).toMatchObject({ professor_id: b, professor_origem: 'aluno' })

    await um(db, `select trocar_professor($1, 'dia', horario_id_input => $2, data_input => '2026-09-29')`, [c, ter18])
    expect(await agendamento(db, ANA, '2026-09-29')).toMatchObject({ professor_id: c, professor_origem: 'dia' })
    expect(await agendamento(db, CAIO, '2026-09-29')).toMatchObject({ professor_id: c, professor_origem: 'dia' })

    // ressincronizar nao desfaz a substituicao
    await um(db, `select sincronizar_agenda('2026-09-28', '2026-10-04')`)
    expect(await agendamento(db, ANA, '2026-09-29')).toMatchObject({ professor_id: c })
    // e a semana seguinte volta ao padrao
    await um(db, `select sincronizar_agenda('2026-10-05', '2026-10-11')`)
    expect(await agendamento(db, ANA, '2026-10-06')).toMatchObject({ professor_id: a })
  })

  it('troca permanente do horario atualiza so os futuros', async () => {
    const [a, b] = (await todos(db, `insert into professores (nome) values ('A'), ('B') returning id`)).map(r => r.id)
    await db.exec(`update horarios set professor_id = '${a}'`)
    await um(db, `select sincronizar_agenda('2026-09-21', '2026-10-04')`)
    await um(db, `select trocar_professor($1, 'permanente', horario_id_input => $2)`, [b, ter18])
    expect(await agendamento(db, ANA, '2026-09-22')).toMatchObject({ professor_id: a })
    expect(await agendamento(db, ANA, '2026-09-29')).toMatchObject({ professor_id: b })
  })
})

describe('verificar_agendamento', () => {
  it('traz vagas, alertas de plano, inativo e creditos', async () => {
    await um(db, `select sincronizar_agenda('2026-09-28', '2026-10-04')`)
    const v = (await um(db, `select verificar_agendamento($1, $2, '2026-10-01') r`, [ANA, qui18])).r
    expect(v).toMatchObject({ capacidade: 3, ocupados: 1, vagas: 2, ja_agendado: true, excede_plano: false })
    const w = (await um(db, `select verificar_agendamento($1, $2, '2026-10-01') r`, [INATIVO, qui18])).r
    expect(w.aluno_inativo).toBe(true)
    const x = (await um(db, `select verificar_agendamento($1, $2, '2026-10-01') r`, [BIA, qui18])).r
    expect(x.excede_plano).toBe(true) // 1x e ja tem terca
  })
})
