"use strict";
/*
  1.7.22「执行级测试覆盖」的公共壳。

  背景：`test/stability.test.cjs` 是「读文件 + 正则」，证明源码里写着某行字；
  它能抓漂移，但抓不到「这行字跑起来是不是真的对」。archive-core / stats-core
  两套已经是真执行 —— 那是因为它们不碰浏览器 API。剩下的 chrome.*、原生消息、
  导入回写一直没覆盖，原因就是「没法在 node 里跑」。

  这个文件把那层壳补上：
    · makeChrome()          —— 内存版 chrome.storage(.local/.session/.sync) + runtime + 杂项
    · makeDirectoryTree()   —— 内存版 FileSystem 目录树（handle / createWritable / move）
    · loadBackground()      —— 把 background.js 整份丢进 vm 跑起来，并导出内部函数
    · carveFunction()       —— 从 library.js 这类页面脚本里抠出单个函数真跑

  跑起来的是**磁盘上的真源码**，不是副本：改坏了函数，这些测试会红。
*/

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.join(__dirname, "..");
const readSource = (file) => fs.readFileSync(path.join(projectRoot, file), "utf8");
const clone = (value) => (value === undefined ? undefined : structuredClone(value));

/* ------------------------------------------------------------------ */
/* chrome.storage                                                      */
/* ------------------------------------------------------------------ */

function pickKeys(map, keys) {
  if (keys === null || keys === undefined) return Object.fromEntries([...map].map(([k, v]) => [k, clone(v)]));
  if (typeof keys === "string") return map.has(keys) ? { [keys]: clone(map.get(keys)) } : {};
  if (Array.isArray(keys)) {
    const out = {};
    for (const key of keys) if (map.has(key)) out[key] = clone(map.get(key));
    return out;
  }
  const out = {};
  for (const [key, fallback] of Object.entries(keys)) out[key] = map.has(key) ? clone(map.get(key)) : clone(fallback);
  return out;
}

function makeStorageBus() {
  const listeners = [];
  return {
    add: (fn) => listeners.push(fn),
    emit(changes, areaName) {
      for (const fn of [...listeners]) {
        try { fn(changes, areaName); } catch (_) { /* 监听器自己炸不该影响写入方 */ }
      }
    }
  };
}

function makeStorageArea(name, bus, initial = {}) {
  const map = new Map(Object.entries(initial).map(([k, v]) => [k, clone(v)]));
  const area = {
    __name: name,
    __map: map,
    /* 1.14.3：测试把这里设成一个 Error，写入就会失败 —— 用来验证「写不进去」的界面退路。 */
    __failSet: null,
    dump: () => Object.fromEntries([...map].map(([k, v]) => [k, clone(v)])),
    async get(keys) { return pickKeys(map, keys); },
    async set(items) {
      if (area.__failSet) throw area.__failSet;
      const changes = {};
      for (const [key, value] of Object.entries(items || {})) {
        changes[key] = { oldValue: clone(map.get(key)), newValue: clone(value) };
        map.set(key, clone(value));
      }
      if (Object.keys(changes).length) bus.emit(changes, name);
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      const changes = {};
      for (const key of list) {
        if (!map.has(key)) continue;
        changes[key] = { oldValue: clone(map.get(key)), newValue: undefined };
        map.delete(key);
      }
      if (Object.keys(changes).length) bus.emit(changes, name);
    },
    async clear() {
      const changes = {};
      for (const [key, value] of map) changes[key] = { oldValue: clone(value), newValue: undefined };
      map.clear();
      if (Object.keys(changes).length) bus.emit(changes, name);
    }
  };
  return area;
}

/* ------------------------------------------------------------------ */
/* chrome                                                              */
/* ------------------------------------------------------------------ */

