# Product Design Direction — Anoti

**Papel assumido:** Design Director com a régua de Apple, Linear, Arc, Things 3, Craft, Raycast, Notion, Readwise, Sunsama e TickTick.
**Data:** 25/07/2026
**Pergunta única que este documento responde:** *o que falta para o Anoti parecer um produto que as pessoas tenham orgulho de usar todos os dias?*
**O que este documento não é:** não é uma quarta rodada de "consolidar tokens" ou "unificar componentes". Três auditorias anteriores (`F18-AUDITORIA-UX-UI-V4.md`, `F19-PRODUCT-EXPERIENCE-REVIEW-V5.md`, `DESIGN_QUALITY_REVIEW_V2.md`) já fizeram esse trabalho com rigor — e nove fases de implementação desde então (Fases A–J, ver `CHANGELOG.md`) corrigiram boa parte do que foi apontado: a paleta ganhou um índigo próprio, os ícones convergiram para um sistema único injetado via `icons.js`, a página Progresso passou a ter narrativa e composição visual (anel + heatmap), a Sessão de Estudo foi parcialmente reconstruída, os toasts e o disclosure ganharam consistência mecânica. Esse trabalho é real e não será repetido aqui.

Este documento parte de uma constatação diferente, verificada em código nesta rodada: **mesmo depois de toda essa consolidação, nenhuma superfície do produto — exceto o anel de meta e o heatmap de constância — pertence estruturalmente ao Anoti.** A paleta de cinza é literalmente a rampa padrão do Tailwind (`#f9fafb…#1f2937`) com um único valor recolorido. Os ícones são geometria padrão de biblioteca de traço (`viewBox 24x24`, `stroke-width 2`, `stroke-linecap round` — o desenho de qualquer ícone open-source de traço único). A hierarquia visual é feita quase inteiramente por `font-weight` (700 aparece 55 vezes no CSS; 400 aparece 3 vezes) porque 62% de todas as declarações de tamanho de fonte do produto (115 de 185) usam apenas dois tokens — `--font-size-xs` (12px) e `--font-size-sm` (13,6px). Não existe uma única curva de movimento, forma de modal, gesto de toque ou padrão de elevação que alguém pudesse apontar e dizer "isto só existe no Anoti". A consolidação de tokens deixou o sistema **limpo**; não deixou o sistema **autoral**. Esse é o motivo estrutural desta auditoria.

---

# Diagnóstico Geral

O Anoti tem hoje pensamento de produto maduro (Decision Engine, ciclo Chegar→Executar→Refletir→Fechar, silêncio como política) e uma camada de tokens tecnicamente organizada. O que falta não é polimento — é **autoria na camada atômica**: a cor, o traço do ícone, a curva de movimento, a forma do modal e a escala tipográfica do Anoti são, hoje, indistinguíveis das de qualquer outro produto SaaS construído com um kit de início padrão e uma paleta trocada. Cobrir o logo confirma isso: sobra um dashboard cinza-e-índigo com ícones de traço de biblioteca, cards de borda fina e sombra suave, e uma tipografia inteira espremida entre 12px e 14px — o "genérico de qualidade" que qualquer ferramenta interna de qualquer empresa produz com o mesmo cuidado.

A segunda causa estrutural, nunca nomeada nas três auditorias anteriores porque elas mediram disciplina de token, não vocabulário de interação: **o Anoti não tem nenhum gesto de toque.** Zero ocorrências de `touchstart`, `touchmove`, `pointerdown` custom, swipe ou drag em todo o código-fonte. Um produto que se declara mobile-first e é uma PWA instalável resolve toda interação — abrir, fechar, descartar, reordenar, arquivar — com toque simples em botão. Isso, mais do que qualquer detalhe visual, é por que o app "parece um site responsivo com bottom-nav" (nota já dada pelo F19, 5/10 em "mobile first") e não um aplicativo nativo: aplicativos nativos são definidos pelo que o dedo pode fazer diretamente sobre o conteúdo, não pelo que aparece depois de tocar num botão.

A terceira causa: **todo modal do produto é uma caixa de desktop encolhida, nunca uma folha de mobile.** `.modal-card` tem `max-width: 360px`, é centralizado com `scale+fade`, e não existe nenhuma regra `@media` que o transforme em bottom sheet abaixo de 767px — o mesmo componente, no mesmo formato, para tela de 1440px e tela de 380px. Nenhum dos dez produtos de referência desta auditoria faz isso: Arc, Notion mobile, Linear mobile, TickTick e Things 3 usam folhas que sobem do rodapé em telas pequenas porque é assim que o polegar alcança conteúdo sem esticar. A ausência desse padrão é, sozinha, um dos sinais mais confiáveis de "adaptado", não "desenhado para o dedo".

Resumo em uma frase: **o Anoti tem a arquitetura de um produto que as pessoas confiariam todos os dias, vestida com os materiais de um produto que ninguém vai lembrar.**

---

# O que impede o Anoti de parecer premium

