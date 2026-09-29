'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  LayoutGrid,
  LineChart,
  Lock,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Tag,
  UserRound,
  UsersRound,
  X
} from 'lucide-react'
import { podeAcessar, UsuarioProvider, useUsuario } from './Usuario'
import './shell.css'

type Item = { href: string; rotulo: string; icone: typeof LayoutGrid; filhos?: { href: string; rotulo: string }[] }

const MENU: Item[] = [
  { href: '/dashboard', rotulo: 'Início', icone: LayoutGrid },
  { href: '/agenda', rotulo: 'Agenda', icone: CalendarDays },
  { href: '/clientes', rotulo: 'Clientes', icone: UsersRound },
  {
    href: '/financeiro',
    rotulo: 'Financeiro',
    icone: CircleDollarSign,
    filhos: [
      { href: '/financeiro/entradas', rotulo: 'Entradas' },
      { href: '/financeiro/saidas', rotulo: 'Saídas' }
    ]
  },
  { href: '/relatorios', rotulo: 'Relatórios', icone: BarChart3 },
  { href: '/planos', rotulo: 'Planos', icone: ClipboardList },
  { href: '/servicos', rotulo: 'Tipos de Serviço', icone: Tag },
  { href: '/profissionais', rotulo: 'Profissionais', icone: UserRound },
  { href: '/empresa', rotulo: 'Minha Empresa', icone: Building2 }
]

const EXTRAS: Item[] = [
  { href: '/aulas', rotulo: 'Registro de aulas', icone: CalendarCheck },
  { href: '/resultados', rotulo: 'Resultados', icone: LineChart }
]

const SEM_MOLDURA = ['/', '/login']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const caminho = usePathname() ?? '/'
  if (SEM_MOLDURA.includes(caminho)) return <>{children}</>
  return (
    <UsuarioProvider>
      <Moldura caminho={caminho}>{children}</Moldura>
    </UsuarioProvider>
  )
}

function Moldura({ caminho, children }: { caminho: string; children: React.ReactNode }) {
  const usuario = useUsuario()
  const [recolhida, setRecolhida] = useState(false)
  const [gaveta, setGaveta] = useState(false)
  const [financeiroAberto, setFinanceiroAberto] = useState(caminho.startsWith('/financeiro'))

  useEffect(() => {
    try {
      setRecolhida(localStorage.getItem('lk-sidebar') === 'recolhida')
    } catch {
      /* sem armazenamento */
    }
  }, [])

  useEffect(() => setGaveta(false), [caminho])

  function alternarRecolhida() {
    setRecolhida(r => {
      try {
        localStorage.setItem('lk-sidebar', r ? 'aberta' : 'recolhida')
      } catch {
        /* sem armazenamento */
      }
      return !r
    })
  }

  const ativo = (href: string) => caminho === href || caminho.startsWith(href + '/')
  const permitido = podeAcessar(usuario.funcao, caminho)

  function renderItem(item: Item) {
    if (!podeAcessar(usuario.funcao, item.href)) return null
    const Icone = item.icone
    if (item.filhos) {
      const aberto = financeiroAberto
      return (
        <li key={item.href}>
          <button
            className={`sb-item${ativo(item.href) ? ' ativo' : ''}`}
            onClick={() => (recolhida ? alternarRecolhida() : setFinanceiroAberto(v => !v))}
            title={item.rotulo}
            aria-expanded={aberto}
          >
            <Icone size={20} />
            <span className="sb-rotulo">{item.rotulo}</span>
            <ChevronDown size={16} className={`sb-seta${aberto ? ' aberta' : ''}`} />
          </button>
          {aberto && !recolhida && (
            <ul className="sb-sub">
              {item.filhos.map(f => (
                <li key={f.href}>
                  <Link href={f.href} className={`sb-subitem${ativo(f.href) ? ' ativo' : ''}`}>
                    {f.rotulo}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </li>
      )
    }
    return (
      <li key={item.href}>
        <Link href={item.href} className={`sb-item${ativo(item.href) ? ' ativo' : ''}`} title={item.rotulo}>
          <Icone size={20} />
          <span className="sb-rotulo">{item.rotulo}</span>
        </Link>
      </li>
    )
  }

  return (
    <div className={`shell${recolhida ? ' recolhida' : ''}${gaveta ? ' gaveta-aberta' : ''}`}>
      {gaveta && <div className="sb-fundo" onClick={() => setGaveta(false)} />}
      <aside className="sb" aria-label="Menu principal">
        <div className="sb-topo">
          <Link href="/dashboard" className="sb-marca">
            <img src="/logo-lk-pilates.png" alt="" />
            <span className="sb-rotulo">LK Pilates</span>
          </Link>
          <button className="sb-toggle desktop" onClick={alternarRecolhida} aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}>
            {recolhida ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button className="sb-toggle mobile" onClick={() => setGaveta(false)} aria-label="Fechar menu">
            <X size={18} />
          </button>
        </div>
        <nav>
          <ul className="sb-lista">{MENU.map(renderItem)}</ul>
          <div className="sb-divisor" />
          <ul className="sb-lista">{EXTRAS.map(renderItem)}</ul>
        </nav>
      </aside>

      <div className="shell-conteudo">
        <header className="topo">
          <button className="topo-menu" onClick={() => setGaveta(true)} aria-label="Abrir menu">
            <Menu size={22} />
          </button>
          <div className="topo-direita">
            <div className="topo-usuario">
              <strong>Olá{usuario.nome ? `, ${usuario.nome}` : ''}</strong>
              <span>{usuario.estudio}</span>
            </div>
          </div>
        </header>
        <main className="shell-main">
          {permitido ? (
            children
          ) : (
            <div className="shell-bloqueado">
              <Lock size={28} />
              <h2>Acesso restrito</h2>
              <p>Esta área é só para administradores. Fale com a responsável pelo estúdio.</p>
              <Link href="/agenda" className="btn btn-sec">Ir para a agenda</Link>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
