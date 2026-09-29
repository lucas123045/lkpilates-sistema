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

-- =====================================================================
-- Correcao: no banco de producao agenda.id e UUID (as versoes anteriores
-- destas funcoes recebiam bigint e falhavam). Remove as versoes antigas e
-- recria com uuid. Seguro rodar de novo.
-- =====================================================================
drop function if exists public.agenda_validar_vaga(uuid, date, uuid, bigint, boolean);
drop function if exists public.agenda_gravar(public.horarios, uuid, date, text, uuid, text, text, text, bigint);
drop function if exists public.agenda_aplicar_status(bigint, text, boolean);
drop function if exists public.marcar_status(bigint, text, text);
drop function if exists public.desmarcar(bigint, boolean, text);
drop function if exists public.remarcar(bigint, uuid, date, boolean);
drop function if exists public.trocar_professor(uuid, text, bigint, uuid, date);
drop function if exists public.conflitos_cliente(uuid, date, time, time, smallint[], bigint, uuid);
drop function if exists public.editar_aula_cliente(bigint, text, date, time, time, smallint[], uuid, uuid, text, text, boolean);
drop function if exists public.excluir_aula_cliente(bigint, text);

create or replace function public.agenda_validar_vaga(
  horario_id_input uuid,
  data_input date,
  aluno_id_input uuid,
  ignorar_agenda_id_input uuid default null,
  forcar_encaixe_input boolean default false
)
returns public.horarios
language plpgsql
as $$
declare
  turma public.horarios%rowtype;
  motivo text;
  ocupados integer;
begin
  select * into turma from public.horarios where id = horario_id_input;
  if not found or not turma.ativo then
    raise exception 'Horario nao encontrado ou inativo' using errcode = 'LK010';
  end if;

  if extract(isodow from data_input) <> turma.dia_semana then
    raise exception 'A data % nao cai no dia da semana deste horario', to_char(data_input, 'DD/MM/YYYY')
      using errcode = 'LK010';
  end if;

  if data_input < turma.vigente_desde or (turma.vigente_ate is not null and data_input > turma.vigente_ate) then
    raise exception 'Horario fora da vigencia em %', to_char(data_input, 'DD/MM/YYYY') using errcode = 'LK010';
  end if;

  motivo := public.horario_bloqueado(horario_id_input, data_input);
  if motivo is not null then
    raise exception 'Horario bloqueado: %', motivo using errcode = 'LK003';
  end if;

  if aluno_id_input is not null then
    if exists (
      select 1 from public.agenda a
      where a.aluno_id = aluno_id_input
        and a.horario_id = horario_id_input
        and a.data = data_input
        and public.agenda_status_ocupa(a.status)
        and a.id::text is distinct from ignorar_agenda_id_input::text
    ) then
      raise exception 'Aluno ja esta agendado neste horario' using errcode = 'LK005';
    end if;

    if exists (
      select 1 from public.agenda a
      where a.aluno_id = aluno_id_input
        and a.data = data_input
        and public.agenda_status_ocupa(a.status)
        and a.id::text is distinct from ignorar_agenda_id_input::text
        and (a.hora, a.hora + make_interval(mins => a.duracao_min))
            overlaps (turma.hora_inicio, turma.hora_inicio + make_interval(mins => turma.duracao_min))
    ) then
      raise exception 'Aluno ja tem aula em horario sobreposto nesse dia' using errcode = 'LK002';
    end if;
  end if;

  ocupados := public.agenda_ocupados(horario_id_input, data_input);
  if ocupados >= turma.capacidade and not coalesce(forcar_encaixe_input, false) then
    raise exception 'Horario lotado (%/%)', ocupados, turma.capacidade using errcode = 'LK001';
  end if;

  return turma;
end;
$$;

create or replace function public.agenda_gravar(
  turma public.horarios,
  aluno_id_input uuid,
  data_input date,
  tipo_input text,
  credito_id_input uuid,
  experimental_nome_input text,
  experimental_telefone_input text,
  observacao_input text,
  remarcado_de_id_input uuid
)
returns public.agenda
language plpgsql
as $$
declare
  resultado public.agenda%rowtype;
  prof record;
  lotado boolean;
