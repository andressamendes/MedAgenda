/**
 * Reusable fake for the browser Notification API — installs a minimal
 * `Notification` global so notificationService.js can be imported and
 * exercised without a real browser.
 */
export function installNotificationMock({ permission = "granted" } = {}) {
  const instances = [];

  class NotificationMock {
    static permission = permission;
    static requestPermission = async () => NotificationMock.permission;

    constructor(title, options) {
      this.title = title;
      this.options = options;
      instances.push(this);
    }
  }
  NotificationMock._instances = instances;

  // notificationService.js checks `"Notification" in window`, so the mock
  // must live on the jsdom window object (not just on globalThis).
  globalThis.Notification = NotificationMock;
  if (globalThis.window) globalThis.window.Notification = NotificationMock;
  return NotificationMock;
}

export function uninstallNotificationMock() {
  delete globalThis.Notification;
  if (globalThis.window) delete globalThis.window.Notification;
}
