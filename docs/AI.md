# Assistente IA

## Visão Geral

O Assistente IA do MedAgenda é um módulo opcional, que utiliza um modelo de linguagem (Google Gemini) para gerar textos em linguagem natural a partir da agenda do usuário. Ele não substitui o "Assistente Inteligente" local (`smartAssistant.js`), que roda inteiramente no navegador, sem custo e sem enviar dados a serviços externos — os dois convivem no aplicativo com propósitos distintos.

### Objetivo

Oferecer ao estudante de medicina três análises narrativas de sua agenda, redigidas em português, que seriam difíceis de expressar apenas com regras determinísticas:

- um resumo textual da semana atual;
- sugestões de horários específicos para estudo nos próximos 14 dias;
- uma análise textual de conflitos e sobrecarga nos próximos 30 dias.

### Funcionalidades atuais

O módulo expõe exatamente três operações, cada uma acionada por um botão no Painel IA (`aiPanelView.js`):

| Ação no painel | Função chamada | Janela de dados analisada |
|---|---|---|
| "Resumo da semana" | `getWeeklySummary()` | Semana atual (segunda a domingo) |
| "Horários para estudo" | `getStudySuggestion()` | Próximos 14 dias |
| "Análise da agenda" | `getScheduleAnalysis()` | Próximos 30 dias |

Não há chat livre, não há memória de conversas anteriores e não há histórico persistido — cada clique é uma chamada isolada e sem estado.

### Limitações

- Apenas três tipos fixos de prompt existem; não há entrada de texto livre do usuário.
- Nenhuma conversa é mantida entre chamadas (sem contexto acumulado).
- O texto retornado é sempre em português e não é passível de configuração pelo usuário final.
- A resposta depende inteiramente da disponibilidade da API do Google Gemini.
- Não existe cache de respostas: toda ação reprocessa os eventos e chama a IA novamente.

### Arquitetura

O módulo segue um princípio único: **o frontend nunca fala diretamente com a API do Gemini**. Toda a comunicação passa por uma Edge Function do Supabase, que é a única parte do sistema que possui a chave de API do Gemini.

---

## Arquitetura Geral

```
Usuário
  │  (clica em um botão do Painel IA)
  ▼
Painel IA (aiPanelView.js)
  │  (chama uma função pública)
  ▼
aiService.js
  │  (monta o payload e seleciona o provedor configurado)
  ▼
Gemini Provider (services/ai/providers/geminiProvider.js)
  │  (HTTPS + JWT do usuário autenticado)
  ▼
Edge Function (supabase/functions/ai-chat)
  │  (HTTPS + GEMINI_API_KEY, mantida em segredo no servidor)
  ▼
Gemini API (Google)
  │
  ▼
Resposta (texto em linguagem natural)
```

### Explicação de cada etapa

1. **Usuário** — clica em uma das três ações do Painel IA.
2. **Painel IA** — busca os eventos do usuário via `getEvents()` e delega o processamento a uma das três funções do `aiService.js`.
3. **aiService.js** — é o único ponto de entrada que o restante da aplicação deve usar para falar com a IA. Prepara os dados (por meio dos módulos em `prompts/`) e invoca o provedor configurado em `config/ai.js`.
4. **Gemini Provider** — implementa o contrato de "provedor de IA": recebe um payload genérico, autentica a chamada com o token de sessão do Supabase e faz a requisição HTTP para a Edge Function.
5. **Edge Function (`ai-chat`)** — roda no servidor (Deno, ambiente do Supabase). Valida o JWT, valida a entrada, monta o prompt final em texto e chama a API do Gemini usando a chave secreta.
6. **Gemini API** — processa o prompt e devolve o texto gerado.
7. **Resposta** — o texto retorna pela mesma cadeia até o Painel IA, passando por um normalizador (`responseParser.js`) antes de ser exibido.

---

## Estrutura dos Arquivos

