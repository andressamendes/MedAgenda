# MedAgenda — Beta Público

Versão: **1.0.0-beta.1**
Última atualização: 2026-06-28

---

## Como Reportar Bugs

### Antes de reportar
1. Abra as **Configurações** → **Diagnóstico** e verifique o status dos serviços.
2. Tente reproduzir o problema em uma aba anônima (garante ambiente limpo).
3. Anote os passos exatos que levaram ao problema.

### Informações obrigatórias no relato
- **Descrição:** O que aconteceu vs. o que era esperado.
- **Passos para reproduzir:** Numerados, detalhados.
- **Ambiente:** Navegador e versão, sistema operacional, tipo de dispositivo (desktop/mobile).
- **Versão da aplicação:** Visível em Configurações → Diagnóstico → rodapé.
- **Screenshot ou vídeo:** Se possível.

### Canal de reporte
Abra uma **issue** no repositório GitHub:
`https://github.com/andressamendes/MedAgenda/issues/new`

Use o template disponível e marque com a label `bug`.

---

## Fluxo de Testes para Validadores Beta

### 1. Login e Autenticação
- [ ] Login com credenciais válidas
- [ ] Login com credenciais inválidas → mensagem de erro clara
- [ ] Sessão expirada → redirecionamento automático para login
- [ ] Logout funciona corretamente

### 2. Compromissos
- [ ] Criar novo compromisso (todos os campos)
- [ ] Criar compromisso com campos mínimos (título, data, hora)
- [ ] Editar compromisso existente
- [ ] Excluir compromisso
- [ ] Compromisso recorrente — criar, editar série completa, excluir

### 3. Calendário e Visualizações
- [ ] Visualização mensal carrega corretamente
- [ ] Visualização semanal carrega corretamente
- [ ] Navegação entre semanas/meses
- [ ] Clique em dia abre quick-add
- [ ] Clique em evento preenche formulário de edição

### 4. Categorias
- [ ] Criar nova categoria
- [ ] Editar nome e cor de categoria existente
- [ ] Excluir categoria sem eventos vinculados
- [ ] Tentar excluir categoria com eventos → mensagem de aviso

### 5. Notificações
- [ ] Ativar notificações locais
- [ ] Verificar se lembrete é exibido no horário correto (app aberto)
- [ ] Ativar notificações push
- [ ] Verificar recebimento de push com app fechado
- [ ] Desativar notificações

### 6. Modo Offline
- [ ] Desligar internet → barra "Modo Offline" aparece
- [ ] Calendário ainda exibe dados em cache
- [ ] Reconectar → barra desaparece, dados sincronizam

### 7. Diagnóstico
- [ ] Abrir Configurações → Diagnóstico
- [ ] Verificar status de todos os serviços (verde = OK)
- [ ] Testar com internet desligada → Supabase aparece como falha

### 8. Modo Desenvolvedor
- [ ] Ativar modo desenvolvedor
- [ ] Verificar logs no console do navegador durante operações
- [ ] Desativar modo desenvolvedor

### 9. PWA
- [ ] Aplicação pode ser instalada (botão "Instalar MedAgenda")
- [ ] Funciona após instalação como app standalone
- [ ] Atualização automática ao publicar nova versão

---

## Problemas Conhecidos

| ID    | Descrição                                                        | Impacto   | Status      |
|-------|------------------------------------------------------------------|-----------|-------------|
| BK-01 | Push notifications requerem HTTPS (não funciona em HTTP local)   | Baixo     | Por design  |
| BK-02 | Safari iOS tem suporte limitado a Web Push (requer iOS 16.4+)    | Médio     | Monitorando |
| BK-03 | Múltiplas abas abertas podem causar conflito de sincronização    | Baixo     | Monitorando |

---

## Checklist para Novos Releases

### Pré-release
- [ ] Todos os testes unitários passando (`npm test`)
- [ ] Testar os 9 fluxos do guia de beta acima
- [ ] Verificar `CACHE_VERSION` em `service-worker.js` (incrementar a cada deploy)
- [ ] Atualizar `APP_VERSION` em `diagnosticService.js`
- [ ] Atualizar `CHANGELOG.md` com as mudanças
- [ ] Revisar mensagens visíveis ao usuário (português, sem termos técnicos)
- [ ] Testar em Chrome, Firefox e Safari (desktop e mobile)

### Deploy
- [ ] Merge na branch `main` via Pull Request aprovado
- [ ] GitHub Actions deploy concluído com sucesso
- [ ] Verificar versão publicada em `https://andressamendes.github.io/MedAgenda/`
- [ ] Abrir Diagnóstico no ambiente de produção e confirmar todos os serviços verdes

### Pós-release
- [ ] Monitorar issues abertas nas primeiras 24 h
- [ ] Verificar logs de erro no Supabase Dashboard
- [ ] Confirmar que push notifications estão sendo enviadas (tabela `notification_logs`)

---

## Arquitetura do Sistema de Observabilidade

```
errorService.js
├── Captura: window.onerror + unhandledrejection
├── Categoriza: AUTH, NETWORK, DATABASE, PUSH, SW, UNKNOWN
├── Exibe: toast de erro (toastService.js)
└── Rastreia: telemetryService.js (evento ERROR)

toastService.js
├── Tipos: success (verde), error (vermelho), warning (amarelo), info (azul)
├── Auto-dismiss em 4,5 s
├── Máximo 5 toasts simultâneos
└── ARIA live region para acessibilidade

telemetryService.js
├── Buffer em memória (200 eventos)
├── Eventos: LOGIN, LOGOUT, APPOINTMENT_*, PUSH_*, SYNC_FAILURE, ERROR
├── Dev mode: logs no console
└── Pronto para integração com Google Analytics / Mixpanel

diagnosticService.js
├── Supabase: conectividade + latência
├── Auth: sessão ativa + expiração
├── Service Worker: registrado e controlando a página
└── Push: permissão do navegador
```

---

## Contato da Equipe

Para dúvidas sobre o beta, entre em contato via issues no GitHub ou pelo e-mail configurado no repositório.
