-- =====================================================================
-- Reposicao marcada como reposicao (amarelo), inclusive quando o aluno
-- tem aula na agenda no dia.
--
-- Antes: o botao "Reposicao" do Relatorio de alunos, num dia com aula na
-- agenda, marcava essa aula como presente e gravava "veio" (verde).
--
--  * marcar_reposicao(agenda_id): marca a aula da agenda como presente e o
--    registro em aulas como 'reposicao'. Debita o pacote igual a presenca.
--    Usada pelo novo botao "Reposicao" da agenda.
--  * registrar_presenca_dia: com status 'reposicao' e aula na agenda, usa
--    marcar_reposicao (o resto continua igual).
-- Reexecutavel. Depende de 202609290001.
-- =====================================================================

create or replace function public.marcar_reposicao(agenda_id_input uuid)
returns public.agenda
language plpgsql
as $$
declare
  a public.agenda%rowtype;
begin
  select * into a from public.agenda where id = agenda_id_input;
  if not found then
    raise exception 'Agendamento nao encontrado' using errcode = 'P0002';
  end if;
  if a.aluno_id is null or a.tipo in ('experimental', 'avulsa') then
    raise exception 'Reposicao so vale para aula de aluno cadastrado (nao experimental nem avulsa)' using errcode = 'LK010';
  end if;

  if a.status <> 'presente' then
    a := public.marcar_status(a.id, 'presente');
  end if;

  -- presenca e reposicao debitam igual: so troca como o registro aparece
  update public.aulas
    set status = 'reposicao', tipo = 'reposicao', updated_at = now()
    where id = a.aula_id and deleted_at is null and status in ('veio', 'reposicao');

  return a;
end;
$$;

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
    if a.status <> 'agendado' then
      raise exception 'A aula de % (%) ja esta registrada na agenda como "%". Para corrigir, use a agenda ou desfaca o registro.',
        to_char(data_input, 'DD/MM/YYYY'), to_char(a.hora, 'HH24:MI'),
        case a.status when 'presente' then 'presente' else 'falta' end
        using errcode = '23505';
    end if;
    if status_input = 'reposicao' then
      perform public.marcar_reposicao(a.id);
    else
      perform public.marcar_status(a.id, case status_input when 'faltou' then 'falta' else 'presente' end);
    end if;
    return jsonb_build_object('origem', 'agenda', 'agenda_id', a.id, 'hora', to_char(a.hora, 'HH24:MI'));
  end if;

  aula := public.registrar_aula(
    aluno_id_input, data_input, status_input,
    case when status_input = 'reposicao' then 'reposicao' else 'normal' end, null, null
  );
  return jsonb_build_object('origem', 'registro', 'aula_id', aula.id);
end;
$$;

-- login obrigatorio (202610070002): funcao nova so para usuarios logados
revoke execute on function public.marcar_reposicao(uuid) from public, anon;
grant execute on function public.marcar_reposicao(uuid) to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.marcar_reposicao(uuid) to service_role;
  end if;
end $$;
