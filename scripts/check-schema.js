#!/usr/bin/env node
// ── scripts/check-schema.js — Guard Rail de Schema (P1) ────────────────────
//
// Responsabilidade única: verificar, contra o Supabase real, que o banco tem
// a versão mínima de schema exigida por este build do frontend, que todas as
// tabelas obrigatórias existem, e que as colunas críticas introduzidas por
// migrations recentes (o exato ponto de falha do incidente das migrations
// 11-13: tabelas/colunas que o código já consultava, mas que ainda não
// existiam em produção) também existem. Nunca altera dados, nunca cria
// tabelas — só lê e relata.
//
// Uso:
//   node scripts/check-schema.js
//   npm run check:schema
//
// Credenciais: lidas de SUPABASE_URL/SUPABASE_ANON_KEY no ambiente (usado em
// CI — ver deploy.yml) ou, na ausência delas, de config.js na raiz do
// repositório (mesmo arquivo usado pelo frontend em desenvolvimento local).
// Sem nenhuma das duas, a checagem FALHA explicitamente informando que
// depende do ambiente — nunca é mascarada como sucesso (ver ci.yml, que não
// tem acesso ao banco e por isso roda este script apenas de forma
// informativa, sem bloquear o PR).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Tabelas que o frontend consulta hoje — uma ausente reproduz exatamente o
// incidente das migrations 11-13 (Dashboard/Insights/Histórico quebrados).
export const REQUIRED_TABLES = [
  'events', 'categories', 'profiles', 'push_subscriptions', 'notification_logs',
  'academic_calendars', 'academic_events', 'ai_metrics',
  'activity_sessions', 'reviews', 'schema_version',
];

// tabela -> colunas cuja ausência não é detectável apenas checando se a
// tabela existe (o caso concreto de 12_time_goals.sql: profiles já existia,
// só faltavam as colunas de meta de tempo que o Dashboard de Execução lê).
export const REQUIRED_COLUMNS = {
  profiles: ['daily_goal_minutes', 'weekly_goal_minutes', 'monthly_goal_minutes'],
};

/** Lê EXPECTED_SCHEMA_VERSION do código-fonte de schemaService.js (nunca importa o módulo — ele depende do SDK do Supabase via CDN, inutilizável em Node puro). */
export function readExpectedVersion(schemaServiceSource) {
  const match = schemaServiceSource.match(/EXPECTED_SCHEMA_VERSION\s*=\s*(\d+)/);
  if (!match) throw new Error('Não foi possível ler EXPECTED_SCHEMA_VERSION de schemaService.js');
  return Number(match[1]);
}

/** Lê SUPABASE_URL/SUPABASE_ANON_KEY de um config.js real (mesmo formato do config.example.js). */
export function parseConfigCredentials(configSource) {
  const url    = configSource.match(/SUPABASE_URL\s*=\s*"([^"]*)"/)?.[1];
  const anonKey = configSource.match(/SUPABASE_ANON_KEY\s*=\s*"([^"]*)"/)?.[1];
  if (!url || !anonKey || url.includes('your-project-id')) return null;
  return { url, anonKey };
}

/**
 * Resolve as credenciais a usar: variáveis de ambiente (CI) têm prioridade
 * sobre config.js (desenvolvimento local). Retorna null se nenhuma das duas
 * fontes tiver credenciais utilizáveis — nunca inventa um valor.
 */
export function resolveCredentials(env, configSource) {
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    return { url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY, source: 'variáveis de ambiente' };
  }
  if (configSource) {
    const fromConfig = parseConfigCredentials(configSource);
    if (fromConfig) return { ...fromConfig, source: 'config.js' };
  }
  return null;
}

/** Avalia o resultado da consulta a schema_version contra a versão mínima exigida. */
export function evaluateSchemaVersion(versionQuery, expectedVersion) {
  if (!versionQuery.ok) {
    return { ok: false, label: `schema version: não foi possível consultar (${versionQuery.error})` };
  }
  if (versionQuery.version === null) {
    return { ok: false, label: `schema version: ausente (esperado >= ${expectedVersion}) — schema_version está vazia ou não existe` };
  }
  if (versionQuery.version < expectedVersion) {
    return { ok: false, label: `schema version: ${versionQuery.version} — abaixo do mínimo exigido (${expectedVersion})` };
  }
  return { ok: true, label: `schema version: ${versionQuery.version} (mínimo exigido: ${expectedVersion})` };
}

