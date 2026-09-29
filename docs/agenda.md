# Agenda — como subir e testar

## Subir no Supabase (produção)

Nada disto foi aplicado no banco ainda. Ordem:

1. **Backup**: Relatórios → "Backup dos dados" (e, se possível, backup do projeto no painel do Supabase).
2. No **SQL Editor**, rode, nesta ordem, o conteúdo de:
   1. `supabase/migrations/202609260001_agenda_estrutura.sql`
   2. `supabase/migrations/202609260002_agenda_funcoes.sql`
   3. `supabase/migrations/202609260003_agenda_conversao_horarios.sql`
   4. `supabase/migrations/202609270001_agenda_calendario.sql`
   5. `supabase/migrations/202609280001_gestao_estudio.sql` (profissionais, serviços, planos, clientes, agenda por cliente com recorrência, financeiro, empresa)
3. O passo 3 termina mostrando um resumo. Para ver o detalhe da conversão:
   ```sql
   select situacao, origem, origem_id, detalhe
   from conversao_agenda_log
   where execucao = (select max(execucao) from conversao_agenda_log)
   order by situacao;
   ```
   - `convertido`: horário do aluno ligado a uma turma da grade.
   - `nao_convertido`: dia/horário ilegível ou vários dias numa linha. Corrija na ficha do aluno (Cadastros → aluno → Horários fixos).
   - `aviso`: turma com mais fixos que a capacidade (capacidade ajustada), plano sem "Nx", aluno ativo sem horário.
4. Em **Agenda → Grade e professores**: cadastre os professores (com cor), defina o professor de cada turma e confira capacidade/modalidade das turmas criadas pela conversão.

Todas as migrations são aditivas e podem ser rodadas de novo sem duplicar nada. A 001 para com erro (sem alterar nada) se `agenda` já tiver dados em formato inesperado.

## Rodar os testes

```bash
npm test
```

Os testes sobem um Postgres em memória (PGlite) com uma réplica do schema atual, aplicam as migrations e testam as regras: conversão idempotente, geração idempotente dos fixos, antecedência/crédito, validade do crédito, capacidade/encaixe, conflito de horário, bloqueios, professor efetivo, integração com o pacote (`aulas`).

## Roteiro de teste manual (depois de subir)

| Fluxo | Onde | Esperado |
|---|---|---|
| Alunos reais aparecem | `/agenda` (hoje) | Turmas do dia com os alunos fixos |
| Presença / falta | ✓ / ✗ no card | Registro em `aulas`, `aulas_restantes` debitado, aparece em Relatórios |
| Desfazer | Aluno → Presença → "Voltar para agendado" | Aula desfeita e pacote devolvido |
| Desmarcar com antecedência | Aluno → Desmarcar | Falta justificada + crédito (ficha do aluno) |
| Desmarcar em cima da hora | idem, < 3h | Falta, debita, sem crédito (há opção de conceder) |
| Reposição | Card → Adicionar → Reposição | Lista créditos válidos; consome o crédito |
| Experimental | Card → Adicionar → Experimental | Ocupa vaga; "Converter em aluno" leva ao Cadastro |
| Lotado | Adicionar numa turma cheia | Pede confirmação de encaixe ou oferece lista de espera |
| Remarcar | Aluno → Remarcar | Mostra vagas por horário da data escolhida |
| Cancelar aula | Card → Cancelar aula | Todos cancelados, créditos gerados, horário bloqueado |
| Feriado | "Feriado / bloqueio" | Dia inteiro bloqueado, alunos com crédito |
| Troca de professor | Card → Professor (dia/permanente) ou aluno → Professor | Cor/iniciais mudam; "só hoje" indicado |
| Semana | Aba Semana | Grade com ocupação e bolinhas por professor |
| Horários fixos | Cadastros → aluno | Adicionar/tirar horário; alerta se exceder o plano |

## Regras adotadas

