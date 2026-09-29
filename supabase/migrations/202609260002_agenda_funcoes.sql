-- =====================================================================
-- AGENDA - regras de negocio
-- Toda operacao que altera a agenda passa por estas funcoes, para que o
-- site e integracoes futuras (ex.: atendimento via WhatsApp) sigam as
-- mesmas regras. Erros de regra usam codigos proprios:
--   LK001 horario lotado          LK005 aluno ja agendado neste horario
--   LK002 conflito de horario     LK006 agendamento nao pode ser alterado
--   LK003 horario bloqueado       LK007 credito ja utilizado
--   LK004 sem credito valido      LK010 horario/dados invalidos
-- =====================================================================

-- Agora no fuso do estudio. lk.agora permite fixar o relogio em testes.
create or replace function public.agenda_agora()
returns timestamp
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('lk.agora', true), '')::timestamp,
    (now() at time zone 'America/Sao_Paulo')
  )
$$;

create or replace function public.agenda_hoje()
returns date
language sql
stable
as $$
  select public.agenda_agora()::date
$$;

create or replace function public.agenda_status_ocupa(status_input text)
returns boolean
language sql
immutable
as $$
  select status_input in ('agendado', 'presente', 'falta')
$$;

create or replace function public.agenda_configuracao()
returns public.configuracoes_estudio
language sql
stable
as $$
  select * from public.configuracoes_estudio where id = 1
$$;

-- Motivo do bloqueio (ou null se o horario esta livre nessa data).
create or replace function public.horario_bloqueado(horario_id_input uuid, data_input date)
returns text
language sql
stable
as $$
  select b.motivo
    from public.bloqueios b
    where data_input between b.data and coalesce(b.data_fim, b.data)
      and (b.horario_id is null or b.horario_id = horario_id_input)
    order by b.horario_id nulls first
    limit 1
$$;

-- Professor efetivo: dia especifico > aluno > horario.
create or replace function public.professor_efetivo(
  horario_id_input uuid,
  aluno_id_input uuid,
  data_input date,
  out professor_id uuid,
  out origem text
)
language plpgsql
stable
as $$
begin
  select s.professor_id into professor_id
    from public.substituicoes_professor s
    where s.horario_id = horario_id_input and s.data = data_input;
  if found then
    origem := 'dia';
    return;
  end if;

  if aluno_id_input is not null then
    select f.professor_id into professor_id
      from public.horarios_aluno f
      where f.aluno_id::uuid = aluno_id_input
        and f.horario_id = horario_id_input
        and f.professor_id is not null
        and (f.data_inicio is null or f.data_inicio <= data_input)
        and (f.data_fim is null or f.data_fim >= data_input)
      order by f.data_inicio desc nulls last
      limit 1;
    if professor_id is not null then
      origem := 'aluno';
      return;
    end if;

    select a.professor_id into professor_id from public.alunos a where a.id = aluno_id_input;
    if professor_id is not null then
      origem := 'aluno';
      return;
    end if;
  end if;

  select h.professor_id into professor_id from public.horarios h where h.id = horario_id_input;
  origem := case when professor_id is null then null else 'horario' end;
end;
$$;

create or replace function public.agenda_ocupados(horario_id_input uuid, data_input date)
returns integer
language sql
stable
as $$
  select count(*)::integer
    from public.agenda a
    where a.horario_id = horario_id_input
      and a.data = data_input
      and public.agenda_status_ocupa(a.status)
$$;

-- Valida se da para colocar alguem no horario/data. Retorna a turma.
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

-- Insere (ou reativa um registro desmarcado) do agendamento. Uso interno.
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