1. **A paleta de neutros nunca foi desenhada — foi herdada.** `--gray-50` a `--gray-800` são, valor por valor, a rampa `gray` padrão do Tailwind CSS. Qualquer pessoa que já trabalhou com Tailwind reconhece `#f9fafb`, `#f3f4f6`, `#e5e7eb`, `#9ca3af`, `#6b7280`, `#374151`, `#1f2937` de memória — é a paleta neutra mais usada da internet, presente em milhares de produtos não relacionados. Um produto premium tem uma rampa de cinza com temperatura própria (levemente quente, levemente fria, levemente dessaturada) que sobrevive ao teste "eu reconheceria este cinza específico". Hoje o Anoti não passa nesse teste porque nenhum cinza aqui é específico do Anoti.
2. **Os ícones são geometria de biblioteca, não glifos autorais.** `viewBox="0 0 24 24"`, `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"` — a assinatura técnica exata de Feather/Lucide. Correntes de traço fino e cantos arredondados existem em milhares de produtos. Nenhuma curva, ângulo ou proporção do conjunto foi desenhada para o Anoti especificamente.
3. **A hierarquia é só peso, nunca escala.** Com 62% dos tamanhos de fonte do produto vivendo em dois tokens (`xs`=12px, `sm`=13,6px) e `font-weight: 700` usado 18× mais que `400`, toda tela "grita" no mesmo volume: títulos de seção, rótulos de card e texto de apoio diferem por *quão preto* o texto é, não por *quanto espaço* ele ocupa. Produtos premium (Linear, Notion, Things) usam saltos de escala reais (14→16→20→28→40) para que o olho pouse automaticamente onde importa, sem esforço.
4. **Nenhuma superfície tem elevação com caráter.** Todo cartão do produto usa `border` fino + `box-shadow` suave — a receita mais genérica de elevação que existe em CSS, idêntica à de qualquer template de admin dashboard gratuito.
5. **O ícone do app (gradiente índigo-roxo vívido) promete uma linguagem visual que o produto por dentro nunca cumpre** — 100% chapado, uma cor de acento, zero gradiente ou profundidade em qualquer tela.
6. **Zero curva de easing autoral.** As 14 `@keyframes` do produto (breathe, spin, fade, slide, pulse, shimmer) são microinterações de framework genéricas — nenhuma usa uma curva bezier específica o bastante para ser reconhecida como "isto se move do jeito Anoti se move".

---

# O que impede o Anoti de criar conexão emocional

1. **O produto tem os dados para gerar emoção e não os usa para isso** (achado do F19, ainda válido): streak, heatmap de constância e conquistas existem como cálculo, raramente como composição visual que produza sentimento.
2. **Todo "sucesso" pesa igual.** Registrar uma questão e fechar o dia inteiro disparam o mesmo toast verde com a mesma animação (`slide-in-right`). Um produto com conexão emocional calibra a intensidade da resposta ao tamanho do momento — "1 questão registrada" é um sussurro; "você fechou o dia" merece uma respiração diferente.
3. **Nenhuma tela celebra sem imediatamente voltar ao trabalho.** `.achv-celebration-screen` e `.close-day-screen` existem, mas nenhuma pausa para deixar o momento respirar — são telas de confirmação com um selo, não rituais.
4. **A voz do produto só existe no onboarding.** Todo o resto — validação, erro, confirmação — é prosa de formulário SaaS ("Preencha e-mail e senha.", "As senhas não coincidem."). Um produto que cria vínculo tem voz que sobrevive ao clique errado, não só à primeira tela.
5. **Nenhum ritual tem textura própria.** "Fechar o dia" é a melhor ideia emocional do produto (citação direta do shutdown ritual do Sunsama) e usa a mesma paleta, a mesma tipografia e o mesmo raio de borda de uma tela de configurações.

---

# O que impede o Anoti de parecer um aplicativo nativo

1. **Zero vocabulário de gesto.** Nenhum swipe-to-archive, swipe-to-delete, pull-to-refresh, long-press ou arraste em lugar nenhum do código. Toda ação nasce de um toque em botão — a marca registrada de "site adaptado", não "app desenhado para o dedo".
2. **Modais são caixas de desktop encolhidas.** `.modal-card` (max-width 360px, centralizado, scale+fade) não tem nenhuma variante de bottom sheet em mobile. Um app nativo de 2026 abre ações contextuais subindo do rodapé, não flutuando no centro da tela com uma faixa de fundo escurecida ao redor — esse padrão é o dedo lembrando a mão, e o Anoti não o tem em nenhum lugar.
3. **A barra de navegação inferior tem rótulos de 10px** (`.bottom-nav-label { font-size: .62rem; }`) — menor que qualquer texto funcional do produto. Navegação primária mobile não deveria ser o elemento com menos confiança visual da tela.
4. **Sem feedback tátil (haptics via Vibration API) em nenhuma ação de confirmação**, mesmo em PWA instalada onde isso é suportado em Android.
5. **A sidebar de 220px que vira drawer é, estruturalmente, um menu de navegação de desktop reaproveitado**, não uma navegação desenhada primeiro para o polegar.
6. **Sem estados de "pressed" com feedback visual imediato de toque** além de `transform: scale(.98)` genérico em botões — nenhuma superfície swipeable, nenhum drag handle, nenhuma resposta elástica a gesto.

---

# Os maiores problemas de direção de design

1. Nenhuma decisão visual foi tomada intencionalmente sobre "como o Anoti deveria parecer diferente de qualquer outro planner" — todas as decisões visuais até aqui foram sobre consistência interna, nunca sobre diferenciação externa.
2. O sistema de tokens resolve "isto está organizado?" mas nunca respondeu "isto é nosso?" — não existe um brief de identidade visual (paleta de marca, tom de voz visual, princípios de movimento) documentado em lugar nenhum do repositório, equivalente ao que `VISAO_DO_PRODUTO.md` já faz para produto.
3. `npm run verify` não tem nenhuma checagem de design (stylelint existe mas roda em `severity: warning`, não bloqueia CI) — a deriva de token vai continuar reaparecendo a cada PR porque nada além de auditoria manual periódica a detecta.
4. Cada tela ainda resolve sozinha "quanto de grade cabe aqui" — não existe uma regra de composição compartilhada (ex.: "no máximo 1 elemento hero + 1 lista + 1 disclosure por página") aplicada de forma consistente.

