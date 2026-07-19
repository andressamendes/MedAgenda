/**
 * P0 — Proteção contra Divergência de Schema (ETAPA 9: Testes de ponta a
 * ponta).
 *
 * Reproduz, com schemaService.js, errorService.js e stateView.js REAIS (só a
 * fonte de dados — supabase.js — é mockada), a cadeia completa que o
 * bootstrap (script.js) percorre quando o banco está desatualizado:
 *
 *   schemaService.assertSchemaCompatible() [lança SchemaMismatchError]
 *     → errorService.handleError()        [categoriza como schema_mismatch]
 *     → stateView.errorToState()          [traduz para STATES.SCHEMA_MISMATCH]
 *     → stateView.renderStateBlock()      [tela dedicada: título + ação]
 *
 * Mesmo padrão de tests/integration/sessionExpiredFlow.test.js — um cenário
 * por arquivo, para não misturar mocks de módulos ESM cacheados entre testes.
 *
 * Isto é a garantia automatizada de que o incidente das migrations 11–13
 * nunca mais produz uma tela quebrada silenciosa: qualquer sessão cujo banco
 * não tenha a versão de schema mínima exigida cai sempre nesta mesma tela
 * dedicada — nunca em "Erro ao comunicar com o servidor" nem em Dashboard/
 * Insights/Histórico parcialmente carregados.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";
import { createSupabaseMock } from "../mocks/supabaseMock.js";

const SUPABASE_SPECIFIER  = new URL("../../supabase.js", import.meta.url).href;
const TOAST_SPECIFIER     = new URL("../../toastService.js", import.meta.url).href;
const TELEMETRY_SPECIFIER = new URL("../../telemetryService.js", import.meta.url).href;

beforeEach(() => { installDom(); });
afterEach(() => { uninstallDom(); });

test("banco em versão de schema antiga (migrations pendentes): a cadeia real schemaService → errorService → stateView renderiza 'Banco de dados desatualizado', nunca um toast nem 'Erro ao comunicar com o servidor'", async (t) => {
  const supabase = createSupabaseMock({
    tableResponses: { schema_version: { data: { version: 10 }, error: null } },
  });
  t.mock.module(SUPABASE_SPECIFIER, { namedExports: { supabase } });

  const toasts = [];
  const tracked = [];
  t.mock.module(TOAST_SPECIFIER, {
    namedExports: { showToast: (msg, kind) => toasts.push({ msg, kind }) },
  });
  t.mock.module(TELEMETRY_SPECIFIER, {
    namedExports: {
      track: (event, payload) => tracked.push({ event, payload }),
      EVENTS: { ERROR: "error" },
    },
  });

  const { assertSchemaCompatible } = await import(`../../schemaService.js?t=${Math.random()}`);
  const { handleError } = await import(`../../errorService.js?t=${Math.random()}`);
  const { errorToState, renderStateBlock, STATES } = await import(`../../stateView.js?t=${Math.random()}`);

  let reloaded = false;
  let container = null;

  // Simula _checkSchemaGate() de script.js: nunca deixa a exceção escapar
  // sem antes render a tela dedicada — Dashboard/Insights/Histórico/IA/
  // Sessões nunca chegam a ser inicializados neste caminho.
  let dashboardInitialized = false;
  async function bootstrapGate() {
    try {
      await assertSchemaCompatible();
      dashboardInitialized = true; // equivalente a rodar os safeInit() de _initApp
      return true;
    } catch (err) {
      const { category, friendly } = handleError(err, { context: "initApp.schemaCheck", silent: true });
      container = document.createElement("div");
      renderStateBlock(container, {
        ...errorToState({ category, friendly }),
        onRetry: () => { reloaded = true; },
      });
      document.body.appendChild(container);
      return false;
    }
  }

  const proceeded = await bootstrapGate();

  assert.strictEqual(proceeded, false);
  assert.strictEqual(dashboardInitialized, false, "Dashboard/Insights/Histórico/IA/Sessões nunca devem inicializar com schema incompatível");

  const title = container.querySelector(".state-block-title").textContent;
  const desc  = container.querySelector(".state-block-desc").textContent;
  assert.strictEqual(title, "Banco de dados desatualizado");
  assert.strictEqual(desc, "Esta versão do sistema requer uma atualização do banco de dados antes de poder ser utilizada.");
  assert.notStrictEqual(title, "Erro ao comunicar com o servidor");

  const btn = container.querySelector(".state-block-action");
  assert.strictEqual(btn.textContent, "Recarregar");
  btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(reloaded, true);

  // silent: true no handleError() já bastaria, mas confirmamos explicitamente
  // que nenhum toast passivo aparece por cima da tela dedicada.
  assert.strictEqual(toasts.length, 0);

  // Telemetria continua registrando o erro (categoria própria), como
  // qualquer outro erro tratado por errorService.js.
  assert.strictEqual(tracked.length, 1);
  assert.strictEqual(tracked[0].payload.category, "schema_mismatch");
});

test("banco sem a tabela schema_version (cenário do incidente original: migrations não aplicadas de forma alguma) também bloqueia o bootstrap com a mesma tela dedicada", async (t) => {
  const missingTableError = Object.assign(new Error('relation "public.schema_version" does not exist'), { code: "42P01" });
  const supabase = createSupabaseMock({
    tableResponses: { schema_version: { data: null, error: missingTableError } },
  });
  t.mock.module(SUPABASE_SPECIFIER, { namedExports: { supabase } });
  t.mock.module(TOAST_SPECIFIER, { namedExports: { showToast: () => {} } });
  t.mock.module(TELEMETRY_SPECIFIER, { namedExports: { track: () => {}, EVENTS: { ERROR: "error" } } });

  const { assertSchemaCompatible } = await import(`../../schemaService.js?t=${Math.random()}`);
  const { handleError } = await import(`../../errorService.js?t=${Math.random()}`);
  const { errorToState, renderStateBlock } = await import(`../../stateView.js?t=${Math.random()}`);

  let dashboardInitialized = false;
  let container = null;
  try {
    await assertSchemaCompatible();
    dashboardInitialized = true;
  } catch (err) {
    const { category, friendly } = handleError(err, { silent: true });
    container = document.createElement("div");
    renderStateBlock(container, { ...errorToState({ category, friendly }) });
    document.body.appendChild(container);
  }

  assert.strictEqual(dashboardInitialized, false);
  assert.strictEqual(container.querySelector(".state-block-title").textContent, "Banco de dados desatualizado");
});