function makeChrome(options = {}) {
  const bus = makeStorageBus();
  const storage = {
    local: options.local || makeStorageArea("local", bus, options.localData),
    session: options.session || makeStorageArea("session", bus, options.sessionData),
    sync: options.sync || makeStorageArea("sync", bus, options.syncData),
    onChanged: { addListener: bus.add }
  };
  const events = {};
  const event = (name) => (events[name] = events[name] || { listeners: [], addListener(fn) { this.listeners.push(fn); } });

  const nativeReplies = options.nativeReplies || [];
  const chrome = {
    __storageBus: bus,
    __events: events,
    __nativeCalls: [],
    __messages: [],
    __notifications: [],
    __badge: [],
    storage,
    runtime: {
      id: "test-extension-id",
      lastError: undefined,
      onInstalled: event("runtime.onInstalled"),
      onStartup: event("runtime.onStartup"),
      onMessage: event("runtime.onMessage"),
      onConnect: event("runtime.onConnect"),
      getManifest: () => ({ version: options.version || "1.7.22", manifest_version: 3 }),
      getURL: (relative) => `chrome-extension://test-extension-id/${String(relative).replace(/^\//, "")}`,
      /* 真 Chrome 的 sendMessage(message, callback) 会把应答交给回调（没人应答时
         回调拿到 undefined 且 lastError 被设上）。只记消息不叫回调，
         content.js 的「先问导入状态、再发归档」这条两段式链路就会断在第一段。 */
      sendMessage(message, callback) {
        chrome.__messages.push(message);
        const respond = (value) => { if (typeof callback === "function") callback(value); };
        if (typeof options.onRuntimeMessage !== "function") {
          respond(undefined);
          return Promise.resolve(undefined);
        }
        const result = options.onRuntimeMessage(message, respond);
        if (result && typeof result.then === "function") {
          return result.then((value) => { respond(value); return value; });
        }
        if (typeof callback === "function" && result !== undefined) respond(result);
        else if (typeof callback === "function") respond(undefined);
        return Promise.resolve(result);
      },
      sendNativeMessage(host, message, callback) {
        chrome.__nativeCalls.push({ host, message });
        const reply = nativeReplies.length ? nativeReplies.shift() : { ok: true, protocol: 3 };
        // 真 Chrome 的回调是异步的，这里也异步，免得测出「同步返回」这种假象
        setTimeout(() => {
          if (reply && reply.__lastError) {
            chrome.runtime.lastError = { message: reply.__lastError };
            try { callback(undefined); } finally { chrome.runtime.lastError = undefined; }
            return;
          }
          if (reply && reply.__throw) { throw reply.__throw; }
          callback(clone(reply));
        }, 0);
      }
    },
    action: {
      setBadgeText: (details) => chrome.__badge.push({ kind: "text", ...details }),
      setBadgeBackgroundColor: (details) => chrome.__badge.push({ kind: "color", ...details })
    },
    notifications: {
      create: (id, options2) => chrome.__notifications.push({ id, ...options2 }),
      clear: async () => true
    },
    tabs: { create: async () => ({}), query: async () => [], sendMessage: async () => undefined, update: async () => ({}) },
    windows: { create: async () => ({}) },
    permissions: { contains: async () => true, request: async () => true },
    alarms: { create() {}, clear: async () => true, onAlarm: event("alarms.onAlarm") },
    contextMenus: { create() {}, removeAll(cb) { if (cb) cb(); }, onClicked: event("contextMenus.onClicked") },
    commands: { onCommand: event("commands.onCommand") },
    scripting: { executeScript: async () => [], insertCSS: async () => {} },
    i18n: { getMessage: (key) => key, getUILanguage: () => "zh-CN" },
    offscreen: { createDocument: async () => {}, closeDocument: async () => {} },
    downloads: { download: async () => 1 }
  };
  return chrome;
}

/* ------------------------------------------------------------------ */
/* FileSystem 目录树（内存版）                                          */
/* ------------------------------------------------------------------ */

function bytesOf(value) {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value === null || value === undefined) return new Uint8Array();
  return new TextEncoder().encode(JSON.stringify(value));
}
const textOf = (bytes) => new TextDecoder().decode(bytes);

