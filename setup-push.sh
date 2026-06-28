#!/usr/bin/env bash
# MedAgenda — Setup de Push Notifications
# Execute este script localmente após instalar o Supabase CLI.
# Pré-requisito: supabase login (ou SUPABASE_ACCESS_TOKEN definido)

set -e

PROJECT_REF="ofqlstebdvkgrhzzklqc"
VAPID_PUBLIC_KEY="BPJiFUY6a2u8PNz2xW3CHKFbNjtnEH5IGPtkztdAcKV50WNQ-gA_r2W5xBdJzCz3CPQg5xGb0Eoeyh_rsy79gHM"
VAPID_SUBJECT="mailto:souza.andressam@gmail.com"

# A chave privada deve ser gerada uma única vez e guardada com segurança.
# Se você já tem a chave privada, cole-a abaixo.
# Caso contrário, gere com: npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY="${VAPID_PRIVATE_KEY:-}"

if [ -z "$VAPID_PRIVATE_KEY" ]; then
  echo ""
  echo "ATENÇÃO: VAPID_PRIVATE_KEY não definida."
  echo "Execute: export VAPID_PRIVATE_KEY='SUA_CHAVE_PRIVADA_AQUI'"
  echo "Depois rode este script novamente."
  echo ""
  exit 1
fi

echo "==> [1/4] Configurando segredos VAPID no Supabase..."
supabase secrets set \
  VAPID_PUBLIC_KEY="$VAPID_PUBLIC_KEY" \
  VAPID_PRIVATE_KEY="$VAPID_PRIVATE_KEY" \
  VAPID_SUBJECT="$VAPID_SUBJECT" \
  --project-ref "$PROJECT_REF"
echo "    ✓ Segredos configurados."

echo ""
echo "==> [2/4] Fazendo deploy da Edge Function..."
supabase functions deploy send-push-notifications \
  --project-ref "$PROJECT_REF"
echo "    ✓ Edge Function deployada."

echo ""
echo "==> [3/4] Rodando migration SQL..."
supabase db execute \
  --file "$(dirname "$0")/sql/04_push_notifications.sql" \
  --project-ref "$PROJECT_REF"
echo "    ✓ Tabelas push_subscriptions e notification_logs criadas."

echo ""
echo "==> [4/4] Configurando agendamento (pg_cron)..."
SERVICE_ROLE_KEY=$(supabase projects api-keys --project-ref "$PROJECT_REF" --json 2>/dev/null | \
  python3 -c "import json,sys; keys=json.load(sys.stdin); print(next(k['api_key'] for k in keys if k['name']=='service_role'))" 2>/dev/null || echo "")

if [ -n "$SERVICE_ROLE_KEY" ]; then
  supabase db execute \
    --project-ref "$PROJECT_REF" \
    --command "
SELECT cron.schedule(
  'medagenda-push-notifications',
  '* * * * *',
  \$\$
    SELECT net.http_post(
      url     := 'https://${PROJECT_REF}.supabase.co/functions/v1/send-push-notifications',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ${SERVICE_ROLE_KEY}'
      ),
      body    := '{}'::jsonb
    ) AS request_id;
  \$\$
);"
  echo "    ✓ Cron configurado (a cada 1 minuto)."
else
  echo "    ⚠ Não foi possível configurar o cron automaticamente."
  echo "    → Faça manualmente pelo Dashboard:"
  echo "      Supabase → Edge Functions → send-push-notifications → Schedule → '* * * * *'"
fi

echo ""
echo "==> Atualizando config.js com VAPID_PUBLIC_KEY..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/config.js" ]; then
  # Atualiza a linha VAPID_PUBLIC_KEY existente
  sed -i "s|export const VAPID_PUBLIC_KEY.*|export const VAPID_PUBLIC_KEY  = \"$VAPID_PUBLIC_KEY\";|" \
    "$SCRIPT_DIR/config.js"
  echo "    ✓ config.js atualizado."
else
  echo "    ⚠ config.js não encontrado — crie-o a partir do config.example.js"
  echo "      e defina VAPID_PUBLIC_KEY = \"$VAPID_PUBLIC_KEY\""
fi

echo ""
echo "================================================"
echo "  Setup concluído! Push Notifications ativas."
echo "================================================"
echo ""
echo "Chaves VAPID em uso:"
echo "  Public : $VAPID_PUBLIC_KEY"
echo "  Subject: $VAPID_SUBJECT"
echo ""
echo "Próximos passos:"
echo "  1. Verifique o cron em: Dashboard → Database → Extensions → pg_cron"
echo "  2. Teste criando um compromisso com lembrete e fechando o app."
