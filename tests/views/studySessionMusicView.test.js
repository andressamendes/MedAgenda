/**
 * Tests for studySessionMusicView.js — the only module in the project that
 * talks to the YouTube IFrame Player API (official mechanism, see the module
 * header comment for why it was chosen over a raw postMessage protocol).
 *
 * No real network/script load happens in these tests: `window.YT` is stubbed
 * before each test with a fake Player constructor, so enableMusic() takes
 * the "API already loaded" shortcut in _loadApi() and never touches the DOM
 * script tag / real youtube.com.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";

async function loadMusicView() {
  return import(`../../studySessionMusicView.js?t=${Math.random()}`);
}

function installFakeYT() {
  const instances = [];
  class FakePlayer {
    constructor(el, config) {
      this.el = typeof el === "string" ? document.getElementById(el) : el;
      this.config = config;
      this.destroyed = false;
      this.playCalls = 0;
      this.pauseCalls = 0;
      this.volume = null;
      instances.push(this);
      // Simula onReady assíncrono, como o player real faria.
      queueMicrotask(() => this.config.events?.onReady?.({ target: this }));
    }
    playVideo() {
      this.playCalls++;
      this.config.events?.onStateChange?.({ data: window.YT.PlayerState.PLAYING });
    }
    pauseVideo() {
      this.pauseCalls++;
      this.config.events?.onStateChange?.({ data: window.YT.PlayerState.PAUSED });
    }
    stopVideo() {}
    setVolume(v) { this.volume = v; }
    destroy() { this.destroyed = true; }
  }
  window.YT = { Player: FakePlayer, PlayerState: { PLAYING: 1, PAUSED: 2 } };
  return instances;
}

beforeEach(() => {
  installDom();
});

afterEach(() => {
  delete window.YT;
  delete window.onYouTubeIframeAPIReady;
  uninstallDom();
});

test("starts off, and enabling it only creates the player after enableMusic() is called (no autoplay on load)", async () => {
  const instances = installFakeYT();
  const { getMusicState, enableMusic } = await loadMusicView();

  assert.strictEqual(getMusicState(), "off");
  assert.strictEqual(instances.length, 0);

  await enableMusic();
  await new Promise((r) => queueMicrotask(r));

  assert.strictEqual(instances.length, 1);
  assert.strictEqual(instances[0].playCalls, 1);
  assert.strictEqual(getMusicState(), "playing");
});

test("initMusicControl(onStateChange) is notified on every real state transition", async () => {
  installFakeYT();
  const { initMusicControl, enableMusic, pauseMusic, resumeMusic } = await loadMusicView();

  const states = [];
  initMusicControl({ onStateChange: (s) => states.push(s) });

  await enableMusic();
  await new Promise((r) => queueMicrotask(r));
  pauseMusic();
  resumeMusic();

  assert.deepStrictEqual(states, ["playing", "paused", "playing"]);
});

test("pauseMusic()/resumeMusic() are no-ops when the music is off (no player created)", async () => {
  installFakeYT();
  const { getMusicState, pauseMusic, resumeMusic } = await loadMusicView();

  pauseMusic();
  resumeMusic();
  assert.strictEqual(getMusicState(), "off");
});

test("disableMusic() destroys the player and removes it — nothing left mounted after turning music off", async () => {
  const instances = installFakeYT();
  const { getMusicState, enableMusic, disableMusic } = await loadMusicView();

  await enableMusic();
  await new Promise((r) => queueMicrotask(r));
  assert.strictEqual(instances[0].destroyed, false);

  disableMusic();
  assert.strictEqual(instances[0].destroyed, true);
  assert.strictEqual(getMusicState(), "off");
});

test("enabling again after disabling creates a fresh player (no iframe left over from the previous session)", async () => {
  const instances = installFakeYT();
  const { enableMusic, disableMusic } = await loadMusicView();

  await enableMusic();
  await new Promise((r) => queueMicrotask(r));
  disableMusic();

  await enableMusic();
  await new Promise((r) => queueMicrotask(r));

  assert.strictEqual(instances.length, 2);
  assert.strictEqual(instances[1].destroyed, false);
});

test("setMusicVolume() clamps to 0-100 and is a no-op before the player exists", async () => {
  const instances = installFakeYT();
  const { enableMusic, setMusicVolume } = await loadMusicView();

  setMusicVolume(70); // sem player ainda — não deve lançar
  await enableMusic();
  await new Promise((r) => queueMicrotask(r));

  setMusicVolume(150);
  assert.strictEqual(instances[0].volume, 100);
  setMusicVolume(-10);
  assert.strictEqual(instances[0].volume, 0);
});