function makeFileHandle(name, bytes) {
  const node = {
    kind: "file",
    name,
    __bytes: bytesOf(bytes),
    /** 测试用：设成 Error 之后，createWritable() 的 close() 会抛这个错 */
    __failWrite: null,
    /** 测试用：设成 Error 之后，createWritable() 直接抛 */
    __failOpen: null,
    /** 测试用：设成 Error 之后 getFile() 抛（权限被撤 / 被别的程序占着） */
    __failRead: null,
    /** 测试用：设成 true 之后 move() 抛 NoModificationAllowedError（目标被占用） */
    __locked: false,
    async getFile() {
      if (node.__failRead) throw node.__failRead;
      // 真 File 是快照：拿到手之后源文件再改，快照不变
      const snapshot = new Uint8Array(node.__bytes);
      return {
        name,
        size: snapshot.byteLength,
        lastModified: 0,
        type: "",
        async text() { return textOf(snapshot); },
        async arrayBuffer() { return snapshot.buffer.slice(snapshot.byteOffset, snapshot.byteOffset + snapshot.byteLength); }
      };
    },
    async createWritable() {
      if (node.__failOpen) throw node.__failOpen;
      const buffer = [];
      let closed = false;
      return {
        async write(chunk) {
          if (node.__failWrite) throw node.__failWrite;
          if (typeof chunk === "string") buffer.push(new TextEncoder().encode(chunk));
          else if (chunk instanceof Uint8Array) buffer.push(new Uint8Array(chunk));
          else if (chunk && chunk.__bytes) buffer.push(new Uint8Array(chunk.__bytes));
          /* 真 Chrome 的 createWritable().write() 吃 Blob / File；1.13.4 之前这里没有这一支，
             于是「把 A 文件的 File 写进 B 文件」会退化成 JSON 文本 —— copyFileHandle 因此在
             测试里永远产出 0 字节，moveDirectoryInto 的复制校验分支从没被测到过。 */
          else if (chunk && typeof chunk.arrayBuffer === "function") buffer.push(new Uint8Array(await chunk.arrayBuffer()));
          else buffer.push(bytesOf(chunk));
        },
        async close() {
          if (closed) return;
          if (node.__failWrite) throw node.__failWrite;
          closed = true;
          const total = buffer.reduce((sum, part) => sum + part.byteLength, 0);
          const merged = new Uint8Array(total);
          let offset = 0;
          for (const part of buffer) { merged.set(part, offset); offset += part.byteLength; }
          node.__bytes = merged;
        },
        async abort() { closed = true; }
      };
    },
    async move(destination, newName) {
      if (node.__locked) {
        const error = new Error("Failed to execute 'move' on 'FileSystemFileHandle': cannot be moved to a destination which is locked.");
        error.name = "NoModificationAllowedError";
        throw error;
      }
      if (!destination || destination.kind !== "directory") {
        throw new TypeError("Failed to execute 'move': parameter 1 is not of type 'FileSystemDirectoryHandle'.");
      }
      const targetName = newName || name;
      if (destination.__entries.has(targetName) && destination.__entries.get(targetName).__locked) {
        const error = new Error("cannot be moved to a destination which is locked.");
        error.name = "NoModificationAllowedError";
        throw error;
      }
      destination.__entries.delete(name);
      node.name = targetName;
      destination.__entries.set(targetName, node);
    },
    __text: () => textOf(node.__bytes)
  };
  return node;
}