```
config/
  ai.js                         → configuração estática do módulo (provider, modelo, limites)

services/ai/
  aiService.js                  → gateway público; única API que o resto do app deve importar
  providers/
    geminiProvider.js           → chama a Edge Function; trata erros de rede/HTTP; define AIError
  prompts/
    weeklySummary.js            → recorta e formata eventos da semana atual
    studySuggestion.js          → recorta e formata eventos dos próximos 14 dias
    scheduleAnalysis.js         → recorta e formata eventos dos próximos 30 dias
  parsers/
    responseParser.js           → limpa marcações de markdown da resposta do modelo

supabase/functions/ai-chat/
  index.ts                      → Edge Function: autenticação, validação, montagem do prompt final,
                                   chamada à API do Gemini e tratamento de erros
```

### Responsabilidade de cada parte

- **`config/ai.js`** — centraliza os parâmetros do módulo (`provider`, `model`, `temperature`, `maxTokens`, `timeout`). Não contém nenhuma credencial.
- **`services/ai/aiService.js`** — é o "gateway": mapeia o nome do provedor configurado para a função de chamada correspondente (hoje, apenas `gemini`), orquestra a preparação do payload e a normalização da resposta. Nenhum outro módulo do frontend deve importar diretamente um provider.
- **`services/ai/providers/`** — cada arquivo aqui implementa o contrato de um provedor específico (hoje, só o Gemini). É responsável por autenticação do usuário, timeout da requisição e tradução de códigos HTTP em erros de aplicação (`AIError`).
- **`services/ai/prompts/`** — cada arquivo prepara os dados de entrada (não o texto do prompt em si) para um tipo de análise: filtra o intervalo de datas relevante, expande eventos recorrentes (`recurrence.js`) e remove campos desnecessários antes de enviar ao servidor.
- **Edge Function `ai-chat`** — é a única peça do sistema que efetivamente monta o texto do prompt em linguagem natural e possui a chave de API do Gemini. Roda fora do navegador, no ambiente do Supabase.

---

## Fluxo Completo

```
Clique do usuário no Painel IA
        ↓
Painel IA carrega os eventos (getEvents()) e chama getWeeklySummary /
getStudySuggestion / getScheduleAnalysis
        ↓
aiService.js prepara o payload (prompts/*.js) — filtra e formata eventos
        ↓
Gemini Provider anexa o token JWT da sessão e faz POST à Edge Function,
com timeout de 30s
        ↓
Edge Function valida o JWT e o corpo da requisição, monta o texto final
do prompt e chama a API do Gemini com a chave secreta
        ↓
Gemini gera o texto de resposta
        ↓
Edge Function devolve { text, ms } ao frontend
        ↓
Gemini Provider trata códigos de erro HTTP, se houver, e retorna o texto
        ↓
responseParser.js remove marcações de markdown (títulos, negrito, listas)
        ↓
Painel IA renderiza o texto final na tela
```

---

## Configuração

Definida em `config/ai.js`:

```js
export const AI_CONFIG = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  temperature: 0.7,
  maxTokens: 1024,
  timeout: 30000,
};
```

| Parâmetro | Valor atual | Finalidade |
|---|---|---|
| `provider` | `'gemini'` | Seleciona qual função de `PROVIDERS` (em `aiService.js`) será usada para todas as chamadas de IA. |
| `model` | `'gemini-2.5-flash'` | Modelo do Gemini enviado à Edge Function; a Edge Function usa o mesmo valor como padrão (`'gemini-2.5-flash'`) caso o payload não o informe. |
| `temperature` | `0.7` | Controla a aleatoriedade/criatividade do texto gerado; repassado à `generationConfig` da chamada ao Gemini. |
| `maxTokens` | `1024` | Limite máximo de tokens de saída (`maxOutputTokens`), evitando respostas excessivamente longas. |
| `timeout` | `30000` (30s) | Tempo máximo que o `geminiProvider.js` aguarda pela Edge Function antes de abortar a requisição (via `AbortController`). |

Esses quatro valores (`model`, `temperature`, `maxTokens`) são enviados no corpo da requisição a cada chamada; a Edge Function os aceita como opcionais e usa valores padrão próprios se ausentes.