---

# Os maiores problemas de linguagem visual

1. **Paleta neutra é literalmente Tailwind `gray` stock**, sem nenhum ajuste de matiz que a torne reconhecível como própria.
2. **Ícones são geometria Feather/Lucide sem modificação** — mesmo traço, mesmo raio de canto, mesma proporção de qualquer produto que usa a mesma biblioteca.
3. **Duas famílias de elevação de cartão coexistem** (`.card/.modal-card/.ss-card/.smart-card` em radius-lg/shadow-md vs. `.event-card/.stat-card` em radius/shadow-sm) sem justificativa nomeada — achado do V2, ainda não corrigido.
4. **Duas geometrias de "rótulo colorido" coexistem** (`.badge` pill vs. `.cal-chip`/`.wk-allday-chip` retangular 3px) resolvendo o mesmo problema de produto com formas diferentes.
5. **Contêiner de ícone (a cápsula ao redor do glifo) tem ~10 valores crus** não relacionados aos tokens `--icon-box-*` — o mesmo problema que já foi resolvido para o SVG em si, ressurgido um nível acima.
6. **Nenhuma tipografia de destaque tem peso visual real**: `--font-display` (serifada de sistema) é usada só em números — o produto nunca usa contraste de família tipográfica para comunicar hierarquia de conteúdo, só para decorar números.

---

# Os maiores problemas de identidade

1. **Se o logo for escondido, nada sobra que seja reconhecível como Anoti** — nem uma cor, nem uma forma, nem um ícone, nem uma frase, além do anel de meta e do heatmap de constância (os dois únicos componentes com identidade visual própria em todo o produto, apontados já pelo V2).
2. **O ícone do app (gradiente vívido índigo→roxo) e o produto por dentro (100% chapado, uma cor) contam histórias visuais diferentes** — a marca promete profundidade que a experiência nunca entrega.
3. **Nenhum elemento de movimento é assinado** — toda transição usa easing genérico (`ease`, `cubic-bezier(.2,.8,.2,1)` de framework), nenhuma curva foi desenhada para "isto se sente como o Anoti".
4. **A voz verbal só existe no onboarding** — o restante do produto fala com a voz neutra de qualquer formulário.

---

# Os maiores problemas de experiência

1. **A tela mais usada é a mais densa.** `#page-study-session` acumula 2 modais, 1 painel lateral e blocos de definição empilhados — o oposto do padrão de apps de foco (Forest, Things, Session): a tela onde o usuário passa mais tempo contínuo deveria ser a mais silenciosa, não a mais carregada.
2. **Confirmação e perigo não são calibrados por gravidade real.** "Cancelar sessão" (reversível) usa o mesmo vermelho sólido que excluir um compromisso (permanente); exclusão de recorrência pede escopo em um ponto de entrada e apaga a série inteira direto em outro.
3. **Zero gesto elimina cliques que poderiam desaparecer.** Arquivar, adiar ou marcar como feito sempre exigem abrir um menu/modal — nenhum desses fluxos tem atalho de gesto direto sobre o item.
4. **Nove seções de navegação na sidebar** (3 primárias + 2 secundárias + 2 de gerência, com dois divisores) — lê como menu de administração, não como as 3-4 âncoras de um app focado.
5. **Um único componente de painel lateral (`.ai-panel`) serve quatro conteúdos de natureza diferente** (filtro, leitura analítica, histórico, conversa) — eficiência de engenharia que achata a percepção de que cada momento é diferente.

---

# Componentes que devem desaparecer

1. **O padrão "Carregando…" de texto solto** em `accountView.js`, `diagnosticModal.js`, `academicCalendarView.js` — reimplementação paralela do skeleton já padronizado (`skeletonView.js`).
2. **A duplicação de `.event-card`/`.stat-card` como família de elevação própria** — deve convergir para a mesma base de `.card` ou ser nomeada formalmente como uma terceira variante intencional, nunca um desvio silencioso.
3. **`.cal-chip`/`.wk-allday-chip` como geometria retangular paralela ao `.badge`** — resolvem o mesmo problema de produto; uma das duas formas deve desaparecer.
4. **`999px` hardcoded (5 ocorrências)** em vez de `var(--radius-full)` — literal morto que já tem token equivalente.
5. **O ícone de "menu de três pontos" (`Mais`) no bottom-nav** como item de navegação — é o clássico "não sabíamos o que colocar no quinto lugar"; deve desaparecer como destino de navegação e ser substituído por ação contextual ou reorganização dos 4 destinos reais.

---

# Componentes que devem ser completamente redesenhados

1. **A paleta de neutros inteira** — não ajustar valores, redesenhar a rampa com temperatura própria (ver Fase 1 do roadmap).
2. **O conjunto de ícones** — não trocar 1-2 ícones, redesenhar a família inteira com uma característica geométrica exclusiva (ver Fase 2).
3. **`.modal-card`/`.modal-overlay`** — precisa de uma variante bottom-sheet real para mobile, não um ajuste de padding.
4. **O sistema de toast** — precisa diferenciar peso emocional (sucesso rotineiro vs. marco), não só cor por tipo.
5. **A tela de Sessão de Estudo ativa** — já identificada por três auditorias como a candidata nº 1; esta rodada não muda esse veredito, só reforça a causa (é a tela mais visitada e a mais carregada — nenhum produto de foco de referência faz isso).
6. **O ritual de Fechamento do Dia e a Celebração de Conquista** — merecem composição visual exclusiva (textura, paleta de celebração usada com mais generosidade, tempo de permanência na tela) em vez de reaproveitar a moldura genérica de modal.

