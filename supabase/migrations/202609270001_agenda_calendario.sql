-- =====================================================================
-- AGENDA - operacoes do calendario (arrastar, redimensionar, criar, desfazer)
-- Aditiva e reexecutavel. Depende de 202609260001..003.
--
-- Conceitos:
--  * Aula unica: turma com origem = 'aula_unica' e vigencia de um so dia.
--  * Mover "somente esta aula" de uma turma semanal: cria uma aula unica no
--    novo horario, leva os alunos agendados e bloqueia a ocorrencia original.
--  * Mover "esta e as seguintes": divide a turma na data (a antiga termina na
--    vespera, a nova comeca no novo dia/hora) e leva os horarios fixos.
--  * Mover "todas as aulas": altera a turma no lugar (o passado nao muda,
--    porque cada agendamento guarda a propria data/hora).
--  * Toda movimentacao fica em agenda_movimentos e pode ser desfeita.
-- =====================================================================

alter table public.agenda
  add column if not exists bloqueio_id uuid references public.bloqueios(id) on delete set null;

create table if not exists public.agenda_movimentos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  tipo text not null,
  dados jsonb not null,
  desfeito_em timestamptz
);

alter table public.agenda_movimentos enable row level security;
drop policy if exists agenda_movimentos_app_acesso on public.agenda_movimentos;
create policy agenda_movimentos_app_acesso on public.agenda_movimentos
  for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.agenda_movimentos to anon, authenticated;

create or replace function public.horario_eh_unico(h public.horarios)
returns boolean
language sql
immutable
as $$
  select h.origem = 'aula_unica' or (h.vigente_ate is not null and h.vigente_ate = h.vigente_desde)
$$;

-- ---------------------------------------------------------------------
-- sincronizar_agenda: igual a versao anterior, mas nao remove agendamentos
-- que foram movidos para uma aula unica (eles nao tem horario fixo la).
-- ---------------------------------------------------------------------
create or replace function public.sincronizar_agenda(inicio_input date, fim_input date)
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

  delete from public.agenda a
    where a.tipo = 'fixo'
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

  return jsonb_build_object('criados', criados, 'removidos', removidos, 'atualizados', atualizados);
end;
$$;

-- ---------------------------------------------------------------------
-- bloquear: igual a versao anterior, mas guarda qual bloqueio cancelou
-- cada agendamento (para poder desfazer).
-- ---------------------------------------------------------------------
create or replace function public.bloquear(
  data_input date,
  data_fim_input date default null,
  horario_id_input uuid default null,
  motivo_input text default null,
  gerar_credito_input boolean default true
)
returns jsonb
language plpgsql
as $$
declare
  fim date := coalesce(data_fim_input, data_input);
  novo_bloqueio_id uuid;
  r record;
  cancelados integer := 0;
  creditos_antes integer;
  creditos_depois integer;
begin
  if coalesce(trim(motivo_input), '') = '' then
    raise exception 'Informe o motivo' using errcode = 'LK010';
  end if;
  if fim < data_input or fim - data_input > 62 then
    raise exception 'Periodo invalido (maximo 62 dias)' using errcode = 'LK010';
  end if;

  perform public.sincronizar_agenda(data_input, fim);

  insert into public.bloqueios (data, data_fim, horario_id, motivo)
    values (data_input, nullif(fim, data_input), horario_id_input, trim(motivo_input))
    returning id into novo_bloqueio_id;

  select count(*) into creditos_antes from public.creditos_reposicao;

  for r in
    select a.id from public.agenda a
      where a.data between data_input and fim
        and (horario_id_input is null or a.horario_id = horario_id_input)
        and a.status = 'agendado'
  loop
    perform public.agenda_aplicar_status(r.id, 'cancelado_estudio', gerar_credito_input);
    update public.agenda set cancelamento_motivo = trim(motivo_input), bloqueio_id = novo_bloqueio_id where id = r.id;
    cancelados := cancelados + 1;
  end loop;

  select count(*) into creditos_depois from public.creditos_reposicao;

  return jsonb_build_object('bloqueio_id', novo_bloqueio_id, 'cancelados', cancelados,
    'creditos', creditos_depois - creditos_antes);
end;
$$;

-- Desfaz um bloqueio/cancelamento: reativa os agendamentos que ele cancelou
-- (cancelando os creditos ainda nao usados) e remove o bloqueio.
create or replace function public.desfazer_bloqueio(bloqueio_id_input uuid)
returns jsonb
language plpgsql
as $$
declare
  r record;
  restaurados integer := 0;
