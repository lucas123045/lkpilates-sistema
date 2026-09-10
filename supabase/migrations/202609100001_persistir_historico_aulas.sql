-- Historico de aulas: os registros de negocio ficam no banco e nao no estado do navegador.
alter table public.aulas
  add column if not exists horario time,
  add column if not exists tipo text not null default 'normal',
  add column if not exists plano_id uuid,
  add column if not exists observacao text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists aulas_aluno_data_idx
  on public.aulas (aluno_id, data desc)
  where deleted_at is null;

create index if not exists aulas_data_status_idx
  on public.aulas (data desc, status)
  where deleted_at is null;

alter table public.aulas enable row level security;

drop policy if exists aulas_authenticated_select on public.aulas;
create policy aulas_authenticated_select on public.aulas
  for select to authenticated using (true);

drop policy if exists aulas_authenticated_insert on public.aulas;
create policy aulas_authenticated_insert on public.aulas
  for insert to authenticated with check (true);

drop policy if exists aulas_authenticated_update on public.aulas;
create policy aulas_authenticated_update on public.aulas
  for update to authenticated using (true) with check (true);

create or replace function public.registrar_aula(
  aluno_id_input uuid,
  data_input date,
  status_input text,
  tipo_input text default 'normal',
  horario_input time default null,
  observacao_input text default null
)
returns public.aulas
language plpgsql
security invoker
set search_path = public
as $$
declare
  aluno_atual public.alunos%rowtype;
  aula_criada public.aulas%rowtype;
begin
  if status_input not in ('veio', 'faltou', 'reposicao', 'reinicio') then
    raise exception 'Status de aula invalido: %', status_input using errcode = '22023';
  end if;

  select * into aluno_atual
    from public.alunos
    where id = aluno_id_input and ativo = true
    for update;

  if not found then
    raise exception 'Aluno ativo nao encontrado' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.aulas
    where aluno_id = aluno_id_input
      and data = data_input
      and horario is not distinct from horario_input
      and deleted_at is null
  ) then
    raise exception 'Ja existe uma aula para este aluno nesta data' using errcode = '23505';
  end if;

  if status_input in ('veio', 'faltou', 'reposicao') and aluno_atual.aulas_restantes <= 0 then
    raise exception 'O plano nao possui aulas restantes' using errcode = '22013';
  end if;

  insert into public.aulas (aluno_id, data, status, tipo, horario, observacao)
    values (aluno_id_input, data_input, status_input, tipo_input, horario_input, observacao_input)
    returning * into aula_criada;

  if status_input in ('veio', 'faltou', 'reposicao') then
    update public.alunos
      set aulas_restantes = aulas_restantes - 1
      where id = aluno_id_input;
  end if;

  return aula_criada;
end;
$$;

create or replace function public.desfazer_aula(aula_id_input bigint)
returns public.aulas
language plpgsql
security invoker
set search_path = public
as $$
declare
  aula_atual public.aulas%rowtype;
  aula_cancelada public.aulas%rowtype;
begin
  select * into aula_atual
    from public.aulas
    where id = aula_id_input and deleted_at is null
    for update;

  if not found then
    raise exception 'Aula nao encontrada' using errcode = 'P0002';
  end if;

  update public.aulas
    set deleted_at = now(), updated_at = now()
    where id = aula_id_input
    returning * into aula_cancelada;

  if aula_atual.status in ('veio', 'faltou', 'reposicao') then
    update public.alunos
      set aulas_restantes = aulas_restantes + 1
      where id = aula_atual.aluno_id;
  end if;

  return aula_cancelada;
end;
$$;

comment on column public.aulas.deleted_at is 'Cancelamento logico; nao apagar historico operacional.';