---

# Telas que devem ser reconstruídas

| Tela | Por quê |
|---|---|
| **Sessão de Estudo (ativa)** | Tela mais usada e mais densa do produto — inverte a lógica de "app de foco" que a Visão do Produto declara como tese central. |
| **Agenda — Semana/Mês** | Grade densa, `min-width:480px` força scroll horizontal em mobile — nenhum elemento a diferencia de qualquer biblioteca de calendário open-source. |
| **Histórico (aba do Diário)** | Lista crua de checkbox sem composição visual própria — a aba menos desenhada do produto. |
| **Todos os modais (`.modal-card`)** | Precisam de variante mobile nativa (bottom sheet), não reconstrução de conteúdo. |
| **Cadastro** | Lista vertical de campo+campo+campo sem nenhuma diferenciação do restante do mercado. |

---

# Os 50 refinamentos de maior impacto

Ordenados por impacto estrutural (não por facilidade). Agrupados nas mesmas famílias do roadmap abaixo — o número entre colchetes indica a Fase do roadmap onde o refinamento é implementado.

### Identidade atômica (a causa raiz)
1. [Fase 1] Redesenhar a rampa de cinza com temperatura própria, substituindo os valores idênticos ao Tailwind stock.
2. [Fase 1] Redefinir `--color-primary` e derivados com uma segunda camada de profundidade (não só um hex, uma pequena família tonal).
3. [Fase 2] Redesenhar a geometria de todos os ícones com uma característica exclusiva reconhecível (ex.: um corte de canto específico, uma proporção de traço não-padrão).
4. [Fase 2] Substituir `stroke-width="2"` genérico por um valor calibrado à escala real do produto, não ao default de biblioteca.
5. [Fase 3] Desenhar 1-2 curvas de easing autorais (não `ease`/`cubic-bezier` genérico) e aplicá-las a toda transição de entrada/saída.
6. [Fase 3] Nomear e documentar essas curvas como tokens (`--ease-anoti-enter`, `--ease-anoti-exit`) em vez de valores soltos por regra.
7. [Fase 4] Redesenhar `.app-loading-screen`/spinner com uma composição que não seja "spinner cinza genérico girando".
8. [Fase 12] Fazer o gradiente do ícone do app aparecer, de forma comedida, em pelo menos um momento real do produto (ex.: ritual de fechamento do dia), para que marca e produto conversem.

### Hierarquia e tipografia
9. [Fase 5] Introduzir 2-3 tamanhos de destaque reais acima de `--font-size-xl` para títulos hero de página (hoje o maior token de texto de UI é 1,25rem).
10. [Fase 5] Reduzir o cluster de 10 valores de `font-size` entre .58–.95rem para 2 tokens nomeados.
11. [Fase 5] Reduzir a dependência de `font-weight: 700` como único mecanismo de hierarquia — reintroduzir contraste de tamanho/espaço/cor em vez de só peso.
12. [Fase 5] Formalizar o "meio-degrau" de espaçamento (.6/.65/.7/.85/.9/1.3rem) em 1-2 tokens novos.
13. [Fase 5] Aumentar `.bottom-nav-label` de .62rem para um tamanho legível como texto funcional primário (mínimo 11-12px reais).

### Elevação e superfície
14. [Fase 6] Unificar `.event-card`/`.stat-card` com a família `.card` ou nomear formalmente a variante discreta.
15. [Fase 6] Unificar `.cal-chip`/`.wk-allday-chip` com a geometria pill de `.badge`, ou criar `--radius-chip` deliberado.
16. [Fase 6] Consolidar o contêiner de ícone (~10 valores crus) em 2-3 tokens `--icon-box-*` reais.
17. [Fase 6] Preencher `.btn-danger`/`.btn-success` com cor sólida para paridade de peso com `.btn-primary`.
18. [Fase 6] Nomear as sombras de uso único (11 valores bespoke) como 2-3 tokens recorrentes.
19. [Fase 6] Substituir `999px` hardcoded por `var(--radius-full)` nas 5 ocorrências restantes.
20. [Fase 6] Introduzir `--color-on-primary` como token real usado em vez de `#fff` hardcoded (26 ocorrências).

### Gestos e sensação nativa
21. [Fase 7] Implementar swipe-to-dismiss em toasts (hoje só botão de fechar).
22. [Fase 7] Implementar swipe-to-archive/delete em itens de lista (compromissos, sessões do Diário).
23. [Fase 7] Implementar pull-to-refresh na Agenda e no Diário.
24. [Fase 7] Implementar long-press para ações contextuais rápidas em cards de compromisso.
25. [Fase 8] Converter `.modal-card` em bottom sheet real abaixo de 767px, com drag handle e arraste para fechar.
26. [Fase 8] Adicionar feedback tátil (Vibration API) em confirmações de sucesso e erro na PWA instalada.
27. [Fase 8] Adicionar resposta elástica (rubber-band) ao arrastar o painel de sessão ativa (mini-timer flutuante).

### Movimento e microinteração
28. [Fase 9] Diferenciar a animação de toast por peso emocional (sucesso rotineiro vs. marco/celebração).
29. [Fase 9] Dar ao ritual de Fechamento do Dia uma composição de movimento própria (staged reveal mais lento, não a mesma curva de modal padrão).
30. [Fase 9] Dar à Celebração de Conquista uma composição de movimento própria, distinta do Fechamento do Dia.
31. [Fase 9] Introduzir um momento de "respiro" (pequena pausa antes do fade) entre ação e resposta visual nos dois rituais acima.