-- ---------------------------------------------------------------------
-- Geracao/sincronizacao dos fixos (idempotente)
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

  -- 1. Fixos futuros ainda "agendado" que deixaram de valer (horario do aluno mudou,
  --    turma desativada, aluno inativado). Passado e registros marcados nunca mudam.
  delete from public.agenda a
    where a.tipo = 'fixo'
      and a.status = 'agendado'
      and a.aula_id is null
      and a.data between inicio_input and fim_input
      and (a.data + a.hora) > agora
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

  -- 2. Agendamentos futuros acompanham mudancas de hora/duracao/professor da turma.
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

  -- 3. Cria o que falta. A restricao unica garante que nada duplica e que
  --    ocorrencias desmarcadas/canceladas nao "voltam".
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
-- Mudanca de status (integra com aulas/pacote e creditos). Uso interno.
-- ---------------------------------------------------------------------

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

  -- Desfaz efeitos do status anterior
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

    -- Reposicao que tinha devolvido o credito volta a consumi-lo
    if a.credito_usado_id is not null then
      select * into credito from public.creditos_reposicao where id = a.credito_usado_id for update;
      if credito.usado_em is null then
        update public.creditos_reposicao
          set usado_em = now(), agendamento_destino_id = a.id
          where id = credito.id;
      elsif credito.agendamento_destino_id::text is distinct from a.id::text then
        raise exception 'O credito desta reposicao ja foi usado em outra aula' using errcode = 'LK007';
      end if;
    end if;
  end if;

  -- Aplica o novo status
  if a.aluno_id is not null and status_input in ('presente', 'falta') then
    if a.tipo = 'avulsa' then
      -- Aula avulsa e paga a parte: registra no historico sem debitar o pacote.
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
     and a.tipo in ('fixo', 'reposicao')
     and gerar_credito_input then
    credito := null;
    if a.credito_usado_id is not null then
      select * into credito from public.creditos_reposicao
        where id = a.credito_usado_id and cancelado_em is null and expira_em >= public.agenda_hoje()
        for update;
    end if;

    if credito.id is not null then
      -- Reposicao desmarcada: devolve o mesmo credito (mantem a validade original)
      update public.creditos_reposicao
        set usado_em = null, agendamento_destino_id = null
        where id = credito.id;
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
-- Operacoes publicas
-- ---------------------------------------------------------------------

create or replace function public.agendar(
  aluno_id_input uuid,
  horario_id_input uuid,
  data_input date,
  tipo_input text,
  credito_id_input uuid default null,
  experimental_nome_input text default null,
  experimental_telefone_input text default null,
  observacao_input text default null,
  forcar_encaixe_input boolean default false
)
returns public.agenda
language plpgsql
as $$
declare
  turma public.horarios%rowtype;
  credito_id uuid;
begin
  if tipo_input not in ('fixo', 'reposicao', 'experimental', 'avulsa') then
    raise exception 'Tipo de agendamento invalido: %', tipo_input using errcode = 'LK010';
  end if;

  if tipo_input = 'experimental' then
    if coalesce(trim(experimental_nome_input), '') = '' then
      raise exception 'Informe o nome da pessoa da aula experimental' using errcode = 'LK010';
    end if;
    aluno_id_input := null;
  elsif aluno_id_input is null or not exists (select 1 from public.alunos where id = aluno_id_input) then
    raise exception 'Aluno nao encontrado' using errcode = 'LK010';
  end if;

  -- Trava a turma para que dois agendamentos simultaneos nao estourem a capacidade.
  perform 1 from public.horarios where id = horario_id_input for update;
  turma := public.agenda_validar_vaga(horario_id_input, data_input, aluno_id_input, null, forcar_encaixe_input);

  if tipo_input = 'reposicao' then
    select c.id into credito_id
      from public.creditos_reposicao c
      where c.aluno_id = aluno_id_input
        and (credito_id_input is null or c.id = credito_id_input)
        and c.usado_em is null and c.cancelado_em is null
        and c.expira_em >= data_input
      order by c.expira_em
      limit 1
      for update;
    if credito_id is null then
      raise exception 'Aluno nao tem credito de reposicao valido para %', to_char(data_input, 'DD/MM/YYYY')
        using errcode = 'LK004';
    end if;
  end if;

  return public.agenda_gravar(
    turma, aluno_id_input, data_input, tipo_input, credito_id,
    nullif(trim(experimental_nome_input), ''), nullif(trim(experimental_telefone_input), ''),
    nullif(trim(observacao_input), ''), null
  );
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

