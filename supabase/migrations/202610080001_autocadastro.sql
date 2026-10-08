-- =====================================================================
-- Autocadastro do cliente pelo link (/cadastro).
--   - campos de cadastro completos em alunos (CPF, e-mail, endereco...)
--   - liga/desliga do link em empresa
--   - funcao autocadastro(): so o servidor (service_role) executa; cria o
--     cliente ja ativo, sem duplicar CPF/telefone, com limite por IP
-- Reexecutavel. Depende de 202610070002.
-- =====================================================================

alter table public.alunos
  add column if not exists cpf text,
  add column if not exists email text,
  add column if not exists cep text,
  add column if not exists logradouro text,
  add column if not exists numero text,
  add column if not exists complemento text,
  add column if not exists bairro text,
  add column if not exists cidade text,
  add column if not exists uf text,
  add column if not exists profissao text,
  add column if not exists como_conheceu text,
  add column if not exists objetivo text,
  add column if not exists saude text,
  add column if not exists aceite_lgpd_em timestamptz,
  add column if not exists cadastrado_por text not null default 'estudio',
  add column if not exists autocadastro_visto_em timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'alunos_cpf_formato') then
    alter table public.alunos add constraint alunos_cpf_formato check (cpf is null or cpf ~ '^[0-9]{11}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'alunos_cadastrado_por_check') then
    alter table public.alunos add constraint alunos_cadastrado_por_check check (cadastrado_por in ('estudio', 'autocadastro'));
  end if;
end $$;

create unique index if not exists alunos_cpf_uidx on public.alunos (cpf) where cpf is not null;
create index if not exists alunos_autocadastro_novos_idx on public.alunos (created_at) where cadastrado_por = 'autocadastro' and autocadastro_visto_em is null;

alter table public.empresa add column if not exists cadastro_link_ativo boolean not null default true;

-- ---------------------------------------------------------------------
-- Tentativas (limite por IP). Ninguem le pela API; so a funcao abaixo.
-- ---------------------------------------------------------------------
create table if not exists public.autocadastro_tentativas (
  id bigserial primary key,
  ip_hash text not null,
  criado_em timestamptz not null default now()
);

create index if not exists autocadastro_tentativas_ip_idx on public.autocadastro_tentativas (ip_hash, criado_em);

alter table public.autocadastro_tentativas enable row level security;
revoke all on public.autocadastro_tentativas from anon, authenticated, public;

-- ---------------------------------------------------------------------
-- autocadastro(dados, ip_hash) -> {status: ok | ja_cadastrado | fechado | limite}
-- Os dados chegam ja validados e normalizados pela API (src/lib/cadastro.ts).
-- ---------------------------------------------------------------------
create or replace function public.autocadastro(dados jsonb, ip_hash_input text, limite_por_hora integer default 5)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cpf_in text := dados ->> 'cpf';
  tel_in text := regexp_replace(coalesce(dados ->> 'telefone', ''), '\D', '', 'g');
begin
  if not coalesce((select cadastro_link_ativo from public.empresa where id = 1), false) then
    return jsonb_build_object('status', 'fechado');
  end if;

  delete from public.autocadastro_tentativas where criado_em < now() - interval '1 day';
  if (select count(*) from public.autocadastro_tentativas
      where ip_hash = ip_hash_input and criado_em > now() - interval '1 hour') >= limite_por_hora then
    return jsonb_build_object('status', 'limite');
  end if;
  insert into public.autocadastro_tentativas (ip_hash) values (ip_hash_input);

  if coalesce(cpf_in, '') !~ '^[0-9]{11}$' or coalesce(trim(dados ->> 'nome'), '') = '' or length(tel_in) < 10 then
    raise exception 'Dados de cadastro invalidos' using errcode = 'LK010';
  end if;

  -- ja e cliente (mesmo CPF ou mesmo telefone): nao duplica e nao revela nada
  if exists (
    select 1 from public.alunos
    where cpf = cpf_in
       or (telefone is not null and right(regexp_replace(telefone, '\D', '', 'g'), 11) = right(tel_in, 11))
  ) then
    return jsonb_build_object('status', 'ja_cadastrado');
  end if;

  begin
    insert into public.alunos (
      nome, cpf, data_nascimento, telefone, email, cep, logradouro, numero, complemento, bairro, cidade, uf,
      profissao, como_conheceu, objetivo, saude, aceite_lgpd_em, cadastrado_por,
      ativo, total_aulas, aulas_restantes, etiquetas
    ) values (
      trim(dados ->> 'nome'), cpf_in, nullif(dados ->> 'data_nascimento', '')::date, dados ->> 'telefone',
      lower(dados ->> 'email'), dados ->> 'cep', dados ->> 'logradouro', dados ->> 'numero', nullif(dados ->> 'complemento', ''),
      dados ->> 'bairro', dados ->> 'cidade', dados ->> 'uf', nullif(dados ->> 'profissao', ''), nullif(dados ->> 'como_conheceu', ''),
      nullif(dados ->> 'objetivo', ''), nullif(dados ->> 'saude', ''), now(), 'autocadastro',
      true, 0, 0, array['Autocadastro']
    );
  exception when unique_violation then
    return jsonb_build_object('status', 'ja_cadastrado');
  end;

  return jsonb_build_object('status', 'ok');
end
$$;

revoke execute on function public.autocadastro(jsonb, text, integer) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.autocadastro(jsonb, text, integer) to service_role;
    grant select, insert, update, delete on public.autocadastro_tentativas to service_role;
    grant usage, select on sequence public.autocadastro_tentativas_id_seq to service_role;
  end if;
end $$;
