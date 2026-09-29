-- =====================================================================
-- PRESENCA UNICA: a mesma aula nunca e contada duas vezes.
-- Aditiva e reexecutavel. Depende de 202609280001.
--
--  * registrar_aula recusa um segundo registro do aluno no mesmo dia
--    (so permite dois no dia quando sao aulas com horarios diferentes da agenda).
--  * registrar_presenca_dia (usada pelo Relatorio de alunos e pelo Registro
--    de aulas): se o aluno tem aula na agenda no dia, marca ESSA aula.
--  * Agenda: ao marcar presenca, aproveita o registro ja feito pelo Relatorio
--    (sem debitar de novo); se as duas telas discordarem, bloqueia.
--  * desfazer_aula tambem devolve a aula da agenda para "agendado".
--  * aulas_possiveis_duplicadas: lista para revisar o historico antigo
--    (nada e apagado automaticamente).
-- =====================================================================

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
  existente public.aulas%rowtype;
begin
  if status_input not in ('veio', 'faltou', 'reposicao', 'reinicio') then
    raise exception 'Status de aula invalido: %', status_input using errcode = '22023';
  end if;

  -- trava o aluno: dois cliques/telas ao mesmo tempo ficam em fila
  select * into aluno_atual
    from public.alunos
    where id = aluno_id_input and ativo = true
    for update;

  if not found then
    raise exception 'Aluno ativo nao encontrado' using errcode = 'P0002';
  end if;

  if status_input <> 'reinicio' then
    select * into existente from public.aulas
      where aluno_id = aluno_id_input
        and data = data_input
        and deleted_at is null
        and status <> 'reinicio'
        and (horario_input is null or horario is null or horario = horario_input)
      order by id
      limit 1;
    if found then
      raise exception 'Esta aula ja foi registrada em % como "%". Para corrigir, desfaca o registro anterior.',
        to_char(data_input, 'DD/MM/YYYY'),
        case existente.status when 'veio' then 'presente' when 'faltou' then 'falta' else existente.status end
        using errcode = '23505';
    end if;
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

-- Desfazer um registro tambem devolve a aula ligada na agenda para "agendado"
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

  update public.agenda
    set status = 'agendado', aula_id = null, status_alterado_em = now(), updated_at = now()
    where aula_id = aula_id_input and status in ('presente', 'falta');

  return aula_cancelada;
end;
$$;

-- ---------------------------------------------------------------------
-- Agenda: marca presenca/falta aproveitando o registro ja feito no dia
-- (mesmo corpo da versao anterior + o bloco "aproveita registro")
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
  existente public.aulas%rowtype;
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
    -- trava o aluno antes de procurar registros do dia (evita duplicar em paralelo)
    perform 1 from public.alunos where id = a.aluno_id for update;

    -- Registro ja feito no dia pelo Relatorio de alunos / Registro de aulas (sem horario e sem aula da agenda ligada)
    select * into existente from public.aulas x
      where x.aluno_id = a.aluno_id and x.data = a.data and x.deleted_at is null
        and x.horario is null and x.status in ('veio', 'faltou', 'reposicao')
        and not exists (select 1 from public.agenda y where y.aula_id = x.id)
      order by x.id
      limit 1
      for update;

    if found then
      if (status_input = 'falta') <> (existente.status = 'faltou') then
        raise exception 'Este aluno ja foi registrado como "%" nesta data pelo Relatorio de alunos. Corrija o registro la antes.',
          case existente.status when 'faltou' then 'falta' else 'presente' end
          using errcode = 'LK008';
      end if;
      update public.aulas set horario = a.hora, updated_at = now() where id = existente.id;
      nova_aula_id := existente.id;
    elsif a.tipo = 'avulsa' then
      if exists (
        select 1 from public.aulas x
        where x.aluno_id = a.aluno_id and x.data = a.data and x.deleted_at is null
          and x.status <> 'reinicio' and (x.horario is null or x.horario = a.hora)
      ) then
        raise exception 'Esta aula ja foi registrada nesta data' using errcode = '23505';
      end if;
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
-- Presenca pelo Relatorio de alunos / Registro de aulas.
-- Com aula na agenda no dia: marca ESSA aula. Sem agenda: registro comum.
-- ---------------------------------------------------------------------
create or replace function public.registrar_presenca_dia(
  aluno_id_input uuid,
  data_input date,
  status_input text
)
returns jsonb
language plpgsql
as $$
declare
  a public.agenda%rowtype;
  alvo text;
  aula public.aulas%rowtype;
begin
  if status_input not in ('veio', 'faltou', 'reposicao') then
    raise exception 'Status invalido: %', status_input using errcode = '22023';
  end if;

  perform 1 from public.alunos where id = aluno_id_input for update;

  -- aula da agenda no dia: primeiro as ainda nao marcadas, pela hora
  select * into a from public.agenda x
    where x.aluno_id = aluno_id_input and x.data = data_input and not x.excluida
      and x.status in ('agendado', 'presente', 'falta')
    order by (x.status = 'agendado') desc, x.hora
    limit 1;

  if found then
    alvo := case status_input when 'faltou' then 'falta' else 'presente' end;
    if a.status <> 'agendado' then
      raise exception 'A aula de % (%) ja esta registrada na agenda como "%". Para corrigir, use a agenda ou desfaca o registro.',
        to_char(data_input, 'DD/MM/YYYY'), to_char(a.hora, 'HH24:MI'),
        case a.status when 'presente' then 'presente' else 'falta' end
        using errcode = '23505';
    end if;
    perform public.marcar_status(a.id, alvo);
    return jsonb_build_object('origem', 'agenda', 'agenda_id', a.id, 'hora', to_char(a.hora, 'HH24:MI'));
  end if;

  aula := public.registrar_aula(
    aluno_id_input, data_input, status_input,
    case when status_input = 'reposicao' then 'reposicao' else 'normal' end, null, null
  );
  return jsonb_build_object('origem', 'registro', 'aula_id', aula.id);
end;
$$;

-- ---------------------------------------------------------------------
-- Historico antigo: dias em que o mesmo aluno tem mais de um registro.
-- So para revisao; nada e apagado.
-- ---------------------------------------------------------------------
create or replace view public.aulas_possiveis_duplicadas
with (security_invoker = true)
as
select
  a.aluno_id,
  al.nome as aluno_nome,
  a.data,
  count(*)::integer as registros,
  array_agg(a.status order by a.id) as status,
  array_agg(a.id order by a.id) as ids
from public.aulas a
join public.alunos al on al.id = a.aluno_id
where a.deleted_at is null and a.status <> 'reinicio'
group by a.aluno_id, al.nome, a.data
having count(*) > 1;

grant select on public.aulas_possiveis_duplicadas to anon, authenticated;
