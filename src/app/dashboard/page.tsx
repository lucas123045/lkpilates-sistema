'use client'

import Link from 'next/link'
import { BarChart3, Building2, CalendarCheck, CalendarDays, CircleDollarSign, ClipboardList, LineChart, Receipt, Tag, UserRound, UsersRound } from 'lucide-react'
import PageHeader from '@/app/components/shell/PageHeader'
import { podeAcessar, useUsuario } from '@/app/components/shell/Usuario'

const ATALHOS = [
  { href: '/agenda', rotulo: 'Agenda', icone: CalendarDays },
  { href: '/clientes', rotulo: 'Clientes', icone: UsersRound },
  { href: '/financeiro/entradas', rotulo: 'Entradas', icone: CircleDollarSign },
  { href: '/financeiro/saidas', rotulo: 'Saídas', icone: Receipt },
  { href: '/relatorios', rotulo: 'Relatórios', icone: BarChart3 },
  { href: '/planos', rotulo: 'Planos', icone: ClipboardList },
  { href: '/servicos', rotulo: 'Tipos de Serviço', icone: Tag },
  { href: '/profissionais', rotulo: 'Profissionais', icone: UserRound },
  { href: '/empresa', rotulo: 'Minha Empresa', icone: Building2 },
  { href: '/aulas', rotulo: 'Registro de aulas', icone: CalendarCheck },
  { href: '/resultados', rotulo: 'Resultados', icone: LineChart }
]

export default function Dashboard() {
  const usuario = useUsuario()
  return (
    <>
      <PageHeader trilha={[{ rotulo: 'Início' }]} />
      <div className="ph-corpo">
        <div className="painel" style={{ padding: '28px 20px' }}>
          <h1 className="dashboard-title" style={{ marginBottom: 4 }}>Painel de Controle</h1>
          <p className="dashboard-subtitle">
            Gerenciamento completo do estúdio <b>{usuario.estudio}</b>
          </p>
          <div className="dashboard-actions">
            {ATALHOS.filter(a => podeAcessar(usuario.funcao, a.href)).map(({ href, rotulo, icone: Icone }) => (
              <Link key={href} href={href} className="dashboard-card">
                <Icone size={26} strokeWidth={1.75} />
                <span>{rotulo}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