begin
  if not exists (select 1 from public.bloqueios where id = bloqueio_id_input) then
    raise exception 'Bloqueio nao encontrado' using errcode = 'P0002';
  end if;

  for r in
    select a.id from public.agenda a
      where a.bloqueio_id = bloqueio_id_input and a.status = 'cancelado_estudio'
  loop
    perform public.agenda_aplicar_status(r.id, 'agendado', true);
    update public.agenda set bloqueio_id = null, cancelamento_motivo = null where id = r.id;
    restaurados := restaurados + 1;
  end loop;

  delete from public.bloqueios where id = bloqueio_id_input;
  return jsonb_build_object('restaurados', restaurados);
end;
$$;

-- ---------------------------------------------------------------------
-- Criar aula (unica ou semanal) a partir de um espaco da grade
-- ---------------------------------------------------------------------
create or replace function public.criar_aula(
  data_input date,
  hora_input time,
  duracao_input integer,
  capacidade_input integer,
  modalidade_id_input uuid default null,
  professor_id_input uuid default null,
  repetir_input boolean default false,
  observacao_input text default null
)
returns public.horarios
language plpgsql
as $$
declare
  motivo text;
  nova public.horarios%rowtype;
begin
  if coalesce(duracao_input, 0) <= 0 or coalesce(capacidade_input, 0) <= 0 then
    raise exception 'Duracao e capacidade devem ser maiores que zero' using errcode = 'LK010';
  end if;

  select b.motivo into motivo from public.bloqueios b
    where data_input between b.data and coalesce(b.data_fim, b.data) and b.horario_id is null
    limit 1;
  if motivo is not null and not repetir_input then
    raise exception 'Dia bloqueado: %', motivo using errcode = 'LK003';
  end if;

  insert into public.horarios (
    dia_semana, hora_inicio, duracao_min, professor_id, modalidade_id, capacidade,
    vigente_desde, vigente_ate, origem, observacao
  ) values (
    extract(isodow from data_input), hora_input, duracao_input, professor_id_input, modalidade_id_input, capacidade_input,
    data_input, case when repetir_input then null else data_input end,
    case when repetir_input then 'manual' else 'aula_unica' end,
    nullif(trim(observacao_input), '')
  )
  returning * into nova;

  return nova;
end;
$$;

-- ---------------------------------------------------------------------
-- Mover / redimensionar uma aula
-- escopo: 'esta' | 'seguintes' | 'todas'
-- ---------------------------------------------------------------------
create or replace function public.mover_aula(
  horario_id_input uuid,
  data_input date,
  nova_data_input date,
  nova_hora_input time,
  nova_duracao_input integer,
  escopo_input text default 'esta'
)
returns jsonb
language plpgsql
as $$
declare
  turma public.horarios%rowtype;
  alvo public.horarios%rowtype;
  agora timestamp := public.agenda_agora();
  unica boolean;
  delta integer := nova_data_input - data_input;
  novo_dia smallint := extract(isodow from nova_data_input);
  ids bigint[];
  linhas jsonb;
  conflito text;
  novo_bloqueio uuid;
  fixos_alterados jsonb := '[]'::jsonb;
  fixos_inseridos jsonb := '[]'::jsonb;
  fx record;
  novo_fixo_id text;
  movimento uuid;
  modo text;
