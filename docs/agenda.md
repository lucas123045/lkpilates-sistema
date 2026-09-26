# Agenda — como subir e testar

## Subir no Supabase (produção)

Nada disto foi aplicado no banco ainda. Ordem:

1. **Backup**: Relatórios → "Backup dos dados" (e, se possível, backup do projeto no painel do Supabase).
2. No **SQL Editor**, rode, nesta ordem, o conteúdo de:
   1. `supabase/migrations/202609260001_agenda_estrutura.sql`
   2. `supabase/migrations/202609260002_agenda_funcoes.sql`
   3. `supabase/migrations/202609260003_agenda_conversao_horarios.sql`
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
