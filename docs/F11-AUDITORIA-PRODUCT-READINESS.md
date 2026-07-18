# F11 — Auditoria Final de Product Readiness (UX • UI • Front-end)

**Produto:** Anoti — agenda e gestão de estudos para estudantes de Medicina
**Data:** 18/07/2026
**Método:** leitura integral do front-end (index.html, style.css, 60+ módulos JS), execução do app em Chromium (1440×900, 390×844, temas claro/escuro) com captura de telas, e simulação de perfis de uso.
**Escopo:** exclusivamente UX, UI, design, front-end e percepção de qualidade. Nenhuma linha de código foi alterada.

---

## Resumo Executivo

**O Anoti está pronto para ser lançado no mercado? Ainda não — mas está perto.**

A fundação é sólida e acima da média para o estágio: design tokens consistentes, dark mode arquitetado corretamente, acessibilidade (ARIA, focus ring, reduced-motion) levada a sério, skeletons, empty states didáticos e um histórico visível de auditorias UX já aplicadas (F10). A estrutura de navegação é enxuta e o uso de progressive disclosure é deliberado.

O que impede o lançamento não é arquitetura — é **acabamento e identidade**. Três problemas dominam a percepção de "produto em desenvolvimento":

1. **O rebranding para Anoti está incompleto nos pontos mais visíveis.** O ícone do app instalado ainda é o "M" azul genérico com cruz médica do MedAgenda, a URL pública é `/MedAgenda/`, e o wordmark "Anoti" é renderizado em serifa de sistema (Georgia), que muda de aparência por sistema operacional. A primeira coisa que o usuário vê (ícone na home, aba do navegador, tela de login) ainda comunica o produto antigo ou nenhum produto.
2. **A camada de iconografia e ilustração é mista e amadora em pontos-chave.** A sidebar usa ícones SVG de linha consistentes, mas o painel de IA usa emojis (✨ 📚 📋 📅 🔍 💡 📈), os smart cards usam emojis (💡 📌 ⚠️ 🎯 🔁) e os modais/telas de auth usam glifos de texto (✕ ✉ ✓ ⚠). Emoji renderiza diferente em cada plataforma e é o sinal mais rápido de "projeto pessoal".
3. **As telas de leitura (Dashboard, Diário) são feitas só de texto.** Cards de valor sem nenhum elemento gráfico (barra de progresso, anel, sparkline), descrições repetitivas sob cada número, e um painel de filtros do Diário com selects 100% de largura empilhados e uma linha "SOMENTE:" em caixa alta desalinhada. Funciona, mas parece sistema interno.

Nada disso exige mudar regra de negócio. É um trabalho de refinamento em camadas finas — e o roadmap no final deste documento organiza tudo em PRs pequenas e independentes.

**Veredicto de primeira impressão:** hoje o Anoti parece um **MVP muito bem-arquitetado** — acima de projeto acadêmico, abaixo de produto comercial. Com as etapas P0+P1 do roadmap executadas, cruza a linha de produto comercial.

---

## Nota Geral

| Dimensão | Nota | Justificativa |
|---|---|---|
| UX | **7,0** | Fluxos principais bem resolvidos, disclosure deliberado, empty states didáticos. Perde pontos por fragmentação de estatísticas em 4 lugares, atrito no registro de questões (5 campos) e ações importantes escondidas em modais. |
| UI | **5,5** | Componentes limpos, mas sem elemento gráfico algum nos dashboards, 4 estilos diferentes de abas, emojis misturados a SVG, e layout que desperdiça largura em monitores grandes. |
| Visual | **5,0** | Paleta índigo consistente e dark mode correto, mas wordmark em serifa de sistema, ícone PWA do produto antigo e ausência total de identidade gráfica própria (ilustrações, logo, personalidade). |
| Design (sistema) | **7,5** | Tokens de cor/espaço/raio/sombra/z-index/transição formalizados e usados de verdade. Perde pontos pelas duplicações de padrão (abas, dois formulários de criação de evento). |
| Usabilidade | **7,0** | Aprendizado rápido, rótulos claros, teclado e ARIA presentes. Perde por: link "Termos de Uso" morto, título da janela fixo, ausência de atalhos, contraste dependente de cor livre escolhida pelo usuário. |
| Minimalismo | **6,5** | O F10 já cortou muito (abas unificadas, disclosure). Ainda sobra: campo "Cor" redundante com categoria, 6 linhas de contexto com "—" na sessão, descrições repetitivas nos cards. |
| Consistência | **6,0** | Tokens fortes, mas iconografia tripla (SVG/emoji/glifo), 4 componentes de aba, 2 modais de criação de evento com estilos distintos, rótulos "Sessão" vs "Sessão de Estudo". |
| Modernidade | **5,5** | Sem transição entre páginas, sem microinterações além de reveal, cards sem profundidade visual, serifa datada no wordmark. A base técnica permite modernizar barato. |
| Percepção de qualidade | **5,5** | Os detalhes que transmitem confiança comercial falham: ícone errado no app instalado, emoji na IA, termos de uso não clicáveis, spinner infinito se o CDN falhar. |

**Média ponderada: ~6,2 / 10** — bom MVP, ainda não produto comercial.

---

## Auditoria por Seção

### 1. Primeira impressão (primeiros 30 segundos)

