-- Etapa 19: AI Gateway — tabela de métricas básicas (opcional)
-- Registra chamadas à IA sem armazenar conteúdo das conversas.

create table if not exists public.ai_metrics (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  prompt_type  text not null,
  duration_ms  int,
  success      boolean not null default true,
  error_code   text,
  created_at   timestamptz not null default now()
);

alter table public.ai_metrics enable row level security;

-- Usuário só acessa suas próprias métricas
create policy "ai_metrics_select_own"
  on public.ai_metrics for select
  using (auth.uid() = user_id);

-- Inserção feita via Service Role na Edge Function (sem policy insert para anon)
