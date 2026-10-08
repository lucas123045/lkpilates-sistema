import { describe, expect, it } from 'vitest'
import { CADASTRO_VAZIO, cpfValido, enderecoEmLinha, formatarCep, formatarCpf, formatarTelefone, validarCadastro } from '@/lib/cadastro'

const HOJE = '2026-10-08'
const VALIDO = {
  ...CADASTRO_VAZIO,
  nome: '  Maria   da Silva ',
  cpf: '529.982.247-25',
  data_nascimento: '1990-05-10',
  telefone: '31 98888-7777',
  email: 'Maria@Exemplo.com ',
  cep: '30130-010',
  logradouro: 'Av. Afonso Pena',
  numero: '1000',
  bairro: 'Centro',
  cidade: 'Belo Horizonte',
  uf: 'mg',
  como_conheceu: 'Instagram',
  aceite_lgpd: true
}

describe('CPF', () => {
  it('valida os digitos verificadores', () => {
    expect(cpfValido('529.982.247-25')).toBe(true)
    expect(cpfValido('52998224725')).toBe(true)
    expect(cpfValido('529.982.247-24')).toBe(false)
    expect(cpfValido('111.111.111-11')).toBe(false)
    expect(cpfValido('123')).toBe(false)
  })
})

describe('mascaras', () => {
  it('formata CPF, telefone e CEP enquanto digita', () => {
    expect(formatarCpf('52998224725')).toBe('529.982.247-25')
    expect(formatarCpf('5299')).toBe('529.9')
    expect(formatarTelefone('31988887777')).toBe('(31) 98888-7777')
    expect(formatarTelefone('3133334444')).toBe('(31) 3333-4444')
    expect(formatarTelefone('319')).toBe('(31) 9')
    expect(formatarCep('30130010')).toBe('30130-010')
  })
})

describe('validarCadastro', () => {
  it('aceita um cadastro completo e normaliza os dados', () => {
    const { erros, dados } = validarCadastro(VALIDO, HOJE)
    expect(erros).toEqual({})
    expect(dados).toMatchObject({
      nome: 'Maria da Silva',
      cpf: '52998224725',
      telefone: '(31) 98888-7777',
      email: 'maria@exemplo.com',
      cep: '30130010',
      uf: 'MG',
      complemento: null,
      como_conheceu: 'Instagram'
    })
  })

  it('aponta cada campo obrigatorio que falta', () => {
    const { erros } = validarCadastro({ ...CADASTRO_VAZIO }, HOJE)
    expect(Object.keys(erros).sort()).toEqual(
      ['aceite_lgpd', 'bairro', 'cep', 'cidade', 'cpf', 'data_nascimento', 'email', 'logradouro', 'nome', 'numero', 'telefone', 'uf'].sort()
    )
  })

  it('recusa CPF invalido, nome sem sobrenome, nascimento no futuro e sem aceite', () => {
    const { erros } = validarCadastro({ ...VALIDO, cpf: '529.982.247-24', nome: 'Maria', data_nascimento: '2030-01-01', aceite_lgpd: false }, HOJE)
    expect(erros.cpf).toBeDefined()
    expect(erros.nome).toBeDefined()
    expect(erros.data_nascimento).toBeDefined()
    expect(erros.aceite_lgpd).toBeDefined()
  })

  it('ignora "como conheceu" fora da lista', () => {
    expect(validarCadastro({ ...VALIDO, como_conheceu: '<script>' }, HOJE).dados.como_conheceu).toBeNull()
  })
})

describe('enderecoEmLinha', () => {
  it('monta o endereco sem partes vazias', () => {
    expect(enderecoEmLinha({ logradouro: 'Rua A', numero: '10', complemento: 'apto 2', bairro: 'Centro', cidade: 'BH', uf: 'MG', cep: '30130010' })).toBe(
      'Rua A, 10 – apto 2 · Centro · BH/MG · CEP 30130-010'
    )
    expect(enderecoEmLinha({})).toBe('')
  })
})
