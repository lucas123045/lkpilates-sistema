// Datas da agenda: sempre no fuso do estudio, semana comecando na segunda.
// Datas trafegam como 'AAAA-MM-DD' e horas como 'HH:MM[:SS]'.

export const FUSO_ESTUDIO = 'America/Sao_Paulo'

export const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
export const DIAS_SEMANA_CURTO = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

function partesNoFuso(data: Date) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_ESTUDIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(data)
  const v = (t: string) => partes.find(p => p.type === t)?.value ?? '00'
  return { data: `${v('year')}-${v('month')}-${v('day')}`, hora: `${v('hour')}:${v('minute')}` }
}

/** Data de hoje no estudio. */
export function hojeEstudio(agora = new Date()) {
  return partesNoFuso(agora).data
}

/** "Relogio de parede" do estudio em milissegundos (para comparar com data+hora da aula). */
export function agoraEstudioMs(agora = new Date()) {
  const p = partesNoFuso(agora)
  return momentoMs(p.data, p.hora)
}

/** Data + hora de parede em ms (sem fuso: os dois lados da comparacao usam a mesma base). */
export function momentoMs(dataISO: string, hora: string) {
  const [a, m, d] = dataISO.split('-').map(Number)
  const [h, min] = hora.split(':').map(Number)
  return Date.UTC(a, m - 1, d, h, min || 0)
}

export function somarDias(dataISO: string, dias: number) {
  const [a, m, d] = dataISO.split('-').map(Number)
  const dt = new Date(Date.UTC(a, m - 1, d + dias))
  return dt.toISOString().slice(0, 10)
}

export function diferencaDias(deISO: string, ateISO: string) {
  return Math.round((momentoMs(ateISO, '00:00') - momentoMs(deISO, '00:00')) / 86400000)
}

/** 1 = segunda ... 7 = domingo */
export function diaSemanaISO(dataISO: string) {
  const [a, m, d] = dataISO.split('-').map(Number)
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay()
  return dia === 0 ? 7 : dia
}

export function inicioSemana(dataISO: string) {
  return somarDias(dataISO, 1 - diaSemanaISO(dataISO))
}

export function diasDaSemana(dataISO: string) {
  const inicio = inicioSemana(dataISO)
  return Array.from({ length: 7 }, (_, i) => somarDias(inicio, i))
}

export function formatarData(dataISO: string) {
  const [a, m, d] = dataISO.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function formatarDataCurta(dataISO: string) {
  const [, m, d] = dataISO.slice(0, 10).split('-')
  return `${d}/${m}`
}

export function formatarDataLonga(dataISO: string) {
  return `${DIAS_SEMANA[diaSemanaISO(dataISO) - 1]}, ${formatarData(dataISO)}`
}

export function formatarHora(hora: string | null | undefined) {
  return hora ? hora.slice(0, 5) : ''
}

export function horaParaMinutos(hora: string) {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function horaFim(hora: string, duracaoMin: number) {
  const total = horaParaMinutos(hora) + duracaoMin
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Dois intervalos [inicio, inicio+duracao) se sobrepoem? */
export function sobrepoe(horaA: string, duracaoA: number, horaB: string, duracaoB: number) {
  const a = horaParaMinutos(horaA)
  const b = horaParaMinutos(horaB)
  return a < b + duracaoB && b < a + duracaoA
}