function makeDirectoryHandle(name, spec = {}) {
  const node = {
    kind: "directory",
    name,
    __entries: new Map(),
    __failCreate: null,
    async getFileHandle(childName, options2 = {}) {
      const existing = node.__entries.get(childName);
      if (existing) {
        if (existing.kind !== "file") {
          const error = new Error(`「${childName}」不是文件`); error.name = "TypeMismatchError"; throw error;
        }
        return existing;
      }
      if (!options2.create) {
        const error = new Error(`文件不存在：${childName}`); error.name = "NotFoundError"; throw error;
      }
      if (node.__failCreate) throw node.__failCreate;
      const file = makeFileHandle(childName, "");
      node.__entries.set(childName, file);
      return file;
    },
    async getDirectoryHandle(childName, options2 = {}) {
      const existing = node.__entries.get(childName);
      if (existing) {
        if (existing.kind !== "directory") {
          const error = new Error(`「${childName}」不是目录`); error.name = "TypeMismatchError"; throw error;
        }
        return existing;
      }
      if (!options2.create) {
        const error = new Error(`目录不存在：${childName}`); error.name = "NotFoundError"; throw error;
      }
      if (node.__failCreate) throw node.__failCreate;
      const child = makeDirectoryHandle(childName);
      node.__entries.set(childName, child);
      return child;
    },
    async removeEntry(childName, options2 = {}) {
      const existing = node.__entries.get(childName);
      if (!existing) { const error = new Error(`不存在：${childName}`); error.name = "NotFoundError"; throw error; }
      if (existing.kind === "directory" && !options2.recursive && existing.__entries.size) {
        const error = new Error("目录非空"); error.name = "InvalidModificationError"; throw error;
      }
      node.__entries.delete(childName);
    },
    /* 真 Chrome 的 values() 交出来的是**真句柄**（自己带 kind / name，也能继续
       getFileHandle / values），不是 {kind, name} 这种描述对象。1.7.22 这里交的是
       描述对象，background.js 只用 kind+name 所以没露馅；1.7.23 给 library.js 的
       scanRoot 写测试时立刻炸了（collectionEntry.values is not a function）。 */
    async *values() {
      for (const entry of [...node.__entries.values()]) yield entry;
    },
    async *keys() { for (const entry of [...node.__entries.values()]) yield entry.name; },
    async queryPermission() { return "granted"; },
    async requestPermission() { return "granted"; },
    __list: () => [...node.__entries.keys()],
    __has: (childName) => node.__entries.has(childName),
    __child: (childName) => node.__entries.get(childName),
    /** 递归导出成纯对象，断言用 */
    __dump() {
      const out = {};
      for (const [childName, entry] of node.__entries) {
        out[childName] = entry.kind === "file" ? entry.__text() : entry.__dump();
      }
      return out;
    }
  };
  for (const [childName, value] of Object.entries(spec)) {
    if (value && typeof value === "object" && !(value instanceof Uint8Array)) {
      node.__entries.set(childName, makeDirectoryHandle(childName, value));
    } else {
      node.__entries.set(childName, makeFileHandle(childName, value));
    }
  }
  return node;
}

/* ------------------------------------------------------------------ */
/* 把 background.js 整份跑起来                                          */
/* ------------------------------------------------------------------ */

/** 测试要够得着的内部函数。加了新测试就往这里加名字。 */
const BACKGROUND_EXPORTS = [
  "readStatsDatabase", "writeStatsDatabase", "flushStatsPendingRecords",
  "rollbackStatsRecords", "touchPetInDatabase", "statsDatabaseWriteBlocked",
  "archivePreviousStatsDatabase", "statsBackupTimestamp", "trimStatsBackups",
  "withStatsWriteSlot", "statsWriteChain",
  "setArchiveWriteLock", "clearArchiveWriteLock", "archiveWriteLockHeldBy",
  "createImportJournal", "rollbackImport", "cleanupLeftoverImport", "saveImportedItem", "importMetadata",
  "statsRecordForItem", "maskLocalUserPaths", "storageReportLabel",
  "discardFailedRecord", "renameFailureNote", "statsPendingRecords",
  "readStatsMirror", "applyStatsMirror", "syncStatsMirror", "publishStatsSnapshot",
  "archiveBrokenStatsDatabase",
  "createDirectoryOrExplain", "describeDirectoryCreateError",
  "saveFavorite", "readExistingRecordFolder", "bvOfInfoText", "favoriteLineOfInfoText",
  "loadBvIndex", "saveBvIndex", "enrichFavoriteMetadata", "buildInfo", "infoLineValue",
  // 1.12.4（审查 P2-2）：自定义路径打码要能被单独驱动
  "rememberLocalRoot", "maskKnownRoots",
  "writeFile", "fileExists",
  // 1.13.5（审查 P1-6）：对比残影的复位要能被真执行
  "diffReconcileState", "diffRun"
];

