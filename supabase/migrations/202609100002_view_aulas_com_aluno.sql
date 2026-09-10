-- View para visualizar as aulas ja com o nome do aluno (facilita conferir no Table Editor / SQL Editor).
create or replace view public.aulas_com_aluno
with (security_invoker = true)
as
select
  a.id,
  a.aluno_id,
  al.nome as aluno_nome,
  a.data,
  a.horario,
  a.status,
  a.tipo,
  a.observacao,
  a.plano_id,
  a.created_at,
  a.updated_at,
  a.deleted_at
from public.aulas a
join public.alunos al on al.id = a.aluno_id;

grant select on public.aulas_com_aluno to authenticated;
