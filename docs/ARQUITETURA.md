# Arquitetura Técnica — MedAgenda

## Visão Geral

O MedAgenda é uma aplicação web estática com backend gerenciado pelo Supabase. Não há servidor próprio: o frontend é servido pelo GitHub Pages e toda a lógica de persistência, autenticação e segurança é delegada ao Supabase.

```
Usuário
  ↓
GitHub Pages  (HTML + CSS + JavaScript puro)
  ↓
Supabase Auth  (autenticação e sessão do usuário)
  ↓
PostgreSQL  (banco de dados com RLS)
```

---

## Camadas da Aplicação

### Frontend — GitHub Pages

- Tecnologia: HTML, CSS e JavaScript puro (sem frameworks)
- Hospedagem: GitHub Pages (deploy automático a partir da branch `main`)
- Comunicação com o backend: via Supabase JavaScript SDK (CDN)
- Responsabilidades:
  - Renderizar a interface da agenda
  - Gerenciar o estado local da sessão do usuário
  - Enviar e receber dados do Supabase via SDK

### Autenticação — Supabase Auth

- Provedor: Supabase Authentication
- Método inicial: e-mail e senha
- O token de sessão é gerenciado automaticamente pelo SDK do Supabase
- Após o login, o `user_id` do usuário autenticado fica disponível para todas as consultas
- As políticas de RLS no banco utilizam o `user_id` da sessão para filtrar os dados

### Banco de Dados — PostgreSQL (via Supabase)

- Banco relacional gerenciado pelo Supabase
- Acesso exclusivamente via SDK do Supabase (não há acesso direto ao banco pelo frontend)
- Row Level Security (RLS) ativado em todas as tabelas
- Nenhuma consulta retorna dados de outros usuários

---

## Row Level Security (RLS)

O RLS é a camada de segurança principal do banco de dados. Ele garante que, mesmo que uma consulta seja feita sem filtro explícito de `user_id`, o PostgreSQL bloqueará automaticamente o retorno de dados de outros usuários.

**Princípio aplicado:**
- Toda tabela de dados do usuário terá RLS ativado
- As políticas permitirão apenas operações onde `user_id = auth.uid()`
- `auth.uid()` é a função do Supabase que retorna o ID do usuário autenticado na sessão atual

**Política padrão para a tabela `events`:**
```sql
-- Leitura: usuário vê apenas seus próprios eventos
CREATE POLICY "Users can view own events"
  ON events FOR SELECT
  USING (user_id = auth.uid());

-- Inserção: usuário só insere eventos com seu próprio user_id
CREATE POLICY "Users can insert own events"
  ON events FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Atualização: usuário só edita seus próprios eventos
CREATE POLICY "Users can update own events"
  ON events FOR UPDATE
  USING (user_id = auth.uid());

-- Exclusão: usuário só exclui seus próprios eventos
CREATE POLICY "Users can delete own events"
  ON events FOR DELETE
  USING (user_id = auth.uid());
```

---

## Fluxo de Autenticação

```
1. Usuário acessa o MedAgenda (GitHub Pages)
2. Supabase SDK verifica se há uma sessão ativa no localStorage
3a. Sessão ativa → carrega a agenda do usuário diretamente
3b. Sem sessão → exibe tela de login/cadastro
4. Usuário faz login com e-mail e senha
5. Supabase Auth valida as credenciais e retorna um JWT
6. SDK armazena o token na sessão do navegador
7. Todas as consultas ao banco passam a incluir o token automaticamente
8. PostgreSQL aplica RLS com base no user_id extraído do token
```

---

## Estrutura de Arquivos Prevista

```
medagenda/
├── index.html          # Ponto de entrada da aplicação
├── config.js           # Variáveis de ambiente (não versionado)
├── config.example.js   # Exemplo de configuração (versionado)
├── css/
│   └── style.css
├── js/
│   ├── app.js          # Inicialização e roteamento
│   ├── auth.js         # Login, cadastro e sessão
│   └── events.js       # CRUD de eventos
└── docs/
    ├── VISAO_DO_PRODUTO.md
    ├── ROADMAP.md
    ├── ARQUITETURA.md
    └── BANCO_DE_DADOS.md
```
