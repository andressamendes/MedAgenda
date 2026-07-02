/**
 * Reusable fake for navigator.serviceWorker / PushManager — lets
 * pushService.js be exercised without a real browser or push server.
 */
export function createFakeSubscription(endpoint = "https://fcm.example.com/fake-endpoint") {
  return {
    endpoint,
    toJSON: () => ({ keys: { p256dh: "fake-p256dh", auth: "fake-auth" } }),
    unsubscribe: async () => true,
  };
}

export function installServiceWorkerMock({ subscription = null } = {}) {
  const calls = [];
  let current = subscription;

  const pushManager = {
    getSubscription: async () => current,
    subscribe: async (options) => {
      calls.push({ method: "subscribe", options });
      current = createFakeSubscription();
      return current;
    },
  };

  const registration = { pushManager };

  globalThis.navigator.serviceWorker = {
    ready: Promise.resolve(registration),
    register: async () => registration,
  };
  globalThis.PushManager = function PushManager() {};

  return { registration, pushManager, _calls: calls };
}

export function uninstallServiceWorkerMock() {
  if (globalThis.navigator) delete globalThis.navigator.serviceWorker;
  delete globalThis.PushManager;
}
