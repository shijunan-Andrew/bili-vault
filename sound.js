"use strict";
/*
  音效（BcaSound）—— 1.16.0

  设计口径：
    1. 所有音效都是**本地文件**（audio/*.mp3，随扩展一起发），不联网、不上传。
    2. 只有一处「怎么算音量」的实现：总开关 × 总音量 × 单项开关 × 单项音量。
       任何界面都不许自己乘一遍 —— 需要判断就调 effectiveVolume()。
    3. 设置存在 chrome.storage.local 的 soundSettings 上，页面上任何一处改完，
       其它打开的页面靠 storage.onChanged 自动跟上（这里的 reload 就是那个订阅）。
    4. 同一个音效永远只有一个 Audio 实例：连点时后一次会**覆盖**前一次
       （重置 currentTime 再播），不会叠着响。
    5. 扩展页面与内容脚本共用这一份文件。内容脚本能加载它，是因为
       audio/bubblepop.mp3 与 audio/error.mp3 在 manifest 的
       web_accessible_resources 里（只有这两个，其余音效只在扩展页面里放）。
*/

(function (global) {
  const STORAGE_KEY = "soundSettings";

  // 名称 → 文件。名称是英文短名（存进设置里，不许改；改了老用户的选择就丢了）。
  const SOUND_FILES = Object.freeze({
    bubblepop: "audio/bubblepop.mp3",
    notification: "audio/new-notification.mp3",
    meow: "audio/cat-meow.mp3",
    purring: "audio/purring.mp3",
    error: "audio/error.mp3"
  });

  const SOUND_KEYS = Object.freeze(["bubblepop", "notification", "meow", "purring", "error"]);

  const DEFAULT_VOLUME = 0.5;

  function clampVolume(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return DEFAULT_VOLUME;
    if (number < 0) return 0;
    if (number > 1) return 1;
    return Math.round(number * 100) / 100;
  }

  function defaultSettings() {
    const effects = {};
    for (const key of SOUND_KEYS) effects[key] = { enabled: true, volume: DEFAULT_VOLUME };
    return { enabled: true, volume: DEFAULT_VOLUME, effects };
  }

  /* 把 storage 里读到的东西收敛成「永远完整」的形状：
     少字段用默认值补、多余字段丢掉、音量夹到 0–1 并保留两位小数。
     读坏了不许把整个功能打死 —— 最差也要给出一份默认设置。 */
  function normalizeSoundSettings(raw) {
    const base = defaultSettings();
    if (!raw || typeof raw !== "object") return base;
    const sourceEffects = raw.effects && typeof raw.effects === "object" ? raw.effects : {};
    const effects = {};
    for (const key of SOUND_KEYS) {
      const item = sourceEffects[key];
      effects[key] = {
        enabled: item && item.enabled === false ? false : true,
        volume: item && item.volume !== undefined ? clampVolume(item.volume) : DEFAULT_VOLUME
      };
    }
    return {
      enabled: raw.enabled === false ? false : true,
      volume: raw.volume !== undefined ? clampVolume(raw.volume) : DEFAULT_VOLUME,
      effects
    };
  }

  /* 这个音效此刻该用多大音量；返回 0 表示「不该响」。
     这是全项目唯一一处「总音量 × 单项音量」的乘法。 */
  function effectiveSoundVolume(settings, name) {
    const normalized = normalizeSoundSettings(settings);
    if (!Object.prototype.hasOwnProperty.call(SOUND_FILES, name)) return 0;
    if (!normalized.enabled) return 0;
    const effect = normalized.effects[name];
    if (!effect || !effect.enabled) return 0;
    return Math.round(normalized.volume * effect.volume * 100) / 100;
  }

  let settings = defaultSettings();
  const players = new Map(); // name → HTMLAudioElement
  let storageWatched = false;

  function audioFor(name) {
    if (players.has(name)) return players.get(name);
    const file = SOUND_FILES[name];
    if (!file) return null;
    if (typeof global.Audio !== "function") return null;
    if (typeof global.chrome === "undefined" || !global.chrome?.runtime?.getURL) return null;
    let audio = null;
    try {
      audio = new global.Audio(global.chrome.runtime.getURL(file));
      audio.preload = "auto";
    } catch (error) {
      // 二档：造不出来只是「没声音」，不该影响任何主流程
      console.warn("音效没能加载（这一次不会有声音）", error);
      return null;
    }
    players.set(name, audio);
    return audio;
  }

  function applySettings() {
    // 只跟音量，不碰循环标记：循环是「这一下播放」的参数（purring 睡觉时一直响，
    // 改音量不该把它停掉，也不该把别的音效变成循环）。
    for (const [name, audio] of players) {
      audio.volume = effectiveSoundVolume(settings, name);
    }
  }

  function reload() {
    try {
      if (typeof global.chrome === "undefined" || !global.chrome?.storage?.local) return Promise.resolve(settings);
    } catch (_) {
      return Promise.resolve(settings);
    }
    return new Promise((resolve) => {
      global.chrome.storage.local.get(STORAGE_KEY, (data) => {
        void global.chrome.runtime?.lastError;
        settings = normalizeSoundSettings(data?.[STORAGE_KEY]);
        applySettings();
        resolve(settings);
      });
    });
  }

  function watchStorage() {
    if (storageWatched) return;
    storageWatched = true;
    if (typeof global.chrome === "undefined" || !global.chrome?.storage?.onChanged) return;
    global.chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes[STORAGE_KEY]) return;
      settings = normalizeSoundSettings(changes[STORAGE_KEY].newValue);
      applySettings();
    });
  }

  /* play(name, { loop }) → 当前的 Audio 或 null。
     音量由设置算出来；算出 0 就什么都不放（连实例都不建）。 */
  function play(name, options) {
    const volume = effectiveSoundVolume(settings, name);
    if (volume <= 0) return null;
    const audio = audioFor(name);
    if (!audio) return null;
    const loop = options?.loop === true;
    try {
      audio.loop = loop;
      audio.volume = volume;
      audio.currentTime = 0;
      const played = audio.play();
      if (played && typeof played.catch === "function") {
        /* 自动播放策略（内容脚本尤其会遇到）拒绝时不用惊动用户：
           音效是锦上添花，页面本身的提示还照常显示。 */
        played.catch((error) => console.warn("音效没能播放（浏览器拦了自动播放）", error));
      }
    } catch (error) {
      console.warn("音效没能播放", error);
      return null;
    }
    return audio;
  }

  function stop(name) {
    const audio = players.get(name);
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.loop = false;
    } catch (error) {
      console.warn("音效没能停下", error);
    }
  }

  function stopAll() {
    for (const name of players.keys()) stop(name);
  }

  /* 1.16.2：取消既不是成功也不是失败 —— 用户点了「取消导入」，不该再听到任何声音。
     判据只这一处，library.js / popup.js 的收尾都只调 playImportResult(state)。 */
  function importCancelled(state) {
    if (!state || typeof state !== "object") return false;
    if (state.cancelled === true) return true;
    return /取消/.test(String(state.summary || state.text || ""));
  }

  /* 导入收尾该响哪个：取消不响、失败响 error、成功响 notification。
     判据只这一处 —— 失败看 state.failed，或 summary / text 里出现「失败 / 错误」。 */
  function importFailed(state) {
    if (!state || typeof state !== "object") return false;
    if (importCancelled(state)) return false;
    if (state.failed === true) return true;
    /* 1.16.3：被中断（浏览器被关、扩展被重载、后台被回收）也是「没跑完」——
       以前只认「失败 / 错误」，中断的收尾文案里没有这两个词，于是响了一声「导入成功」。 */
    if (state.interrupted === true) return true;
    return /失败|错误|中断/.test(String(state.summary || state.text || ""));
  }

  function playImportResult(state) {
    /* 兼容老口径：传布尔值时按「是不是失败」处理（不再区分取消）。 */
    if (typeof state === "boolean") return play(state ? "error" : "notification");
    if (importCancelled(state)) return null;
    return play(importFailed(state) ? "error" : "notification");
  }

  function currentSettings() {
    return normalizeSoundSettings(settings);
  }

  // 扩展页面：载入时读一次、并订阅变化。内容脚本也一样走这条路。
  if (typeof global.chrome !== "undefined" && global.chrome?.storage?.local) {
    watchStorage();
    void reload();
  }

  global.BcaSound = Object.freeze({
    STORAGE_KEY,
    SOUND_FILES,
    SOUND_KEYS,
    DEFAULT_VOLUME,
    normalizeSoundSettings,
    effectiveSoundVolume,
    defaultSettings,
    play,
    stop,
    stopAll,
    reload,
    importCancelled,
    importFailed,
    playImportResult,
    currentSettings
  });
})(globalThis);
