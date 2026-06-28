# Calendário Acadêmico — MedAgenda

Documentação técnica da funcionalidade de Calendário Acadêmico (Etapa 17).

---

## Objetivo

Permitir que estudantes de Medicina cadastrem calendários acadêmicos institucionais
separados dos seus compromissos pessoais, com suporte a importação/exportação no
padrão iCalendar (.ics).

---

## Modelo de dados

### Tabela `academic_calendars`

| Campo          | Tipo        | Descrição                          |
|----------------|-------------|-------------------------------------|
| `id`           | UUID PK     | Identificador único                 |
| `user_id`      | UUID FK     | Usuário dono do calendário          |
| `name`         | TEXT        | Nome do calendário (obrigatório)    |
| `university`   | TEXT        | Nome da universidade (opcional)     |
| `academic_year`| TEXT        | Ano letivo, ex: "2026" (opcional)   |
| `color`        | TEXT        | Cor hexadecimal (padrão #7c3aed)    |
| `created_at`   | TIMESTAMPTZ | Data de criação                     |
| `updated_at`   | TIMESTAMPTZ | Data da última atualização          |

### Tabela `academic_events`

| Campo         | Tipo        | Descrição                                   |
|---------------|-------------|----------------------------------------------|
| `id`          | UUID PK     | Identificador único                          |
| `calendar_id` | UUID FK     | Calendário ao qual pertence                  |
| `title`       | TEXT        | Título do evento (obrigatório)               |
| `description` | TEXT        | Descrição (opcional)                         |
| `start_date`  | DATE        | Data de início (obrigatório)                 |
| `end_date`    | DATE        | Data de término — inclusive (opcional)       |
| `all_day`     | BOOLEAN     | Se é evento de dia inteiro (padrão: true)    |
| `color`       | TEXT        | Cor do evento (sobrescreve a cor do calendário) |
| `category`    | TEXT        | Categoria: Aula, Prova, Férias…              |
| `location`    | TEXT        | Local (opcional)                             |
| `created_at`  | TIMESTAMPTZ | Data de criação                              |
| `updated_at`  | TIMESTAMPTZ | Data da última atualização                   |

---

## Segurança (RLS)

- `academic_calendars`: políticas diretas via `user_id = auth.uid()`.
- `academic_events`: políticas via subquery — apenas o dono do calendário pode
  ler/escrever seus eventos.

```sql
-- Exemplo de política de leitura para academic_events
CREATE POLICY "Users can view own academic events"
  ON academic_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM academic_calendars
      WHERE id = calendar_id AND user_id = auth.uid()
    )
  );
```

---

## Fluxo do usuário

1. **Criar calendário** — botão "Calendários" no cabeçalho → modal "Calendários Acadêmicos"
   → preencher nome, universidade, ano letivo e cor.

2. **Adicionar evento** — dentro do modal, selecionar "Eventos" em um calendário
   → formulário com título, datas, categoria, cor, local e descrição.

3. **Importar ICS** — dentro da lista de calendários, clicar "Importar ICS"
   → selecionar arquivo `.ics` → duplicatas detectadas e ignoradas automaticamente.

4. **Exportar ICS** — clicar "Exportar ICS" ao lado do calendário desejado
   → download de arquivo `.ics` pronto para importar em Google Calendar, Apple Calendar etc.

5. **Filtros** — barra de filtros no topo da tela principal:
   - ☑ Compromissos pessoais
   - ☑ [Nome de cada calendário acadêmico]
   - Desmarcar um item oculta-o do calendário mensal e da agenda semanal.

---

## Integração com as views

### Calendário mensal

Os eventos acadêmicos são renderizados como chips com a classe `cal-chip-academic`,
visualmente diferenciados pelo estilo de borda e ícone. A cor do chip reflete a cor
do calendário (ou a cor individual do evento, se definida).

```
evento pessoal   → .cal-chip          (fundo sólido, sem borda especial)
evento acadêmico → .cal-chip-academic (borda esquerda + ícone 📚)
```

### Agenda semanal

Eventos acadêmicos de **dia inteiro** aparecem na faixa "Dia todo" acima da grade
horária (`.wk-allday-row`). Eventos acadêmicos com horário aparecem na grade com
a classe `wk-event-academic`.

---

## Importação ICS

### Arquivo: `icsImporter.js`

- **`parseICS(content)`** — analisa o conteúdo ICS e retorna array de objetos evento.
- **`deduplicateEvents(incoming, existing)`** — retorna apenas os eventos novos,
  descartando duplicatas por título + data.

### Campos mapeados

| Campo ICS     | Campo BD        |
|---------------|-----------------|
| SUMMARY       | title           |
| DESCRIPTION   | description     |
| DTSTART       | start_date      |
| DTEND         | end_date        |
| LOCATION      | location        |
| CATEGORIES    | category        |
| COLOR / X-APPLE-CALENDAR-COLOR | color |

- `DTEND` com valor DATE é exclusivo (conforme RFC 5545); o importador subtrai 1 dia.
- Linhas dobradas (folded) são unificadas antes da análise.

---

## Exportação ICS

### Arquivo: `icsExporter.js`

- **`exportToICS(calendar, events)`** — gera string ICS válida (RFC 5545).
- **`downloadICS(content, filename)`** — dispara download no navegador.

### Regras de geração

- Eventos de dia inteiro usam `DTSTART;VALUE=DATE` e `DTEND;VALUE=DATE` (exclusivo).
- Eventos com horário usam `DTSTART:YYYYMMDDTHHmmss`.
- Linhas maiores que 75 bytes são dobradas (folded) conforme RFC 5545 §3.1.
- Cada evento recebe um `UID` único e `DTSTAMP` com o momento da exportação.

---

## Arquivos criados/modificados

| Arquivo                          | Tipo        | Descrição                                      |
|----------------------------------|-------------|------------------------------------------------|
| `sql/07_academic_calendar.sql`   | Novo        | Migration SQL com tabelas e RLS                |
| `academicCalendarService.js`     | Novo        | CRUD de calendários e eventos + expansão       |
| `icsImporter.js`                 | Novo        | Parser de arquivos ICS                         |
| `icsExporter.js`                 | Novo        | Gerador de arquivos ICS                        |
| `academicCalendarView.js`        | Novo        | UI completa: modal, formulários, filtros       |
| `calendar.js`                    | Modificado  | Suporte a provider de eventos acadêmicos       |
| `weekView.js`                    | Modificado  | Faixa "Dia todo" + suporte a eventos acadêmicos|
| `index.html`                     | Modificado  | Botão Calendários + modal + barra de filtros   |
| `script.js`                      | Modificado  | Wiring de providers, filtros e modal           |
| `style.css`                      | Modificado  | Estilos para novos componentes                 |
| `docs/ACADEMIC_CALENDAR.md`      | Novo        | Esta documentação                              |
