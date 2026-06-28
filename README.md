# MedAgenda

> Agenda de compromissos feita para estudantes de Medicina.

MedAgenda é uma aplicação web progressiva (PWA) para organizar a rotina intensa da vida médica: aulas, plantões, ambulatórios, laboratórios, estudos, provas, congressos e compromissos pessoais.

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
├── index.html              # SPA — ponto de entrada
├── style.css               # Estilos globais
├── script.js               # Controlador principal da UI
├── utils.js                # Utilitários compartilhados (pad, isoDate, escapeHtml…)
├── auth.js                 # Login / logout / sessão
├── supabase.js             # Cliente Supabase + currentUserId
├── eventService.js         # CRUD de eventos
├── categoryService.js      # CRUD de categorias
├── recurrence.js           # Expansão de eventos recorrentes (funções puras)
├── calendar.js             # Vista mensal
├── weekView.js             # Vista semanal
├── quickAdd.js             # Modal de criação rápida
├── notificationService.js  # Notificações locais (browser)
├── pushService.js          # Web Push (app fechado)
├── pwa.js                  # Registro do Service Worker e botão de instalação
├── service-worker.js       # Cache offline + Push handler
├── manifest.webmanifest    # PWA manifest
├── config.example.js       # Template de configuração (copiar → config.js)
├── package.json            # Scripts de teste
├── CHANGELOG.md            # Histórico de versões
├── icons/                  # Ícones PWA (72px a 512px)
├── sql/                    # Migrations do banco de dados
├── supabase/functions/     # Edge Function de push notifications
├── tests/                  # Testes automatizados
│   ├── utils.test.js       # 30 testes para utilitários
│   └── recurrence.test.js  # 16 testes para lógica de recorrência
└── docs/                   # Documentação detalhada
    ├── ARQUITETURA.md
    ├── BANCO_DE_DADOS.md
    ├── ROADMAP.md
    └── VISAO_DO_PRODUTO.md
```

---

## Configuração e Deploy

### 1. Clonar e configurar

```bash
git clone https://github.com/andressamendes/medagenda.git
cd medagenda
cp config.example.js config.js
# Editar config.js com suas credenciais do Supabase
```

### 2. Configurar o Supabase

1. Criar um projeto em [supabase.com](https://supabase.com)
2. Executar os scripts SQL na ordem:
   - `sql/02_categories.sql`
   - `sql/03_recurrence.sql`
   - `sql/04_push_notifications.sql`
3. Copiar a **URL do projeto** e a **chave anon** para `config.js`

### 3. Push Notifications (opcional)

Consulte `docs/ARQUITETURA.md` para instruções de configuração do VAPID e deploy da Edge Function.

### 4. Deploy no GitHub Pages

O deploy é automático ao fazer push para `main`. O app é servido diretamente como site estático — nenhum build necessário.

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

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — arquitetura técnica
- [`docs/BANCO_DE_DADOS.md`](docs/BANCO_DE_DADOS.md) — schema do banco de dados
- [`docs/VISAO_DO_PRODUTO.md`](docs/VISAO_DO_PRODUTO.md) — visão e princípios do produto
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — próximas versões planejadas
- [`CHANGELOG.md`](CHANGELOG.md) — histórico de versões

---

## Versão

**v1.0.0-rc1** — Release Candidate 1

---

## Licença

MIT © andressamendes
