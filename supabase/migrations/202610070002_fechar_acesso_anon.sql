-- =====================================================================
-- Fecha o acesso anonimo e aplica os niveis de acesso no banco.
--
--   operacionais (Agenda / Relatorio de alunos): qualquer usuario ativo le e grava
--   cadastros de apoio: qualquer usuario ativo le; so nivel 2 grava
--   gestao (financeiro, planos, empresa...): so nivel 2
--   anon (sem login): nada
--
-- RODE SO DEPOIS de criar o login de nivel 2 da dona (docs/acesso.md):
-- sem nenhum nivel 2 ativo esta migration para com erro e nao altera nada.
-- Reexecutavel. Depende de 202610070001.
-- =====================================================================

do $$
begin
  if coalesce(current_setting('lk.ignorar_bootstrap', true), '') <> 'on'
     and not exists (select 1 from public.usuarios_acesso where nivel = 2 and ativo) then
    raise exception 'Crie primeiro o usuario de nivel 2 da dona (docs/acesso.md, passo 3). Nada foi alterado.'
      using errcode = 'LK021';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create or replace function pg_temp.lk_proteger_tabela(t text, regra text)
returns void
language plpgsql
as $$
declare
  p record;
begin
  if to_regclass('public.' || t) is null then
    return;
  end if;

  execute format('alter table public.%I enable row level security', t);

  -- remove as policies antigas (inclusive as "for all to anon ... using (true)")
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
    execute format('drop policy %I on public.%I', p.policyname, t);
  end loop;

  execute format('revoke all on public.%I from anon, public', t);
  execute format('grant select, insert, update, delete on public.%I to authenticated', t);

  if regra = 'operacional' then
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.usuario_ativo())) with check ((select public.usuario_ativo()))',
      t || '_usuario_ativo', t);
  elsif regra = 'leitura' then
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.usuario_ativo()))',
      t || '_leitura', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.usuario_nivel2())) with check ((select public.usuario_nivel2()))',
      t || '_nivel2', t);
  elsif regra = 'nivel2' then
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.usuario_nivel2())) with check ((select public.usuario_nivel2()))',
      t || '_nivel2', t);
  else
    raise exception 'regra desconhecida: %', regra;
  end if;
end
$$;

do $$
declare
  t text;
begin
  -- Agenda e Relatorio de alunos (nivel 1 e 2)
  foreach t in array array[
    'alunos', 'aulas', 'agenda', 'horarios', 'horarios_aluno', 'recorrencias', 'bloqueios',
    'creditos_reposicao', 'lista_espera', 'substituicoes_professor', 'agenda_movimentos'
  ] loop
    perform pg_temp.lk_proteger_tabela(t, 'operacional');
  end loop;

  -- usados pela agenda, mas cadastrados so pela dona
  foreach t in array array['professores', 'modalidades', 'configuracoes_estudio'] loop
    perform pg_temp.lk_proteger_tabela(t, 'leitura');
  end loop;

  -- gestao: so nivel 2
  foreach t in array array['pagamentos', 'despesas', 'planos', 'contratos', 'empresa', 'conversao_agenda_log'] loop
    perform pg_temp.lk_proteger_tabela(t, 'nivel2');
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Views: por padrao rodam com o dono e ignorariam as policies acima
-- ---------------------------------------------------------------------
do $$
declare
  v text;
begin
  foreach v in array array['creditos_reposicao_situacao', 'agenda_relatorio', 'aulas_com_aluno', 'aulas_possiveis_duplicadas'] loop
    if to_regclass('public.' || v) is not null then
      execute format('alter view public.%I set (security_invoker = on)', v);
      execute format('revoke all on public.%I from anon, public', v);
      execute format('grant select on public.%I to authenticated', v);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Funcoes e sequencias: anon nao executa nada. As funcoes da agenda rodam
-- com as permissoes de quem chama, entao as policies acima continuam valendo
-- (ex.: registrar_pagamento falha para o nivel 1).
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke all on all sequences in schema public from anon, public;
grant usage, select on all sequences in schema public to authenticated;

-- service_role (APIs do servidor: criar login, autocadastro) continua com acesso total
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on all tables in schema public to service_role;
    grant execute on all functions in schema public to service_role;
    grant usage, select on all sequences in schema public to service_role;
  end if;
end $$;

-- objetos criados no futuro tambem nao ficam abertos ao anon
alter default privileges in schema public revoke all on tables from anon, public;
alter default privileges in schema public revoke execute on functions from anon, public;
alter default privileges in schema public revoke all on sequences from anon, public;