### Voz e conteúdo
32. [Fase 10] Reescrever mensagens de erro/validação genéricas ("Preencha e-mail e senha.") com a mesma voz autoral do onboarding.
33. [Fase 10] Reescrever textos de confirmação (`confirmDialog`) para refletir a gravidade real da ação, não um template único "Confirmar?".
34. [Fase 10] Reescrever o texto de estados vazios (`.list-empty`) que hoje são frases utilitárias sem personalidade.

### Consolidação estrutural (herdada, ainda válida)
35. [Fase 11] Migrar `.ai-panel` para 2-4 composições visuais distintas por natureza de conteúdo (filtro / leitura / histórico / conversa).
36. [Fase 11] Padronizar o padrão "Carregando…" solto para o skeleton já existente nas 3 telas restantes.
37. [Fase 11] Igualar o comportamento de exclusão de recorrência entre modal de edição, card da lista e evento acadêmico (sempre pedir escopo).
38. [Fase 11] Rebaixar "Cancelar sessão" de `danger` para peso neutro (é reversível).
39. [Fase 11] Elevar a exclusão de conta e a exclusão de compromisso ao mesmo tom de toast (hoje `info` vs. `success`).
40. [Fase 11] Adicionar confirmação consistente para remoção de revisão/questão associada (hoje sem confirmação, destoando do resto do produto).

### Navegação e arquitetura de tela
41. [Fase 12] Reduzir as 9 seções verticais da sidebar para 4 âncoras reais, movendo "Calendários Acadêmicos"/"Categorias" para dentro de Configurações.
42. [Fase 12] Substituir o item "Mais" do bottom-nav (ícone de três pontos) por um destino real ou ação contextual.
43. [Fase 13] Reduzir a Sessão de Estudo ativa a cronômetro + no máximo 2 ações visíveis, movendo todo o resto para um único painel sob demanda (retomando o espírito da Fase F, mas concluindo a poda).
44. [Fase 13] Achatar o painel "Analisar" do Diário de 3 níveis de caixa aninhada para no máximo 2.
45. [Fase 13] Achatar a recorrência do formulário de evento de 3 níveis (`campo → extra-block → custom-block → days-wrap`) para no máximo 2.

### Telas específicas
46. [Fase 14] Redesenhar a visão de Mês da Agenda com uma composição própria (hoje é grade genérica de biblioteca open-source).
47. [Fase 14] Dar à aba Histórico do Diário a mesma composição visual (timeline) já usada em Marcos.
48. [Fase 14] Redesenhar a tela de Cadastro com a mesma diferenciação visual que o Login já recebeu (painel de marca).
49. [Fase 14] Adicionar variante bottom-sheet ao formulário de novo compromisso em mobile (o fluxo mais frequente do produto).
50. [Fase 15] Introduzir enforcement automático de design system: `stylelint` com `severity: error` bloqueando CI para `font-size`/`border-radius`/`box-shadow`/cor fora de token, hoje em `severity: warning` sem efeito prático.

---

# Roadmap de implementação

Cada etapa cabe em uma única PR. Etapas dentro da mesma fase são independentes entre si e podem ser feitas em qualquer ordem; a ordem entre fases reflete dependência real (ex.: a paleta redesenhada da Fase 1 deve existir antes de qualquer refinamento visual que a use).

## Fase 1 — Paleta de neutros própria

**Objetivo:** substituir a rampa de cinza idêntica ao Tailwind stock por uma paleta com temperatura própria, e dar a `--color-primary` uma pequena família tonal em vez de um hex único.
**Justificativa:** é a causa estrutural nº1 desta auditoria — toda a superfície do produto herda cor de uma rampa que não é do Anoti. Nenhum refinamento de componente resolve isso; só uma nova paleta resolve.
**Impacto esperado:** primeira mudança que torna o produto reconhecível em uma captura de tela sem o logo.
**Arquivos envolvidos:** `style.css` (bloco `:root` e `:root[data-theme="dark"]`, linhas ~7–330).
**Complexidade:** média (troca de valor, sem troca de variável — efeito se propaga por herança de custom property, como já documentado no próprio código para a troca de acento anterior).
**Riscos:** contraste de acessibilidade (WCAG AA) precisa ser revalidado para cada novo valor, em ambos os temas.
**Critérios de aceite:** nenhuma classe/seletor muda; todos os pares texto/fundo mantêm contraste ≥ 4.5:1; screenshot comparativo claro/escuro anexado à PR.

## Fase 2 — Família de ícones autoral

**Objetivo:** redesenhar a geometria dos ícones (`icons.js`) com uma característica exclusiva (proporção de traço, corte de canto ou terminação não-padrão) que os distinga da geometria Feather/Lucide atual.
**Justificativa:** ícones são o segundo maior "empréstimo" de identidade do produto — reconhecíveis como biblioteca de terceiros por qualquer designer.
**Impacto esperado:** reforça reconhecimento de marca em todo header, sidebar, bottom-nav e estado vazio.
**Arquivos envolvidos:** `icons.js` (todos os exports SVG).
**Complexidade:** alta (exige exploração de design antes de qualquer código; ~50 glifos a redesenhar).
**Riscos:** regressão visual em telas que dependem de proporção exata do ícone atual; deve ser feito com revisão visual tela a tela, não só no componente isolado.
**Critérios de aceite:** todos os ícones mantêm a mesma metáfora/legibilidade em `--icon-sm` (16px); nenhum ícone perde contraste em modo escuro; captura lado a lado do "antes/depois" de pelo menos 10 telas.