---

## Prompts

Existem três tipos de prompt, identificados pelo campo `type` do payload. A montagem acontece em duas camadas:

1. **Camada de preparação de dados** (`services/ai/prompts/*.js`, executada no frontend): define a janela de datas, expande eventos recorrentes e reduz cada evento a um subconjunto de campos (título, data, hora, duração, categoria e, em um caso, local).
2. **Camada de montagem do texto** (`supabase/functions/ai-chat/index.ts`, executada no servidor): recebe os eventos já filtrados e constrói a string final enviada ao Gemini, com instruções de persona, formato de saída e limite de palavras.

### `weekly_summary`
- **Objetivo:** gerar um resumo textual da semana atual, destacando carga de trabalho e distribuição de atividades.
- **Quando é usado:** botão "Resumo da semana" do Painel IA.
- **Como é montado:** `prepareWeeklySummary()` recorta a semana corrente (segunda a domingo); a Edge Function lista os eventos com data, hora, título, categoria, duração e local, e instrui o modelo a responder em até 200 palavras, em tom encorajador.

### `study_suggestion`
- **Objetivo:** sugerir horários concretos para estudo, aproveitando lacunas na agenda.
- **Quando é usado:** botão "Horários para estudo" do Painel IA.
- **Como é montado:** `prepareStudySuggestion()` recorta os próximos 14 dias; a Edge Function pede de 3 a 5 sugestões concretas de dia/horário, evitando horários noturnos tardios após plantões, em até 200 palavras.

### `schedule_analysis`
- **Objetivo:** identificar conflitos de horário, sobrecarga e riscos de esgotamento, com sugestões de ajuste.
- **Quando é usado:** botão "Análise da agenda" do Painel IA.
- **Como é montado:** `prepareScheduleAnalysis()` recorta os próximos 30 dias; a Edge Function pede uma resposta estruturada cobrindo conflitos, excesso de carga, risco de esgotamento e sugestões, em até 250 palavras.

Em todos os três casos, o texto integral do prompt (a persona e as instruções) só existe no código da Edge Function — o frontend nunca constrói nem vê o prompt final, apenas os dados que o alimentam.

---

## Edge Function

A Edge Function `ai-chat` (`supabase/functions/ai-chat/index.ts`) é o único componente do sistema com acesso à chave da API do Gemini.

### Autenticação e JWT

1. Exige um cabeçalho `Authorization: Bearer <token>`; sem ele, responde `401`.
2. Cria um cliente Supabase autenticado com esse token e chama `supabase.auth.getUser()` para validar a sessão; se o token for inválido ou expirado, responde `401`.
3. Não há verificação adicional de papel/permissão (RBAC) — qualquer usuário autenticado pode usar as três ações.

### Secrets

- `SUPABASE_URL` e `SUPABASE_ANON_KEY` — usadas para instanciar o cliente Supabase que valida o JWT do usuário.
- `GEMINI_API_KEY` — a chave da API do Gemini, lida via `Deno.env.get`. Se ausente, a função responde `503` sem tentar contatar o Gemini.

Nenhuma dessas variáveis é exposta ao navegador; todas vivem apenas no ambiente de execução da Edge Function.

### Requisição

```
POST {SUPABASE_URL}/functions/v1/ai-chat
Authorization: Bearer {JWT do usuário}
Content-Type: application/json

{
  "type": "weekly_summary" | "study_suggestion" | "schedule_analysis",
  "events": [ { title, date, start_time?, duration_minutes?, category?, location? }, ... ],
  "weekStart"?, "weekEnd"?, "rangeStart"?, "rangeEnd"?,
  "model"?, "temperature"?, "maxTokens"?
}
```

Validações aplicadas, em ordem:
- corpo precisa ser um JSON válido;
- `type` precisa ser um dos três valores aceitos;
- `events` precisa ser um array;
- `events` não pode ter mais de 500 itens.

### Resposta de sucesso