- **Tela de carregamento:** wordmark "Anoti" em Georgia/serifa + spinner. Se o CDN do Supabase (jsDelivr) falhar ou demorar, o spinner roda **para sempre** — sem timeout, sem mensagem, sem retry (verificado em execução real: o app inteiro é um grafo de módulos ES cuja raiz importa o SDK do CDN; se esse import falha, nenhum JS do app executa, nem o tema é aplicado).
- **Login:** card centrado, limpo, mas com labels e placeholders idênticos duplicados ("E-mail"/"E-mail"), e o aceite de termos aponta para um `<span>` não clicável — **não existem Termos de Uso**. Para um produto pago, isso é bloqueante (jurídico e de confiança).
- **Pós-login:** a Agenda abre com grade de semana e um bom empty state didático ("Sua semana está vazia…"). O tour de boas-vindas é um cartão dispensável — abordagem correta.
- **Classificação: MVP bem-arquitetado.** O que puxa para baixo é o par ícone-PWA antigo + serifa de sistema + emoji; o que puxa para cima é a casca de navegação limpa e os estados vazios pensados.

### 2. Identidade visual

- **Logo:** não existe logo — só o nome em `--font-display: ui-serif, Georgia…`. Serifa de sistema rende diferente em Windows/macOS/Android e remete a documento, não a app de produtividade. Os produtos benchmark usam wordmarks sans customizados.
- **Ícone do app:** `icons/icon-*.png` ainda é o "M" branco sobre azul `#3b82f6` com cruz médica — três problemas de uma vez: letra errada, cor fora da paleta atual (`#4954a8`) e marca antiga. É o que aparece na home screen de quem instala o PWA.
- **Nome/URL:** produto "Anoti", URL pública `andressamendes.github.io/MedAgenda/`, manifest com `start_url: "/MedAgenda/"`. A inconsistência é visível na barra de endereço de todo usuário.
- **Cores:** paleta índigo + rampa de cinzas + cores de status — consistente e correta nos dois temas. Ponto forte.
- **Tipografia de corpo:** pilha de sistema (`-apple-system, …, "Segoe UI", sans-serif`) — segura, porém 100% neutra; nenhuma personalidade tipográfica. A escala (`--font-size-xs…xl`) existe e é usada.
- **Iconografia:** três linguagens simultâneas — SVG de linha (sidebar, bottom nav), emoji (painel IA, smart cards) e glifos unicode (✕ fechar, ✉ ✓ ⚠ nas telas de auth). Falta um conjunto único.
- **Sombras/bordas/raios:** tokenizados e coerentes.
- **Loading/empty states:** skeletons (rows e cards) e state-blocks padronizados — ponto forte raro em MVPs.

### 3. Design System

- **Duplicações reais encontradas:**
  - **4 componentes de aba** com estilos distintos: `.ah-filter-tab` (pills — Agenda/Diário), `.dash-tab` (Dashboard), `.ss-start-tab` (modal de sessão), `.theme-tab` (Configurações).
  - **2 formulários de criação de compromisso:** o modal completo (`event-modal`, 10 campos) e o QuickAdd (título+hora) — visuais e comportamentos diferentes para a mesma ação.
  - **Botão-toggle de disclosure** repetido com o mesmo par `btn btn-ghost btn-sm` + `aria-expanded` em ao menos 6 lugares, cada um com markup própria — funciona, mas é candidato natural a componente único.
- **Padrão quebrado:** o rótulo do botão de disclosure alterna entre "Mostrar", "Ver histórico deste compromisso", "Detalhar", "Filtros avançados" — quatro verbos para o mesmo gesto.
- **Fora da identidade:** emojis (acima); a linha "SOMENTE:" do Diário renderiza em caixa alta com checkboxes desalinhados dos selects.

### 4. Navegação

- Sidebar com 3 grupos (principal / secundário / "Gerenciar") — hierarquia correta e rara em MVPs. O usuário sabe onde está (item ativo destacado, título de página).
- **Problemas:**
  - "Assistente IA" está no grupo primário mas **não é um destino** — abre um painel lateral. Mesmo modelo mental quebrado que a auditoria #09 corrigiu para Categorias/Calendários.
  - "Compromissos" e "Agenda" são duas visões do mesmo dado com nomes que não comunicam a diferença (calendário vs lista).
  - "Calendários Acadêmicos" quebra em duas linhas na sidebar de 220px.
  - Mobile: o mesmo destino chama "Sessão de Estudo" (desktop) e "Sessão" (bottom nav) — inconsistência pequena, mas visível.
  - **Título da janela é sempre "Anoti"** — histórico do navegador e alt-tab não dizem em que tela o usuário estava.
- Gestão pesada vive em modais (ver §7).

### 5. Carga Cognitiva por tela

| Tela | Carga | Comentário |
|---|---|---|
| Login/Auth | Muito baixa | Correta. |
| Agenda (Semana) | Média | Grade 24h × 7 dias + dica IA + plano da semana + filtro — razoável para o domínio; o empty state ajuda. |
| Agenda (Mês) | Baixa | Ok. |
| Compromissos | Baixa | Busca + 2 selects — ok. |
| Sessão de Estudo (vazia) | Muito baixa | Baixa demais: uma frase + botão num oceano de espaço vazio. |
| Sessão de Estudo (ativa) | Média | Cronômetro + 6 linhas de contexto (muitas com "—") + 2 blocos colapsáveis. O colapso salva; o `<dl>` com traços polui. |
| Registro de questão | **Alta** | 5 campos (tipo, status, dificuldade, matéria, tópico) para registrar 1 questão no meio de um estudo cronometrado. |
| Dashboard | Média | 3 níveis com abas (bom), mas 12+ cards de texto puro com descrições repetitivas. |
| Diário (Concluídas) | **Alta** | Parágrafo explicativo + 3 abas + busca + select + filtros avançados (4 selects + 3 checkboxes + 2 selects) + aviso de parcialidade + marcos + lista. É a tela mais pesada do produto. |
| Diário (Canceladas/Todas) | Baixa | Lista compacta — ok. |
| Painel IA | Baixa | 6 ações agrupadas em 2 categorias — boa estrutura; visual comprometido pelos emojis. |
| Modal Novo compromisso | Média-alta | 10 campos visíveis; "Cor" é decisão redundante quando categoria já tem cor. |
| Configurações / Conta / Categorias / Calendários | Baixa-média | Ok como conteúdo; questionável como modal (§7). |

