# MedAgenda

> Agenda de compromissos feita para estudantes de Medicina.

MedAgenda é uma aplicação web progressiva (PWA) para organizar a rotina intensa da vida médica: aulas, plantões, ambulatórios, laboratórios, estudos, provas, congressos e compromissos pessoais.

**URL de produção:** https://andressamendes.github.io/MedAgenda/

---

## Funcionalidades

- **Autenticação** — login e logout com email/senha via Supabase
- **CRUD de eventos** — criar, editar e excluir compromissos
- **Calendário mensal** — visão geral do mês com chips coloridos
- **Agenda semanal** — grade de horários com linha "agora"
- **Quick Add** — criação rápida ao clicar em qualquer dia ou slot
- **Categorias** — 8 categorias padrão + categorias personalizadas com cores
- **Recorrência** — diária, semanal, quinzenal, mensal, anual, dias úteis ou personalizada
- **Lembretes locais** — notificações do navegador enquanto o app está aberto
- **Push Notifications** — lembretes mesmo com o app fechado (via Web Push)
- **PWA** — instalável como app, funciona offline com dados em cache
- **Calendários Acadêmicos** — múltiplos calendários com eventos institucionais, importação/exportação ICS

---

## Tecnologias

| Camada     | Tecnologia                                           |
|------------|------------------------------------------------------|
| Frontend   | HTML5, CSS3, JavaScript ES6+ (sem framework)         |
| Backend    | Supabase (PostgreSQL + Auth + Edge Functions)        |
| Hospedagem | GitHub Pages (frontend) + Supabase (backend)         |
| Push       | Web Push Protocol (W3C) + VAPID                      |
| PWA        | Service Worker + Web App Manifest                    |
| Testes     | Node.js (ES Modules nativos)                         |

---

## Estrutura do Projeto

```
MedAgenda/
├── index.html                    # SPA — ponto de entrada
├── style.css                     # Estilos globais
├── script.js                     # Controlador principal da UI
├── utils.js                      # Utilitários compartilhados
├── auth.js                       # Login / logout / sessão
├── supabase.js                   # Cliente Supabase + currentUserId
├── eventService.js               # CRUD de eventos pessoais
├── categoryService.js            # CRUD de categorias
├── recurrence.js                 # Expansão de eventos recorrentes
├── academicCalendarService.js    # CRUD de calendários e eventos acadêmicos
├── academicCalendarView.js       # UI dos calendários acadêmicos
├── icsImporter.js                # Parser de arquivos ICS
├── icsExporter.js                # Gerador de arquivos ICS
├── calendar.js                   # Vista mensal
├── weekView.js                   # Vista semanal
├── quickAdd.js                   # Modal de criação rápida
├── notificationService.js        # Notificações locais (browser)
├── pushService.js                # Web Push (app fechado)
├── pwa.js                        # Registro do Service Worker
├── service-worker.js             # Cache offline + Push handler
├── manifest.webmanifest          # PWA manifest
├── config.example.js             # Template de configuração
├── package.json                  # Scripts de teste
├── CHANGELOG.md                  # Histórico de versões
├── icons/                        # Ícones PWA (72px a 512px)
├── sql/                          # Migrations do banco de dados
│   ├── 02_categories.sql
│   ├── 03_recurrence.sql
│   ├── 04_push_notifications.sql
│   ├── 05_profiles.sql
│   ├── 06_storage.sql
│   └── 07_academic_calendar.sql  # Calendários acadêmicos (Etapa 17)
├── supabase/functions/           # Edge Functions
├── tests/                        # Testes automatizados
└── docs/                         # Documentação detalhada
    ├── ARQUITETURA.md
    ├── BANCO_DE_DADOS.md
    ├── DEPLOY.md
    ├── ROADMAP.md
    ├── VISAO_DO_PRODUTO.md
    └── ACADEMIC_CALENDAR.md      # Documentação da Etapa 17
```

---

## Executar localmente

Como o projeto usa ES Modules (`type="module"`), é necessário um servidor HTTP:

```bash
git clone https://github.com/andressamendes/medagenda.git
cd medagenda
cp config.example.js config.js
# Editar config.js com suas credenciais do Supabase
python3 -m http.server 8080
```

Acesse `http://localhost:8080`.

---

## Configurar o Supabase

1. Criar um projeto em [supabase.com](https://supabase.com)
2. Executar os scripts SQL na ordem:
   - `sql/02_categories.sql`
   - `sql/03_recurrence.sql`
   - `sql/04_push_notifications.sql`
   - `sql/05_profiles.sql`
   - `sql/06_storage.sql`
   - `sql/07_academic_calendar.sql`
3. Copiar a **URL do projeto** e a **chave anon** para `config.js`
4. Em **Authentication → URL Configuration**, configurar:
   - Site URL: `https://andressamendes.github.io/MedAgenda/`
   - Redirect URLs: `https://andressamendes.github.io/MedAgenda/**`

---

## Publicar no GitHub Pages

### Configuração única (primeira vez)

1. Configurar os Secrets no repositório:
   - **Settings → Secrets and variables → Actions**
   - Adicionar: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VAPID_PUBLIC_KEY`

2. Habilitar GitHub Pages:
   - **Settings → Pages → Source → GitHub Actions**

### Deploy contínuo

Após a configuração, todo push na branch `main` dispara o deploy automaticamente.

Consulte [`docs/DEPLOY.md`](docs/DEPLOY.md) para o guia completo.

---

## Instalar a PWA

1. Acesse a URL de produção pelo celular ou desktop
2. Clique em **"Instalar MedAgenda"** (aparece automaticamente quando disponível)
3. No iOS Safari: toque em **Compartilhar → Adicionar à Tela de Início**

---

## Executando os testes

```bash
npm test
```

Os testes cobrem as funções puras do projeto (utilitários e lógica de recorrência) e não requerem credenciais do Supabase.

```bash
npm run test:utils        # Apenas testes de utils.js
npm run test:recurrence   # Apenas testes de recurrence.js
```

---

## Documentação

- [`docs/DEPLOY.md`](docs/DEPLOY.md) — guia completo de deploy e configuração
- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — arquitetura técnica
- [`docs/API.md`](docs/API.md) — API interna: Services, Supabase e Edge Functions
- [`docs/BANCO_DE_DADOS.md`](docs/BANCO_DE_DADOS.md) — schema do banco de dados
- [`docs/VISAO_DO_PRODUTO.md`](docs/VISAO_DO_PRODUTO.md) — visão e princípios do produto
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — próximas versões planejadas
- [`docs/ACADEMIC_CALENDAR.md`](docs/ACADEMIC_CALENDAR.md) — Calendário Acadêmico (Etapa 17)
- [`CHANGELOG.md`](CHANGELOG.md) — histórico de versões

---

## Versão

**v1.1.0** — Calendário Acadêmico (Etapa 17)

---

## Licença

MIT © andressamendes