create or replace function public.marcar_todos_presentes(horario_id_input uuid, data_input date)
returns jsonb
language plpgsql
as $$
declare
  r record;
  marcados integer := 0;
  erros jsonb := '[]'::jsonb;
begin
  for r in
    select a.id, coalesce(al.nome, a.experimental_nome) as nome
      from public.agenda a
      left join public.alunos al on al.id = a.aluno_id
      where a.horario_id = horario_id_input and a.data = data_input and a.status = 'agendado'
  loop
    begin
      perform public.agenda_aplicar_status(r.id, 'presente', true);
      marcados := marcados + 1;
    exception when others then
      erros := erros || jsonb_build_object('agenda_id', r.id, 'nome', r.nome, 'erro', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('marcados', marcados, 'erros', erros);
end;
$$;

-- Desmarca calculando a antecedencia. Dentro do prazo: falta justificada + credito.
-- Fora do prazo: falta (debita o pacote). gerar_credito_input sobrepoe a regra.
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

-- Bloqueio (feriado, recesso, aula cancelada pelo estudio). Cancela os
-- agendamentos do periodo e gera credito para alunos de fixo/reposicao.
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
  bloqueio_id uuid;
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

  -- Materializa os fixos antes, para que tambem sejam cancelados (e gerem credito).
  perform public.sincronizar_agenda(data_input, fim);

  insert into public.bloqueios (data, data_fim, horario_id, motivo)
    values (data_input, nullif(fim, data_input), horario_id_input, trim(motivo_input))
    returning id into bloqueio_id;

  select count(*) into creditos_antes from public.creditos_reposicao;

  for r in
    select a.id from public.agenda a
      where a.data between data_input and fim
        and (horario_id_input is null or a.horario_id = horario_id_input)
        and a.status = 'agendado'
  loop
    perform public.agenda_aplicar_status(r.id, 'cancelado_estudio', gerar_credito_input);
    update public.agenda set cancelamento_motivo = trim(motivo_input) where id = r.id;
    cancelados := cancelados + 1;
  end loop;

  select count(*) into creditos_depois from public.creditos_reposicao;

  return jsonb_build_object('bloqueio_id', bloqueio_id, 'cancelados', cancelados,
    'creditos', creditos_depois - creditos_antes);
end;
$$;

-- Troca de professor. escopo 'dia' = so na data; 'permanente' = na recorrencia.
-- Informe agenda_id (um aluno) ou horario_id + data (turma inteira).
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

-- Diagnostico antes de agendar: vagas, bloqueio, conflitos e alertas.
-- Nao altera nada; usado pela tela e por integracoes.
create or replace function public.verificar_agendamento(
  aluno_id_input uuid,
  horario_id_input uuid,
  data_input date
)
returns jsonb
language plpgsql
stable
as $$
declare
  turma public.horarios%rowtype;
  al public.alunos%rowtype;
  ocupados integer;
  na_semana integer;
  conflito boolean := false;
  ja_agendado boolean := false;
  creditos jsonb;
  espera integer;
  reposicoes_mes integer;
  cfg public.configuracoes_estudio%rowtype := public.agenda_configuracao();
begin
  select * into turma from public.horarios where id = horario_id_input;
  if not found then
    raise exception 'Horario nao encontrado' using errcode = 'LK010';
  end if;

  ocupados := public.agenda_ocupados(horario_id_input, data_input);

  select count(*) into espera from public.lista_espera e
    where e.horario_id = horario_id_input and (e.data is null or e.data = data_input)
      and e.atendido_em is null and e.cancelado_em is null;

  if aluno_id_input is not null then
    select * into al from public.alunos where id = aluno_id_input;

    select exists (
      select 1 from public.agenda a
      where a.aluno_id = aluno_id_input and a.data = data_input and public.agenda_status_ocupa(a.status)
        and a.horario_id is distinct from horario_id_input
        and (a.hora, a.hora + make_interval(mins => a.duracao_min))
            overlaps (turma.hora_inicio, turma.hora_inicio + make_interval(mins => turma.duracao_min))
    ) into conflito;

    select exists (
      select 1 from public.agenda a
      where a.aluno_id = aluno_id_input and a.horario_id = horario_id_input and a.data = data_input
        and public.agenda_status_ocupa(a.status)
    ) into ja_agendado;

    select count(*) into na_semana from public.agenda a
      where a.aluno_id = aluno_id_input
        and a.data between date_trunc('week', data_input)::date and date_trunc('week', data_input)::date + 6
        and public.agenda_status_ocupa(a.status);

    select count(*) into reposicoes_mes from public.agenda a
      where a.aluno_id = aluno_id_input and a.tipo = 'reposicao'
        and date_trunc('month', a.data) = date_trunc('month', data_input)
        and public.agenda_status_ocupa(a.status);

    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'expira_em', c.expira_em) order by c.expira_em), '[]'::jsonb)
      into creditos
      from public.creditos_reposicao c
      where c.aluno_id = aluno_id_input and c.usado_em is null and c.cancelado_em is null
        and c.expira_em >= public.agenda_hoje();
  end if;

  return jsonb_build_object(
    'capacidade', turma.capacidade,
    'ocupados', ocupados,
    'vagas', greatest(turma.capacidade - ocupados, 0),
    'lotado', ocupados >= turma.capacidade,
    'bloqueio', public.horario_bloqueado(horario_id_input, data_input),
    'dia_invalido', extract(isodow from data_input) <> turma.dia_semana or not turma.ativo,
    'conflito', conflito,
    'ja_agendado', ja_agendado,
    'aluno_inativo', aluno_id_input is not null and not coalesce(al.ativo, false),
    'aulas_na_semana', coalesce(na_semana, 0),
    'frequencia_semanal', al.frequencia_semanal,
    'excede_plano', al.frequencia_semanal is not null
      and coalesce(na_semana, 0) + (case when ja_agendado then 0 else 1 end) > al.frequencia_semanal,
    'aulas_restantes', al.aulas_restantes,
    'reposicoes_no_mes', coalesce(reposicoes_mes, 0),
    'limite_reposicoes_mes', cfg.limite_reposicoes_mes,
    'creditos', coalesce(creditos, '[]'::jsonb),
    'lista_espera', espera
  );
