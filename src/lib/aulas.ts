import { supabase } from './supabase'

export type StatusAula = 'veio' | 'faltou' | 'reposicao' | 'reinicio'

export function dataLocalISO(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

/**
 * Registra presenca/falta/reposicao do dia. Se o aluno tem aula na agenda nesse
 * dia, marca ESSA aula (a mesma aula nunca e contada duas vezes). O reinicio do
 * plano continua sendo um registro simples.
 */
export async function registrarAula(
  alunoId: string,
  status: StatusAula,
  data = dataLocalISO(),
  observacao?: string
) {
  if (status === 'reinicio') {
    const { data: aula, error } = await supabase.rpc('registrar_aula', {
      aluno_id_input: alunoId,
      data_input: data,
      status_input: status,
      tipo_input: 'normal',
      observacao_input: observacao || null
    })
    if (error) throw new Error(error.message)
    return aula
  }

  const { data: r, error } = await supabase.rpc('registrar_presenca_dia', {
    aluno_id_input: alunoId,
    data_input: data,
    status_input: status
  })
  if (error) throw new Error(error.message)
  return r as { origem: 'agenda' | 'registro'; agenda_id?: string; hora?: string; aula_id?: number }
}

export async function desfazerAula(aulaId: number) {
  const { data, error } = await supabase.rpc('desfazer_aula', {
    aula_id_input: aulaId
  })

  if (error) throw new Error(error.message)
  return data
}