-- =====================================================================
-- Excluir aula lancada por engano, mesmo com presenca/falta marcada.
-- A marcacao e desfeita antes (a aula volta para o pacote e creditos
-- nao usados sao cancelados). Reexecutavel. Depende de 202609290001.
-- =====================================================================

create or replace function public.excluir_aula_cliente(agenda_id_input uuid, escopo_input text default 'esta')
returns jsonb
language plpgsql
as $$
declare
  a public.agenda%rowtype;
  r public.recorrencias%rowtype;
  n integer := 0;
  desfeita boolean := false;
begin
  select * into a from public.agenda where id = agenda_id_input for update;
  if not found then
    raise exception 'Aula nao encontrada' using errcode = 'P0002';
  end if;

  -- Marcada por engano: desfaz a marcacao (devolve ao pacote, cancela credito nao usado).
  -- Se o credito gerado por esta falta ja foi usado em outra aula, agenda_aplicar_status recusa (LK007).
  if a.status in ('presente', 'falta', 'falta_justificada') then
    perform public.agenda_aplicar_status(a.id, 'agendado', true);
    select * into a from public.agenda where id = agenda_id_input;
    desfeita := true;
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
    return jsonb_build_object('excluidas', n, 'marcacao_desfeita', desfeita);
  end if;

  if a.recorrencia_id is null then
    delete from public.agenda where id = a.id;
  else
    -- mantem a linha (para a regra nao recriar) mas some da agenda
    update public.agenda set excluida = true, excecao = true, status = 'desmarcado',
      cancelamento_motivo = 'Aula excluída', updated_at = now()
    where id = a.id;
  end if;
  return jsonb_build_object('excluidas', 1, 'marcacao_desfeita', desfeita);
end;
$$;
