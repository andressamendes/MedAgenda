import { supabase } from "./supabase.js";

const PREF_KEY = (userId) => `medagenda_push_${userId}`;

let _userId      = null;
let _vapidPubKey = null;

// ── Public API ─────────────────────────────────────────────────────────────

export function initPushService(userId, vapidPublicKey) {
  _userId      = userId;
  _vapidPubKey = vapidPublicKey || null;
}

export function isPushSupported() {
  return (
    "serviceWorker" in navigator &&
    "PushManager"   in window   &&
    "Notification"  in window
  );
}

export function isPushEnabled() {
  if (!_userId) return false;
  return localStorage.getItem(PREF_KEY(_userId)) === "enabled";
}

/** Requests permission, creates a Push subscription and saves it to Supabase. */
export async function subscribeToPush() {
  if (!isPushSupported()) {
    throw new Error("Push não é suportado neste navegador.");
  }
  if (!_vapidPubKey) {
    throw new Error("VAPID_PUBLIC_KEY não configurada em config.js.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permissão de notificação negada pelo usuário.");
  }

  const registration = await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: _urlBase64ToUint8Array(_vapidPubKey),
    });
  }

  await _saveSubscription(subscription);
  _setPrefEnabled(true);
  return subscription;
}

/** Unsubscribes from push, removes the subscription from Supabase. */
export async function unsubscribeFromPush() {
  if (!isPushSupported()) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    await _removeSubscription(subscription.endpoint);
    await subscription.unsubscribe();
  }

  _setPrefEnabled(false);
}

/**
 * Re-syncs the current push subscription with Supabase.
 * Useful after login to ensure the subscription is still registered.
 */
export async function syncPushSubscription() {
  if (!isPushSupported() || !isPushEnabled()) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    // Subscription was revoked externally (e.g. browser settings cleared)
    _setPrefEnabled(false);
    return;
  }

  await _saveSubscription(subscription);
}

// ── Internal ───────────────────────────────────────────────────────────────

function _setPrefEnabled(enabled) {
  if (!_userId) return;
  localStorage.setItem(PREF_KEY(_userId), enabled ? "enabled" : "disabled");
}

async function _saveSubscription(subscription) {
  const keys = subscription.toJSON().keys;

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id:    _userId,
        endpoint:   subscription.endpoint,
        p256dh:     keys.p256dh,
        auth:       keys.auth,
        user_agent: navigator.userAgent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" }
    );

  if (error) throw new Error(`Erro ao salvar subscription: ${error.message}`);
}

async function _removeSubscription(endpoint) {
  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", _userId)
    .eq("endpoint", endpoint);
}

function _urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