```json
{ "text": "texto gerado pelo Gemini...", "ms": 1234 }
```

### Tratamento de erros

A função devolve sempre um JSON `{ "error": "mensagem em português" }` com o código HTTP correspondente:

| Código | Situação | Origem |
|---|---|---|
| 400 | Corpo inválido, `type` inválido, `events` não é array, ou mais de 500 eventos | Validação de entrada, na própria Edge Function |
| 401 | Cabeçalho `Authorization` ausente ou sessão inválida/expirada | Validação de JWT, na própria Edge Function |
| 429 | Gemini retornou `429` (limite de requisições) | Repassado da API do Gemini |
| 502 | Gemini retornou qualquer outro erro HTTP, ou devolveu uma resposta vazia | Repassado/traduzido da API do Gemini |
| 503 | `GEMINI_API_KEY` não configurada, ou Gemini retornou `401`/`403` (chave inválida) | Configuração ausente ou falha de autenticação com o Gemini |
| 500 | Qualquer exceção não tratada no bloco principal | `catch` genérico da função |

Não há tratamento explícito de `403`, `404` ou "modelo inexistente" como categorias próprias: um `403` do Gemini é absorvido pelo mesmo tratamento do `401` (vira `503`); um modelo inválido ou inexistente cai no branch genérico `!geminiRes.ok` (vira `502`). Não há retentativas automáticas (retry) em nenhum caso.

No lado do cliente (`geminiProvider.js`), o `AbortController` gera um erro de `TIMEOUT` após 30 segundos sem resposta, e falhas de rede (sem resposta HTTP alguma) geram um erro de `NETWORK`. Uma resposta HTTP `200` sem o campo `text` gera um erro de `EMPTY_RESPONSE`.

---

## Tratamento de Erros

Visão consolidada de como cada situação é tratada ao longo da cadeia (Edge Function → `geminiProvider.js` → interface):

| Situação | Onde é detectada | Código HTTP | Como é exposta ao usuário |
|---|---|---|---|
| Corpo/tipo/lista de eventos inválidos | Edge Function | 400 | Mensagem de erro específica retornada em `error`, exibida como resultado da ação |
| Token ausente | Edge Function | 401 | `geminiProvider.js` converte em `AIError('Sessão expirada...', 'AUTH')` |
| Sessão do Supabase inválida (frontend) | `geminiProvider.js`, antes mesmo da requisição | — | `AIError('Usuário não autenticado.', 'AUTH')` |
| Token expirado/369 revogado | Edge Function | 401 (também tratado como 403 no cliente) | `AIError('Sessão expirada...', 'AUTH')` |
| Limite de requisições do usuário | Edge Function repassa do Gemini | 429 | `AIError('Limite de requisições atingido...', 'RATE_LIMIT')` |
| Erro genérico do Gemini / modelo inexistente | Edge Function | 502 | `AIError` com a mensagem retornada pelo servidor, código `'API_ERROR'` |
| `GEMINI_API_KEY` ausente ou inválida | Edge Function | 503 | `AIError('...temporariamente indisponível...', 'UNAVAILABLE')` |
| Erro interno inesperado | Edge Function | 500 | `AIError` com a mensagem do servidor, código `'API_ERROR'` |
| Timeout de 30s no cliente | `geminiProvider.js` (`AbortController`) | — (sem resposta) | `AIError('...excedeu o tempo limite...', 'TIMEOUT')` |
| Falha de rede/conexão | `geminiProvider.js` | — (sem resposta) | `AIError('Não foi possível conectar...', 'NETWORK')` |
| Resposta `200` sem texto | `geminiProvider.js` | 200 | `AIError('...resposta vazia...', 'EMPTY_RESPONSE')` |
| Falha ao carregar eventos do banco (antes de chamar a IA) | `aiPanelView.js` | — | Mensagem fixa de erro de conexão, sem chamar a IA |

Em todos os casos, o Painel IA (`aiPanelView.js`) captura a exceção em um `try/catch` e exibe `err.message` (ou uma mensagem genérica de fallback) diretamente na área de resultado — não há reformatação adicional de erro na interface.