### 6. Fluxos

- **Cadastro:** linear e claro; telas de confirmação dedicadas. **Quebra:** Termos de Uso não clicáveis; nenhuma indicação de força de senha.
- **Planejamento (plano da semana/IA):** escondido atrás de "Ver plano da semana" — disclosure ok, mas o resultado usa markup própria (`ai-result-body--plan`) diferente dos smart cards — duas linguagens para sugestões.
- **Agenda:** criar por slot (QuickAdd) e por botão (modal completo) — bom atalho, mas o usuário que aprendeu pelo QuickAdd não descobre lembrete/recorrência; os dois formulários não se conectam ("criar e detalhar").
- **Sessão:** iniciar exige nomear o estudo (bom — evita sessões anônimas). **Atrito:** iniciar sessão a partir de um compromisso requer abrir o modal de edição do evento e achar "Iniciar Sessão" no rodapé do formulário — ação primária escondida num lugar de edição.
- **Questões:** atrito alto (5 campos). Um contador rápido "+ acertei / + errei" cobriria 90% do uso real durante estudo.
- **Revisões:** associar/criar dentro da sessão — bom. Nomenclatura "Associar revisão"/"Criar revisão" é jargão de sistema.
- **Diário:** rico, mas o poder está atrás de texto: parágrafo-manual no topo é sinal de UI que precisa de explicação.
- **Dashboard/Insights:** blocos "Revisões" e "Produtividade" (ex-Central de Insights) moram dentro da aba "Recordes e Conquistas" — nome da aba não anuncia esse conteúdo; usuário não os descobre.
- **Histórico:** absorvido pelo Diário (bom), mas estatísticas de execução de um compromisso específico só existem dentro do modal de edição do evento — retrabalho para comparar.

### 7. Interface

- **Espaço vazio:** em 1440px, Sessão vazia e Dashboard usam <25% da área útil; conteúdo é limitado a 960px mas alinhado sem equilíbrio (CTA "+ Novo compromisso" na extrema direita, longe do título).
- **Desalinhamento:** painel de filtros do Diário — selects full-width empilhados, linha "SOMENTE:" em caps com checkboxes noutro alinhamento; caixa fantasma vazia do `filter-bar` quando não há filtro acadêmico.
- **Hierarquia:** cards do Dashboard têm título pequeno + número grande + parágrafo — o parágrafo repete o título ("Sessões hoje" / "Quantidade de sessões finalizadas hoje.") em 100% dos cards.
- **Ações apagadas:** quase toda ação secundária é `btn-ghost btn-sm` — "Adicionar questão" (a ação principal do bloco) tem o mesmo peso visual de "Cancelar".
- **"+" textual** nos rótulos ("+ Novo compromisso", "+ Repetir", "+ Adicionar questão") em vez de ícone alinhado.

### 8. Progressive Disclosure

Já é o ponto forte do produto (F10 fez esse dever de casa). Restam candidatos:
- Campo **Cor** no formulário de evento → só quando não há categoria, ou dentro de "Mais opções".
- Linhas "—" do contexto da sessão → ocultar linhas sem valor.
- Blocos Revisões/Produtividade → merecem entrada própria discreta, não enterro na aba "Recordes".
- Aviso de contagem parcial do Diário → só quando de fato houver filtro + páginas no servidor (já é assim — ok).
- Marcos da Evolução → `<details>` colapsado — correto.

### 9. Front-end

- **Responsividade:** breakpoints documentados (767/480), bottom nav mobile, safe areas para notch — acima da média. Grade da semana em 390px fica apertada mas utilizável.
- **Dark mode:** arquitetura por tokens correta; sombras recalibradas. **Risco:** cores de categoria/evento escolhidas livremente pelo usuário via color picker são aplicadas inline nos dois temas — contraste não garantido no escuro.
- **Hover/focus:** 42 regras de hover, 14 `:focus-visible`, anel de foco tokenizado — bom.
- **Transições:** tokens existem, mas **a troca de página não tem transição nenhuma** (toggle de `hidden`) — a navegação parece "seca" comparada a qualquer benchmark.
- **Skeleton/feedback:** presentes (rows/cards, toasts, sync indicator) — bom.
- **Robustez de carga:** dependência do CDN jsDelivr no caminho crítico + spinner sem timeout (§1) — um firewall corporativo ou DNS ruim transforma o produto numa tela congelada.
- **Higiene:** o HTML servido carrega ~500 linhas de comentários de auditoria interna (notas F10/PR14 etc.) — peso e vazamento de processo; versão "1.0.0-rc1" exposta.

### 10. Benchmark conceitual