## Fase 3 — Curvas de movimento autorais

**Objetivo:** substituir `ease`/`cubic-bezier` genéricos por 1-2 curvas próprias, tokenizadas, aplicadas a toda transição de entrada/saída do produto.
**Justificativa:** nenhuma transição do produto hoje é reconhecível como "assinatura Anoti" — todas usam easing de framework.
**Impacto esperado:** o produto passa a "se mover" de um jeito consistente e memorável, sem mudar nenhuma duração perceptível.
**Arquivos envolvidos:** `style.css` (tokens `--transition-*`, todos os `@keyframes`).
**Complexidade:** baixa (troca de valor de curva, tokens já existem).
**Riscos:** nenhum funcional; risco puramente de gosto — vale validar com 2-3 protótipos de curva antes de aplicar globalmente.
**Critérios de aceite:** `--transition-fast/base/slow` usam a nova curva; nenhuma duração muda; `prefers-reduced-motion` continua respeitado.

## Fase 4 — Tela de carregamento com composição própria

**Objetivo:** substituir `.app-loading-spinner` (círculo cinza girando) por uma composição de carregamento com identidade visual.
**Justificativa:** é a primeira coisa que qualquer usuário vê a cada abertura do app — hoje é o componente mais genérico possível.
**Impacto esperado:** primeira impressão diária deixa de ser "template de tutorial de CSS".
**Arquivos envolvidos:** `style.css` (`.app-loading-*`, `@keyframes app-loading-breathe`), `index.html` (markup da tela de loading).
**Complexidade:** baixa a média.
**Riscos:** não pode aumentar o tempo de carregamento percebido; deve continuar leve o bastante para não atrasar o boot.
**Critérios de aceite:** tempo de exibição não aumenta; funciona em claro e escuro; usa a paleta da Fase 1.

## Fase 5 — Escala tipográfica e hierarquia real

**Objetivo:** introduzir 2-3 tamanhos de destaque acima de `--font-size-xl`, reduzir o cluster de valores crus entre .58–.95rem para tokens, e diminuir a dependência de `font-weight: 700` como único mecanismo de hierarquia.
**Justificativa:** 62% dos tamanhos de fonte do produto vivem em dois tokens de 12-13,6px — toda tela tem o mesmo volume visual, nada "grita" ou "sussurra" por tamanho.
**Impacto esperado:** títulos de página e números de destaque ganham peso real sem precisar de mais negrito; leitura de tela fica mais rápida.
**Arquivos envolvidos:** `style.css` (tokens `--font-size-*`, seletores `.page-title`, `.stat-card-value`, `.ss-timer-value`, `.bottom-nav-label` e os ~36 valores de `font-size` fora de token).
**Complexidade:** média (muitos pontos de toque, mudança de valor sem mudança estrutural).
**Riscos:** quebra de layout em componentes com altura fixa; revisar cada tela após a mudança.
**Critérios de aceite:** nenhum novo valor cru de `font-size` introduzido; `.bottom-nav-label` legível (≥11px reais); nenhum teste de layout quebra.

## Fase 6 — Consolidação de elevação e superfície

**Objetivo:** unificar `.event-card`/`.stat-card` com `.card`, unificar `.cal-chip`/`.wk-allday-chip` com `.badge`, consolidar contêiner de ícone em tokens `--icon-box-*`, preencher `.btn-danger`/`.btn-success` com cor sólida, substituir `999px` cru por `var(--radius-full)`, introduzir `--color-on-primary`.
**Justificativa:** consolidação de achados já nomeados por auditorias anteriores e ainda não corrigidos — bloqueiam a percepção de sistema coerente.
**Impacto esperado:** uma única linguagem de elevação e rótulo em todo o produto.
**Arquivos envolvidos:** `style.css` (seletores `.event-card`, `.stat-card`, `.cal-chip`, `.wk-allday-chip`, `.btn-danger`, `.btn-success`, ocorrências de `999px` e `#fff`).
**Complexidade:** média.
**Riscos:** mudança visual em Hoje/Progresso/Agenda (telas mais vistas) — exige revisão visual completa antes de merge.
**Critérios de aceite:** `grep -c "999px" style.css` retorna 0; `grep -c "#fff" style.css` cai a 0 fora de exceções documentadas; screenshot comparativo de Hoje/Progresso/Agenda.

## Fase 7 — Gestos de toque em listas e toasts

**Objetivo:** implementar swipe-to-dismiss em toasts, swipe-to-archive/delete em itens de lista, pull-to-refresh em Agenda/Diário, long-press para ações contextuais.
**Justificativa:** zero gestos hoje é a causa estrutural nº2 de "parece site, não app" — toda interação nasce de toque em botão.
**Impacto esperado:** maior sensação de "app nativo" em uso diário mobile, sem adicionar nenhuma função nova.
**Arquivos envolvidos:** `toastService.js`, itens de lista (`script.js`/`event-card`, `studyJournalView.js`/`sj-entry`, `activityHistoryView.js`), novo módulo de gesto compartilhado (ex.: `gestureUtils.js`).
**Complexidade:** alta (nova lógica de interação, sem framework de gestos existente no projeto).
**Riscos:** conflito com scroll vertical da lista; testar em dispositivo real, não só emulador; acessibilidade — toda ação por gesto precisa de equivalente por botão.
**Critérios de aceite:** toda ação de gesto tem fallback de botão acessível; testado em iOS Safari e Android Chrome reais; nenhuma regressão de scroll.