begin
  prof := public.professor_efetivo(turma.id, aluno_id_input, data_input);
  lotado := public.agenda_ocupados(turma.id, data_input) >= turma.capacidade;

  if aluno_id_input is not null then
    update public.agenda a set
      tipo = tipo_input,
      status = 'agendado',
      hora = turma.hora_inicio,
      duracao_min = turma.duracao_min,
      professor_id = prof.professor_id,
      professor_origem = prof.origem,
      credito_usado_id = credito_id_input,
      observacao = coalesce(observacao_input, a.observacao),
      encaixe = lotado,
      aula_id = null,
      cancelamento_motivo = null,
      remarcado_de_id = coalesce(remarcado_de_id_input, a.remarcado_de_id),
      status_alterado_em = now(),
      alterado_por = auth.uid(),
      updated_at = now()
    where a.aluno_id = aluno_id_input and a.horario_id = turma.id and a.data = data_input
    returning a.* into resultado;
  end if;

  if resultado.id is null then
    insert into public.agenda (
      aluno_id, horario_id, data, hora, duracao_min, tipo, status,
      professor_id, professor_origem, credito_usado_id,
      experimental_nome, experimental_telefone, observacao, encaixe,
      remarcado_de_id, status_alterado_em, alterado_por
    ) values (
      aluno_id_input, turma.id, data_input, turma.hora_inicio, turma.duracao_min, tipo_input, 'agendado',
      prof.professor_id, prof.origem, credito_id_input,
      experimental_nome_input, experimental_telefone_input, observacao_input, lotado,
      remarcado_de_id_input, now(), auth.uid()
    )
    returning * into resultado;
  end if;

  if credito_id_input is not null then
    update public.creditos_reposicao
      set usado_em = now(), agendamento_destino_id = resultado.id
      where id = credito_id_input;
  end if;

  if aluno_id_input is not null then
    update public.lista_espera
      set atendido_em = now()
      where aluno_id = aluno_id_input
        and horario_id = turma.id
        and data = data_input
        and atendido_em is null and cancelado_em is null;
  end if;

  return resultado;
end;
$$;

create or replace function public.marcar_status(
  agenda_id_input uuid,
  status_input text,
  observacao_input text default null
)
returns public.agenda
language plpgsql
as $$
declare
  resultado public.agenda%rowtype;
begin
  if status_input not in ('agendado', 'presente', 'falta', 'falta_justificada') then
    raise exception 'Status invalido: %', status_input using errcode = 'LK010';
  end if;

  if exists (select 1 from public.agenda where id = agenda_id_input and status in ('desmarcado', 'cancelado_estudio'))
     and status_input <> 'agendado' then
    raise exception 'Agendamento desmarcado/cancelado. Reative antes de marcar presenca.' using errcode = 'LK006';
  end if;

  resultado := public.agenda_aplicar_status(agenda_id_input, status_input, true);

  if observacao_input is not null then
    update public.agenda set observacao = nullif(trim(observacao_input), ''), updated_at = now()
      where id = agenda_id_input
      returning * into resultado;
  end if;

  return resultado;
end;
$$;

create or replace function public.desmarcar(
  agenda_id_input uuid,
  gerar_credito_input boolean default null,
  motivo_input text default null
)
returns jsonb
language plpgsql
as $$
declare
  a public.agenda%rowtype;
  cfg public.configuracoes_estudio%rowtype := public.agenda_configuracao();
  horas numeric;
  dentro_prazo boolean;
  novo_status text;
  gera boolean;
  credito_id uuid;
  espera integer;
begin
  select * into a from public.agenda where id = agenda_id_input for update;
  if not found then
    raise exception 'Agendamento nao encontrado' using errcode = 'P0002';
  end if;
  if a.status <> 'agendado' then
    raise exception 'So e possivel desmarcar agendamentos com status agendado' using errcode = 'LK006';
  end if;

  horas := round((extract(epoch from ((a.data + a.hora) - public.agenda_agora())) / 3600)::numeric, 2);
  dentro_prazo := horas >= cfg.antecedencia_desmarcacao_horas;

  if a.tipo in ('experimental', 'avulsa') then
    novo_status := 'desmarcado';
    gera := false;
  else
    gera := coalesce(gerar_credito_input, dentro_prazo);
    novo_status := case when gera then 'falta_justificada' else 'falta' end;
  end if;

  if novo_status = 'desmarcado' then
    update public.agenda set status = 'desmarcado', status_alterado_em = now(), alterado_por = auth.uid(), updated_at = now()
      where id = a.id;
  else
    perform public.agenda_aplicar_status(a.id, novo_status, gera);
  end if;

  update public.agenda set cancelamento_motivo = nullif(trim(motivo_input), '') where id = a.id;

  select c.id into credito_id from public.creditos_reposicao c
    where c.cancelado_em is null and c.usado_em is null
      and (c.agendamento_origem_id = a.id or c.id = a.credito_usado_id)
    order by c.criado_em desc limit 1;

  select count(*) into espera from public.lista_espera e
    where e.horario_id = a.horario_id and (e.data is null or e.data = a.data)
      and e.atendido_em is null and e.cancelado_em is null;

  return jsonb_build_object(
    'status', novo_status,
    'dentro_prazo', dentro_prazo,
    'horas_antecedencia', horas,
    'credito_id', case when gera then credito_id end,
    'lista_espera', espera
  );
end;
$$;

create or replace function public.remarcar(
  agenda_id_input uuid,
  horario_id_input uuid,
  data_input date,
  forcar_encaixe_input boolean default false
)
returns public.agenda
language plpgsql
as $$
declare
  origem public.agenda%rowtype;
  turma public.horarios%rowtype;
  novo public.agenda%rowtype;
