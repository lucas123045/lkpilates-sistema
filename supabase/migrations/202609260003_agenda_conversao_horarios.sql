-- =====================================================================
-- AGENDA - conversao dos horarios existentes
-- Le horarios_aluno (dia_semana, horario) e cria as turmas em "horarios",
-- ligando cada linha a sua turma por horario_id.
--  * Nao apaga nem altera dia_semana/horario originais.
--  * Idempotente: linhas ja ligadas (horario_id preenchido) sao puladas.
--  * Tudo que foi (ou nao) convertido fica em conversao_agenda_log.
-- Tambem preenche alunos.frequencia_semanal a partir do texto do plano ("2x").
-- Ao final, consulte:
--   select * from conversao_agenda_log where execucao = (select max(execucao) from conversao_agenda_log);
-- =====================================================================

create table if not exists public.conversao_agenda_log (
  id bigserial primary key,
  execucao timestamptz not null,
  origem text not null,
  origem_id text,
  aluno_id uuid,
  situacao text not null, -- convertido | ja_convertido | aviso | nao_convertido
  detalhe text
);

alter table public.conversao_agenda_log enable row level security;
drop policy if exists conversao_agenda_log_app_acesso on public.conversao_agenda_log;
create policy conversao_agenda_log_app_acesso on public.conversao_agenda_log
  for select to anon, authenticated using (true);
grant select on public.conversao_agenda_log to anon, authenticated;

-- Interpreta o dia da semana. Aceita numero (0/7 = domingo, 1 = segunda ... 6 = sabado),
-- nome em portugues/ingles, com ou sem acento. Retorna null se nao reconhecer.
create or replace function public.agenda_interpretar_dia(texto text)
returns smallint
language plpgsql
immutable
as $$
declare
  t text := translate(lower(trim(coalesce(texto, ''))), 'áàâãéêíóôõúç', 'aaaaeeiooouc');
begin
  if t ~ '^[0-7]$' then
    return case when t::int = 0 then 7 else t::int end;
  end if;
  t := regexp_replace(t, '[^a-z]', '', 'g');
  return case
    when t like 'seg%' or t like 'mon%' then 1
    when t like 'ter%' or t like 'tue%' then 2
    when t like 'qua%' or t like 'wed%' then 3
    when t like 'qui%' or t like 'thu%' then 4
    when t like 'sex%' or t like 'fri%' then 5
    when t like 'sab%' or t like 'sat%' then 6
    when t like 'dom%' or t like 'sun%' then 7
    else null
  end;
end;
$$;

-- Interpreta horario: "18:00", "18:00:00", "18h", "18h30", "7:30", "18". Null se invalido.
create or replace function public.agenda_interpretar_hora(texto text)
returns time
language plpgsql
immutable
as $$
declare
  partes text[];
  h int;
  m int;
begin
  partes := regexp_match(lower(trim(coalesce(texto, ''))), '^(\d{1,2})\s*(?:[:h]\s*(\d{2})?)?');
  if partes is null then
    return null;
  end if;
  h := partes[1]::int;
  m := coalesce(partes[2], '0')::int;
  if h > 23 or m > 59 then
    return null;
  end if;
  return make_time(h, m, 0);
end;
$$;

do $$
declare
  execucao_atual timestamptz := clock_timestamp();
  hoje_estudio date := (now() at time zone 'America/Sao_Paulo')::date;
  cfg public.configuracoes_estudio%rowtype;
  modalidade_padrao uuid;
  r record;
  dia smallint;
  hora time;
  turma_id uuid;
  n_multiplos int;
