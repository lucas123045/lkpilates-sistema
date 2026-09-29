-- =====================================================================
-- GESTAO DO ESTUDIO: profissionais, tipos de servico, planos, clientes,
-- agenda por cliente com recorrencia, financeiro e empresa.
-- Aditiva e reexecutavel. Depende de 202609260001..202609270001.
--
-- Reaproveita:
--   professores  -> Profissionais (funcao, nascimento, e-mail)
--   modalidades  -> Tipos de Servico (duracao padrao, cor)
--   alunos       -> Clientes (plano, vencimento, aniversario, etiquetas)
--   agenda       -> cada aula de um cliente numa data (recorrencia_id, servico, cor)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Profissionais
-- ---------------------------------------------------------------------
alter table public.professores
  add column if not exists funcao text not null default 'nivel2',
  add column if not exists data_nascimento date,
  add column if not exists email text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'professores_funcao_check') then
    alter table public.professores add constraint professores_funcao_check
      check (funcao in ('administrador', 'nivel2'));
  end if;
end $$;

create unique index if not exists professores_email_uidx on public.professores (lower(email)) where email is not null;

-- ---------------------------------------------------------------------
-- Tipos de servico
-- ---------------------------------------------------------------------
alter table public.modalidades
  add column if not exists duracao_padrao_min integer not null default 60,
  add column if not exists cor text not null default '#0ea5e9';

insert into public.modalidades (nome, capacidade_padrao, duracao_padrao_min)
  values ('Aula de pilates', 3, 60)
  on conflict (nome) do nothing;

-- ---------------------------------------------------------------------
-- Planos
-- ---------------------------------------------------------------------
create table if not exists public.planos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  periodicidade text not null default 'mensal',
  meses integer not null default 1 check (meses > 0),
  aulas_semana smallint check (aulas_semana between 1 and 7),
  preco_mensal numeric(10, 2) not null default 0 check (preco_mensal >= 0),
  ativo boolean not null default true,
  origem text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'planos_periodicidade_check') then
    alter table public.planos add constraint planos_periodicidade_check
      check (periodicidade in ('mensal', 'bimestral', 'trimestral', 'quadrimestral', 'semestral', 'anual', 'avulso'));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Clientes (extensao de alunos)
-- ---------------------------------------------------------------------
alter table public.alunos
  add column if not exists plano_id uuid references public.planos(id) on delete set null,
  add column if not exists vencimento date,
  add column if not exists data_nascimento date,
  add column if not exists etiquetas text[] not null default '{}',
  add column if not exists observacoes text;

create index if not exists alunos_vencimento_idx on public.alunos (vencimento) where ativo;

-- ---------------------------------------------------------------------
-- Agenda por cliente: regra de recorrencia
-- ---------------------------------------------------------------------
create table if not exists public.recorrencias (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid references public.alunos(id) on delete cascade,
  nome_livre text,
  telefone_livre text,
  dias_semana smallint[] not null,
  hora_inicio time not null,
  hora_fim time not null,
  profissional_id uuid references public.professores(id) on delete set null,
  servico_id uuid references public.modalidades(id) on delete set null,
  cor text,
  observacao text,
  data_inicio date not null,
  data_fim date,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (aluno_id is not null or nome_livre is not null),
  check (hora_fim > hora_inicio),
  check (cardinality(dias_semana) > 0 and dias_semana <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  check (data_fim is null or data_fim >= data_inicio)
);

create index if not exists recorrencias_aluno_idx on public.recorrencias (aluno_id) where ativo;

alter table public.agenda
  add column if not exists recorrencia_id uuid references public.recorrencias(id) on delete set null,
  add column if not exists servico_id uuid references public.modalidades(id) on delete set null,
  add column if not exists cor text,
  add column if not exists excecao boolean not null default false,
  add column if not exists excluida boolean not null default false;

create unique index if not exists agenda_recorrencia_data_uidx
  on public.agenda (recorrencia_id, data) where recorrencia_id is not null;

-- Novo tipo 'aula': aula comum de cliente fora de recorrencia (debita o pacote como a fixa)
alter table public.agenda drop constraint if exists agenda_tipo_check;
alter table public.agenda add constraint agenda_tipo_check
  check (tipo in ('fixo', 'aula', 'reposicao', 'experimental', 'avulsa')) not valid;

-- ---------------------------------------------------------------------
-- Financeiro
-- ---------------------------------------------------------------------
create table if not exists public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  valor numeric(10, 2) not null check (valor > 0),
  forma text not null check (forma in ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'transferencia')),
  aluno_id uuid references public.alunos(id) on delete set null,
  profissional_id uuid references public.professores(id) on delete set null,
  servico_id uuid references public.modalidades(id) on delete set null,
  descricao text,
  meses_vencimento integer not null default 0,
  vencimento_anterior date,
  vencimento_novo date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pagamentos_data_idx on public.pagamentos (data desc);
