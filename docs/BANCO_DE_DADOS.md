# Modelo de Banco de Dados — MedAgenda

## Tabela principal: `events`

Armazena todos os compromissos de todos os usuários. O isolamento entre usuários é garantido pelo RLS com base no campo `user_id`.

---

## Definição dos Campos

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id` | `UUID` | Sim | Identificador único do evento, gerado automaticamente pelo banco (`gen_random_uuid()`) |
| `user_id` | `UUID` | Sim | Referência ao usuário dono do evento (`auth.users.id`). Base para todas as políticas de RLS |
| `title` | `TEXT` | Sim | Título do compromisso (ex: "Plantão UPA", "Aula de Semiologia") |
| `description` | `TEXT` | Não | Descrição opcional com detalhes adicionais do compromisso |
| `event_date` | `DATE` | Sim | Data em que o evento ocorre |
| `start_time` | `TIME` | Não | Horário de início do evento |
| `end_time` | `TIME` | Não | Horário de término do evento |
| `duration_minutes` | `INTEGER` | Não | Duração calculada em minutos (pode ser derivada de `start_time` e `end_time`) |
| `category` | `TEXT` | Sim | Categoria do compromisso. Valores permitidos: `aula`, `plantao`, `ambulatorio`, `laboratorio`, `estudo`, `prova`, `congresso`, `pessoal` |
| `color` | `TEXT` | Não | Cor de destaque do evento em hexadecimal (ex: `#4A90D9`). Permite personalização visual além da categoria |
| `location` | `TEXT` | Não | Local do compromisso (ex: "Hospital das Clínicas", "Sala 302 — Bloco B") |
| `reminder_minutes` | `INTEGER` | Não | Antecedência do lembrete em minutos antes do início do evento (ex: `30`, `60`, `1440`) |
| `recurrence_type` | `TEXT` | Não | Tipo de recorrência do evento. Valores: `none`, `daily`, `weekly`, `monthly`. Padrão: `none` |
| `recurrence_until` | `DATE` | Não | Data limite até quando a recorrência se repete. Ignorado se `recurrence_type` for `none` |
| `created_at` | `TIMESTAMPTZ` | Sim | Data e hora de criação do registro, preenchida automaticamente pelo banco |
| `updated_at` | `TIMESTAMPTZ` | Sim | Data e hora da última atualização, mantida pelo banco via trigger |

---

## Script de criação

```sql
CREATE TABLE events (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title             TEXT          NOT NULL,
  description       TEXT,
  event_date        DATE          NOT NULL,
  start_time        TIME,
  end_time          TIME,
  duration_minutes  INTEGER,
  category          TEXT          NOT NULL,
  color             TEXT,
  location          TEXT,
  reminder_minutes  INTEGER,
  recurrence_type   TEXT          NOT NULL DEFAULT 'none',
  recurrence_until  DATE,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Índices para performance nas consultas mais comuns
CREATE INDEX events_user_id_idx ON events (user_id);
CREATE INDEX events_event_date_idx ON events (event_date);
CREATE INDEX events_user_date_idx ON events (user_id, event_date);

-- Trigger para manter updated_at atualizado automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Ativar RLS
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Users can view own events"
  ON events FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own events"
  ON events FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own events"
  ON events FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own events"
  ON events FOR DELETE
  USING (user_id = auth.uid());
```

---

## Categorias válidas

| Valor no banco | Exibição |
|---|---|
| `aula` | Aula |
| `plantao` | Plantão |
| `ambulatorio` | Ambulatório |
| `laboratorio` | Laboratório |
| `estudo` | Estudo |
| `prova` | Prova |
| `congresso` | Congresso |
| `pessoal` | Pessoal |

---

## Valores de recorrência

| Valor | Comportamento |
|---|---|
| `none` | Evento único, sem repetição |
| `daily` | Repete todos os dias até `recurrence_until` |
| `weekly` | Repete semanalmente no mesmo dia da semana até `recurrence_until` |
| `monthly` | Repete mensalmente na mesma data até `recurrence_until` |

---

## Segurança

- RLS está ativo na tabela `events`
- Nenhuma consulta retorna dados de outro usuário, mesmo sem filtro explícito
- A foreign key `user_id → auth.users(id)` garante integridade referencial com a tabela de autenticação do Supabase
- `ON DELETE CASCADE` garante que todos os eventos de um usuário sejam removidos ao deletar a conta

---

## Etapa 17: Calendários Acadêmicos

### Tabela `academic_calendars`

Cada usuário pode ter múltiplos calendários acadêmicos (Medicina 2026, Internato, Ligas…).

| Campo           | Tipo        | Obrigatório | Descrição                          |
|-----------------|-------------|-------------|-------------------------------------|
| `id`            | UUID        | Sim         | Identificador único                 |
| `user_id`       | UUID        | Sim         | Dono do calendário                  |
| `name`          | TEXT        | Sim         | Nome do calendário                  |
| `university`    | TEXT        | Não         | Nome da universidade                |
| `academic_year` | TEXT        | Não         | Ano letivo (ex: "2026")             |
| `color`         | TEXT        | Sim         | Cor hexadecimal (padrão #7c3aed)    |
| `created_at`    | TIMESTAMPTZ | Sim         | Data de criação                     |
| `updated_at`    | TIMESTAMPTZ | Sim         | Data da última atualização          |

**RLS:** `user_id = auth.uid()` em SELECT/INSERT/UPDATE/DELETE.

---

### Tabela `academic_events`

Eventos associados a um calendário acadêmico. Suportam datas únicas ou intervalos (férias, semestres).

| Campo         | Tipo        | Obrigatório | Descrição                                         |
|---------------|-------------|-------------|---------------------------------------------------|
| `id`          | UUID        | Sim         | Identificador único                               |
| `calendar_id` | UUID FK     | Sim         | Calendário ao qual pertence (CASCADE DELETE)      |
| `title`       | TEXT        | Sim         | Título do evento                                  |
| `description` | TEXT        | Não         | Descrição opcional                                |
| `start_date`  | DATE        | Sim         | Data de início                                    |
| `end_date`    | DATE        | Não         | Data de fim (inclusive); null = evento de 1 dia   |
| `all_day`     | BOOLEAN     | Sim         | Se é evento de dia inteiro (padrão: true)         |
| `color`       | TEXT        | Não         | Cor do evento (sobrescreve a cor do calendário)   |
| `category`    | TEXT        | Não         | Categoria: Aula, Prova, Férias, Rodízio…          |
| `location`    | TEXT        | Não         | Local do evento                                   |
| `created_at`  | TIMESTAMPTZ | Sim         | Data de criação                                   |
| `updated_at`  | TIMESTAMPTZ | Sim         | Data da última atualização                        |

**RLS:** Acesso via subquery — apenas o dono do calendário pode ler/escrever seus eventos.

Script de criação: `sql/07_academic_calendar.sql`