begin
  if escopo_input not in ('esta', 'seguintes', 'todas') then
    raise exception 'Escopo invalido' using errcode = 'LK010';
  end if;
  if coalesce(nova_duracao_input, 0) <= 0 then
    raise exception 'Duracao invalida' using errcode = 'LK010';
  end if;

  select * into turma from public.horarios where id = horario_id_input for update;
  if not found then
    raise exception 'Aula nao encontrada' using errcode = 'P0002';
  end if;
  unica := public.horario_eh_unico(turma);

  if (data_input + turma.hora_inicio) < agora then
    raise exception 'Esta aula ja aconteceu e nao pode ser alterada' using errcode = 'LK006';
  end if;
  if (nova_data_input + nova_hora_input) < agora then
    raise exception 'Nao e possivel mover uma aula para o passado' using errcode = 'LK006';
  end if;

  -- ================= Somente esta aula =================
  if escopo_input = 'esta' or unica then
    perform public.sincronizar_agenda(data_input, data_input);

    if exists (
      select 1 from public.agenda a
      where a.horario_id = turma.id and a.data = data_input
        and a.status in ('presente', 'falta', 'falta_justificada')
    ) then
      raise exception 'Esta aula ja tem presenca/falta marcada e nao pode ser movida' using errcode = 'LK006';
    end if;

    if exists (
      select 1 from public.bloqueios b
      where nova_data_input between b.data and coalesce(b.data_fim, b.data) and b.horario_id is null
    ) then
      raise exception 'O dia de destino esta bloqueado' using errcode = 'LK003';
    end if;

    select coalesce(array_agg(a.id), '{}'),
           coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'horario_id', a.horario_id, 'data', a.data,
                                                  'hora', a.hora, 'duracao_min', a.duracao_min)), '[]'::jsonb)
      into ids, linhas
      from public.agenda a
      where a.horario_id = turma.id and a.data = data_input and a.status = 'agendado';

    -- Nenhum aluno pode ficar com duas aulas sobrepostas no destino
    select string_agg(distinct al.nome, ', ') into conflito
      from public.agenda a
      join public.alunos al on al.id = a.aluno_id
      where a.id = any (ids)
        and exists (
          select 1 from public.agenda b
          where b.aluno_id = a.aluno_id and b.data = nova_data_input
            and public.agenda_status_ocupa(b.status) and not (b.id = any (ids))
            and (b.hora, b.hora + make_interval(mins => b.duracao_min))
                overlaps (nova_hora_input, nova_hora_input + make_interval(mins => nova_duracao_input))
        );
    if conflito is not null then
      raise exception 'Conflito de horario no destino: %', conflito using errcode = 'LK002';
    end if;

    if unica then
      update public.horarios set
        dia_semana = novo_dia, hora_inicio = nova_hora_input, duracao_min = nova_duracao_input,
        vigente_desde = nova_data_input, vigente_ate = nova_data_input, updated_at = now()
      where id = turma.id
      returning * into alvo;
      modo := 'unica';
    else
      insert into public.horarios (
        dia_semana, hora_inicio, duracao_min, professor_id, modalidade_id, capacidade,
        vigente_desde, vigente_ate, origem, observacao
      ) values (
        novo_dia, nova_hora_input, nova_duracao_input, turma.professor_id, turma.modalidade_id, turma.capacidade,
        nova_data_input, nova_data_input, 'aula_unica', turma.observacao
      )
      returning * into alvo;

      -- A ocorrencia original fica fechada (e os fixos nao voltam a ser gerados la)
      insert into public.bloqueios (data, horario_id, motivo)
        values (data_input, turma.id,
                format('Aula movida para %s às %s', to_char(nova_data_input, 'DD/MM'), to_char(nova_hora_input, 'HH24:MI')))
        returning id into novo_bloqueio;
      modo := 'esta';
    end if;

    update public.agenda set
      horario_id = alvo.id, data = nova_data_input, hora = nova_hora_input, duracao_min = nova_duracao_input,
      updated_at = now(), alterado_por = auth.uid()
    where id = any (ids);

    insert into public.agenda_movimentos (tipo, dados)
      values (modo, jsonb_build_object(
        'turma_antes', to_jsonb(turma), 'alvo_id', alvo.id, 'bloqueio_id', novo_bloqueio, 'linhas', linhas))
      returning id into movimento;

    return jsonb_build_object('movimento_id', movimento, 'horario_id', alvo.id, 'movidos', coalesce(array_length(ids, 1), 0), 'modo', modo);
  end if;

  -- ================= Esta e as seguintes / Todas =================
  -- Conflito: algum aluno fixo ja tem outra turma fixa sobreposta no novo dia/hora
  select string_agg(distinct al.nome, ', ') into conflito
    from public.horarios_aluno f
    join public.alunos al on al.id = f.aluno_id::uuid and al.ativo
    where f.horario_id = turma.id
      and (f.data_fim is null or f.data_fim >= data_input)
      and exists (
        select 1 from public.horarios_aluno g
        join public.horarios h2 on h2.id = g.horario_id and h2.ativo and h2.id <> turma.id
        where g.aluno_id::uuid = f.aluno_id::uuid
          and (g.data_fim is null or g.data_fim >= nova_data_input)
          and (h2.vigente_ate is null or h2.vigente_ate >= nova_data_input)
          and h2.dia_semana = novo_dia
          and (h2.hora_inicio, h2.hora_inicio + make_interval(mins => h2.duracao_min))
              overlaps (nova_hora_input, nova_hora_input + make_interval(mins => nova_duracao_input))
      );
  if conflito is not null then
    raise exception 'Conflito com outro horario fixo de: %', conflito using errcode = 'LK002';
  end if;

  if escopo_input = 'todas' or turma.vigente_desde >= data_input then
    update public.horarios set
      dia_semana = novo_dia, hora_inicio = nova_hora_input, duracao_min = nova_duracao_input,
      vigente_desde = least(vigente_desde + delta, vigente_desde), updated_at = now()
    where id = turma.id
    returning * into alvo;
    update public.horarios_aluno set dia_semana = alvo.dia_semana::text, horario = to_char(alvo.hora_inicio, 'HH24:MI')
      where horario_id = turma.id;
    modo := 'todas';
  else
    insert into public.horarios (
      dia_semana, hora_inicio, duracao_min, professor_id, modalidade_id, capacidade,
      vigente_desde, vigente_ate, origem, observacao
    ) values (
      novo_dia, nova_hora_input, nova_duracao_input, turma.professor_id, turma.modalidade_id, turma.capacidade,
      nova_data_input, turma.vigente_ate, 'manual', turma.observacao
    )
    returning * into alvo;

    update public.horarios set vigente_ate = data_input - 1, updated_at = now() where id = turma.id;

    for fx in
      select * from public.horarios_aluno
        where horario_id = turma.id and (data_fim is null or data_fim >= data_input)
    loop
      fixos_alterados := fixos_alterados || jsonb_build_object(
        'id', fx.id::text, 'horario_id', fx.horario_id, 'data_inicio', fx.data_inicio, 'data_fim', fx.data_fim);

      if fx.data_inicio is not null and fx.data_inicio >= data_input then
        update public.horarios_aluno set horario_id = alvo.id,
          dia_semana = alvo.dia_semana::text, horario = to_char(alvo.hora_inicio, 'HH24:MI'),
          data_inicio = greatest(fx.data_inicio, nova_data_input), updated_at = now()
        where id = fx.id;
      else
        update public.horarios_aluno set data_fim = data_input - 1, updated_at = now() where id = fx.id;
        insert into public.horarios_aluno (aluno_id, horario_id, dia_semana, horario, data_inicio, data_fim, professor_id)
          values (fx.aluno_id, alvo.id, alvo.dia_semana::text, to_char(alvo.hora_inicio, 'HH24:MI'),
                  nova_data_input, fx.data_fim, fx.professor_id)
          returning id::text into novo_fixo_id;
        fixos_inseridos := fixos_inseridos || to_jsonb(novo_fixo_id);
      end if;
    end loop;
    modo := 'seguintes';
  end if;

  -- Reposicoes/avulsas/experimentais futuras acompanham a turma
  select coalesce(array_agg(a.id), '{}'),
         coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'horario_id', a.horario_id, 'data', a.data,
                                                'hora', a.hora, 'duracao_min', a.duracao_min)), '[]'::jsonb)
    into ids, linhas
    from public.agenda a
    where a.horario_id = turma.id and a.data >= data_input and a.tipo <> 'fixo' and a.status = 'agendado';

  update public.agenda set
    horario_id = alvo.id, data = data + delta, hora = nova_hora_input, duracao_min = nova_duracao_input, updated_at = now()
  where id = any (ids);

  insert into public.agenda_movimentos (tipo, dados)
    values (modo, jsonb_build_object(
      'turma_antes', to_jsonb(turma), 'alvo_id', alvo.id, 'linhas', linhas,
      'fixos_alterados', fixos_alterados, 'fixos_inseridos', fixos_inseridos,
      'inicio', least(data_input, nova_data_input)))
    returning id into movimento;

  -- Regenera as proximas semanas ja no novo horario
  perform public.sincronizar_agenda(least(data_input, nova_data_input), least(data_input, nova_data_input) + 56);

  return jsonb_build_object('movimento_id', movimento, 'horario_id', alvo.id, 'movidos', coalesce(array_length(ids, 1), 0), 'modo', modo);
