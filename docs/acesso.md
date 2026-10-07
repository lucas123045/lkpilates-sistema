# Login e níveis de acesso — como subir

| Nível | Acessa |
|---|---|
| **Nível 1** (funcionários) | Agenda (inclui Horários fixos) e Relatório de alunos (inclui "Ver relatório completo") |
| **Nível 2** (dona) | Tudo, inclusive Financeiro, Resultados, IA e a tela **Usuários e acessos** |

As regras valem em três lugares: no menu, nas rotas (middleware no servidor) e **no banco** (policies). Sem login, ninguém lê nem grava nada.

## Ordem para subir (siga exatamente esta ordem)

> Se a ordem for trocada, a Luciana pode ficar sem conseguir entrar. A migration do passo 5 se recusa a rodar sem um nível 2, justamente para evitar isso.

1. **Backup**: Relatório de alunos → "Backup dos dados" (e, se possível, backup do projeto no painel do Supabase).

2. **SQL Editor** → rode `supabase/migrations/202610070001_usuarios_acesso.sql`.
   Só cria a tabela de usuários. O sistema continua funcionando como hoje.

3. **Painel do Supabase → Authentication**:
   1. **Sign In / Providers** (ou *Settings*): **desligue "Allow new users to sign up"**. Sem isso, qualquer pessoa cria uma conta pela chave pública.
   2. **Users → Add user → Create new user**: e-mail e senha da Luciana, marcando *Auto Confirm User*.
   3. No **SQL Editor**, troque o e-mail e rode:
      ```sql
      insert into public.usuarios_acesso (user_id, nome, email, nivel, ativo)
      select id, 'Luciana', lower(email), 2, true
      from auth.users
      where lower(email) = lower('EMAIL-DA-LUCIANA@exemplo.com')
      on conflict (user_id) do update set nivel = 2, ativo = true;

      -- conferir: deve aparecer 1 linha com nivel 2
      select nome, email, nivel, ativo from public.usuarios_acesso;
      ```

4. **Vercel → Project Settings → Environment Variables**: adicione `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API → chave `service_role`, a secreta). Confira também `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Modelo em `.env.example`.
   Publique o código novo (deploy). **A partir daqui o login passa a ser obrigatório.** Teste entrar com a Luciana.

5. **SQL Editor** → rode `supabase/migrations/202610070002_fechar_acesso_anon.sql`.
   Fecha o banco: sem login não há acesso, o Nível 1 não vê financeiro, empresa, planos nem outros usuários. Se aparecer o erro *"Crie primeiro o usuário de nível 2 da dona"*, volte ao passo 3.

6. A Luciana entra em **Usuários e acessos** e cria o login de cada funcionária (nome, e-mail, senha inicial e nível). A pessoa troca a senha depois, no ícone de chave no topo.

As duas migrations podem ser rodadas de novo sem problema.

## Esqueceu a senha

Não há "esqueci a senha" por e-mail (o e-mail gratuito do Supabase é limitado). A Luciana redefine em **Usuários e acessos → Redefinir senha**. Se for a própria Luciana: painel do Supabase → Authentication → Users → o usuário → *Send password recovery* ou redefina por lá.

## Roteiro de teste manual (depois de subir)

| Teste | Esperado |
|---|---|
| Abrir o sistema sem login | Vai para a tela de login |
| Entrar com a Luciana | Cai no Início, vê todo o menu e "Usuários e acessos" |
| Criar um login Nível 1 e entrar com ele (janela anônima) | Cai na Agenda, o menu só tem Agenda e Relatório de alunos |
| Nível 1 digita `/financeiro/entradas` ou `/resultados` na barra | Tela "Acesso restrito" |
| Nível 1 na Agenda: abrir uma aula | Nome do aluno sem link; marca presença/falta normalmente |
| Nível 1 no Relatório de alunos | Sem "Backup dos dados" e sem "Horários e agenda"; "Ver relatório completo" funciona |
| Desativar o login Nível 1 | A pessoa não consegue mais entrar |
| Tentar rebaixar/desativar a si mesma | O sistema não deixa |
| Ícone de chave → trocar senha → sair → entrar com a nova | Funciona |
| Ícone de sair | Volta para o login |

## Detalhes técnicos

- Tabela `usuarios_acesso` (`nivel` 1 ou 2, `ativo`). A coluna antiga `professores.funcao` não controla mais nada.
- Funções usadas nas policies: `usuario_nivel()`, `usuario_ativo()`, `usuario_nivel2()`; `nome_estudio()` dá o nome do estúdio ao topo sem abrir a tabela `empresa`.
- Um gatilho impede ficar sem nenhum nível 2 ativo (erro `LK020`).
- As views passaram a usar `security_invoker` (respeitam as policies de quem consulta).
- Criar login e redefinir senha passam por `/api/usuarios` (servidor, com a service role), que confere se quem chamou é nível 2.
- `/api/chat` (IA da página Resultados) exige nível 2.