/**
 * Avalia a presença de cada tabela obrigatória e das colunas críticas
 * declaradas em REQUIRED_COLUMNS, a partir das `definitions` do documento
 * OpenAPI que o PostgREST expõe em GET {SUPABASE_URL}/rest/v1/ (introspecção
 * de schema, sem precisar de service role nem sessão de usuário). Produz uma
 * entrada por item verificado — nunca um único "schema inválido" genérico.
 */
export function evaluateTablesAndColumns(openapiDefinitions, requiredTables = REQUIRED_TABLES, requiredColumns = REQUIRED_COLUMNS) {
  const results = [];
  for (const table of requiredTables) {
    const def = openapiDefinitions?.[table];
    if (!def) {
      results.push({ ok: false, label: `tabela ausente: ${table}` });
      continue;
    }
    results.push({ ok: true, label: table });

    for (const column of requiredColumns[table] ?? []) {
      if (def.properties && Object.prototype.hasOwnProperty.call(def.properties, column)) {
        results.push({ ok: true, label: `${table}.${column}` });
      } else {
        results.push({ ok: false, label: `coluna ausente: ${table}.${column}` });
      }
    }
  }
  return results;
}

export function formatReport(results) {
  return results.map(r => `${r.ok ? '✓' : '✕'} ${r.label}`).join('\n');
}

/**
 * Orquestra a checagem completa. `fetchImpl` é injetável para testes — em
 * produção é o `fetch` global do Node. Nunca lança: sempre retorna um
 * diagnóstico estruturado, mesmo quando a própria consulta falha.
 */
export async function runCheck({ env, configSource, schemaServiceSource, fetchImpl }) {
  const expectedVersion = readExpectedVersion(schemaServiceSource);
  const credentials = resolveCredentials(env, configSource);

  if (!credentials) {
    return {
      ok: false,
      blockedByEnvironment: true,
      results: [],
      message:
        'Validação de schema não executada: nenhuma credencial do Supabase disponível ' +
        '(nem SUPABASE_URL/SUPABASE_ANON_KEY no ambiente, nem config.js local). ' +
        'Esta checagem depende do ambiente de produção/desenvolvimento — não é uma confirmação de que o schema está OK.',
    };
  }

  const results = [];

  let versionQuery;
  try {
    const res = await fetchImpl(`${credentials.url}/rest/v1/schema_version?select=version&id=eq.1`, {
      headers: { apikey: credentials.anonKey, Authorization: `Bearer ${credentials.anonKey}` },
    });
    if (!res.ok) {
      versionQuery = { ok: false, error: `HTTP ${res.status}` };
    } else {
      const body = await res.json();
      versionQuery = { ok: true, version: body?.[0]?.version ?? null };
    }
  } catch (err) {
    versionQuery = { ok: false, error: err.message };
  }
  results.push(evaluateSchemaVersion(versionQuery, expectedVersion));

  try {
    const res = await fetchImpl(`${credentials.url}/rest/v1/`, {
      headers: { apikey: credentials.anonKey, Authorization: `Bearer ${credentials.anonKey}` },
    });
    if (!res.ok) {
      results.push({ ok: false, label: `não foi possível consultar o schema via REST (HTTP ${res.status})` });
    } else {
      const openapi = await res.json();
      results.push(...evaluateTablesAndColumns(openapi.definitions));
    }
  } catch (err) {
    results.push({ ok: false, label: `não foi possível consultar o schema via REST: ${err.message}` });
  }

  return {
    ok: results.every(r => r.ok),
    blockedByEnvironment: false,
    results,
    credentialsSource: credentials.source,
  };
}

async function main() {
  const schemaServiceSource = fs.readFileSync(path.join(ROOT, 'schemaService.js'), 'utf8');
  const configPath = path.join(ROOT, 'config.js');
  const configSource = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : null;

  const outcome = await runCheck({
    env: process.env,
    configSource,
    schemaServiceSource,
    fetchImpl: fetch,
  });

  if (outcome.blockedByEnvironment) {
    console.error(`✕ ${outcome.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Validando schema (credenciais via ${outcome.credentialsSource})\n`);
  console.log(formatReport(outcome.results));

  if (outcome.ok) {
    console.log('\nSchema compatível.');
  } else {
    console.error('\nSchema incompatível — veja acima exatamente o que está ausente. Aplique as migrations pendentes em /sql (SQL Editor do Supabase) antes de publicar.');
    process.exitCode = 1;
  }
}

// Só executa como CLI quando chamado diretamente (node scripts/check-schema.js),
// nunca quando importado pelos testes (tests/scripts/check-schema.test.js).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