- **Linear/Raycast:** navegação instantânea + atalhos de teclado + command palette. Anoti não tem nenhum atalho de teclado; criar compromisso sempre exige mouse.
- **Notion/Todoist:** onboarding com conteúdo de exemplo e templates. Anoti abre vazio (o empty state didático mitiga, não resolve).
- **Sunsama/Motion:** rituais guiados (planejar o dia) com 1 clique. O "Plano da Semana" do Anoti existe mas está atrás de um toggle discreto.
- **Stripe/Vercel:** dashboards com hierarquia visual forte — número grande + delta + minigráfico. Dashboard do Anoti é texto puro.
- **TickTick:** timer de estudo integrado ao calendário — o Anoti compete bem aqui em estrutura; perde em polish.
- **Arc/GitHub:** identidade visual própria memorável — o gap mais claro do Anoti.

### 11. Experiência comercial

- **Eu pagaria?** Hoje, não — não pela funcionalidade (que é competitiva no nicho), mas porque os sinais de confiança falham: ícone de app errado, termos de uso mortos, emoji na interface, wordmark improvisado. Assinatura pressupõe confiança de que o produto é mantido com cuidado.
- **O que impediria a venda:** (1) identidade incompleta; (2) ausência de página/landing explicando o produto; (3) termos/privacidade inexistentes; (4) dashboard sem apelo visual em screenshots — screenshots vendem SaaS.
- **O que já transmite profissional:** dark mode correto, acessibilidade, estados vazios/skeletons, coerência de tokens, PWA instalável com push.

---

## Testes de Usabilidade Simulados

| Perfil | Dificuldades encontradas |
|---|---|
| **Usuário novo** | Não entende a diferença Agenda × Compromissos; não descobre que clicar num horário da grade cria evento (o empty state avisa uma única vez); Assistente IA abre painel quando esperava página. |
| **Estudante (uso real)** | Registrar questões durante estudo exige 5 decisões por questão — abandona o recurso; iniciar sessão de um compromisso exige passar pelo modal de edição. |
| **Usuário avançado** | Sem atalhos de teclado; sem command palette; estatísticas espalhadas (Dashboard, aba Recordes, Diário, modal do evento) exigem 4 navegações para uma visão completa. |
| **Usuário distraído** | Sessão ativa não é visível fora da página Sessão (nenhum indicador persistente no header/sidebar de "cronômetro rodando") — risco de sessão esquecida; o abandonedSessionDialog mitiga depois, não durante. |
| **Notebook 13" (1280×800)** | Ok — o container de 960px cabe; filtros do Diário empilham bem. |
| **Monitor pequeno / mobile** | Bottom nav boa; grade da semana exige scroll horizontal mental (7 colunas em 390px); rótulo "Compromissos" espremido na bottom nav. |
| **Uso prolongado** | Descrições repetitivas dos cards viram ruído permanente; ausência de transições dá sensação de "pisca" a cada navegação; toggles de disclosure voltam sempre fechados (sem memória por usuário). |

---

## Os 30 Maiores Problemas (ordenados por impacto)

Formato: **Título** — Descrição · Impacto · Gravidade · Tela · Fluxo · Causa · Solução · Complexidade.