## Fase 8 — Modais como bottom sheet em mobile

**Objetivo:** converter `.modal-card` em uma folha que sobe do rodapé abaixo de 767px, com drag handle e arraste para fechar; adicionar feedback tátil (Vibration API) em confirmações na PWA instalada.
**Justificativa:** é o sinal mais confiável de "adaptado" vs. "nativo" identificado nesta auditoria — o mesmo diálogo centralizado de desktop aparece encolhido em qualquer tela pequena.
**Impacto esperado:** toda ação modal (novo compromisso, iniciar sessão, categorias, configurações) passa a se sentir como um app instalado, não como um site.
**Arquivos envolvidos:** `style.css` (`.modal-overlay`, `.modal-card` e variantes), `modalController.js` (lógica de abrir/fechar/drag).
**Complexidade:** alta (nova mecânica de interação aplicada a 8+ instâncias de modal).
**Riscos:** cada modal tem conteúdo de altura diferente — testar overflow/scroll interno em todos; cuidado com teclado virtual sobrepondo o sheet em formulários.
**Critérios de aceite:** todo modal existente abre como bottom sheet em ≤767px sem quebra de conteúdo; arraste para fechar funciona com `prefers-reduced-motion` respeitado; desktop (>767px) mantém comportamento atual inalterado.

## Fase 9 — Movimento diferenciado por peso emocional

**Objetivo:** diferenciar a animação de toast por peso emocional (rotina vs. marco), e dar ao Fechamento do Dia e à Celebração de Conquista composições de movimento próprias e distintas entre si.
**Justificativa:** hoje "1 questão registrada" e "seu dia terminou" produzem a mesma resposta visual — nenhuma calibração de intensidade existe.
**Impacto esperado:** os dois melhores momentos de produto do Anoti (ritual de fechamento, conquista) passam a *sentir-se* como os melhores momentos, não só a *ser* funcionalmente diferentes.
**Arquivos envolvidos:** `toastService.js`, `style.css` (`.close-day-screen`, `.achv-celebration-screen`, `@keyframes close-day-reveal`, `@keyframes achv-badge-pop`/`achv-ring-burst`).
**Complexidade:** média.
**Riscos:** timing mais longo pode ser percebido como lentidão se mal calibrado — validar com teste de usuário informal antes de finalizar duração.
**Critérios de aceite:** toast de marco visualmente distinto do toast de rotina; Fechamento do Dia e Celebração de Conquista usam composições de movimento diferentes entre si; `prefers-reduced-motion` respeitado em ambos.

## Fase 10 — Voz autoral em erro, validação e estado vazio

**Objetivo:** reescrever mensagens de erro/validação e textos de estado vazio com a mesma voz autoral já usada no onboarding.
**Justificativa:** a única superfície com personalidade verbal do produto é a primeira tela que o usuário vê uma vez — todo o resto fala com voz de formulário genérico, para sempre.
**Impacto esperado:** o produto passa a soar como "escrito por alguém", não "gerado por um framework de validação".
**Arquivos envolvidos:** `authView.js`, `confirmDialog.js`, `errorService.js`, `emptyStateView.js`, mensagens `.list-empty` espalhadas por `todayView.js`/`weekView.js`/`studyJournalView.js`.
**Complexidade:** baixa (mudança de texto, sem mudança de lógica).
**Riscos:** tom precisa ser calibrado para não soar informal demais em erro real (ex. falha de rede) — revisar com native reader.
**Critérios de aceite:** nenhuma mensagem de erro/validação restante usa fórmula genérica de formulário; revisão de conteúdo aprovada antes de merge.

## Fase 11 — Calibração de risco e consolidação de feedback

**Objetivo:** rebaixar "Cancelar sessão" de `danger` para peso neutro; igualar comportamento de exclusão de recorrência entre os três pontos de entrada; unificar tom de toast para toda exclusão (incluindo conta); adicionar confirmação para remoção de revisão/questão.
**Justificativa:** hoje vermelho às vezes significa "irreversível" e às vezes só "não é a ação primária" — um produto premium usa cor de perigo como contrato de confiança absoluto.
**Impacto esperado:** o usuário aprende a confiar no vermelho sem precisar ler.
**Arquivos envolvidos:** `studySessionView.js` (cancelar sessão), `script.js` (exclusão de recorrência no card), `academicCalendarEventsView.js`, `accountView.js` (toast de exclusão de conta), `sessionQuestionsService.js`/`reviewSessionService.js` (confirmação de remoção).
**Complexidade:** média.
**Riscos:** mudar o escopo de exclusão de recorrência no card da lista pode introduzir um passo extra em um fluxo hoje mais rápido — comunicar a mudança nos releases notes internos.
**Critérios de aceite:** toda ação irreversível usa `danger`; toda ação reversível não usa; exclusão de recorrência sempre pergunta escopo, em qualquer ponto de entrada; toda remoção de dado passa por `confirmDialog`.

## Fase 12 — Reorganização da navegação

