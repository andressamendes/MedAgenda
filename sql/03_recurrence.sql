-- Execute no SQL Editor do Supabase
-- Etapa 9: adiciona colunas de recorrência na tabela events existente

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS recurrence_interval     INTEGER,
  ADD COLUMN IF NOT EXISTS recurrence_until        DATE,
  ADD COLUMN IF NOT EXISTS recurrence_days_of_week TEXT;
