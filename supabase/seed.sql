-- =====================================================================
-- DADOS DE EXEMPLO — SOMENTE DESENVOLVIMENTO
-- O Supabase CLI roda este arquivo apenas em `supabase db reset` local.
-- Trava de seguranca: se existir qualquer aluno que nao seja de teste
-- ("[DEV] ..."), o seed aborta sem inserir nada.
-- =====================================================================

do $$
begin
  if exists (select 1 from public.alunos where nome not like '[DEV]%') then
    raise exception 'seed.sql abortado: este banco tem alunos reais. Use apenas em desenvolvimento.';
  end if;
end $$;

insert into public.professores (id, nome, telefone, cor) values
  ('10000000-0000-0000-0000-000000000001', '[DEV] Karla', '31990000001', '#1f4fd8'),
  ('10000000-0000-0000-0000-000000000002', '[DEV] Lívia', '31990000002', '#ea580c'),
  ('10000000-0000-0000-0000-000000000003', '[DEV] Bruno', '31990000003', '#15803d')
on conflict (id) do nothing;

insert into public.horarios (id, dia_semana, hora_inicio, duracao_min, professor_id, modalidade_id, capacidade, vigente_desde)
select v.id::uuid, v.dia, v.hora::time, 55, v.prof::uuid, (select id from public.modalidades where nome = v.modalidade), v.cap, current_date - 30
from (values
  ('20000000-0000-0000-0000-000000000001', 1, '07:00', '10000000-0000-0000-0000-000000000001', 'Aparelhos', 3),
  ('20000000-0000-0000-0000-000000000002', 3, '07:00', '10000000-0000-0000-0000-000000000001', 'Aparelhos', 3),
  ('20000000-0000-0000-0000-000000000003', 2, '18:00', '10000000-0000-0000-0000-000000000002', 'Aparelhos', 3),
  ('20000000-0000-0000-0000-000000000004', 4, '18:00', '10000000-0000-0000-0000-000000000002', 'Aparelhos', 3),
  ('20000000-0000-0000-0000-000000000005', 2, '19:00', '10000000-0000-0000-0000-000000000003', 'Solo/Mat', 6),
  ('20000000-0000-0000-0000-000000000006', 5, '09:00', '10000000-0000-0000-0000-000000000003', 'Individual', 1)
) v(id, dia, hora, prof, modalidade, cap)
on conflict (id) do nothing;

insert into public.alunos (id, nome, plano, total_aulas, aulas_restantes, valor_plano, ativo, telefone, frequencia_semanal) values
  ('30000000-0000-0000-0000-000000000001', '[DEV] Maria Souza', 'semestral 2x', 48, 40, 399, true, '31980000001', 2),
  ('30000000-0000-0000-0000-000000000002', '[DEV] Ana Lima', 'mensal 2x', 8, 6, 300, true, '31980000002', 2),
  ('30000000-0000-0000-0000-000000000003', '[DEV] João Pedro', 'trimestral 1x', 12, 9, 280, true, null, 1),
  ('30000000-0000-0000-0000-000000000004', '[DEV] Carla Mendes', 'mensal 3x', 12, 12, 420, true, null, 3),
  ('30000000-0000-0000-0000-000000000005', '[DEV] Rita (inativa)', 'mensal 1x', 4, 0, 150, false, null, 1)
on conflict (id) do nothing;

insert into public.horarios_aluno (aluno_id, dia_semana, horario, horario_id, data_inicio, professor_id)
select v.aluno::uuid, h.dia_semana::text, to_char(h.hora_inicio, 'HH24:MI'), h.id, current_date - 30, v.prof::uuid
from (values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', null),
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', null),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004', null),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', null),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', null),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', null),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000005', null)
) v(aluno, horario, prof)
join public.horarios h on h.id = v.horario::uuid
where not exists (
  select 1 from public.horarios_aluno f where f.aluno_id::uuid = v.aluno::uuid and f.horario_id = h.id
);

-- Materializa a semana atual e a proxima
select public.sincronizar_agenda(date_trunc('week', current_date)::date, date_trunc('week', current_date)::date + 13);