end;
$$;

-- ---------------------------------------------------------------------
-- Desfazer uma movimentacao (ate 30 minutos depois)
-- ---------------------------------------------------------------------
create or replace function public.desfazer_movimento(movimento_id_input uuid)
returns jsonb
language plpgsql
as $$
declare
  m public.agenda_movimentos%rowtype;
  antes public.horarios;
  alvo_id uuid;
  l jsonb;
  inicio date;
begin
  select * into m from public.agenda_movimentos where id = movimento_id_input for update;
  if not found then
    raise exception 'Movimentacao nao encontrada' using errcode = 'P0002';
  end if;
  if m.desfeito_em is not null then
    raise exception 'Esta movimentacao ja foi desfeita' using errcode = 'LK006';
  end if;
  if m.criado_em < now() - interval '30 minutes' then
    raise exception 'Tempo para desfazer esgotado' using errcode = 'LK006';
  end if;

  antes := jsonb_populate_record(null::public.horarios, m.dados -> 'turma_antes');
  alvo_id := (m.dados ->> 'alvo_id')::uuid;

  -- Nada movido pode ter sido marcado depois
  if exists (
    select 1 from public.agenda a
    join jsonb_array_elements(m.dados -> 'linhas') x on (x ->> 'id')::bigint = a.id
    where a.status <> 'agendado'
  ) then
    raise exception 'Algum aluno desta aula ja foi marcado; desfaca a marcacao antes' using errcode = 'LK006';
  end if;

  if m.tipo = 'seguintes' and exists (
    select 1 from public.agenda a
    where a.horario_id = alvo_id and a.status in ('presente', 'falta', 'falta_justificada')
  ) then
    raise exception 'A nova turma ja tem presencas marcadas' using errcode = 'LK006';
  end if;

  -- Devolve os agendamentos movidos
  for l in select * from jsonb_array_elements(m.dados -> 'linhas') loop
    update public.agenda set
      horario_id = (l ->> 'horario_id')::uuid, data = (l ->> 'data')::date,
      hora = (l ->> 'hora')::time, duracao_min = (l ->> 'duracao_min')::integer, updated_at = now()
    where id = (l ->> 'id')::bigint;
  end loop;

  if m.tipo = 'unica' or m.tipo = 'todas' then
    update public.horarios set
      dia_semana = antes.dia_semana, hora_inicio = antes.hora_inicio, duracao_min = antes.duracao_min,
      vigente_desde = antes.vigente_desde, vigente_ate = antes.vigente_ate, updated_at = now()
    where id = antes.id;
    if m.tipo = 'todas' then
      update public.horarios_aluno set dia_semana = antes.dia_semana::text, horario = to_char(antes.hora_inicio, 'HH24:MI')
        where horario_id = antes.id;
    end if;
  elsif m.tipo = 'esta' then
    delete from public.bloqueios where id = (m.dados ->> 'bloqueio_id')::uuid;
    delete from public.horarios where id = alvo_id
      and not exists (select 1 from public.agenda a where a.horario_id = alvo_id);
    update public.horarios set ativo = false where id = alvo_id;
  elsif m.tipo = 'seguintes' then
    delete from public.agenda a
      where a.horario_id = alvo_id and a.tipo = 'fixo' and a.status = 'agendado' and a.aula_id is null;
    delete from public.horarios_aluno f
      where f.id::text in (select jsonb_array_elements_text(m.dados -> 'fixos_inseridos'));
    for l in select * from jsonb_array_elements(m.dados -> 'fixos_alterados') loop
      update public.horarios_aluno set
        horario_id = (l ->> 'horario_id')::uuid,
        dia_semana = antes.dia_semana::text, horario = to_char(antes.hora_inicio, 'HH24:MI'),
        data_inicio = (l ->> 'data_inicio')::date, data_fim = (l ->> 'data_fim')::date, updated_at = now()
      where id::text = l ->> 'id';
    end loop;
    update public.horarios set vigente_ate = antes.vigente_ate, updated_at = now() where id = antes.id;
    delete from public.horarios where id = alvo_id
      and not exists (select 1 from public.agenda a where a.horario_id = alvo_id);
    update public.horarios set ativo = false where id = alvo_id;
  end if;

  update public.agenda_movimentos set desfeito_em = now() where id = m.id;

  inicio := coalesce((m.dados ->> 'inicio')::date, public.agenda_hoje());
  if m.tipo in ('seguintes', 'todas') then
    perform public.sincronizar_agenda(inicio, inicio + 56);
  end if;

  return jsonb_build_object('desfeito', true);
end;
$$;
