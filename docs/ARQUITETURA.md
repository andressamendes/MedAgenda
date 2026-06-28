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

## Arquitetura da Interface (Etapa 21)

### Dois Layouts Independentes

**Layout Público** — exibido quando não há sessão ativa:
- `#login-screen` contém todos os fluxos de autenticação
- Views: login, cadastro, confirmação de e-mail, recuperar senha, nova senha
- Nenhum elemento da agenda é renderizado

**Layout Autenticado** — exibido após login válido:
- `#app-screen` com header + sidebar + content area
- Nunca exibe formulário de login ou cadastro

### Estrutura do Layout Autenticado

```
#app-screen
├── header.app-header
│   ├── .header-left    (toggle sidebar + logo + sync)
│   └── .header-right   (instalar PWA + user-menu dropdown)
│
├── .app-layout
│   ├── nav.app-sidebar           (240 px, sempre visível no desktop)
│   │   ├── .sidebar-filter-wrap  (filtros de calendários)
│   │   ├── Agenda      → #page-agenda
│   │   ├── Calendário  → #page-calendar
│   │   ├── Compromissos→ #page-appointments
│   │   ├── Assistente IA → painel drawer
│   │   ├── Calendários → modal #academic-overlay
│   │   └── Categorias  → modal #cat-overlay
│   │
│   └── main.app-content
│       ├── #page-agenda       (agenda semanal + assistente inteligente)
│       ├── #page-calendar     (calendário mensal)
│       └── #page-appointments (lista com busca, filtro e ordenação)
│
└── nav.bottom-nav   (apenas mobile, 56 px)
```

### Modais

| ID | Conteúdo |
|----|----------|
| `#event-modal` | Formulário de novo/editar compromisso |
| `#cat-overlay` | Gerenciar categorias |
| `#settings-overlay` | Configurações e notificações |
| `#account-overlay` | Minha Conta (perfil + avatar + senha) |
| `#diagnostic-overlay` | Diagnóstico do sistema |
| `#academic-overlay` | Calendários acadêmicos |
| `#ai-panel` | Painel drawer do Assistente IA (Gemini) |

### Responsividade

| Tamanho | Comportamento |
|---------|---------------|
| Desktop (≥768 px) | Sidebar fixo à esquerda, bottom-nav oculto |
| Tablet/Mobile (<768 px) | Sidebar como drawer (desliza da esquerda), bottom-nav visível |
| Mobile estreito (<480 px) | E-mail do usuário oculto no header |

---

## Estrutura de Arquivos

```
medagenda/
├── index.html              # SPA — estrutura completa da UI
├── script.js               # Controlador principal
├── style.css               # Estilos globais (sem frameworks CSS)
├── config.js               # Variáveis de ambiente (não versionado)
├── config.example.js       # Exemplo de configuração (versionado)
├── auth.js                 # signIn, signUp, signOut, onAuthStateChange
├── supabase.js             # Cliente Supabase singleton
├── eventService.js         # CRUD de eventos pessoais
├── categoryService.js      # CRUD de categorias
├── calendar.js             # Renderização do calendário mensal
├── weekView.js             # Renderização da agenda semanal
├── quickAdd.js             # Modal de criação rápida (clique no slot)
├── accountView.js          # Modal "Minha Conta"
├── academicCalendarView.js # Modal e filtros de calendários acadêmicos
├── recurrence.js           # Expansão de eventos recorrentes
├── notificationService.js  # Lembretes locais (app aberto)
├── pushService.js          # Notificações push (app fechado)
├── smartAssistant.js       # Análise de conflitos e sugestões
├── analytics.js            # Estatísticas mensais
├── services/ai/            # Integração com Google Gemini
├── pwa.js                  # Service Worker, instalação, offline
├── toastService.js         # Notificações toast
├── utils.js                # Funções puras utilitárias
└── docs/                   # Documentação técnica
```