end;
$$;

-- Creditos que expiraram sem uso nao precisam de job: o vencimento e
-- calculado por expira_em < agenda_hoje(). Esta view facilita relatorios.
create or replace view public.creditos_reposicao_situacao
with (security_invoker = true)
as
select
  c.*,
  case
    when c.cancelado_em is not null then 'cancelado'
    when c.usado_em is not null then 'usado'
    when c.expira_em < public.agenda_hoje() then 'vencido'
    else 'ativo'
  end as situacao
from public.creditos_reposicao c;

grant select on public.creditos_reposicao_situacao to anon, authenticated;

-- View pronta para relatorios (frequencia, faltas, ocupacao, professor, experimentais).
create or replace view public.agenda_relatorio
with (security_invoker = true)
as
select
  a.id,
  a.data,
  a.hora,
  extract(isodow from a.data)::smallint as dia_semana,
  a.tipo,
  a.status,
  a.encaixe,
  a.aluno_id,
  coalesce(al.nome, a.experimental_nome) as pessoa_nome,
  a.aluno_convertido_id,
  a.horario_id,
  h.capacidade,
  m.nome as modalidade,
  a.professor_id,
  p.nome as professor_nome,
  a.professor_origem,
  a.aula_id
from public.agenda a
left join public.alunos al on al.id = a.aluno_id
left join public.horarios h on h.id = a.horario_id
left join public.modalidades m on m.id = h.modalidade_id
left join public.professores p on p.id = a.professor_id;

grant select on public.agenda_relatorio to anon, authenticated;