- Presença e falta (sem aviso) **debitam** o pacote, como na tela Aulas. Falta justificada **não debita** e gera crédito.
- Aula avulsa registra presença em `aulas` com `tipo = 'avulsa'` **sem** debitar o pacote. Experimental não gera registro em `aulas`.
- Professor efetivo: troca do dia > professor do aluno (no horário fixo, depois no cadastro) > professor da turma. Fica gravado em `agenda.professor_id` e `agenda.professor_origem`.
- Crédito vale N dias a partir da data da aula (ou de hoje, se a aula já passou).
- Alterar a grade ou o horário fixo só mexe em agendamentos **futuros ainda "agendado"**. Passado e marcações nunca mudam.

## Para relatórios futuros

- `agenda_relatorio` (view): cada agendamento com tipo, status, professor efetivo, modalidade, capacidade.
- `creditos_reposicao_situacao` (view): créditos com situação ativo/usado/vencido/cancelado.
- Conversão de experimentais: `agenda.tipo = 'experimental'` e `aluno_convertido_id`.

## Calendário (/agenda)

Feito com FullCalendar 6 usando só plugins MIT (timegrid, daygrid, list, interaction, luxon3 para o fuso America/Sao_Paulo).

- Visões: Dia, Semana, Mês, Programação (próximos 30 dias) e 3 dias (padrão no celular). A última visão, os filtros e o "24 horas" ficam salvos por usuário (ou por aparelho, sem login).
- Clique num espaço vazio: criação rápida (aula única ou semanal, aluno numa aula do horário, bloqueio). Arrastar sobre a grade define o intervalo.
- Clique numa aula: detalhes, presença rápida, adicionar aluno, professor, lista de espera, editar, cancelar/reativar.
- Arrastar para mover e puxar a borda para mudar a duração. Em turma semanal pergunta "Somente esta aula / Esta e as seguintes / Todas as aulas". Aulas passadas ou com presença marcada não se movem. Toast com "Desfazer" (até 30 min).
- Atalhos: `t` hoje, `j`/`k` ou setas, `d` dia, `w` semana, `m` mês, `a` programação, `x` 3 dias, `c` criar, `/` busca, `Esc` fecha.
- Celular: swipe lateral troca o período, botão "+" flutuante, popovers viram bottom sheet, toque longo para arrastar.

## Gestão do estúdio (migration 202609280001)

A agenda passou a ser **por cliente** (um card por aluno), com regra de recorrência:

- `recorrencias`: cliente (ou nome livre para experimental), dias da semana, das/até, profissional, serviço, cor. As aulas da semana são geradas a partir dela, sem duplicar.
- Editar/excluir aula recorrente pergunta **Somente esta aula** / **Esta e as próximas**. Aulas passadas ou marcadas nunca mudam.
- Presença e falta continuam debitando o pacote (tabela `aulas`), e desmarcar dentro do prazo gera crédito de reposição.
- Conflito do mesmo cliente em horários sobrepostos gera aviso (dá para salvar mesmo assim).

Outros módulos: Clientes (`alunos` + plano, vencimento, aniversário, etiquetas), Planos (criados automaticamente a partir do texto do plano de cada aluno — confira em Planos), Profissionais (função e cor), Tipos de Serviço (duração e cor), Financeiro (Entradas/Saídas), Relatórios → Gestão, Minha Empresa.

**Vencimento:** ao registrar um pagamento, o vencimento avança N meses a partir do vencimento atual (ou da data do pagamento, se não houver). N é sugerido como valor ÷ preço mensal do plano e pode ser editado. Excluir o pagamento devolve o vencimento anterior.

**Permissões:** o e-mail do login é procurado em Profissionais. Nível 2 vê Início, Agenda, Clientes e Registro de aulas. Sem login ou com e-mail não cadastrado: acesso total (como hoje). A restrição é da interface; o banco continua aberto à chave pública (mesmo modelo de antes).
