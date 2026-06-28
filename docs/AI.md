# AI Gateway — Documentação Técnica

## Visão Geral

A MedAgenda implementa uma camada de IA desacoplada que permite adicionar futuros provedores (OpenAI, OpenRouter, Groq, Ollama) sem alterar o restante do sistema.

**Princípio fundamental:** Nenhuma chamada direta à API de IA é feita a partir do frontend. Todo tráfego passa pela Edge Function `ai-chat`.

---

## Arquitetura

```
Frontend (browser)
    │
    ▼
aiService.js          ← ponto de entrada único
    │
    ▼
geminiProvider.js     ← implementação do provedor
    │  (HTTPS + JWT)
    ▼
Supabase Edge Function: ai-chat
    │  (HTTPS + API Key)
    ▼
Google Gemini API
```

### Estrutura de arquivos

```
services/
  ai/
    aiService.js              ← gateway público (única API exportada)
    providers/
      geminiProvider.js       ← chama a Edge Function
    prompts/
      weeklySummary.js        ← prepara dados: resumo da semana
      studySuggestion.js      ← prepara dados: sugestão de estudos
      scheduleAnalysis.js     ← prepara dados: análise de conflitos
    parsers/
      responseParser.js       ← normaliza resposta do LLM

config/
  ai.js                       ← configurações (sem chaves)

supabase/
  functions/
    ai-chat/
      index.ts                ← Edge Function (proxy seguro)

docs/
  AI.md                       ← este arquivo
```

---

## Dois Modos de Operação

### Modo Inteligência Local (padrão)
Análises puramente locais, sem custo e sem dados saindo do dispositivo:
- Detecção de conflitos de horário
- Alerta de plantões longos e consecutivos
- Identificação de dias sobrecarregados
- Sugestão de dias livres para estudo

Implementado em `smartAssistant.js` — sem dependência de IA.

### Modo IA (Gemini)
Tarefas que exigem linguagem natural:
- Resumo narrativo da semana
- Sugestão personalizada de horários de estudo
- Análise explicativa de conflitos e carga

---

## Edge Function: ai-chat

### Responsabilidades
1. Valida o token JWT do usuário autenticado
2. Valida e sanitiza a entrada
3. Constrói o prompt adequado ao tipo de análise
4. Encaminha a requisição ao Gemini
5. Retorna a resposta formatada
6. Registra métricas básicas (sem conteúdo das conversas)

### Endpoint
```
POST {SUPABASE_URL}/functions/v1/ai-chat
Authorization: Bearer {JWT_DO_USUARIO}
Content-Type: application/json
```

### Corpo da requisição
```json
{
  "type": "weekly_summary" | "study_suggestion" | "schedule_analysis",
  "events": [...],
  "weekStart": "YYYY-MM-DD",
  "weekEnd":   "YYYY-MM-DD"
}
```

### Resposta de sucesso
```json
{
  "text": "Texto gerado pelo Gemini...",
  "ms": 1234
}
```

### Erros tratados
| Código | Significado |
|--------|-------------|
| 400 | Entrada inválida |
| 401 | Token ausente ou inválido |
| 429 | Rate limit do Gemini atingido |
| 502 | Erro na API do Gemini |
| 503 | `GEMINI_API_KEY` não configurada |
| 500 | Erro interno inesperado |

---

## Configuração

### Variáveis de ambiente no Supabase

```bash
supabase secrets set GEMINI_API_KEY="sua-chave-aqui"
```

A chave de API do Gemini **nunca** deve ser exposta no frontend.

### Deploy da Edge Function

```bash
supabase functions deploy ai-chat
```

### Obter uma chave Gemini gratuita
1. Acesse [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Crie uma chave de API
3. Configure no Supabase como descrito acima

---

## Modelo utilizado

**`gemini-1.5-flash`** — modelo gratuito recomendado pelo Google para produção.
- Rápido e econômico
- Suporta contexto de 1 milhão de tokens
- Tier gratuito: 15 RPM, 1.500 req/dia

---

## Troca de Provedores

Para adicionar um novo provedor (ex: OpenAI):

1. Crie `services/ai/providers/openaiProvider.js` exportando `async function callOpenAI(payload)`
2. Registre em `services/ai/aiService.js`:
   ```js
   import { callOpenAI } from './providers/openaiProvider.js';
   const PROVIDERS = { gemini: callGemini, openai: callOpenAI };
   ```
3. Altere `config/ai.js`:
   ```js
   provider: 'openai'
   ```
4. Ajuste a Edge Function para rotear para o provedor correto

O restante do sistema permanece inalterado.

---

## Privacidade e Segurança

- Apenas título, data, hora, duração e categoria são enviados ao Gemini
- Campos como `description`, `location` (exceto resumo semanal) e IDs não são enviados
- Máximo de 500 eventos por requisição
- O usuário precisa estar autenticado para qualquer chamada
- Nenhum conteúdo de conversa é armazenado no banco de dados
- Apenas métricas agregadas são registradas (tipo, duração, sucesso/erro)

---

## Custos Estimados

Com o tier gratuito do Gemini 1.5 Flash:
- 1.500 requisições por dia gratuitas
- Para uma base de 100 usuários ativos, ~15 req/usuário/dia → dentro do free tier
- Para escalar além do free tier: ~$0,075 por 1M tokens de entrada

---

## Logs e Métricas

A Edge Function registra via `console.log`:
```
[ai-chat] type=weekly_summary user=uuid status=200 ms=1234
```

Métricas disponíveis na tabela `ai_metrics` (opcional, ver `sql/08_ai_metrics.sql`):
- `prompt_type`: tipo de análise solicitada
- `duration_ms`: tempo de resposta em milissegundos
- `success`: se a chamada foi bem-sucedida
- `error_code`: código do erro, se houver

**Não é registrado:** conteúdo das conversas, eventos do usuário, respostas do Gemini.