---

## Segurança

- **`GEMINI_API_KEY`** nunca é enviada ao navegador; existe apenas como variável de ambiente (`secret`) da Edge Function, lida via `Deno.env.get("GEMINI_API_KEY")`.
- **Secrets do Supabase** (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GEMINI_API_KEY`) ficam configuradas no ambiente de execução da Edge Function, fora do controle de versão.
- **Edge Function** age como proxy exclusivo entre o frontend e o Gemini: nenhuma chamada à API do Google é feita fora desse contexto.
- **JWT**: toda requisição precisa de um `Authorization: Bearer <token>` válido, verificado contra o Supabase Auth (`supabase.auth.getUser()`) antes de qualquer processamento.
- **Proteção da chave**: por não trafegar pelo cliente, a chave do Gemini não pode ser extraída via inspeção do navegador, interceptação de tráfego do frontend ou engenharia reversa do bundle JS.
- **RLS (Row Level Security)**: a tabela `ai_metrics` (`sql/08_ai_metrics.sql`, colunas adicionais em `sql/10_ai_metrics_observability.sql`) tem RLS habilitada, com uma política que permite a cada usuário `select` apenas suas próprias linhas (`auth.uid() = user_id`); não há política de `insert` para o papel anônimo — apenas o papel de serviço grava métricas nela, o que a Edge Function `ai-chat` faz a cada chamada.
- **Dados registrados em `ai_metrics`**: apenas metadados operacionais (tipo de prompt, modelo, duração, status HTTP, sucesso/falha, código e resumo curto de erro) — nunca o conteúdo do prompt, a resposta da IA, o JWT ou qualquer dado pessoal, preservando a LGPD.
- **Limite de payload**: no máximo 500 eventos por requisição, reduzindo superfície de abuso e custo de tokens.

---

## Fluxo de Dados

```
Agenda do usuário (eventos brutos, via getEvents())
        ↓
Expansão de recorrência (recurrence.js) + recorte por janela de datas
        ↓
Redução de campos (título, data, hora, duração, categoria, local)
        ↓
Prompt (montado na Edge Function, a partir dos eventos filtrados)
        ↓
Gemini (gemini-2.5-flash)
        ↓
Texto de resposta (JSON: { text, ms })
        ↓
responseParser.js (remoção de markdown)
        ↓
Frontend (renderização no Painel IA)
```

---

## Boas Práticas

- Todo o restante da aplicação interage com a IA exclusivamente através de `aiService.js` — nenhum outro módulo importa um provider diretamente.
- Adicionar um novo provedor de IA exige apenas: um novo arquivo em `providers/`, uma entrada no mapa `PROVIDERS` de `aiService.js` e a troca do valor de `provider` em `config/ai.js`.
- A chave de API nunca é distribuída ao cliente; toda chamada externa passa por uma Edge Function autenticada.
- Os dados enviados à IA são reduzidos ao mínimo necessário (sem IDs internos, sem descrição livre do evento) antes de saírem do frontend.
- Cada chamada é isolada (sem estado/memória entre requisições), o que simplifica o raciocínio sobre custo, privacidade e cache.
- Erros são sempre traduzidos para mensagens em português, amigáveis ao usuário final, mantendo um código interno (`AIError.code`) para depuração.

---

## Limitações

- Não existe interface de chat livre; apenas os três tipos fixos de prompt (`weekly_summary`, `study_suggestion`, `schedule_analysis`).
- Não há memória de conversas: cada ação é uma chamada isolada e sem contexto de interações anteriores.
- Não há mecanismo de retry automático em caso de falha temporária do Gemini ou de rede.
- Não há cache de respostas: o mesmo pedido repetido gera uma nova chamada e um novo custo.
- O timeout de 30 segundos é aplicado apenas no cliente; a Edge Function não impõe um timeout próprio na chamada ao Gemini.
- O texto de saída é sempre em português e no formato de texto simples (após remoção de markdown), sem opção de formato estruturado (ex: JSON) para o consumo do frontend.
- O limite de 500 eventos por requisição pode truncar análises de agendas muito extensas (a validação apenas rejeita a requisição com erro 400, sem paginação ou resumo automático).

---

## Auditoria

Pontos verificados na implementação atual:

- **Configuração do modelo**: `config/ai.js` define `model: 'gemini-2.5-flash'`; a Edge Function usa o mesmo valor (`'gemini-2.5-flash'`) como padrão quando o payload não especifica um modelo. Os dois estão consistentes entre si.
- **Provider**: `config/ai.js` define `provider: 'gemini'`; `aiService.js` possui apenas uma entrada no mapa `PROVIDERS` (`gemini: callGemini`), portanto não há caminho de código morto para outros provedores ainda não implementados.
- **Edge Function**: implementa autenticação, validação de entrada, montagem de prompt e chamada ao Gemini em um único arquivo (`index.ts`), sem separação em módulos menores.
- **Tratamento de erros**: os códigos `401`/`403` retornados pela própria API do Gemini são ambos convertidos em `503` pela Edge Function, enquanto o cliente (`geminiProvider.js`) trata `401`/`403` vindos da Edge Function como erro de autenticação (`AUTH`). Não há um código de erro dedicado para "modelo inexistente" — esse caso é absorvido pelo tratamento genérico de erro (`502`).
- **Timeout**: existe apenas no lado do cliente (`AI_CONFIG.timeout`, 30s via `AbortController`); a chamada da Edge Function à API do Gemini não define um timeout próprio.
- **Integração frontend/backend**: o payload trafega os parâmetros `model`, `temperature` e `maxTokens` do frontend para a Edge Function a cada chamada, em vez de a Edge Function ler esses valores apenas de sua própria configuração — ou seja, o cliente pode, em tese, sobrescrever esses parâmetros.
- **Tabela `ai_metrics`** (Resolvido — Auditoria A2.2): definida em `sql/08_ai_metrics.sql`, com RLS e política de leitura por usuário; `sql/10_ai_metrics_observability.sql` acrescentou `model`, `http_status` e `error_message`. Além do `console.log` (`[ai-chat] type=... user=... status=... ms=...`), `index.ts` agora insere uma linha por chamada em `ai_metrics` via `service_role`, em background (`EdgeRuntime.waitUntil`), cobrindo sucesso, erros do Gemini, erro interno e erro de autenticação com o provedor — sem alterar prompts, payload ou respostas da API.
- **`smartAssistant.js`**: módulo de análise local baseado em regras, totalmente independente da IA (não importa nada de `services/ai/`), coexistindo no mesmo aplicativo mas fora do escopo deste documento além desta menção.

Nenhuma alteração de código foi feita a partir destas observações — elas estão documentadas apenas para registro.

---

## Estado Atual

- **Provider atual:** `gemini` (único provedor implementado em `services/ai/providers/`).
- **Modelo atual:** `gemini-2.5-flash`, definido em `config/ai.js` e replicado como padrão na Edge Function.
- **Arquitetura consolidada:** Painel IA → `aiService.js` → `geminiProvider.js` → Edge Function `ai-chat` → API do Gemini, com a chave de API isolada inteiramente no ambiente da Edge Function.
- **Integrações:** autenticação via Supabase Auth (JWT), leitura de eventos via `getEvents()`/`recurrence.js`, e uma tabela de métricas (`ai_metrics`) alimentada a cada chamada pela própria Edge Function.
- **Avaliação geral:** o módulo cumpre o princípio de isolamento de chave e responsabilidade única (`aiService.js` como gateway) de forma consistente. A lacuna de observabilidade (ausência de escrita em `ai_metrics`) foi resolvida na Auditoria A2.2. As lacunas remanescentes (ausência de timeout no servidor, sobreposição de tratamento de erros `401`/`403`) são limitadas em escopo e não comprometem a segurança da chave de API, que permanece corretamente confinada ao backend.
