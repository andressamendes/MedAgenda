# Changelog

Todas as mudanças notáveis deste projeto são documentadas neste arquivo.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).
Versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

---

## [1.0.0-rc1] — 2026-06-28

### Release Candidate — Consolidação de Arquitetura e Qualidade

Esta versão consolida todas as funcionalidades implementadas nas etapas anteriores
e prepara a MedAgenda para uso em produção com foco em qualidade, performance e manutenibilidade.

### Adicionado
- **`utils.js`** — módulo de utilitários compartilhados (`pad`, `isoDate`, `isoToday`, `localDate`, `escapeHtml`, `mondayOf`, `truncate`)
- **`tests/utils.test.js`** — 30 testes unitários para utilitários (100% cobertura)
- **`tests/recurrence.test.js`** — 16 testes unitários para lógica de recorrência (todos os tipos cobertos)
- **`package.json`** — scripts de teste via `npm test`
- **ARIA `role="alert"` e `aria-live`** em todas as mensagens de erro da interface
- **`role="dialog"` e `aria-modal="true"`** nos modais de Categorias e Configurações
- **`aria-labelledby`** nos modais para associar títulos

### Corrigido
- **Service Worker** — registro alterado de caminho absoluto (`/service-worker.js`) para relativo (`./service-worker.js`), corrigindo compatibilidade com GitHub Pages em subdiretórios
- **App Shell do Service Worker** — caminhos dos assets migrados para URLs absolutas calculadas a partir da localização do SW (compatível com qualquer base URL)
- **Ícones de notificação Push** — URLs dos ícones no Service Worker agora usam caminho absoluto correto para qualquer deploy
- Consulta redundante em `eventService.getEventsByRange` — cláusula `.lte("event_date", end)` desnecessária removida da query de eventos recorrentes

### Refatorado
- **Eliminação de código duplicado**:
  - `pad()` — existia em `weekView.js`, `notificationService.js`, `calendar.js` → movido para `utils.js`
  - `isoDate()` — existia em `weekView.js`, `notificationService.js` → movido para `utils.js`
  - `isoToday()` — existia em `calendar.js`, `weekView.js` → movido para `utils.js`
  - `mondayOf()` — existia em `weekView.js` e `recurrence.js` → movido para `utils.js`
  - `escapeHtml()` / `esc()` — existia em `script.js` e `weekView.js` → movido para `utils.js`
  - `localDate()` — existia em `recurrence.js` → movido para `utils.js`
  - `currentUserId()` — existia em `eventService.js` e `categoryService.js` → movido para `supabase.js`
- Todos os módulos JS atualizados para importar utilitários de `utils.js`
- `supabase.js` agora exporta `currentUserId()` centralizado

---

## [0.12.0] — Push Notifications

### Adicionado
- Web Push API com VAPID
- Supabase Edge Function para envio de notificações
- Tabela `push_subscriptions` e `notification_logs`
- Deduplicação de notificações via banco de dados

---

## [0.11.0] — PWA

### Adicionado
- Service Worker com cache offline (Cache-first para assets, network-first para API)
- Manifesto PWA (`manifest.webmanifest`) com ícones para todos os tamanhos
- Banner de atualização ao detectar novo Service Worker
- Barra de modo offline
- Botão de instalação (Add to Home Screen)

---

## [0.10.0] — Recorrência

### Adicionado
- Tipos de recorrência: diária, semanal, quinzenal, mensal, anual, dias úteis, personalizada
- Expansão de ocorrências virtuais por intervalo de datas
- Campo `recurrence_until` para limite de recorrência
- Recorrência personalizada com seleção de dias da semana e intervalo em semanas

---

## [0.9.0] — Categorias

### Adicionado
- CRUD completo de categorias personalizadas
- 8 categorias padrão pré-criadas para estudantes de Medicina
- Seleção de cor por categoria
- Preenchimento automático de cor ao selecionar categoria no formulário

---

## [0.8.0] — Quick Add

### Adicionado
- Modal de criação rápida de compromisso (título + hora)
- Disparo ao clicar em dia no calendário mensal ou slot na agenda semanal

---

## [0.7.0] — Agenda Semanal

### Adicionado
- Vista de agenda semanal com grade de horários
- Linha "agora" atualizada a cada minuto
- Scroll automático para o horário atual
- Navegação entre semanas
- Criação de evento ao clicar em slot vazio

---

## [0.6.0] — Calendário Mensal

### Adicionado
- Vista de calendário mensal com chips de eventos
- Navegação entre meses
- Botão "Hoje"
- Clique em dia → Quick Add; clique em evento → edição

---

## [0.5.0] — CRUD de Eventos

### Adicionado
- Formulário completo de criação e edição de compromissos
- Campos: título, data, hora, duração, categoria, cor, local, descrição, lembrete
- Lista de compromissos com paginação visual
- Exclusão com confirmação

---

## [0.4.0] — Supabase e Banco de Dados

### Adicionado
- Integração com Supabase (PostgreSQL + Auth)
- Tabela `events` com índices e trigger de `updated_at`
- Row-Level Security (RLS) para isolamento de dados entre usuários
- Migrations SQL versionadas em `sql/`

---

## [0.3.0] — Notificações Locais

### Adicionado
- Notificações do navegador (Notification API)
- Agendamento de lembretes via `setTimeout` dentro da janela de 7 dias
- Persistência de preferência de notificação no localStorage

---

## [0.2.0] — Autenticação

### Adicionado
- Login e logout com email/senha via Supabase Auth
- Persistência de sessão entre recargas
- Proteção de rotas (tela de login vs. app)

---

## [0.1.0] — Versão Inicial

### Adicionado
- Estrutura do projeto (HTML, CSS, JS vanilla, sem framework)
- Configuração de deploy via GitHub Pages
- Documentação inicial (README, VISAO_DO_PRODUTO, ARQUITETURA, BANCO_DE_DADOS)