begin
  select * into origem from public.agenda where id = agenda_id_input for update;
  if not found then
    raise exception 'Agendamento nao encontrado' using errcode = 'P0002';
  end if;
  if origem.status <> 'agendado' then
    raise exception 'So e possivel remarcar agendamentos com status agendado' using errcode = 'LK006';
  end if;
  if origem.horario_id = horario_id_input and origem.data = data_input then
    raise exception 'Escolha outro horario ou data' using errcode = 'LK010';
  end if;

  perform 1 from public.horarios where id = horario_id_input for update;
  turma := public.agenda_validar_vaga(horario_id_input, data_input, origem.aluno_id, origem.id, forcar_encaixe_input);

  update public.agenda set status = 'desmarcado', cancelamento_motivo = 'Remarcado',
    status_alterado_em = now(), alterado_por = auth.uid(), updated_at = now()
    where id = origem.id;

  novo := public.agenda_gravar(
    turma, origem.aluno_id, data_input,
    case when origem.tipo = 'fixo' then 'reposicao' else origem.tipo end,
    null, origem.experimental_nome, origem.experimental_telefone, origem.observacao, origem.id
  );

  if origem.credito_usado_id is not null then
    update public.creditos_reposicao set agendamento_destino_id = novo.id where id = origem.credito_usado_id;
    update public.agenda set credito_usado_id = origem.credito_usado_id where id = novo.id returning * into novo;
    update public.agenda set credito_usado_id = null where id = origem.id;
  end if;

  return novo;
end;
$$;

create or replace function public.trocar_professor(
  professor_id_input uuid,
  escopo_input text,
  agenda_id_input uuid default null,
  horario_id_input uuid default null,
  data_input date default null
)
returns jsonb
language plpgsql
as $$
declare
  a public.agenda%rowtype;
  agora timestamp := public.agenda_agora();
  atualizados integer := 0;
begin
  if escopo_input not in ('dia', 'permanente') then
    raise exception 'Escopo invalido' using errcode = 'LK010';
  end if;

  if agenda_id_input is not null then
    select * into a from public.agenda where id = agenda_id_input for update;
    if not found then
      raise exception 'Agendamento nao encontrado' using errcode = 'P0002';
    end if;

    if escopo_input = 'permanente' and a.aluno_id is not null then
      update public.horarios_aluno f set professor_id = professor_id_input, updated_at = now()
        where f.aluno_id::uuid = a.aluno_id and f.horario_id = a.horario_id
          and (f.data_fim is null or f.data_fim >= public.agenda_hoje());

      if found then
        update public.agenda x set professor_id = professor_id_input, professor_origem = 'aluno', updated_at = now()
          where x.aluno_id = a.aluno_id and x.horario_id = a.horario_id
            and x.status = 'agendado' and (x.data + x.hora) > agora
            and x.professor_origem is distinct from 'dia';
      end if;
    end if;

    update public.agenda set professor_id = professor_id_input,
      professor_origem = case when escopo_input = 'dia' then 'dia'
                              when a.aluno_id is not null then 'aluno' else 'horario' end,
      updated_at = now()
      where id = a.id;
    return jsonb_build_object('atualizados', 1);
  end if;

  if horario_id_input is null then
    raise exception 'Informe o agendamento ou o horario' using errcode = 'LK010';
  end if;

  if escopo_input = 'dia' then
    if data_input is null then
      raise exception 'Informe a data da substituicao' using errcode = 'LK010';
    end if;
    insert into public.substituicoes_professor (horario_id, data, professor_id)
      values (horario_id_input, data_input, professor_id_input)
      on conflict (horario_id, data) do update set professor_id = excluded.professor_id;

    update public.agenda set professor_id = professor_id_input, professor_origem = 'dia', updated_at = now()
      where horario_id = horario_id_input and data = data_input
        and status not in ('desmarcado', 'cancelado_estudio');
    get diagnostics atualizados = row_count;
  else
    update public.horarios set professor_id = professor_id_input, updated_at = now()
      where id = horario_id_input;

    update public.agenda set professor_id = professor_id_input, updated_at = now()
      where horario_id = horario_id_input and status = 'agendado'
        and (data + hora) > agora and professor_origem is not distinct from 'horario';
    get diagnostics atualizados = row_count;

    update public.agenda set professor_id = professor_id_input, professor_origem = 'horario', updated_at = now()
      where horario_id = horario_id_input and status = 'agendado'
        and (data + hora) > agora and professor_origem is null;
  end if;

  return jsonb_build_object('atualizados', atualizados);
end;
$$;

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
  ids uuid[];
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
    join jsonb_array_elements(m.dados -> 'linhas') x on (x ->> 'id')::uuid = a.id
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
    where id = (l ->> 'id')::uuid;
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
  agenda_id_input uuid,
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
  ignorar_agenda_id_input uuid default null,
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
  agenda_id_input uuid,
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
create or replace function public.excluir_aula_cliente(agenda_id_input uuid, escopo_input text default 'esta')
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