create index if not exists pagamentos_aluno_idx on public.pagamentos (aluno_id, data desc);

create table if not exists public.despesas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  valor numeric(10, 2) not null check (valor > 0),
  categoria text not null check (categoria in ('aluguel', 'energia', 'equipamentos', 'comissoes', 'outros')),
  descricao text,
  recorrente boolean not null default false,
  frequencia text check (frequencia is null or frequencia = 'mensal'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists despesas_data_idx on public.despesas (data desc);

-- ---------------------------------------------------------------------
-- Minha Empresa (linha unica) + estrutura para fases futuras
-- ---------------------------------------------------------------------
create table if not exists public.empresa (
  id smallint primary key default 1 check (id = 1),
  nome text not null default 'LK Pilates',
  telefone text,
  endereco text,
  documento text,
  avisos_whatsapp boolean not null default false,
  avisos_email boolean not null default false,
  avisos_dias_antes integer not null default 3,
  updated_at timestamptz not null default now()
);

insert into public.empresa (id) values (1) on conflict (id) do nothing;

create table if not exists public.contratos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  conteudo text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Acesso: mesmo modelo das outras tabelas do app
do $$
declare
  t text;
begin
  foreach t in array array['planos', 'recorrencias', 'pagamentos', 'despesas', 'empresa', 'contratos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_app_acesso', t);
    execute format('create policy %I on public.%I for all to anon, authenticated using (true) with check (true)', t || '_app_acesso', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- =====================================================================
-- Regras
-- =====================================================================

-- Presenca/falta/credito passam a tratar o tipo 'aula' igual a 'fixo'
create or replace function public.agenda_aplicar_status(
  agenda_id_input bigint,
  status_input text,
  gerar_credito_input boolean default true
)
returns public.agenda
language plpgsql
as $$
declare
  a public.agenda%rowtype;
  cfg public.configuracoes_estudio%rowtype := public.agenda_configuracao();
  credito public.creditos_reposicao%rowtype;
  aula public.aulas%rowtype;
  nova_aula_id bigint;
begin
  select * into a from public.agenda where id = agenda_id_input for update;
  if not found then
    raise exception 'Agendamento nao encontrado' using errcode = 'P0002';
  end if;

  if a.status = status_input then
    return a;
  end if;

  if a.aula_id is not null then
    perform public.desfazer_aula(a.aula_id);
    a.aula_id := null;
  end if;

  if a.status in ('falta_justificada', 'cancelado_estudio') then
    if exists (
      select 1 from public.creditos_reposicao c
      where c.agendamento_origem_id = a.id and c.usado_em is not null and c.cancelado_em is null
    ) then
      raise exception 'O credito gerado por esta falta ja foi usado em outra aula' using errcode = 'LK007';
    end if;

    update public.creditos_reposicao
      set cancelado_em = now()
      where agendamento_origem_id = a.id and usado_em is null and cancelado_em is null;

    if a.credito_usado_id is not null then
      select * into credito from public.creditos_reposicao where id = a.credito_usado_id for update;
      if credito.usado_em is null then
        update public.creditos_reposicao set usado_em = now(), agendamento_destino_id = a.id where id = credito.id;
      elsif credito.agendamento_destino_id::text is distinct from a.id::text then
        raise exception 'O credito desta reposicao ja foi usado em outra aula' using errcode = 'LK007';
      end if;
    end if;
  end if;

  if a.aluno_id is not null and status_input in ('presente', 'falta') then
    if a.tipo = 'avulsa' then
      insert into public.aulas (aluno_id, data, status, tipo, horario, observacao)
        values (a.aluno_id, a.data, case status_input when 'presente' then 'veio' else 'faltou' end,
                'avulsa', a.hora, a.observacao)
        returning id into nova_aula_id;
    else
      aula := public.registrar_aula(
        a.aluno_id,
        a.data,
        case when status_input = 'falta' then 'faltou'
             when a.tipo = 'reposicao' then 'reposicao'
             else 'veio' end,
        case when a.tipo = 'reposicao' then 'reposicao' else 'normal' end,
        a.hora,
        a.observacao
      );
      nova_aula_id := aula.id;
    end if;
  end if;

  if a.aluno_id is not null
     and status_input in ('falta_justificada', 'cancelado_estudio')
     and a.tipo in ('fixo', 'aula', 'reposicao')
     and gerar_credito_input then
    credito := null;
    if a.credito_usado_id is not null then
      select * into credito from public.creditos_reposicao
        where id = a.credito_usado_id and cancelado_em is null and expira_em >= public.agenda_hoje()
        for update;
    end if;

    if credito.id is not null then
      update public.creditos_reposicao set usado_em = null, agendamento_destino_id = null where id = credito.id;
    else
      insert into public.creditos_reposicao (aluno_id, agendamento_origem_id, expira_em)
        values (a.aluno_id, a.id, greatest(a.data, public.agenda_hoje()) + cfg.validade_credito_dias);
    end if;
  end if;

  update public.agenda set
    status = status_input,
    aula_id = nova_aula_id,
    status_alterado_em = now(),
    alterado_por = auth.uid(),
    updated_at = now()
  where id = a.id
  returning * into a;

  return a;
end;
$$;

-- ---------------------------------------------------------------------
-- Materializa as aulas das recorrencias num periodo (idempotente).
-- Nunca mexe em aulas passadas, marcadas ou editadas individualmente.
-- ---------------------------------------------------------------------
create or replace function public.sincronizar_recorrencias(inicio_input date, fim_input date)
returns jsonb
language plpgsql
as $$
declare
  agora timestamp := public.agenda_agora();
  removidos integer := 0;
  atualizados integer := 0;
  criados integer := 0;
begin
  if fim_input < inicio_input or fim_input - inicio_input > 62 then
    raise exception 'Periodo invalido (maximo 62 dias)' using errcode = 'LK010';
  end if;

  -- 1. Futuras que deixaram de valer (regra alterada/encerrada, cliente inativo)
  delete from public.agenda a
    using public.recorrencias r
    where a.recorrencia_id = r.id
      and a.data between inicio_input and fim_input
      and a.status = 'agendado' and a.aula_id is null and not a.excecao
      and (a.data + a.hora) > agora
      and (
        not r.ativo
        or not (extract(isodow from a.data)::smallint = any (r.dias_semana))
        or a.data < r.data_inicio
        or (r.data_fim is not null and a.data > r.data_fim)
        or exists (select 1 from public.alunos al where al.id = r.aluno_id and not al.ativo)
      );
  get diagnostics removidos = row_count;

  -- 2. Futuras acompanham a regra (hora, duracao, profissional, servico, cor)
  update public.agenda a set
    hora = r.hora_inicio,
    duracao_min = (extract(epoch from (r.hora_fim - r.hora_inicio)) / 60)::integer,
    professor_id = r.profissional_id,
    professor_origem = case when r.profissional_id is null then null else 'aluno' end,
    servico_id = r.servico_id,
    cor = r.cor,
    updated_at = now()
  from public.recorrencias r
  where a.recorrencia_id = r.id
    and a.data between inicio_input and fim_input
    and a.status = 'agendado' and not a.excecao
    and (a.data + a.hora) > agora
    and (a.hora is distinct from r.hora_inicio
      or a.duracao_min is distinct from (extract(epoch from (r.hora_fim - r.hora_inicio)) / 60)::integer
      or a.professor_id is distinct from r.profissional_id
      or a.servico_id is distinct from r.servico_id
      or a.cor is distinct from r.cor);
  get diagnostics atualizados = row_count;

  -- 3. Cria o que falta
  insert into public.agenda (
    aluno_id, experimental_nome, experimental_telefone, recorrencia_id, data, hora, duracao_min,
    tipo, status, professor_id, professor_origem, servico_id, cor, observacao
  )
  select
    r.aluno_id, r.nome_livre, r.telefone_livre, r.id, d.dia, r.hora_inicio,
    (extract(epoch from (r.hora_fim - r.hora_inicio)) / 60)::integer,
    case when r.aluno_id is null then 'experimental' else 'fixo' end,
    'agendado', r.profissional_id, case when r.profissional_id is null then null else 'aluno' end,
    r.servico_id, r.cor, r.observacao
  from public.recorrencias r
  cross join lateral (
    select g::date as dia from generate_series(greatest(inicio_input, r.data_inicio), least(fim_input, coalesce(r.data_fim, fim_input)), interval '1 day') g
  ) d
  left join public.alunos al on al.id = r.aluno_id
  where r.ativo
    and extract(isodow from d.dia)::smallint = any (r.dias_semana)
    and (r.aluno_id is null or al.ativo)
    and not exists (
      select 1 from public.bloqueios b
      where b.horario_id is null and d.dia between b.data and coalesce(b.data_fim, b.data)
    )
  on conflict (recorrencia_id, data) where recorrencia_id is not null do nothing;
  get diagnostics criados = row_count;

  return jsonb_build_object('criados', criados, 'removidos', removidos, 'atualizados', atualizados);
end;
$$;

-- sincronizar_agenda passa a incluir as recorrencias (a parte de turmas continua igual)
create or replace function public.sincronizar_agenda(inicio_input date, fim_input date)
returns jsonb
language plpgsql
as $$
declare
  agora timestamp := public.agenda_agora();
  removidos integer := 0;
  atualizados integer := 0;
  criados integer := 0;
  rec jsonb;
begin
  if fim_input < inicio_input or fim_input - inicio_input > 62 then
    raise exception 'Periodo invalido (maximo 62 dias)' using errcode = 'LK010';
  end if;

  delete from public.agenda a
    where a.tipo = 'fixo'
      and a.recorrencia_id is null
      and a.status = 'agendado'
      and a.aula_id is null
      and a.data between inicio_input and fim_input
      and (a.data + a.hora) > agora
      and not exists (select 1 from public.horarios hx where hx.id = a.horario_id and hx.origem = 'aula_unica')
      and not exists (
        select 1
          from public.horarios_aluno f
          join public.horarios h on h.id = f.horario_id
          join public.alunos al on al.id = f.aluno_id::uuid
          where f.aluno_id::uuid = a.aluno_id
            and f.horario_id = a.horario_id
            and h.ativo and al.ativo
            and h.dia_semana = extract(isodow from a.data)
            and a.data >= h.vigente_desde and (h.vigente_ate is null or a.data <= h.vigente_ate)
            and (f.data_inicio is null or a.data >= f.data_inicio)
            and (f.data_fim is null or a.data <= f.data_fim)
      );
  get diagnostics removidos = row_count;

  with alvo as (
    select a.id, h.hora_inicio, h.duracao_min, pe.professor_id, pe.origem
      from public.agenda a
      join public.horarios h on h.id = a.horario_id
      cross join lateral public.professor_efetivo(a.horario_id, a.aluno_id, a.data) pe
      where a.status = 'agendado'
        and a.recorrencia_id is null
        and a.data between inicio_input and fim_input
        and (a.data + a.hora) > agora
  )
  update public.agenda a set
    hora = alvo.hora_inicio,
    duracao_min = alvo.duracao_min,
    professor_id = case when a.professor_origem = 'dia' and alvo.origem is distinct from 'dia'
                        then a.professor_id else alvo.professor_id end,
    professor_origem = case when a.professor_origem = 'dia' and alvo.origem is distinct from 'dia'
                            then a.professor_origem else alvo.origem end,
    updated_at = now()
  from alvo
  where a.id = alvo.id
    and (a.hora is distinct from alvo.hora_inicio
      or a.duracao_min is distinct from alvo.duracao_min
      or (a.professor_origem is distinct from 'dia' and a.professor_id is distinct from alvo.professor_id)
      or (alvo.origem = 'dia' and a.professor_id is distinct from alvo.professor_id));
  get diagnostics atualizados = row_count;

  insert into public.agenda (
    aluno_id, horario_id, data, hora, duracao_min, tipo, status, professor_id, professor_origem
  )
  select distinct on (f.aluno_id::uuid, h.id, d.dia)
    f.aluno_id::uuid, h.id, d.dia, h.hora_inicio, h.duracao_min, 'fixo', 'agendado', pe.professor_id, pe.origem
  from (select g::date as dia from generate_series(inicio_input, fim_input, interval '1 day') g) d
  join public.horarios h
    on h.ativo
   and h.dia_semana = extract(isodow from d.dia)
   and d.dia >= h.vigente_desde
   and (h.vigente_ate is null or d.dia <= h.vigente_ate)
  join public.horarios_aluno f
    on f.horario_id = h.id
   and (f.data_inicio is null or d.dia >= f.data_inicio)
   and (f.data_fim is null or d.dia <= f.data_fim)
  join public.alunos al on al.id = f.aluno_id::uuid and al.ativo
  cross join lateral public.professor_efetivo(h.id, f.aluno_id::uuid, d.dia) pe
  where public.horario_bloqueado(h.id, d.dia) is null
  on conflict (aluno_id, horario_id, data) where aluno_id is not null and horario_id is not null
  do nothing;
  get diagnostics criados = row_count;

  rec := public.sincronizar_recorrencias(inicio_input, fim_input);

  return jsonb_build_object(
    'criados', criados + (rec ->> 'criados')::integer,
    'removidos', removidos + (rec ->> 'removidos')::integer,
    'atualizados', atualizados + (rec ->> 'atualizados')::integer);
end;
$$;

-- Conflito: o cliente ja tem aula sobreposta? Devolve as datas/horas conflitantes.
create or replace function public.conflitos_cliente(
  aluno_id_input uuid,
  data_input date,
  hora_inicio_input time,
  hora_fim_input time,
  dias_input smallint[] default null,
  ignorar_agenda_id_input bigint default null,
  ignorar_recorrencia_id_input uuid default null
)
returns text[]
language sql
stable
as $$
  select coalesce(array_agg(distinct x order by x), '{}') from (
    -- aulas ja marcadas no dia (ou, se recorrente, nas proximas 8 semanas)
    select to_char(a.data, 'DD/MM') || ' ' || to_char(a.hora, 'HH24:MI') as x
      from public.agenda a
      where aluno_id_input is not null
        and a.aluno_id = aluno_id_input
        and not a.excluida
        and public.agenda_status_ocupa(a.status)
        and a.id is distinct from ignorar_agenda_id_input
        and (ignorar_recorrencia_id_input is null or a.recorrencia_id is distinct from ignorar_recorrencia_id_input)
        and (
          (coalesce(cardinality(dias_input), 0) = 0 and a.data = data_input)
          or (cardinality(dias_input) > 0 and a.data between data_input and data_input + 56
              and extract(isodow from a.data)::smallint = any (dias_input))
        )
        and (a.hora, a.hora + make_interval(mins => a.duracao_min)) overlaps (hora_inicio_input, hora_fim_input)
    union
    -- outras regras de recorrencia ativas do mesmo cliente
    select 'toda ' || (array['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'])[d] || ' ' || to_char(r.hora_inicio, 'HH24:MI')
      from public.recorrencias r
      cross join unnest(r.dias_semana) d
      where aluno_id_input is not null
        and cardinality(dias_input) > 0
        and r.aluno_id = aluno_id_input and r.ativo
        and r.id is distinct from ignorar_recorrencia_id_input
        and (r.data_fim is null or r.data_fim >= data_input)
        and d = any (dias_input)
        and (r.hora_inicio, r.hora_fim) overlaps (hora_inicio_input, hora_fim_input)
  ) c
$$;

-- ---------------------------------------------------------------------
-- Nova aula (unica ou recorrente)
-- ---------------------------------------------------------------------
create or replace function public.criar_aula_cliente(
  aluno_id_input uuid,
  nome_livre_input text,
  telefone_livre_input text,
  data_input date,
  hora_inicio_input time,
  hora_fim_input time,
  dias_input smallint[] default null,
  profissional_id_input uuid default null,
  servico_id_input uuid default null,
  cor_input text default null,
  observacao_input text default null,
  forcar_input boolean default false
)
returns jsonb
language plpgsql
as $$
declare
  conflitos text[];
  nova_rec uuid;
  nova_aula public.agenda%rowtype;
  motivo text;
  livre text := nullif(trim(nome_livre_input), '');
begin
  if aluno_id_input is null and livre is null then
    raise exception 'Escolha um cliente ou informe o nome' using errcode = 'LK010';
  end if;
  if hora_fim_input <= hora_inicio_input then
    raise exception 'O horario final deve ser depois do inicial' using errcode = 'LK010';
  end if;

  conflitos := public.conflitos_cliente(aluno_id_input, data_input, hora_inicio_input, hora_fim_input, dias_input);
  if cardinality(conflitos) > 0 and not forcar_input then
    raise exception 'Conflito de horario do cliente: %', array_to_string(conflitos, ', ') using errcode = 'LK002';
  end if;

  if coalesce(cardinality(dias_input), 0) > 0 then
    insert into public.recorrencias (
      aluno_id, nome_livre, telefone_livre, dias_semana, hora_inicio, hora_fim,
      profissional_id, servico_id, cor, observacao, data_inicio
    ) values (
      aluno_id_input, case when aluno_id_input is null then livre end,
      case when aluno_id_input is null then nullif(trim(telefone_livre_input), '') end,
      dias_input, hora_inicio_input, hora_fim_input,
      profissional_id_input, servico_id_input, nullif(cor_input, ''), nullif(trim(observacao_input), ''), data_input
    )
    returning id into nova_rec;
    perform public.sincronizar_recorrencias(data_input, data_input + 56);
    return jsonb_build_object('recorrencia_id', nova_rec, 'conflitos', to_jsonb(conflitos));
  end if;

  select b.motivo into motivo from public.bloqueios b
    where b.horario_id is null and data_input between b.data and coalesce(b.data_fim, b.data) limit 1;
  if motivo is not null then
    raise exception 'Dia bloqueado: %', motivo using errcode = 'LK003';
  end if;

  insert into public.agenda (
    aluno_id, experimental_nome, experimental_telefone, data, hora, duracao_min, tipo, status,
    professor_id, professor_origem, servico_id, cor, observacao, status_alterado_em, alterado_por
  ) values (
    aluno_id_input, case when aluno_id_input is null then livre end,
    case when aluno_id_input is null then nullif(trim(telefone_livre_input), '') end,
    data_input, hora_inicio_input, (extract(epoch from (hora_fim_input - hora_inicio_input)) / 60)::integer,
    case when aluno_id_input is null then 'experimental' else 'aula' end, 'agendado',
    profissional_id_input, case when profissional_id_input is null then null else 'dia' end,
    servico_id_input, nullif(cor_input, ''), nullif(trim(observacao_input), ''), now(), auth.uid()
  )
  returning * into nova_aula;

  return jsonb_build_object('agenda_id', nova_aula.id, 'conflitos', to_jsonb(conflitos));
end;
$$;

-- ---------------------------------------------------------------------
-- Editar aula: 'esta' (so esta ocorrencia) ou 'proximas' (esta e as proximas)
-- ---------------------------------------------------------------------
create or replace function public.editar_aula_cliente(
  agenda_id_input bigint,
  escopo_input text,
  data_input date,
  hora_inicio_input time,
  hora_fim_input time,
  dias_input smallint[] default null,
  profissional_id_input uuid default null,
  servico_id_input uuid default null,
  cor_input text default null,
  observacao_input text default null,
  forcar_input boolean default false
)
returns jsonb
language plpgsql
as $$
declare
  a public.agenda%rowtype;
  r public.recorrencias%rowtype;
  conflitos text[];
  nova_rec uuid;
  dias smallint[];
begin
  select * into a from public.agenda where id = agenda_id_input for update;
  if not found then
    raise exception 'Aula nao encontrada' using errcode = 'P0002';
  end if;
  if hora_fim_input <= hora_inicio_input then
    raise exception 'O horario final deve ser depois do inicial' using errcode = 'LK010';
  end if;
  if a.recorrencia_id is not null then
    select * into r from public.recorrencias where id = a.recorrencia_id for update;
  end if;

  -- ---------- somente esta ----------
  if escopo_input = 'esta' or r.id is null then
    if a.status not in ('agendado') and (a.data <> data_input or a.hora <> hora_inicio_input) then
      raise exception 'Esta aula ja foi marcada; desfaca a marcacao para mudar data ou horario' using errcode = 'LK006';
    end if;
    conflitos := public.conflitos_cliente(a.aluno_id, data_input, hora_inicio_input, hora_fim_input, null, a.id);
    if cardinality(conflitos) > 0 and not forcar_input then
      raise exception 'Conflito de horario do cliente: %', array_to_string(conflitos, ', ') using errcode = 'LK002';
    end if;
    if exists (select 1 from public.agenda x where x.recorrencia_id = a.recorrencia_id and x.data = data_input and x.id <> a.id) then
      raise exception 'Ja existe uma aula desta serie nesta data' using errcode = 'LK005';
    end if;

    update public.agenda set
      data = data_input, hora = hora_inicio_input,
      duracao_min = (extract(epoch from (hora_fim_input - hora_inicio_input)) / 60)::integer,
      professor_id = profissional_id_input,
      professor_origem = case when profissional_id_input is null then null else 'dia' end,
      servico_id = servico_id_input, cor = nullif(cor_input, ''),
      observacao = nullif(trim(observacao_input), ''),
      excecao = recorrencia_id is not null,
      updated_at = now(), alterado_por = auth.uid()
    where id = a.id;
    return jsonb_build_object('escopo', 'esta', 'conflitos', to_jsonb(conflitos));
  end if;

  -- ---------- esta e as proximas ----------
  dias := coalesce(nullif(dias_input, '{}'), r.dias_semana);
  conflitos := public.conflitos_cliente(r.aluno_id, data_input, hora_inicio_input, hora_fim_input, dias, null, r.id);
  if cardinality(conflitos) > 0 and not forcar_input then
    raise exception 'Conflito de horario do cliente: %', array_to_string(conflitos, ', ') using errcode = 'LK002';
  end if;

  if a.data <= r.data_inicio then
    update public.recorrencias set
      dias_semana = dias, hora_inicio = hora_inicio_input, hora_fim = hora_fim_input,
      profissional_id = profissional_id_input, servico_id = servico_id_input, cor = nullif(cor_input, ''),
      observacao = nullif(trim(observacao_input), ''), data_inicio = least(r.data_inicio, data_input), updated_at = now()
    where id = r.id;
    nova_rec := r.id;
  else
    update public.recorrencias set data_fim = a.data - 1, updated_at = now() where id = r.id;
    insert into public.recorrencias (
      aluno_id, nome_livre, telefone_livre, dias_semana, hora_inicio, hora_fim,
      profissional_id, servico_id, cor, observacao, data_inicio, data_fim
    ) values (
      r.aluno_id, r.nome_livre, r.telefone_livre, dias, hora_inicio_input, hora_fim_input,
      profissional_id_input, servico_id_input, nullif(cor_input, ''), nullif(trim(observacao_input), ''),
      least(a.data, data_input), r.data_fim
    )
    returning id into nova_rec;
  end if;

  -- As proximas ainda nao marcadas sao refeitas pela regra nova; as ja marcadas/desmarcadas
  -- passam para a regra nova (assim nao sao recriadas)
  delete from public.agenda x
    where x.recorrencia_id = r.id and x.data >= a.data
      and x.status = 'agendado' and x.aula_id is null;
  if nova_rec <> r.id then
    update public.agenda x set recorrencia_id = nova_rec
      where x.recorrencia_id = r.id and x.data >= a.data;
  end if;

  perform public.sincronizar_recorrencias(least(a.data, data_input), least(a.data, data_input) + 56);
  return jsonb_build_object('escopo', 'proximas', 'recorrencia_id', nova_rec, 'conflitos', to_jsonb(conflitos));
end;
$$;

-- ---------------------------------------------------------------------
-- Excluir aula: 'esta' ou 'proximas'
-- ---------------------------------------------------------------------
create or replace function public.excluir_aula_cliente(agenda_id_input bigint, escopo_input text default 'esta')
returns jsonb
language plpgsql
as $$
declare
  a public.agenda%rowtype;
  r public.recorrencias%rowtype;
  n integer := 0;
begin
  select * into a from public.agenda where id = agenda_id_input for update;
  if not found then
    raise exception 'Aula nao encontrada' using errcode = 'P0002';
  end if;
  if a.status in ('presente', 'falta', 'falta_justificada') then
    raise exception 'Esta aula ja foi marcada; desfaca a marcacao antes de excluir' using errcode = 'LK006';
  end if;

  if escopo_input = 'proximas' and a.recorrencia_id is not null then
    select * into r from public.recorrencias where id = a.recorrencia_id for update;
    if a.data <= r.data_inicio then
      update public.recorrencias set ativo = false, updated_at = now() where id = r.id;
    else
      update public.recorrencias set data_fim = a.data - 1, updated_at = now() where id = r.id;
    end if;
    delete from public.agenda x
      where x.recorrencia_id = r.id and x.data >= a.data and x.status in ('agendado', 'desmarcado') and x.aula_id is null;
    get diagnostics n = row_count;
    return jsonb_build_object('excluidas', n);
  end if;

  if a.recorrencia_id is null then
    delete from public.agenda where id = a.id;
  else
    -- mantem a linha (para a regra nao recriar) mas some da agenda
    update public.agenda set excluida = true, excecao = true, status = 'desmarcado',
      cancelamento_motivo = 'Aula excluída', updated_at = now()
    where id = a.id;
  end if;
  return jsonb_build_object('excluidas', 1);
end;
$$;

-- ---------------------------------------------------------------------
-- Pagamentos: registrar avanca o vencimento; excluir devolve
-- ---------------------------------------------------------------------
create or replace function public.registrar_pagamento(
  data_input date,
  valor_input numeric,
  forma_input text,
  aluno_id_input uuid default null,
  profissional_id_input uuid default null,
  servico_id_input uuid default null,
  descricao_input text default null,
  avancar_meses_input integer default 0
)
returns public.pagamentos
language plpgsql
as $$
declare
  al public.alunos%rowtype;
  anterior date;
  novo date;
  p public.pagamentos%rowtype;
begin
  if aluno_id_input is not null and coalesce(avancar_meses_input, 0) > 0 then
    select * into al from public.alunos where id = aluno_id_input for update;
    anterior := al.vencimento;
    novo := (coalesce(al.vencimento, data_input) + make_interval(months => avancar_meses_input))::date;
    update public.alunos set vencimento = novo where id = aluno_id_input;
  end if;

  insert into public.pagamentos (
    data, valor, forma, aluno_id, profissional_id, servico_id, descricao,
    meses_vencimento, vencimento_anterior, vencimento_novo
  ) values (
    data_input, valor_input, forma_input, aluno_id_input, profissional_id_input, servico_id_input,
    nullif(trim(descricao_input), ''), coalesce(avancar_meses_input, 0), anterior, novo
  )
  returning * into p;
  return p;
end;
$$;

create or replace function public.excluir_pagamento(pagamento_id_input uuid)
returns jsonb
language plpgsql
as $$
declare
  p public.pagamentos%rowtype;
  devolveu boolean := false;
begin
  select * into p from public.pagamentos where id = pagamento_id_input for update;
  if not found then
    raise exception 'Pagamento nao encontrado' using errcode = 'P0002';
  end if;
  -- so devolve o vencimento se nada mudou depois deste pagamento
  if p.meses_vencimento > 0 and p.aluno_id is not null then
    update public.alunos set vencimento = p.vencimento_anterior
      where id = p.aluno_id and vencimento is not distinct from p.vencimento_novo;
    devolveu := found;
  end if;
  delete from public.pagamentos where id = p.id;
  return jsonb_build_object('vencimento_devolvido', devolveu);
end;
$$;

-- =====================================================================
-- Conversao: planos a partir do texto livre de alunos.plano
-- (ex.: "semestral 2x" -> plano Semestral 2x/semana). Idempotente.
-- Precos: valor mais comum de valor_plano entre os alunos do plano.
-- =====================================================================
create or replace function public.plano_interpretar(texto text, out periodicidade text, out meses integer, out aulas smallint)
language plpgsql
immutable
as $$
declare
  t text := translate(lower(coalesce(texto, '')), 'áàâãéêíóôõúç', 'aaaaeeiooouc');
begin
  periodicidade := case
    when t ~ 'mensal' then 'mensal'
    when t ~ 'bimestral' then 'bimestral'
    when t ~ 'trimestral' then 'trimestral'
    when t ~ '(quadrimestral|quatro meses)' then 'quadrimestral'
    when t ~ 'semestral' then 'semestral'
    when t ~ 'anual' then 'anual'
    else null end;
  meses := case periodicidade when 'mensal' then 1 when 'bimestral' then 2 when 'trimestral' then 3
    when 'quadrimestral' then 4 when 'semestral' then 6 when 'anual' then 12 end;
  aulas := (regexp_match(t, '(\d)\s*x(?!\d)'))[1]::smallint;
end;
$$;

do $$
declare
  execucao_atual timestamptz := clock_timestamp();
  g record;
  novo_id uuid;
begin
  for g in
    select pi.periodicidade, pi.meses, pi.aulas,
           mode() within group (order by a.valor_plano) filter (where a.valor_plano > 0) as preco,
           count(*) as qtd
      from public.alunos a
      cross join lateral public.plano_interpretar(a.plano) pi
      where pi.periodicidade is not null
      group by 1, 2, 3
  loop
    select id into novo_id from public.planos
      where origem = 'conversao' and periodicidade = g.periodicidade and aulas_semana is not distinct from g.aulas;
    if novo_id is null then
      insert into public.planos (nome, periodicidade, meses, aulas_semana, preco_mensal, origem)
        values (initcap(g.periodicidade) || coalesce(' ' || g.aulas || 'x/semana', ''), g.periodicidade, g.meses, g.aulas,
                coalesce(g.preco, 0), 'conversao')
        returning id into novo_id;
      insert into public.conversao_agenda_log (execucao, origem, origem_id, situacao, detalhe)
        values (execucao_atual, 'planos', novo_id::text, 'convertido',
                format('Plano criado: %s %s (%s alunos)', g.periodicidade, coalesce(g.aulas || 'x', ''), g.qtd));
    end if;

    update public.alunos a set plano_id = novo_id
      where a.plano_id is null
        and (public.plano_interpretar(a.plano)).periodicidade = g.periodicidade
        and (public.plano_interpretar(a.plano)).aulas is not distinct from g.aulas;
    novo_id := null;
  end loop;

  insert into public.conversao_agenda_log (execucao, origem, origem_id, aluno_id, situacao, detalhe)
    select execucao_atual, 'alunos.plano', a.id::text, a.id, 'nao_convertido',
           format('Plano "%s" nao reconhecido; escolha o plano no cadastro do cliente', coalesce(a.plano, ''))
      from public.alunos a
      where a.ativo and a.plano_id is null;
end $$;
