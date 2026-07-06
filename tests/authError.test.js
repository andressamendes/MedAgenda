/**
 * Tests for authError.js — the structured contract for authentication errors
 * (A1.2 — Contrato Estruturado para Erros de Autenticação).
 */
import { test } from "node:test";
import assert from "node:assert";
import { AuthError, AUTH_REASONS } from "../authError.js";

test("AuthError sets the same __isAuthError flag the Supabase auth-js SDK uses, so errorService.categorize() needs no separate check for it", () => {
  const err = new AuthError("Usuário não autenticado.");
  assert.strictEqual(err.__isAuthError, true);
  assert.strictEqual(err instanceof Error, true);
  assert.strictEqual(err.name, "AuthError");
  assert.strictEqual(err.message, "Usuário não autenticado.");
});

test("AuthError defaults: status 401, reason NO_SESSION, recoverable true, no code/originalError", () => {
  const err = new AuthError("sem sessão");
  assert.strictEqual(err.status, 401);
  assert.strictEqual(err.reason, AUTH_REASONS.NO_SESSION);
  assert.strictEqual(err.recoverable, true);
  assert.strictEqual(err.code, null);
  assert.strictEqual(err.originalError, null);
});

test("AuthError accepts an explicit contract (code/status/reason/recoverable/originalError)", () => {
  const original = new Error("boom");
  const err = new AuthError("sessão expirada", {
    code: "session_expired",
    status: 401,
    reason: AUTH_REASONS.SESSION_EXPIRED,
    recoverable: false,
    originalError: original,
  });

  assert.strictEqual(err.code, "session_expired");
  assert.strictEqual(err.reason, AUTH_REASONS.SESSION_EXPIRED);
  assert.strictEqual(err.recoverable, false);
  assert.strictEqual(err.originalError, original);
});

test("AUTH_REASONS exposes the reason vocabulary used across the app", () => {
  assert.strictEqual(AUTH_REASONS.NO_SESSION, "no_session");
  assert.strictEqual(AUTH_REASONS.SESSION_EXPIRED, "session_expired");
  assert.strictEqual(AUTH_REASONS.REFRESH_INVALID, "refresh_invalid");
  assert.strictEqual(AUTH_REASONS.INVALID_JWT, "invalid_jwt");
  assert.strictEqual(AUTH_REASONS.USER_NOT_FOUND, "user_not_found");
});
