-- =====================================================================
-- AGENDA - estrutura
-- Migration aditiva: cria tabelas novas e acrescenta colunas.
-- Nao apaga colunas nem dados. Pode ser rodada mais de uma vez.
-- Reaproveita:
--   alunos          -> cadastro (ganha telefone, frequencia_semanal, professor_id)
--   horarios_aluno  -> horarios fixos do aluno (ganha horario_id, vigencia, professor)
--   agenda          -> agendamentos (ocorrencia concreta aluno x data x horario)
--   aulas           -> continua sendo o registro de presenca/debito do pacote
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabelas de apoio
-- ---------------------------------------------------------------------

create table if not exists public.professores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  cor text not null default '#2563eb',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.modalidades (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  capacidade_padrao integer not null default 3 check (capacidade_padrao > 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.modalidades (nome, capacidade_padrao) values
  ('Aparelhos', 3),
  ('Solo/Mat', 6),
  ('Individual', 1),
  ('Dupla', 2)
on conflict (nome) do nothing;

-- Turmas recorrentes da grade semanal. dia_semana: 1 = segunda ... 7 = domingo (ISO).
create table if not exists public.horarios (
  id uuid primary key default gen_random_uuid(),
  dia_semana smallint not null check (dia_semana between 1 and 7),
  hora_inicio time not null,
  duracao_min integer not null default 55 check (duracao_min > 0),
  professor_id uuid references public.professores(id) on delete set null,
  modalidade_id uuid references public.modalidades(id) on delete set null,
  capacidade integer not null default 3 check (capacidade > 0),
  ativo boolean not null default true,
  vigente_desde date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  vigente_ate date,
  observacao text,
  origem text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists horarios_dia_hora_idx on public.horarios (dia_semana, hora_inicio) where ativo;

-- Troca pontual de professor de uma turma numa data (substituicao).
create table if not exists public.substituicoes_professor (
  id uuid primary key default gen_random_uuid(),
  horario_id uuid not null references public.horarios(id) on delete cascade,
  data date not null,
  professor_id uuid references public.professores(id) on delete set null,
  motivo text,
  created_at timestamptz not null default now(),
  unique (horario_id, data)
);

-- Feriados, recesso, horario fechado. horario_id nulo = dia inteiro.
create table if not exists public.bloqueios (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  data_fim date,
  horario_id uuid references public.horarios(id) on delete cascade,
  motivo text not null,
  created_at timestamptz not null default now(),
  check (data_fim is null or data_fim >= data)
);

create index if not exists bloqueios_data_idx on public.bloqueios (data, data_fim);

-- Configuracao unica do estudio (linha id = 1).
create table if not exists public.configuracoes_estudio (
  id smallint primary key default 1 check (id = 1),
  hora_abertura time not null default '06:00',
  hora_fechamento time not null default '21:00',
  dias_funcionamento smallint[] not null default '{1,2,3,4,5,6}',
  duracao_padrao_min integer not null default 55,
  antecedencia_desmarcacao_horas numeric not null default 3,
  validade_credito_dias integer not null default 30,
  limite_reposicoes_mes integer,
  updated_at timestamptz not null default now()
);

insert into public.configuracoes_estudio (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- alunos: campos novos (todos opcionais)
-- ---------------------------------------------------------------------

alter table public.alunos
  add column if not exists telefone text,
  add column if not exists frequencia_semanal smallint,
  add column if not exists professor_id uuid references public.professores(id) on delete set null;

-- ---------------------------------------------------------------------
-- horarios_aluno: vira a tabela de horarios fixos.
-- As colunas originais (dia_semana, horario) ficam intactas.
-- ---------------------------------------------------------------------

alter table public.horarios_aluno
  add column if not exists horario_id uuid references public.horarios(id) on delete set null,
  add column if not exists data_inicio date,
  add column if not exists data_fim date,
  add column if not exists professor_id uuid references public.professores(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists horarios_aluno_horario_idx on public.horarios_aluno (horario_id);
create index if not exists horarios_aluno_aluno_idx on public.horarios_aluno (aluno_id);

-- ---------------------------------------------------------------------
-- agenda: vira a tabela de agendamentos.
-- Garante tipos date/time/uuid. So converte automaticamente se a tabela
-- estiver vazia; com dados, para e pede revisao manual.
-- ---------------------------------------------------------------------

do $$
declare
  linhas bigint;
  tipo_atual text;
  alvo record;
begin
  select count(*) into linhas from public.agenda;

  for alvo in
    select * from (values ('data', 'date'), ('hora', 'time without time zone'), ('aluno_id', 'uuid'), ('tipo', 'text')) v(coluna, tipo)
  loop
    select format_type(atttypid, atttypmod) into tipo_atual
      from pg_attribute
      where attrelid = 'public.agenda'::regclass and attname = alvo.coluna and not attisdropped;

    if tipo_atual is null or tipo_atual = alvo.tipo
       or (alvo.tipo = 'text' and tipo_atual like 'character varying%') then
      continue;
    end if;

    if linhas > 0 then
      raise exception 'agenda.% e do tipo % (esperado %) e a tabela tem % linhas. Revise manualmente antes de continuar.',
        alvo.coluna, tipo_atual, alvo.tipo, linhas;
    end if;

    execute format('alter table public.agenda alter column %I drop default', alvo.coluna);
    execute format('alter table public.agenda alter column %I type %s using %I::text::%s',
      alvo.coluna, alvo.tipo, alvo.coluna, alvo.tipo);
  end loop;
end $$;

-- Experimental nao tem aluno cadastrado.
alter table public.agenda alter column aluno_id drop not null;

alter table public.agenda
  add column if not exists horario_id uuid references public.horarios(id) on delete set null,
  add column if not exists duracao_min integer not null default 55,
  add column if not exists status text not null default 'agendado',
  add column if not exists professor_id uuid references public.professores(id) on delete set null,
  add column if not exists professor_origem text,
  add column if not exists experimental_nome text,
  add column if not exists experimental_telefone text,
  add column if not exists aluno_convertido_id uuid references public.alunos(id) on delete set null,
  add column if not exists aula_id bigint references public.aulas(id) on delete set null,
  add column if not exists encaixe boolean not null default false,
  add column if not exists cancelamento_motivo text,
  add column if not exists status_alterado_em timestamptz,
  add column if not exists alterado_por uuid,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agenda_status_check') then
    alter table public.agenda add constraint agenda_status_check
      check (status in ('agendado', 'presente', 'falta', 'falta_justificada', 'desmarcado', 'cancelado_estudio'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agenda_tipo_check') then
    alter table public.agenda add constraint agenda_tipo_check
      check (tipo in ('fixo', 'reposicao', 'experimental', 'avulsa')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agenda_professor_origem_check') then
    alter table public.agenda add constraint agenda_professor_origem_check
      check (professor_origem is null or professor_origem in ('dia', 'aluno', 'horario'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agenda_pessoa_check') then
    alter table public.agenda add constraint agenda_pessoa_check
      check (aluno_id is not null or experimental_nome is not null) not valid;
  end if;
end $$;

-- Chave estrangeira aluno_id -> alunos com nome conhecido (o app usa o nome
-- para buscar o aluno junto do agendamento). NOT VALID: nao revalida linhas antigas.
do $$
declare
  alvo record;
  existente text;
begin
  for alvo in select * from (values ('agenda'), ('horarios_aluno')) v(tabela) loop
    select c.conname into existente
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.conrelid = format('public.%I', alvo.tabela)::regclass
        and c.contype = 'f'
        and c.confrelid = 'public.alunos'::regclass
        and a.attname = 'aluno_id'
      limit 1;

    if existente is null then
      execute format(
        'alter table public.%I add constraint %I foreign key (aluno_id) references public.alunos(id) not valid',
        alvo.tabela, alvo.tabela || '_aluno_id_fkey');
    elsif existente <> alvo.tabela || '_aluno_id_fkey' then
      execute format('alter table public.%I rename constraint %I to %I',
        alvo.tabela, existente, alvo.tabela || '_aluno_id_fkey');
    end if;
  end loop;
end $$;

-- Mesmo aluno so uma vez por horario e data.
create unique index if not exists agenda_aluno_horario_data_uidx
  on public.agenda (aluno_id, horario_id, data)
  where aluno_id is not null and horario_id is not null;

create index if not exists agenda_data_idx on public.agenda (data, hora);
create index if not exists agenda_aluno_data_idx on public.agenda (aluno_id, data desc);

-- Colunas/tabelas que referenciam agenda.id usam o mesmo tipo do id existente.
do $$
declare
  tipo_id text;
begin
  select format_type(atttypid, atttypmod) into tipo_id
    from pg_attribute
    where attrelid = 'public.agenda'::regclass and attname = 'id' and not attisdropped;

  execute format(
    'alter table public.agenda add column if not exists remarcado_de_id %s references public.agenda(id) on delete set null',
    tipo_id);

  execute format($f$
    create table if not exists public.creditos_reposicao (
      id uuid primary key default gen_random_uuid(),
      aluno_id uuid not null references public.alunos(id) on delete cascade,
      agendamento_origem_id %1$s references public.agenda(id) on delete set null,
      agendamento_destino_id %1$s references public.agenda(id) on delete set null,
      criado_em timestamptz not null default now(),
      expira_em date not null,
      usado_em timestamptz,
      cancelado_em timestamptz,
      observacao text
    )$f$, tipo_id);
end $$;

alter table public.agenda
  add column if not exists credito_usado_id uuid references public.creditos_reposicao(id) on delete set null;

create index if not exists creditos_aluno_idx on public.creditos_reposicao (aluno_id, expira_em)
  where usado_em is null and cancelado_em is null;
create index if not exists creditos_origem_idx on public.creditos_reposicao (agendamento_origem_id);

create table if not exists public.lista_espera (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.alunos(id) on delete cascade,
  horario_id uuid not null references public.horarios(id) on delete cascade,
  data date, -- nulo = quer entrar na turma de forma recorrente
  observacao text,
  created_at timestamptz not null default now(),
  atendido_em timestamptz,
  cancelado_em timestamptz
);

create index if not exists lista_espera_horario_idx on public.lista_espera (horario_id, data)
  where atendido_em is null and cancelado_em is null;

comment on table public.agenda is 'Agendamentos: ocorrencia concreta de um aluno (ou experimental) numa data/horario.';
comment on column public.agenda.aula_id is 'Registro em aulas criado ao marcar presenca/falta (debito do pacote).';
comment on column public.agenda.professor_id is 'Professor efetivo naquele dia (dia > aluno > horario).';

-- ---------------------------------------------------------------------
-- Acesso: espelha o sistema atual (o app usa a chave publica e o login
-- nao e obrigatorio). Restringir aqui quando o login passar a ser exigido.
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'professores', 'modalidades', 'horarios', 'substituicoes_professor', 'bloqueios',
    'configuracoes_estudio', 'creditos_reposicao', 'lista_espera', 'agenda', 'horarios_aluno'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_app_acesso', t);
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (true) with check (true)',
      t || '_app_acesso', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;