function loadBackground(options = {}) {
  const chrome = options.chrome || makeChrome(options);
  const warnings = [];
  const sandbox = {
    chrome,
    console: {
      log() {},
      warn: (...args) => warnings.push(args.map(String).join(" ")),
      error: (...args) => warnings.push(args.map(String).join(" ")),
      info() {}, debug() {}
    },
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    URL, URLSearchParams, TextEncoder, TextDecoder, structuredClone, crypto,
    fetch: options.fetch || (async () => { throw new Error("fetch 没有打桩"); }),
    caches: { open: async () => ({ match: async () => undefined, put: async () => {}, delete: async () => true }), delete: async () => true },
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    AbortController,
    __warnings: warnings
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  // 1.9.4：saveFavorite 要读 IndexedDB 里的根目录句柄。默认不给桩，需要时由用例传 options.indexedDB。
  if (options.indexedDB) sandbox.indexedDB = options.indexedDB;
  sandbox.BcaStatsCore = require("../stats-core.js");
  sandbox.BcaArchiveCore = require("../archive-core.js");
  const context = vm.createContext(sandbox);
  // module 类型的 service worker 里那两条 import 在 vm 里跑不了：两份经典脚本已经在上面注进去了。
  // 1.7.33 起 archive-core.js 也走这条路（易变字段的实现在那边，不再各抄一份）。
  const source = readSource("background.js").replace(/^import\s+"\.\/(?:stats-core|archive-core)\.js";\s*$/gm, "");
  if (/^import\s+"\.\/(?:stats-core|archive-core)\.js";/m.test(source)) throw new Error("background.js 的 import 没被剥掉");
  const tail = BACKGROUND_EXPORTS.filter((name) => new RegExp(`(?:function|const|let|var)\\s+${name}\\b`).test(source));
  vm.runInContext(`${source}\n;globalThis.__test = { ${tail.join(", ")} };\n`, context, { filename: "background.js" });
  sandbox.__missing = BACKGROUND_EXPORTS.filter((name) => !tail.includes(name));
  sandbox.__warnings = warnings;
  return sandbox;
}

/* ------------------------------------------------------------------ */
/* 从页面脚本里抠函数真跑                                               */
/* ------------------------------------------------------------------ */

/** 从源码里取出 `function <name>(...) { ... }` 的完整文本（按大括号配平）。 */
function carveFunction(source, name) {
  const at = source.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  if (at < 0) throw new Error(`源码里找不到函数 ${name}`);
  const open = source.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(at, i + 1);
    }
  }
  throw new Error(`函数 ${name} 的大括号没有配平`);
}

/** 取出 `const <name> = <表达式>;` 这一行（单行常量）。 */
function carveConst(source, name) {
  const match = source.match(new RegExp(`^const\\s+${name}\\s*=\\s*[^\\n]*;$`, "m"));
  if (!match) throw new Error(`源码里找不到常量 ${name}`);
  return match[0];
}

/** 把若干段源码拼成一个可调用对象：`buildModule({...})(["fnA","fnB"])` */
function buildModule(parts, globals = {}) {
  const names = Object.keys(globals);
  const values = names.map((key) => globals[key]);
  const body = `${parts.join("\n")}\n;return { ${parts.filter((p) => /^(?:async\s+)?function\s/.test(p.trim())).map((p) => p.trim().match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/)[1]).join(", ")} };`;
  // eslint-disable-next-line no-new-func
  return new Function(...names, body)(...values);
}

module.exports = {
  projectRoot,
  readSource,
  makeChrome,
  makeStorageArea,
  makeDirectoryTree: (spec) => makeDirectoryHandle("root", spec),
  makeDirectoryHandle,
  makeFileHandle,
  loadBackground,
  carveFunction,
  carveConst,
  buildModule,
  BACKGROUND_EXPORTS
};
