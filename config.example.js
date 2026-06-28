// Copie este arquivo para config.js e preencha com suas credenciais.
// Nunca versione o config.js — ele está listado no .gitignore.
//
// Para deploy no GitHub Pages, configure os segredos no repositório:
//   Settings → Secrets and variables → Actions → New repository secret
//   - SUPABASE_URL
//   - SUPABASE_ANON_KEY
//   - VAPID_PUBLIC_KEY  (opcional — deixe vazio para desativar Push)
//
// O workflow .github/workflows/deploy.yml gera config.js automaticamente.

export const SUPABASE_URL      = "https://your-project-id.supabase.co";
export const SUPABASE_ANON_KEY = "your-anon-key-here";

// URL base do app — usada nos links de e-mail de confirmação, redefinição de
// senha e alteração de e-mail. Deve apontar para onde o usuário final acessa
// o app, NÃO para o servidor de desenvolvimento local.
//
// Desenvolvimento local: ajuste para a porta que você usa (ex: 8080, 3000).
// Produção (GitHub Pages): o deploy.yml define automaticamente como
//   https://andressamendes.github.io/MedAgenda/
//
// IMPORTANTE: esta URL também precisa estar na lista "Redirect URLs" do
// Supabase Dashboard em Authentication → URL Configuration.
export const APP_URL           = "http://localhost:8080";

// VAPID public key — necessária para Notificações Push.
// Gere as chaves com: npx web-push generate-vapid-keys
// - Cole a chave PÚBLICA aqui.
// - Adicione a chave PRIVADA como segredo no Supabase:
//     supabase secrets set VAPID_PRIVATE_KEY="sua-chave-privada"
//     supabase secrets set VAPID_PUBLIC_KEY="sua-chave-publica"
//     supabase secrets set VAPID_SUBJECT="mailto:seu@email.com"
// Deixe como string vazia para desativar Push Notifications.
export const VAPID_PUBLIC_KEY  = "";
