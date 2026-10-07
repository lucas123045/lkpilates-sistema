-- =====================================================================
-- Usuarios do sistema e niveis de acesso.
--   Nivel 1: Agenda e Relatorio de alunos.
--   Nivel 2: acesso total (dona do estudio) e gestao dos logins.
--
-- Esta migration NAO fecha nada: so cria a tabela e as funcoes de apoio.
-- O acesso anonimo e fechado em 202610070002, depois que a dona ja tiver
-- o login de nivel 2 (ver docs/acesso.md). Reexecutavel.
-- =====================================================================

create table if not exists public.usuarios_acesso (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  nivel smallint not null default 1 check (nivel in (1, 2)),
  ativo boolean not null default true,
  profissional_id uuid references public.professores(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists usuarios_acesso_email_uidx on public.usuarios_acesso (lower(email));

comment on table public.usuarios_acesso is
  'Logins do sistema. nivel 1 = Agenda e Relatorio de alunos; nivel 2 = acesso total. professores.funcao e legado e nao controla acesso.';

-- ---------------------------------------------------------------------
-- Funcoes usadas nas policies (security definer: leem usuarios_acesso
-- sem depender das policies dela mesma)
-- ---------------------------------------------------------------------

/** Nivel do usuario logado (null = sem login, sem cadastro ou inativo). */
create or replace function public.usuario_nivel()
returns smallint
language sql
stable
security definer
set search_path = public
as $$
  select nivel from public.usuarios_acesso where user_id = auth.uid() and ativo
$$;

create or replace function public.usuario_ativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_nivel() is not null
$$;

create or replace function public.usuario_nivel2()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.usuario_nivel() = 2, false)
$$;

/** Nome do estudio para o topo do sistema, sem abrir a tabela empresa ao nivel 1. */
create or replace function public.nome_estudio()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when public.usuario_ativo()
    then coalesce((select nome from public.empresa where id = 1), 'LK Pilates')
  end
$$;

-- ---------------------------------------------------------------------
-- Nunca ficar sem nenhum nivel 2 ativo (ninguem conseguiria administrar)
-- ---------------------------------------------------------------------
create or replace function public.usuarios_acesso_proteger_nivel2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.nivel = 2 and old.ativo
     and (tg_op = 'DELETE' or new.nivel <> 2 or not new.ativo)
     and not exists (
       select 1 from public.usuarios_acesso
       where nivel = 2 and ativo and user_id <> old.user_id
     ) then
    raise exception 'O sistema precisa de pelo menos um usuario de nivel 2 ativo' using errcode = 'LK020';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists usuarios_acesso_proteger_nivel2 on public.usuarios_acesso;
create trigger usuarios_acesso_proteger_nivel2
  before update or delete on public.usuarios_acesso
  for each row execute function public.usuarios_acesso_proteger_nivel2();

-- ---------------------------------------------------------------------
-- Acesso: cada um ve a propria linha; nivel 2 ve e altera tudo
-- ---------------------------------------------------------------------
alter table public.usuarios_acesso enable row level security;

drop policy if exists usuarios_acesso_proprio on public.usuarios_acesso;
create policy usuarios_acesso_proprio on public.usuarios_acesso
  for select to authenticated using (user_id = auth.uid());

drop policy if exists usuarios_acesso_nivel2 on public.usuarios_acesso;
create policy usuarios_acesso_nivel2 on public.usuarios_acesso
  for all to authenticated using ((select public.usuario_nivel2())) with check ((select public.usuario_nivel2()));

revoke all on public.usuarios_acesso from anon, public;
grant select, insert, update, delete on public.usuarios_acesso to authenticated;

revoke execute on function public.usuario_nivel() from public, anon;
revoke execute on function public.usuario_ativo() from public, anon;
revoke execute on function public.usuario_nivel2() from public, anon;
revoke execute on function public.nome_estudio() from public, anon;
revoke execute on function public.usuarios_acesso_proteger_nivel2() from public, anon;
grant execute on function public.usuario_nivel() to authenticated;
grant execute on function public.usuario_ativo() to authenticated;
grant execute on function public.usuario_nivel2() to authenticated;
grant execute on function public.nome_estudio() to authenticated;
