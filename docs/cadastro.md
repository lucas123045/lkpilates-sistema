# Autocadastro pelo link — como subir

O cliente abre **`https://<endereço do sistema>/cadastro`**, preenche os próprios dados e **já entra como cliente ativo**, sem plano e sem pacote, com a etiqueta **Autocadastro**. A Luciana completa plano, profissional e pacote depois.

## Subir

Pré-requisito: login e níveis já no ar (`docs/acesso.md`, inclusive a `SUPABASE_SERVICE_ROLE_KEY` na Vercel; o autocadastro grava pelo servidor com ela).

1. **SQL Editor** → rode `supabase/migrations/202610080001_autocadastro.sql` (depois da `202610070002`). Reexecutável.
2. Publique o código novo.
3. Em **Minha Empresa → Cadastro pelo link**, confira que está ligado (vem ligado).

## Como usar

- **Clientes → Copiar link de cadastro** ou **Enviar por WhatsApp** (abre o WhatsApp com a mensagem pronta para escolher o contato).
- Cadastros novos aparecem num aviso azul em **Início** e em **Clientes**. "Ver lista" filtra só eles; **Visto** (ou "Marcar todos como vistos") tira do aviso. Editar e salvar o cliente também tira.
- Para pausar (ex.: link vazou), desligue em **Minha Empresa**: a página passa a mostrar "cadastro fechado".

## Campos

Obrigatórios: nome completo, CPF (validado), data de nascimento, telefone/WhatsApp, e-mail, CEP, rua, número, bairro, cidade, UF e o aceite de uso dos dados (LGPD, com data e hora gravadas).
Opcionais: complemento, profissão, como conheceu o estúdio, objetivo com o pilates, informações de saúde.
O CEP preenche rua, bairro, cidade e UF sozinho (ViaCEP); se a busca falhar, dá para digitar.
Os mesmos campos agora existem no formulário do cliente (Clientes → Editar) e aparecem na ficha (aba Dados).

## Proteções

- O navegador do cliente não acessa o banco: a API (`/api/cadastro`) valida tudo de novo e grava pela função `autocadastro()`, que só o servidor executa.
- **Não duplica**: se o CPF ou o telefone já é de um cliente, mostra "você já está cadastrado(a), fale com o estúdio" sem revelar nada do cadastro existente.
- **Anti-spam**: campo escondido que só robô preenche, e no máximo 5 envios por hora vindos da mesma conexão.

## Roteiro de teste manual

| Teste | Esperado |
|---|---|
| Abrir `/cadastro` no celular, sem login | Formulário com a logo, sem o menu do sistema |
| Digitar um CEP válido | Rua, bairro, cidade e UF preenchidos |
| Enviar com campos vazios / CPF errado | Campos destacados em vermelho, nada é gravado |
| Enviar completo | "Cadastro concluído!"; o cliente aparece em Clientes como ativo, com a etiqueta Autocadastro |
| Enviar de novo com o mesmo CPF ou telefone | "Você já está cadastrado(a)" |
| Início e Clientes (Luciana) | Aviso "1 novo cadastro pelo link" → Ver lista → Visto |
| Desligar em Minha Empresa e abrir `/cadastro` | "Cadastro fechado" |
| Clientes → Enviar por WhatsApp | WhatsApp abre com a mensagem e o link |
