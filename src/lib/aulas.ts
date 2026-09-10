import { supabase } from './supabase'

export type StatusAula = 'veio' | 'faltou' | 'reposicao' | 'reinicio'

export function dataLocalISO(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

export async function registrarAula(
  alunoId: string,
  status: StatusAula,
  data = dataLocalISO(),
  observacao?: string
) {
  const { data: aula, error } = await supabase.rpc('registrar_aula', {
    aluno_id_input: alunoId,
    data_input: data,
    status_input: status,
    tipo_input: status === 'reposicao' ? 'reposicao' : 'normal',
    observacao_input: observacao || null
  })

  if (error) throw new Error(error.message)
  return aula
}

export async function desfazerAula(aulaId: number) {
  const { data, error } = await supabase.rpc('desfazer_aula', {
    aula_id_input: aulaId
  })

  if (error) throw new Error(error.message)
  return data
}