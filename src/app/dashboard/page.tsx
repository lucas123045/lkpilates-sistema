'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, BarChart3, Building2, CalendarCheck, CalendarDays, CircleDollarSign, ClipboardCheck, ClipboardList, LineChart, Receipt, ShieldCheck, Tag, UserPlus, UserRound, UsersRound } from 'lucide-react'
import PageHeader from '@/app/components/shell/PageHeader'
import { podeAcessar, useUsuario } from '@/app/components/shell/Usuario'
import { contarNovosAutocadastros } from '@/lib/gestao/servico'

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
  { href: '/resultados', rotulo: 'Resultados', icone: LineChart },
  { href: '/usuarios', rotulo: 'Usuários e acessos', icone: ShieldCheck }
]

export default function Dashboard() {
  const usuario = useUsuario()
  const [novosLink, setNovosLink] = useState(0)

  useEffect(() => {
    contarNovosAutocadastros().then(setNovosLink).catch(() => {})
  }, [])

  return (
    <>
      <PageHeader trilha={[{ rotulo: 'Início' }]} />
      <div className="ph-corpo">
        <div className="painel" style={{ padding: '28px 20px' }}>
          <h1 className="dashboard-title" style={{ marginBottom: 4 }}>Painel de Controle</h1>
          <p className="dashboard-subtitle">
            Gerenciamento completo do estúdio <b>{usuario.estudio}</b>
          </p>
          {novosLink > 0 && (
            <Link href="/clientes?novos-link=1" className="ui-alerta ui-alerta-info" style={{ marginBottom: 16, alignItems: 'center', textDecoration: 'none' }}>
              <UserPlus size={18} />
              <span style={{ flex: 1 }}>
                <strong>{novosLink} {novosLink === 1 ? 'novo cadastro' : 'novos cadastros'} pelo link.</strong> Complete plano, profissional e pacote de aulas.
              </span>
              <ArrowRight size={18} />
            </Link>
          )}
          <Link href="/relatorio-alunos" className="dash-destaque">
            <span className="dash-destaque-icone"><ClipboardCheck size={30} /></span>
            <span className="dash-destaque-texto">
              <strong>Relatório de alunos</strong>
              <span>Presenças, faltas, reposições, pacote de aulas e histórico de cada aluno</span>
            </span>
            <ArrowRight size={22} className="dash-destaque-seta" />
          </Link>
          <div className="dashboard-actions dash-atalhos">
            {ATALHOS.filter(a => podeAcessar(usuario.nivel, a.href)).map(({ href, rotulo, icone: Icone }) => (
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
