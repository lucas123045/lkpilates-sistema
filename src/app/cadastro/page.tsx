'use client'

import { useEffect, useState } from 'react'
import { CircleCheck, Lock, UserRound } from 'lucide-react'
import {
  buscarCep,
  CADASTRO_VAZIO,
  COMO_CONHECEU,
  formatarCep,
  formatarCpf,
  formatarTelefone,
  UFS,
  validarCadastro,
  type EntradaCadastro
} from '@/lib/cadastro'
import { hojeEstudio } from '@/lib/agenda/datas'
import '@/app/components/ui/ui.css'
import './cadastro.css'

type Tela = 'carregando' | 'formulario' | 'fechado' | 'sucesso' | 'ja_cadastrado'
type Erros = Partial<Record<keyof EntradaCadastro, string>>

/** Pagina publica: o cliente preenche os proprios dados e ja entra como cliente ativo. */
export default function Cadastro() {
  const [tela, setTela] = useState<Tela>('carregando')
  const [estudio, setEstudio] = useState('LK Pilates')
  const [f, setF] = useState<EntradaCadastro>(CADASTRO_VAZIO)
  const [isca, setIsca] = useState('')
  const [erros, setErros] = useState<Erros>({})
  const [erroGeral, setErroGeral] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)

  useEffect(() => {
    fetch('/api/cadastro')
      .then(r => r.json())
      .then(j => {
        if (j.estudio) setEstudio(j.estudio)
        setTela(j.aberto ? 'formulario' : 'fechado')
      })
      .catch(() => setTela('formulario'))
  }, [])

  const set = <K extends keyof EntradaCadastro>(k: K, v: EntradaCadastro[K]) => {
    setF(x => ({ ...x, [k]: v }))
    if (erros[k]) setErros(e => ({ ...e, [k]: undefined }))
  }

  async function aoMudarCep(valor: string) {
    const cep = formatarCep(valor)
    set('cep', cep)
    if (cep.replace(/\D/g, '').length !== 8) return
    setBuscandoCep(true)
    const end = await buscarCep(cep)
    setBuscandoCep(false)
    if (end) {
      setF(x => ({ ...x, logradouro: end.logradouro || x.logradouro, bairro: end.bairro || x.bairro, cidade: end.cidade || x.cidade, uf: end.uf || x.uf }))
      setErros(e => ({ ...e, logradouro: undefined, bairro: undefined, cidade: undefined, uf: undefined }))
    }
  }

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault()
    setErroGeral('')
    const { erros: e } = validarCadastro(f, hojeEstudio())
    setErros(e)
    if (Object.keys(e).length) {
      setErroGeral('Confira os campos destacados.')
      document.querySelector('.cad-campo.com-erro, .cad-aceite.com-erro')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setEnviando(true)
    try {
      const r = await fetch('/api/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, site: isca })
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok) return setTela('sucesso')
      if (j.motivo === 'ja_cadastrado') return setTela('ja_cadastrado')
      if (j.motivo === 'fechado') return setTela('fechado')
      if (j.erros) setErros(j.erros)
      setErroGeral(j.erro ?? 'Não foi possível enviar. Tente de novo.')
    } catch {
      setErroGeral('Sem conexão. Confira a internet e tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  const campo = (k: keyof EntradaCadastro, rotulo: string, input: React.ReactNode, dica?: string) => (
    <div className={`cad-campo${erros[k] ? ' com-erro' : ''}`}>
      <label className="label" htmlFor={`cad-${k}`}>{rotulo}</label>
      {input}
      {erros[k] ? <div className="cad-erro-campo">{erros[k]}</div> : dica ? <div className="cad-dica">{dica}</div> : null}
    </div>
  )

  const texto = (k: keyof EntradaCadastro, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input id={`cad-${k}`} className="input" value={f[k] as string} onChange={e => set(k, e.target.value as never)} {...props} />
  )

  return (
    <div className="cad">
      <header className="cad-topo">
        <img src="/logo-lk-pilates.png" alt="" />
        <h1>{estudio}</h1>
        <p>Ficha de cadastro</p>
      </header>

      <main className="cad-corpo">
        {tela === 'carregando' && <div className="cad-card ui-skeleton" style={{ height: 240 }} />}

        {tela === 'fechado' && (
          <div className="cad-card cad-mensagem">
            <Lock size={32} color="var(--ink-500)" />
            <h2>Cadastro fechado</h2>
            <p>O cadastro pelo link não está disponível no momento. Fale com o estúdio.</p>
          </div>
        )}

        {tela === 'sucesso' && (
          <div className="cad-card cad-mensagem">
            <CircleCheck size={40} color="#16a34a" />
            <h2>Cadastro concluído!</h2>
            <p>Obrigado, {f.nome.split(' ')[0]}. Seus dados chegaram ao estúdio. Agora é só combinar seus horários com a equipe.</p>
          </div>
        )}

        {tela === 'ja_cadastrado' && (
          <div className="cad-card cad-mensagem">
            <UserRound size={36} color="var(--brand-blue)" />
            <h2>Você já está cadastrado(a)</h2>
            <p>Encontramos um cadastro com estes dados. Se precisar atualizar alguma informação, fale com o estúdio.</p>
          </div>
        )}

        {tela === 'formulario' && (
          <form onSubmit={enviar} noValidate>
            <div className="cad-card">
              <h2>Seus dados</h2>
              {campo('nome', 'Nome completo', texto('nome', { autoComplete: 'name' }))}
              <div className="cad-linha">
                {campo('cpf', 'CPF', texto('cpf', { inputMode: 'numeric', placeholder: '000.000.000-00', value: f.cpf, onChange: e => set('cpf', formatarCpf(e.target.value)) }))}
                {campo('data_nascimento', 'Data de nascimento', texto('data_nascimento', { type: 'date', max: hojeEstudio(), autoComplete: 'bday' }))}
              </div>
              <div className="cad-linha">
                {campo('telefone', 'Telefone / WhatsApp', texto('telefone', { inputMode: 'tel', autoComplete: 'tel', placeholder: '(31) 99999-9999', value: f.telefone, onChange: e => set('telefone', formatarTelefone(e.target.value)) }))}
                {campo('email', 'E-mail', texto('email', { type: 'email', inputMode: 'email', autoComplete: 'email' }))}
              </div>
              {campo('profissao', 'Profissão (opcional)', texto('profissao'))}
            </div>

            <div className="cad-card">
              <h2>Endereço</h2>
              <div className="cad-linha">
                {campo(
                  'cep',
                  'CEP',
                  texto('cep', { inputMode: 'numeric', autoComplete: 'postal-code', placeholder: '00000-000', value: f.cep, onChange: e => aoMudarCep(e.target.value) }),
                  buscandoCep ? 'Buscando endereço...' : 'Preenche a rua e a cidade sozinho.'
                )}
              </div>
              {campo('logradouro', 'Rua', texto('logradouro', { autoComplete: 'address-line1' }))}
              <div className="cad-linha estreita">
                {campo('complemento', 'Complemento (opcional)', texto('complemento', { placeholder: 'Apto, bloco...' }))}
                {campo('numero', 'Número', texto('numero', { inputMode: 'numeric' }))}
              </div>
              {campo('bairro', 'Bairro', texto('bairro'))}
              <div className="cad-linha estreita">
                {campo('cidade', 'Cidade', texto('cidade', { autoComplete: 'address-level2' }))}
                {campo(
                  'uf',
                  'Estado',
                  <select id="cad-uf" className="ui-select" value={f.uf} onChange={e => set('uf', e.target.value)}>
                    <option value="">UF</option>
                    {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                )}
              </div>
            </div>

            <div className="cad-card">
              <h2>Sobre você</h2>
              {campo(
                'como_conheceu',
                'Como conheceu o estúdio? (opcional)',
                <select id="cad-como_conheceu" className="ui-select" value={f.como_conheceu} onChange={e => set('como_conheceu', e.target.value)}>
                  <option value="">Selecione</option>
                  {COMO_CONHECEU.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
              {campo(
                'objetivo',
                'Seu objetivo com o pilates (opcional)',
                <textarea id="cad-objetivo" className="ui-textarea" value={f.objetivo} onChange={e => set('objetivo', e.target.value)} placeholder="Ex.: postura, aliviar dores, condicionamento..." />
              )}
              {campo(
                'saude',
                'Informações de saúde (opcional)',
                <textarea id="cad-saude" className="ui-textarea" value={f.saude} onChange={e => set('saude', e.target.value)} placeholder="Lesões, cirurgias, dores, gestação, restrições médicas..." />,
                'Ajuda a professora a adaptar os exercícios para você.'
              )}
            </div>

            <div className="cad-card">
              <label className={`cad-aceite${erros.aceite_lgpd ? ' com-erro' : ''}`}>
                <input type="checkbox" checked={f.aceite_lgpd} onChange={e => set('aceite_lgpd', e.target.checked)} />
                <span>Autorizo o {estudio} a guardar e usar meus dados para cadastro, agendamento de aulas e contato, conforme a LGPD.</span>
              </label>
              {erros.aceite_lgpd && <div className="cad-erro-campo" style={{ marginTop: 6 }}>{erros.aceite_lgpd}</div>}

              {/* campo escondido anti-robo */}
              <div className="cad-isca" aria-hidden="true">
                <label>
                  Site
                  <input tabIndex={-1} autoComplete="off" value={isca} onChange={e => setIsca(e.target.value)} />
                </label>
              </div>

              {erroGeral && <div className="form-error" style={{ marginTop: 14, marginBottom: 0 }}>{erroGeral}</div>}
              <button type="submit" className="btn-primary cad-enviar" disabled={enviando} style={{ marginTop: 16 }}>
                {enviando ? 'Enviando...' : 'Concluir cadastro'}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  )
}