1. **Ícone do PWA ainda é o "M" do MedAgenda** — Todos os `icons/icon-*.png` mostram "M" + cruz médica em azul antigo. · Impacto: primeira impressão e app instalado comunicam o produto errado. · Gravidade: crítica. · Tela: home screen/instalação/abas. · Fluxo: instalação. · Causa: rebranding não alcançou os assets. · Solução: gerar novo conjunto de ícones (72–512, maskable) com a identidade Anoti em `#4954a8`. · **S**
2. **"Termos de Uso" é um span morto no cadastro** — O usuário aceita termos que não existem/não abrem. · Impacto: confiança e risco legal para produto comercial. · Gravidade: crítica. · Tela: Cadastro. · Fluxo: cadastro. · Causa: placeholder nunca implementado. · Solução: página estática de Termos + Privacidade e link real. · **S**
3. **Spinner infinito se o CDN do Supabase falhar** — Import ESM do SDK via jsDelivr na raiz do grafo de módulos; falha = nenhuma linha de JS roda, loading eterno. · Impacto: tela congelada em redes restritivas; sem mensagem de erro. · Gravidade: alta. · Tela: carregamento. · Fluxo: boot. · Causa: dependência de CDN no caminho crítico sem timeout. · Solução: vendorizar o SDK (servir local) e/ou timeout no `app-loading` com mensagem e retry. · **M**
4. **Wordmark em serifa de sistema** — "Anoti" em Georgia/ui-serif no loading, login e header. · Impacto: aparência datada e inconsistente entre SOs; ausência de marca. · Gravidade: alta. · Tela: todas. · Causa: `--font-display` improvisado. · Solução: wordmark SVG próprio (ou webfont própria self-hosted para display). · **S**
5. **Emojis como iconografia no painel IA e smart cards** — ✨📚📋📅🔍💡📈 + 💡📌⚠️🎯🔁. · Impacto: rendem diferente por plataforma; sinal nº 1 de amadorismo percebido. · Gravidade: alta. · Tela: painel IA, Agenda (cards), Dashboard. · Causa: ícones nunca migrados para o set SVG. · Solução: substituir por ícones de linha do set existente (icons.js). · **S**
6. **Dashboard 100% texto, sem elemento gráfico** — 12+ cards de título+número+parágrafo. · Impacto: a tela de "resultado" do produto não impressiona nem em screenshot; hierarquia fraca. · Gravidade: alta. · Tela: Dashboard. · Fluxo: acompanhamento. · Causa: decisão inicial "sem gráficos". · Solução: barra de progresso nas metas, anel/percentual visual, sparkline simples de 7 dias (SVG inline, sem lib). · **M**
7. **URL/escopo público `/MedAgenda/`** — Manifest, start_url e URL de produção mantêm o nome antigo. · Impacto: incoerência visível na barra de endereço e no manifest. · Gravidade: alta (para lançamento comercial exige domínio próprio). · Causa: hospedagem no repo antigo. · Solução: domínio próprio ou repo/Pages renomeado + redirect. · **M** (infra)
8. **Filtros avançados do Diário desalinhados e crus** — Selects 100% width empilhados, "SOMENTE:" em caps, checkboxes desalinhados, caixa fantasma do filter-bar vazio. · Impacto: a tela mais rica do produto parece formulário interno. · Gravidade: alta. · Tela: Diário. · Causa: CSS do painel nunca foi desenhado (só empilhado). · Solução: grid 2–3 colunas, labels normalizados, esconder containers vazios. · **S**
9. **Registro de questão exige 5 campos** — Tipo, status, dificuldade, matéria, tópico para cada questão durante o estudo. · Impacto: atrito mata o recurso; dados nunca preenchidos. · Gravidade: alta. · Tela: Sessão ativa. · Fluxo: questões. · Causa: formulário espelha o schema, não o gesto. · Solução: registro rápido de 1 toque (acertei/errei) com campos extras opcionais colapsados; sem mudar schema (defaults). · **M**
10. **Sessão ativa invisível fora da página Sessão** — Nenhum indicador global de cronômetro rodando. · Impacto: sessões esquecidas; usuário perde confiança nos dados. · Gravidade: alta. · Tela: todas. · Fluxo: sessão. · Causa: estado da sessão não exposto na casca. · Solução: chip/indicador no header (tempo + link para a sessão) enquanto houver sessão ativa. · **M**
11. **"Assistente IA" na navegação primária não é um destino** — Abre painel lateral; quebra o modelo "sidebar = páginas". · Impacto: desorientação e destaque desproporcional. · Gravidade: média. · Tela: sidebar. · Causa: exceção herdada. · Solução: mover para um botão de ação na casca (header) ou grupo próprio "Ações", mantendo o painel. · **S**
12. **Estatísticas fragmentadas em 4 lugares** — Dashboard, aba "Recordes e Conquistas" (com Revisões/Produtividade escondidas), stats do Diário, histórico dentro do modal de evento. · Impacto: visão de progresso exige 4 navegações; recursos não descobertos. · Gravidade: média-alta. · Fluxo: acompanhamento. · Causa: absorções sucessivas sem reorganização final. · Solução: IA de conteúdo do Dashboard: renomear abas ("Períodos", "Progresso"), promover Revisões/Produtividade a painel visível. · **M**
13. **Campo "Cor" redundante no formulário de evento** — Categoria já tem cor; evento pede cor própria sempre. · Impacto: +1 decisão em todo cadastro; inconsistência visual entre eventos. · Gravidade: média. · Tela: modal evento. · Causa: recurso anterior às categorias. · Solução: herdar cor da categoria; expor cor custom só em "Mais opções". · **S**
14. **Sem transição na troca de páginas** — Toggle seco de `hidden`. · Impacto: navegação parece protótipo; benchmarks têm fade/slide sutil. · Gravidade: média. · Tela: todas. · Causa: transições nunca aplicadas à navegação. · Solução: fade+translate de 120–180ms via classe utilitária (tokens já existem), respeitando reduced-motion. · **S**
15. **Título da janela fixo "Anoti"** — `document.title` nunca muda. · Impacto: histórico/abas/alt-tab inúteis; SEO da página de login. · Gravidade: média. · Causa: SPA sem gestão de título. · Solução: `document.title = "Página · Anoti"` em `showPage()`. · **XS**
16. **Parágrafo-manual no topo do Diário** — Texto longo explicando o que as abas fazem. · Impacto: UI que precisa de manual + carga de leitura permanente. · Gravidade: média. · Tela: Diário. · Causa: compensação textual da fusão Histórico+Diário. · Solução: remover; deixar as abas falarem por si (tooltips/empty states carregam o resto). · **XS**
17. **Descrições repetitivas nos cards do Dashboard** — "Sessões hoje" / "Quantidade de sessões finalizadas hoje." em todos os cards. · Impacto: ruído de leitura permanente. · Gravidade: média. · Tela: Dashboard. · Causa: template único título+valor+desc. · Solução: remover descrições autoevidentes; manter só as que agregam (ex.: metas). · **XS**
18. **Ação "Iniciar Sessão" enterrada no modal de edição do evento** — Fluxo natural (estudar o que está na agenda) passa por um formulário de edição. · Impacto: atrito no fluxo mais importante do produto. · Gravidade: média. · Tela: Agenda/modal. · Causa: reuso do modal como hub do evento. · Solução: ação "Iniciar sessão" direto no card/slot do evento (hover/ação secundária). · **M**
19. **Quatro componentes de aba diferentes** — `.ah-filter-tab`, `.dash-tab`, `.ss-start-tab`, `.theme-tab`. · Impacto: deriva visual e custo de manutenção. · Gravidade: média. · Causa: cada tela criou o seu. · Solução: unificar num único componente `.tabs` com variante pill; migração por tela. · **M**
20. **Dois formulários de criação de evento desconectados** — QuickAdd vs modal completo. · Impacto: usuário do QuickAdd nunca descobre lembretes/recorrência; estilos divergem. · Gravidade: média. · Fluxo: criação. · Causa: atalho criado à parte. · Solução: QuickAdd ganha "Mais opções →" que abre o modal completo pré-preenchido. · **S**
21. **Cores livres do usuário sem verificação de contraste no dark mode** — Hex inline em badges/dots/eventos nos dois temas. · Impacto: eventos ilegíveis no tema escuro. · Gravidade: média. · Causa: color picker livre + inline style. · Solução: normalizar cor para chip (fundo translúcido + texto derivado) em vez de aplicar o hex cru. · **M**
22. **Espaço morto em telas grandes** — Sessão vazia/Dashboard usam fração mínima de 1440px; CTA colado na direita, longe do título. · Impacto: composição desequilibrada, aparência de "não terminado". · Gravidade: média. · Causa: container único de 960px sem composição por tela. · Solução: empty states centrados verticalmente com ilustração leve; header de página com CTA junto ao título. · **S**
23. **Rótulos de disclosure inconsistentes** — "Mostrar"/"Detalhar"/"Ver histórico deste compromisso"/"Filtros avançados". · Impacto: micro-incoerência que soma. · Gravidade: baixa-média. · Solução: padronizar verbo + chevron rotativo. · **XS**
24. **Glifos unicode como ícones de status/fechar** — ✕ ✉ ✓ ⚠ nos modais e auth. · Impacto: renderização inconsistente; mistura com SVG. · Gravidade: baixa-média. · Solução: trocar pelos SVGs do set. · **XS**
25. **"Sessão de Estudo" vs "Sessão" vs "Diário de Estudos" vs "Diário"** — Rótulos divergem entre sidebar e bottom nav. · Impacto: pequeno atrito de correspondência. · Gravidade: baixa. · Solução: encurtar os nomes canônicos ("Sessão", "Diário") em toda parte. · **XS**
26. **Nenhum atalho de teclado** — Nem criar compromisso, nem busca, nem navegação. · Impacto: usuários avançados percebem imediatamente a distância dos benchmarks. · Gravidade: baixa-média. · Solução: 3 atalhos iniciais (N = novo, / = busca, G+A/D = ir para) + dica no tooltip. · **M**
27. **`<dl>` de contexto da sessão exibe linhas "—"** — Até 6 linhas com traço quando sessão avulsa não tem dados. · Impacto: parece incompleto/quebrado. · Gravidade: baixa. · Solução: ocultar linhas vazias. · **XS**
28. **~500 linhas de comentários de auditoria servidas em produção** — index.html carrega notas internas de processo (F10 #…, PR…). · Impacto: peso de página e vazamento de bastidores (visível em "ver código-fonte"). · Gravidade: baixa. · Solução: passo de build/minificação do HTML (já existe scripts/ para app-shell) ou limpeza manual. · **S**
29. **Aba "Recordes e Conquistas" esconde Revisões e Produtividade** — Nome não anuncia o conteúdo real. · Impacto: recursos invisíveis. · Gravidade: baixa-média. · Solução: renomear ("Progresso e conquistas") ou separar painel. · **XS** (rótulo) 
30. **Preferências de UI sem memória** — Toggles de disclosure, aba ativa do Dashboard e período do Diário voltam sempre ao padrão. · Impacto: retrabalho diário para usuários frequentes. · Gravidade: baixa. · Solução: persistir 3–4 preferências-chave em localStorage. · **S**

---

## Quick Wins (≤ 1 dia cada, alto impacto)

1. Novo conjunto de ícones PWA com identidade Anoti (#1).
2. Substituir todos os emojis e glifos por SVGs do set existente (#5, #24).
3. Título de janela dinâmico por página (#15).
4. Remover parágrafo-manual do Diário e descrições redundantes do Dashboard (#16, #17).
5. Ocultar linhas "—" do contexto da sessão (#27).
6. Padronizar rótulos de navegação e de disclosure (#23, #25).
7. CSS do painel de filtros do Diário (grid + alinhamento) (#8).
8. Cor do evento herdada da categoria; picker atrás de "Mais opções" (#13).
9. Transição fade sutil na troca de páginas (#14).
10. Renomear aba "Recordes e Conquistas" (#29).

## Melhorias Estruturais (sem alterar funcionalidades)

- **Identidade visual 1.0:** wordmark SVG, ícones, paleta aplicada aos assets, tela de loading e login redesenhadas com a marca (#1, #4, ilustrações leves de empty state).
- **Dashboard visual:** progresso de metas com barra/anel, sparkline de 7 dias, reorganização das abas e promoção de Revisões/Produtividade (#6, #12, #29).
- **Fluxo de sessão de primeira classe:** iniciar sessão a partir do evento na agenda, indicador global de sessão ativa, registro rápido de questões (#9, #10, #18).
- **Robustez do boot:** SDK vendorizado + timeout com mensagem/retry no loading (#3).
- **Design system consolidado:** componente único de abas, componente único de disclosure, build que limpa comentários do HTML (#19, #23, #28).
- **Teclado:** atalhos essenciais (#26).

---

# Plano Mestre de Implementação

Etapas pequenas, independentes, uma PR cada. Ordem = prioridade. Nenhuma altera regra de negócio ou schema.

### Fase P0 — Confiança e marca (bloqueadores de lançamento)

**E1. Ícones PWA da marca Anoti**
- Objetivo: app instalado com a marca certa. · Resolve: #1. · Arquivos: `icons/*.png`, `manifest.webmanifest` (theme já correto), `index.html` (links). · Impacto: primeira impressão. · Complexidade: S. · Dependências: definição do símbolo (E2 pode informar, não bloqueia — um "A" tipográfico índigo já resolve). · Riscos: cache do service worker servindo ícones antigos — bump de versão do SW. · Aceite: instalar o PWA exibe o novo ícone em todas as resoluções; nenhum PNG antigo referenciado.

**E2. Wordmark Anoti (SVG) no loading, login e header**
- Objetivo: eliminar a serifa de sistema. · Resolve: #4. · Arquivos: novo `icons/wordmark.svg` (ou inline em `icons.js`), `index.html`, `style.css` (`.app-loading-logo`, `.app-title`, `#view-login h1`, `--font-display` passa a valer só para números). · Impacto: identidade em toda tela. · Complexidade: S. · Dependências: nenhuma. · Riscos: contraste no dark (usar `currentColor`). · Aceite: nenhum texto de marca renderiza em serifa; wordmark idêntico em macOS/Windows/Android.

**E3. Termos de Uso e Política de Privacidade reais**
- Objetivo: link vivo no cadastro. · Resolve: #2. · Arquivos: `termos.html` + `privacidade.html` estáticos, `index.html` (âncora no lugar do span), CSP inalterada. · Impacto: confiança/jurídico. · Complexidade: S (conteúdo à parte). · Dependências: texto jurídico fornecido pela fundadora. · Riscos: nenhum. · Aceite: clicar em "Termos de Uso" abre página legível nos dois temas.

**E4. Boot resiliente: timeout do loading + SDK local**
- Objetivo: nunca congelar em spinner. · Resolve: #3. · Arquivos: `index.html` (script inline não — CSP; usar módulo pequeno separado carregado antes), `supabase.js` (import de cópia local em `vendor/`), `service-worker.js` (cache do vendor), CSP (remover jsdelivr). · Impacto: robustez percebida. · Complexidade: M. · Dependências: nenhuma. · Riscos: atualização manual do SDK passa a ser responsabilidade do repo — documentar. · Aceite: bloquear jsdelivr no devtools → app carrega normalmente; bloquear todo JS → loading mostra mensagem de erro com "Tentar novamente" em ≤10s.

### Fase P1 — Consistência visual

**E5. Iconografia única: fim de emoji e glifos unicode**
- Objetivo: um só set de ícones. · Resolve: #5, #24. · Arquivos: `icons.js` (novos ícones), `aiPanelView.js`/`index.html` (painel IA), `smartCardView.js`, `index.html` (✕ ✉ ✓ ⚠), `style.css` (tamanhos/cores dos novos ícones). · Impacto: salto imediato de percepção. · Complexidade: S. · Dependências: nenhuma. · Riscos: cor dos smart cards por tipo — usar `currentColor` + classe de tipo. · Aceite: `grep` por emoji/glifo em views retorna vazio; painel IA e cards com SVG nos dois temas.

**E6. Filtros do Diário: layout e alinhamento**
- Objetivo: painel de filtros com cara de produto. · Resolve: #8, parte de #13 visual. · Arquivos: `style.css` (grid do `#sj-advanced-filters`, `.filter-bar`, normalizar "Somente:"), `index.html` (estrutura mínima se necessário). · Impacto: a tela mais pesada fica organizada. · Complexidade: S. · Dependências: nenhuma. · Riscos: mobile — testar 390px. · Aceite: selects em grid de 2–3 colunas no desktop, 1 no mobile; nenhum container vazio visível; caps removidos.

**E7. Limpeza de texto: Diário e Dashboard**
- Objetivo: menos leitura obrigatória. · Resolve: #16, #17, #27. · Arquivos: `index.html` (remover `.page-description` do Diário), `activityDashboardView.js` (descs autoevidentes), `studySessionView.js`/`index.html` (ocultar linhas "—"). · Impacto: carga cognitiva. · Complexidade: XS. · Dependências: nenhuma. · Riscos: nenhum. · Aceite: nenhum card com descrição que repita o título; contexto da sessão sem traços.

**E8. Rótulos canônicos e títulos de janela**
- Objetivo: nomes consistentes + histórico útil. · Resolve: #15, #23, #25. · Arquivos: `index.html` (rótulos), `navigationView.js` (`document.title`), views com botões de disclosure (texto padrão + chevron). · Impacto: coerência. · Complexidade: XS-S. · Aceite: mesmo rótulo em sidebar e bottom nav; título da aba muda ao navegar; todos os toggles usam o mesmo par rótulo/ícone.

**E9. Transições de página e microinterações**
- Objetivo: navegação viva. · Resolve: #14. · Arquivos: `navigationView.js` (classe de entrada), `style.css` (keyframe fade/translate com tokens, guard de reduced-motion), `transitionUtils.js` (reuso). · Impacto: modernidade. · Complexidade: S. · Riscos: layout shift — animar só opacity/transform. · Aceite: troca de página com fade ≤180ms; `prefers-reduced-motion` desliga tudo.

**E10. Cor do evento herdada da categoria**
- Objetivo: −1 decisão por cadastro. · Resolve: #13. · Arquivos: `eventFormView.js` (picker segue categoria; custom em disclosure), `index.html` (mover campo). · Impacto: fluxo de criação mais curto e agenda visualmente coerente. · Complexidade: S. · Riscos: eventos antigos mantêm cor própria — sem migração, só default novo. · Aceite: criar evento com categoria nunca pergunta cor; personalizar continua possível em "Mais opções".

### Fase P2 — Valor percebido

**E11. Dashboard visual: progresso e sparkline**
- Objetivo: tela de resultado que impressiona. · Resolve: #6. · Arquivos: `activityDashboardView.js` (markup dos cards de meta com barra; sparkline SVG 7 dias a partir de dados já retornados), `style.css`. · Impacto: percepção de qualidade + screenshots vendáveis. · Complexidade: M. · Dependências: E7 (texto limpo primeiro). · Riscos: dados 7 dias — se o service não expõe série diária, derivar das sessões já carregadas; sem query nova. · Aceite: metas com barra de progresso; ao menos um minigráfico; dark ok; sem lib externa.

**E12. Reorganização das abas do Dashboard**
- Objetivo: Revisões/Produtividade descobríveis. · Resolve: #12, #29. · Arquivos: `index.html` (rótulos/estrutura das abas), `activityDashboardView.js`. · Impacto: descoberta de recursos. · Complexidade: S. · Dependências: E11 opcional. · Aceite: nome de aba anuncia o conteúdo; blocos Revisões/Produtividade visíveis sem conhecimento prévio.

**E13. Sessão ativa visível globalmente**
- Objetivo: cronômetro nunca esquecido. · Resolve: #10. · Arquivos: `index.html` (chip no header), `studySessionView.js`/`sessionEventBus.js` (publicar tick/estado), `style.css`. · Impacto: confiança nos dados de estudo. · Complexidade: M. · Riscos: atualização por minuto, não por segundo (custo zero). · Aceite: com sessão ativa, qualquer página mostra chip com tempo; clique leva à Sessão; some ao finalizar.

**E14. Iniciar sessão direto do evento na agenda**
- Objetivo: fluxo estudar-o-planejado em 1 clique. · Resolve: #18. · Arquivos: `weekView.js`/`script.js` (ação no card/click do evento — ex.: no popover/modal, promover botão), `eventFormView.js`. · Impacto: atrito do fluxo central. · Complexidade: M. · Dependências: E13 recomendada. · Aceite: da Agenda ao cronômetro rodando em ≤2 cliques.

**E15. Registro rápido de questões**
- Objetivo: capturar questões sem interromper o estudo. · Resolve: #9. · Arquivos: `studySessionView.js` (UI de 1 toque com defaults; detalhes em disclosure), `index.html`. · Impacto: recurso passa a ser usado. · Complexidade: M. · Riscos: manter `sessionQuestionsService.addQuestion()` como único ponto de escrita (defaults preenchem os campos). · Aceite: registrar uma questão respondida = 1 clique; formulário completo continua acessível.

**E16. QuickAdd conectado ao formulário completo**
- Objetivo: um fluxo de criação, dois níveis. · Resolve: #20. · Arquivos: `quickAdd.js` (link "Mais opções"), `eventFormView.js` (abrir pré-preenchido). · Impacto: descoberta de lembrete/recorrência. · Complexidade: S. · Aceite: do QuickAdd dá para expandir ao modal completo sem perder o que foi digitado.

### Fase P3 — Polimento de sistema

**E17. Componente único de abas**
- Objetivo: eliminar 4 variantes. · Resolve: #19. · Arquivos: `style.css` (componente `.tabs`), `index.html` + views (migração classe a classe, 1 tela por commit). · Complexidade: M. · Riscos: regressão visual — screenshots antes/depois por tela. · Aceite: um único bloco CSS de abas; todas as telas visualmente idênticas entre si.

**E18. Chips de cor seguros no dark mode**
- Objetivo: legibilidade garantida com cor livre. · Resolve: #21. · Arquivos: `style.css` + pontos de inline style (weekView, calendar, badges) — trocar hex cru por `color-mix()`/fundo translúcido. · Complexidade: M. · Aceite: evento com qualquer cor legível nos dois temas (verificação manual com cores extremas).

**E19. Empty states compostos e uso de tela grande**
- Objetivo: telas vazias com intenção. · Resolve: #22. · Arquivos: `style.css` (centralização vertical, largura de leitura), `index.html` (Sessão vazia com ícone + texto + CTA no padrão `.state-block`). · Complexidade: S. · Aceite: em 1440×900 nenhuma tela parece "faltando conteúdo".

**E20. Atalhos de teclado essenciais**
- Objetivo: paridade mínima com benchmarks. · Resolve: #26. · Arquivos: novo `keyboardService.js` (N, /, G+A…), `navigationView.js`, tooltips. · Complexidade: M. · Riscos: conflito com inputs — ignorar quando focado em campo. · Aceite: N abre novo compromisso de qualquer página; / foca busca quando existente.

**E21. Build de produção do HTML + memória de preferências**
- Objetivo: higiene final. · Resolve: #28, #30. · Arquivos: `scripts/` (strip de comentários no deploy), views (persistir aba/período/toggles). · Complexidade: S. · Aceite: HTML servido sem comentários internos; preferências sobrevivem ao reload.

*(Fora de escopo de código, mas bloqueador comercial: domínio próprio para substituir `/MedAgenda/` — #7 — e uma landing page. Tratar como projeto de infra paralelo.)*

---

## Critério Final

Executadas as fases **P0 e P1** (9 PRs, quase todas XS/S), o Anoti deixa de "parecer em desenvolvimento": marca certa em todos os pontos de contato, uma só linguagem de ícones, telas alinhadas, navegação com transição e zero links mortos. As fases **P2 e P3** convertem isso em preferência: dashboard que vende, fluxo de estudo de 1 clique e polish de sistema. Este documento é a referência da fase de refinamento; cada etapa E1–E21 está dimensionada para virar uma PR isolada e reversível.