begin
  select * into cfg from public.configuracoes_estudio where id = 1;
  select id into modalidade_padrao from public.modalidades where nome = 'Aparelhos';

  for r in
    select f.id::text as id, f.aluno_id::uuid as aluno_id, f.dia_semana::text as dia_txt,
           f.horario::text as hora_txt, f.horario_id, al.id as aluno_existe, al.ativo
      from public.horarios_aluno f
      left join public.alunos al on al.id = f.aluno_id::uuid
      order by f.id::text
  loop
    if r.horario_id is not null then
      insert into public.conversao_agenda_log (execucao, origem, origem_id, aluno_id, situacao, detalhe)
        values (execucao_atual, 'horarios_aluno', r.id, r.aluno_id, 'ja_convertido', null);
      continue;
    end if;

    if r.aluno_existe is null then
      insert into public.conversao_agenda_log (execucao, origem, origem_id, aluno_id, situacao, detalhe)
        values (execucao_atual, 'horarios_aluno', r.id, r.aluno_id, 'nao_convertido', 'Aluno nao existe em alunos');
      continue;
    end if;

    -- Varios dias/horarios na mesma linha (ex.: "{seg,qua}" ou "seg, qua") precisam de revisao manual.
    n_multiplos := coalesce(array_length(regexp_split_to_array(trim(both '{} ' from coalesce(r.dia_txt, '')), '\s+e\s+|\s*[,;/]\s*'), 1), 0);
    if n_multiplos > 1 then
      insert into public.conversao_agenda_log (execucao, origem, origem_id, aluno_id, situacao, detalhe)
        values (execucao_atual, 'horarios_aluno', r.id, r.aluno_id, 'nao_convertido',
                format('Mais de um dia na mesma linha: "%s"', r.dia_txt));
      continue;
    end if;

    dia := public.agenda_interpretar_dia(trim(both '{}' from r.dia_txt));
    hora := public.agenda_interpretar_hora(r.hora_txt);

    if dia is null or hora is null then
      insert into public.conversao_agenda_log (execucao, origem, origem_id, aluno_id, situacao, detalhe)
        values (execucao_atual, 'horarios_aluno', r.id, r.aluno_id, 'nao_convertido',
                format('Dia "%s" ou horario "%s" nao reconhecido', coalesce(r.dia_txt, '(vazio)'), coalesce(r.hora_txt, '(vazio)')));
      continue;
    end if;

    select h.id into turma_id
      from public.horarios h
      where h.dia_semana = dia and h.hora_inicio = hora and h.ativo
      order by (h.origem = 'conversao') desc, h.created_at
      limit 1;

    if turma_id is null then
      insert into public.horarios (dia_semana, hora_inicio, duracao_min, modalidade_id, capacidade, origem, vigente_desde)
        values (dia, hora, coalesce(cfg.duracao_padrao_min, 55), modalidade_padrao, 3, 'conversao', hoje_estudio)
        returning id into turma_id;
    end if;

    update public.horarios_aluno
      set horario_id = turma_id,
          data_inicio = coalesce(data_inicio, hoje_estudio),
          updated_at = now()
      where id::text = r.id;

    insert into public.conversao_agenda_log (execucao, origem, origem_id, aluno_id, situacao, detalhe)
      values (execucao_atual, 'horarios_aluno', r.id, r.aluno_id, 'convertido',
              format('%s %s%s', (array['seg','ter','qua','qui','sex','sab','dom'])[dia], to_char(hora, 'HH24:MI'),
                     case when r.ativo then '' else ' (aluno inativo: nao aparece na agenda)' end));
  end loop;

  -- Turmas com mais alunos fixos que a capacidade padrao: amplia e avisa.
  for r in
    select h.id, h.dia_semana, h.hora_inicio, h.capacidade, count(*) as alunos
      from public.horarios h
      join public.horarios_aluno f on f.horario_id = h.id and (f.data_fim is null or f.data_fim >= hoje_estudio)
      join public.alunos al on al.id = f.aluno_id::uuid and al.ativo
      where h.origem = 'conversao'
      group by h.id
      having count(*) > h.capacidade
  loop
    update public.horarios set capacidade = r.alunos, updated_at = now() where id = r.id;
    insert into public.conversao_agenda_log (execucao, origem, origem_id, situacao, detalhe)
      values (execucao_atual, 'horarios', r.id::text, 'aviso',
              format('%s %s tem %s alunos fixos ativos; capacidade ajustada de %s para %s. Revise.',
                     (array['seg','ter','qua','qui','sex','sab','dom'])[r.dia_semana], to_char(r.hora_inicio, 'HH24:MI'),
                     r.alunos, r.capacidade, r.alunos));
  end loop;

  -- Frequencia semanal a partir do texto do plano ("semestral 2x", "3 x por semana").
  update public.alunos
    set frequencia_semanal = (regexp_match(lower(plano), '(\d)\s*x'))[1]::smallint
    where frequencia_semanal is null
      and lower(coalesce(plano, '')) ~ '(\d)\s*x';

  insert into public.conversao_agenda_log (execucao, origem, origem_id, aluno_id, situacao, detalhe)
    select execucao_atual, 'alunos.plano', al.id::text, al.id, 'aviso',
           format('Frequencia semanal nao identificada no plano "%s"', coalesce(al.plano, ''))
      from public.alunos al
      where al.ativo and al.frequencia_semanal is null;

  -- Alunos ativos sem nenhum horario fixo.
  insert into public.conversao_agenda_log (execucao, origem, origem_id, aluno_id, situacao, detalhe)
    select execucao_atual, 'alunos', al.id::text, al.id, 'aviso', 'Aluno ativo sem horario fixo'
      from public.alunos al
      where al.ativo
        and not exists (select 1 from public.horarios_aluno f where f.aluno_id::uuid = al.id and f.horario_id is not null);
end $$;

-- Resumo da ultima execucao (aparece no SQL Editor).
select situacao, origem, count(*) as total
  from public.conversao_agenda_log
  where execucao = (select max(execucao) from public.conversao_agenda_log)
  group by situacao, origem
  order by situacao, origem;
