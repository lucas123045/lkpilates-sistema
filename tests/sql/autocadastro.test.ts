import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { codigoErro, criarBanco, todos, um, type Banco } from './banco'

const ANA = '00000000-0000-0000-0000-0000000000a1'

let db: Banco

const DADOS = {
  nome: 'Maria da Silva',
  cpf: '52998224725',
  data_nascimento: '1990-05-10',
  telefone: '(31) 98888-7777',
  email: 'maria@exemplo.com',
  cep: '30130010',
  logradouro: 'Av. Afonso Pena',
  numero: '1000',
  complemento: null,
  bairro: 'Centro',
  cidade: 'Belo Horizonte',
  uf: 'MG',
  profissao: null,
  como_conheceu: 'Instagram',
  objetivo: 'Postura',
  saude: 'Dor lombar'
}

const cadastrar = async (dados: object = DADOS, ip = 'ip-1') =>
  (await um(db, `select autocadastro($1::jsonb, $2) r`, [JSON.stringify(dados), ip])).r as { status: string }

beforeEach(async () => {
  db = await criarBanco(`
    insert into alunos (id, nome, plano, total_aulas, aulas_restantes) values ('${ANA}', 'Ana Teste', 'mensal 2x', 8, 8);
  `)
  await db.exec(`update alunos set telefone = '(31) 3333-4444' where id = '${ANA}'`)
})

afterEach(async () => {
  await db.exec('reset role')
})

describe('autocadastro pelo link', () => {
  it('cria o cliente ja ativo, sem plano, com a etiqueta e a data do aceite', async () => {
    expect(await cadastrar()).toEqual({ status: 'ok' })
    const c = await um(db, `select * from alunos where cpf = '52998224725'`)
    expect(c).toMatchObject({
      nome: 'Maria da Silva',
      ativo: true,
      total_aulas: 0,
      aulas_restantes: 0,
      plano_id: null,
      etiquetas: ['Autocadastro'],
      cadastrado_por: 'autocadastro',
      autocadastro_visto_em: null,
      email: 'maria@exemplo.com',
      cidade: 'Belo Horizonte',
      saude: 'Dor lombar'
    })
    expect(c.aceite_lgpd_em).not.toBeNull()
  })

  it('CPF ja cadastrado: nao duplica', async () => {
    await cadastrar()
    expect(await cadastrar({ ...DADOS, telefone: '(31) 97777-6666', nome: 'Outra Pessoa' }, 'ip-2')).toEqual({ status: 'ja_cadastrado' })
    expect((await um(db, `select count(*)::int n from alunos where cpf = '52998224725'`)).n).toBe(1)
  })

  it('telefone de cliente existente (mesmo sem CPF): nao duplica', async () => {
    expect(await cadastrar({ ...DADOS, cpf: '11144477735', telefone: '(31) 3333-4444' })).toEqual({ status: 'ja_cadastrado' })
    expect((await um(db, `select count(*)::int n from alunos`)).n).toBe(1)
  })

  it('link desativado em Minha Empresa: recusa', async () => {
    await db.exec(`update empresa set cadastro_link_ativo = false`)
    expect(await cadastrar()).toEqual({ status: 'fechado' })
    expect((await um(db, `select count(*)::int n from alunos`)).n).toBe(1)
  })

  it('limite de tentativas por IP', async () => {
    for (let i = 0; i < 5; i++) await cadastrar({ ...DADOS, cpf: '52998224725' }, 'ip-spam')
    expect(await cadastrar({ ...DADOS, cpf: '11144477735', telefone: '(31) 91111-2222' }, 'ip-spam')).toEqual({ status: 'limite' })
    // outro IP continua podendo
    expect(await cadastrar({ ...DADOS, cpf: '11144477735', telefone: '(31) 91111-2222' }, 'ip-outro')).toEqual({ status: 'ok' })
  })

  it('recusa dados invalidos que passarem da API', async () => {
    expect(await codigoErro(db.query(`select autocadastro($1::jsonb, 'ip')`, [JSON.stringify({ ...DADOS, cpf: '123' })]))).toBe('LK010')
  })

  it('so o servidor executa: anon e usuarios logados nao', async () => {
    await db.exec(`set role anon`)
    expect(await codigoErro(db.query(`select autocadastro($1::jsonb, 'ip')`, [JSON.stringify(DADOS)]))).toBe('42501')
    expect(await codigoErro(db.query(`select * from alunos`))).toBe('42501')
    expect(await codigoErro(db.query(`select * from autocadastro_tentativas`))).toBe('42501')
    await db.exec(`reset role; set role authenticated`)
    expect(await codigoErro(db.query(`select autocadastro($1::jsonb, 'ip')`, [JSON.stringify(DADOS)]))).toBe('42501')
    await db.exec('reset role')
    expect(await todos(db, `select * from alunos where cpf is not null`)).toEqual([])
  })
})
