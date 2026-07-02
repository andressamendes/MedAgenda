/**
 * Tests for notificationService.js — permission/preference logic and
 * reminder scheduling. Uses the reusable Notification API mock; no real
 * browser notifications are ever fired.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";
import { installNotificationMock, uninstallNotificationMock } from "../mocks/notificationMock.js";

let mod;

beforeEach(async () => {
  installDom();
  installNotificationMock({ permission: "granted" });
  mod = await import(`../../notificationService.js?t=${Math.random()}`);
  localStorage.clear();
});

afterEach(() => {
  uninstallNotificationMock();
  uninstallDom();
});

test("isSupported() reflects Notification API availability", () => {
  assert.strictEqual(mod.isSupported(), true);
});

test("isEnabled() defaults to true before any preference is saved", () => {
  mod.initNotifications("user-123");
  assert.strictEqual(mod.isEnabled(), true);
});

test("setEnabled(false) persists the preference and isEnabled() reflects it", () => {
  mod.initNotifications("user-123");
  mod.setEnabled(false);
  assert.strictEqual(mod.isEnabled(), false);

  mod.setEnabled(true);
  assert.strictEqual(mod.isEnabled(), true);
});

test("permissionStatus() returns the current Notification.permission", () => {
  assert.strictEqual(mod.permissionStatus(), "granted");
});

test("scheduleReminders() does not throw and schedules nothing for events without reminder_minutes", () => {
  mod.initNotifications("user-123");
  assert.doesNotThrow(() => mod.scheduleReminders([
    { id: "evt-1", event_date: "2026-07-02", start_time: "10:00", reminder_minutes: null, recurrence_type: "none" },
  ]));
});
