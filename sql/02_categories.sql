-- Execute no SQL Editor do Supabase
-- Requer: 01_events.sql (define update_updated_at)

CREATE TABLE categories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#3b82f6',
  icon       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Impede categorias duplicadas por usuário (case-insensitive)
CREATE UNIQUE INDEX categories_user_name_idx ON categories (user_id, lower(name));
CREATE INDEX categories_user_id_idx ON categories (user_id);

-- Mantém updated_at atualizado (reutiliza a função criada no script de events)
CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own categories"
  ON categories FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own categories"
  ON categories FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own categories"
  ON categories FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own categories"
  ON categories FOR DELETE USING (user_id = auth.uid());
