'use client'

import Link from 'next/link'
import { ClipboardCheck } from 'lucide-react'
import PageHeader from '@/app/components/shell/PageHeader'
import RelatoriosGestao from './RelatoriosGestao'
import '@/app/components/ui/ui.css'

export default function RelatoriosPage() {
  return (
    <>
      <PageHeader
        trilha={[{ rotulo: 'Relatórios' }, { rotulo: 'Gestão do estúdio' }]}
        acao={
          <Link href="/relatorio-alunos" className="btn">
            <ClipboardCheck size={15} /> Relatório de alunos
          </Link>
        }
      />
      <div className="ph-corpo">
        <RelatoriosGestao />
      </div>
    </>
  )
}