**Objetivo:** reduzir as 9 seções da sidebar para 4 âncoras reais (mover "Calendários Acadêmicos"/"Categorias" para Configurações); substituir o item "Mais" do bottom-nav por um destino real.
**Justificativa:** a sidebar ainda lê como menu de administração de sistema, não como as âncoras de um app focado.
**Impacto esperado:** navegação parece parte de um produto com 4 destinos fortes, não uma lista de tudo que existe.
**Arquivos envolvidos:** `index.html` (`.app-sidebar`, `.bottom-nav`), `navigationView.js`, `settingsModal.js` (para receber os itens movidos).
**Complexidade:** média (mudança de arquitetura de informação, testada com navegação real).
**Riscos:** usuários com hábito de acesso direto a Categorias/Calendários pela sidebar perdem 1 clique de atalho — considerar atalho de teclado preservado.
**Critérios de aceite:** sidebar com no máximo 4-5 itens visíveis sem divisores de "gerência"; toda funcionalidade movida continua acessível em no máximo 2 cliques a mais.

## Fase 13 — Poda estrutural das telas mais densas

**Objetivo:** reduzir a Sessão de Estudo ativa a cronômetro + no máximo 2 ações visíveis; achatar o painel "Analisar" do Diário de 3 para 2 níveis; achatar a recorrência do formulário de evento de 3 para 2 níveis.
**Justificativa:** a tela mais usada do produto é a mais carregada — inverte a tese central do produto ("planeje pouco, estude muito").
**Impacto esperado:** a tela onde o usuário passa mais tempo contínuo se torna a mais silenciosa, não a mais cheia.
**Arquivos envolvidos:** `studySessionView.js`, `index.html` (`#page-study-session`, `#ss-panel`), `studyJournalView.js` (`#sj-panel`), `recurrenceFieldView.js`.
**Complexidade:** alta (redistribuição de conteúdo entre tela principal e painel, sem perder nenhuma funcionalidade).
**Riscos:** funcionalidade que hoje é visível por padrão passa a exigir 1 clique a mais — validar que nenhuma informação crítica (tempo, ação primária) fica escondida.
**Critérios de aceite:** tela ativa de sessão mostra no máximo cronômetro + 2 botões por padrão; nenhum dado ou ação é removido, só redistribuído; recorrência do evento resolve o caso comum (repetir semanalmente) em no máximo 2 decisões.

## Fase 14 — Reconstrução de telas específicas

**Objetivo:** redesenhar a visão de Mês da Agenda com composição própria; dar à aba Histórico do Diário a mesma composição de timeline já usada em Marcos; redesenhar Cadastro com a mesma diferenciação visual do Login; adicionar bottom-sheet ao formulário de novo compromisso em mobile.
**Justificativa:** telas identificadas nesta e em auditorias anteriores como "sistema interno" ou "biblioteca open-source genérica" na primeira impressão de 5 segundos.
**Impacto esperado:** eleva a nota de primeira impressão das quatro telas mais fracas do produto hoje.
**Arquivos envolvidos:** `calendar.js`, `style.css` (`.cal-*`), `studyJournalView.js`/`activityHistoryView.js` (aba Histórico), `authView.js` (Cadastro), `eventFormView.js` + Fase 8 (bottom sheet).
**Complexidade:** alta (4 telas distintas — recomenda-se dividir em 4 PRs menores dentro desta fase, uma por tela).
**Riscos:** Mês é usado por quem prefere visão de calendário tradicional — não simplificar a ponto de perder densidade de informação necessária para planejamento mensal.
**Critérios de aceite:** cada tela redesenhada mantém 100% da funcionalidade anterior; captura de "antes/depois" anexada; teste manual em mobile real.

## Fase 15 — Enforcement automático de design system

**Objetivo:** elevar `stylelint` de `severity: warning` para `severity: error` bloqueando `npm run verify`/CI para `font-size`/`border-radius`/`box-shadow`/cor fora de token.
**Justificativa:** sem isso, toda consolidação das Fases 1-14 volta a se desfazer na próxima feature — é a única forma de tornar a disciplina de token permanente em vez de mais uma vitória temporária de auditoria.
**Impacto esperado:** nenhuma PR futura pode reintroduzir um valor cru sem justificativa explícita (`stylelint-disable` documentado).
**Arquivos envolvidos:** `.stylelintrc.json`, `package.json` (script `verify`).
**Complexidade:** baixa (mudança de configuração) — mas só pode ser feita depois que as Fases 5/6 já tiverem eliminado a maior parte dos literais existentes, senão a regra quebra o build imediatamente.
**Riscos:** pode bloquear PRs legítimas que precisam de um valor único por razão de conteúdo — garantir que exceções documentadas (`/* stylelint-disable-next-line */` com comentário do motivo) sejam aceitas no processo de review.
**Critérios de aceite:** `npm run verify` falha se um valor cru de `font-size`/`border-radius`/`box-shadow`/cor for introduzido sem exceção documentada; todos os literais restantes do CSS atual foram resolvidos ou documentados antes de ativar `error`.

---

## Ordem recomendada

1. **Fase 1 → 2 → 3 → 4** (identidade atômica: paleta, ícone, movimento, loading) — nenhuma depende da outra, mas juntas formam a base visual que todo o resto herda.
2. **Fase 5 → 6** (tipografia e elevação) — usam a paleta da Fase 1.
3. **Fase 7 → 8** (gestos e bottom sheet) — maior impacto em "sensação nativa", tecnicamente independentes das fases anteriores, podem correr em paralelo com 1-6.
4. **Fase 9 → 10 → 11** (movimento emocional, voz, calibração de risco) — refinamento de experiência já existente.
5. **Fase 12 → 13 → 14** (arquitetura de navegação e telas específicas) — mudanças estruturais maiores, feitas por último para não competir com a base visual ainda instável.
6. **Fase 15** (enforcement) — sempre por último, depois que a maioria dos literais tiver sido resolvida nas fases anteriores.
