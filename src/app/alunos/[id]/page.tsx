import { redirect } from 'next/navigation'

export default function AlunoPage({ params }: { params: { id: string } }) {
  redirect(`/clientes/${params.id}`)
}
