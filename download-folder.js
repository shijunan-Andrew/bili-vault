const DB_NAME = "bili-fav-archiver";
const DB_STORE = "settings";
const params = new URLSearchParams(location.search);
const directoryName = params.get("directory") || "";
const $ = (id) => document.getElementById(id);
const videoTitle = $("videoTitle");
const folderPath = $("folderPath");
const folderSummary = $("folderSummary");
const folderMessage = $("folderMessage");
const fileList = $("fileList");
const grantAccess = $("grantAccess");
let objectUrls = [];

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法读取本地目录设置。"));
  });
}

async function readSetting(key) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("无法读取本地目录设置。"));
    });
  } finally { db.close(); }
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function showMessage(text, isError = false) {
  folderMessage.hidden = false;
  folderMessage.classList.toggle("error", isError);
  folderMessage.textContent = text;
}

async function getParentFolder() {
  const mode = await readSetting("downloadFolderMode");
  const customFolder = await readSetting("downloadFolder");
  if (mode === "custom" || (!mode && customFolder)) {
    if (!customFolder) throw new Error("自定义下载目录设置已丢失，请重新选择下载位置后再试。");
    return customFolder;
  }
  const root = await readSetting("rootHandle");
  if (!root) throw new Error("找不到本地收藏根目录。请先在插件中设置保存位置。");
  return root.getDirectoryHandle("视频下载");
}

function fileIcon(name) {
  const extension = name.split(".").pop().toLowerCase();
  if (["mp4", "mkv", "webm", "m4s", "flv"].includes(extension)) return "▶";
  if (["png", "jpg", "jpeg", "webp"].includes(extension)) return "▧";
  if (["xml", "json", "txt", "srt", "ass", "vtt"].includes(extension)) return "≡";
  return "▤";
}

async function collectFiles(directory, prefix = "") {
  const files = [];
  for await (const entry of directory.values()) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "directory") files.push(...await collectFiles(entry, relativePath));
    else files.push({ name: entry.name, relativePath, handle: entry, file: await entry.getFile() });
  }
  return files;
}

function renderFiles(files) {
  objectUrls.forEach(URL.revokeObjectURL);
  objectUrls = [];
  fileList.replaceChildren();
  if (!files.length) {
    folderSummary.textContent = "目录中没有文件";
    showMessage("这个视频目录目前为空。本地收藏库将撤销该视频的“已下载”标记。 ");
    return;
  }
  folderSummary.textContent = `${files.length} 个文件 · ${formatBytes(files.reduce((sum, item) => sum + item.file.size, 0))}`;
  folderMessage.hidden = true;
  for (const item of files) {
    const row = document.createElement("article");
    row.className = "file-row";
    const icon = document.createElement("span");
    icon.className = "file-icon";
    icon.textContent = fileIcon(item.name);
    const copy = document.createElement("div");
    copy.className = "file-copy";
    const name = document.createElement("div");
    name.className = "file-name";
    name.textContent = item.name;
    name.title = item.relativePath;
    const path = document.createElement("div");
    path.className = "file-subpath";
    path.textContent = item.relativePath;
    copy.append(name, path);
    const size = document.createElement("span");
    size.className = "file-size";
    size.textContent = formatBytes(item.file.size);
    const date = document.createElement("span");
    date.className = "file-date";
    date.textContent = formatDate(item.file.lastModified);
    const open = document.createElement("a");
    open.className = "file-open";
    open.textContent = "打开文件";
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    const url = URL.createObjectURL(item.file);
    objectUrls.push(url);
    open.href = url;
    row.append(icon, copy, size, date, open);
    fileList.append(row);
  }
}

async function loadDirectory(requestPermission = false) {
  grantAccess.hidden = true;
  try {
    if (!directoryName) throw new Error("缺少视频目录名称。请从本地收藏库的视频详情页打开此页面。");
    const parent = await getParentFolder();
    let permission = await parent.queryPermission({ mode: "read" });
    if (permission !== "granted" && requestPermission) permission = await parent.requestPermission({ mode: "read" });
    if (permission !== "granted") {
      grantAccess.hidden = false;
      throw new Error("需要授权读取本地下载目录。点击上方按钮后按浏览器提示继续。");
    }
    const directory = await parent.getDirectoryHandle(directoryName);
    folderPath.textContent = `${parent.name} / ${directory.name}`;
    renderFiles(await collectFiles(directory));
    // 通知仍打开的收藏库页面重新核对徽标状态。
    await chrome.storage.local.set({ downloadRevision: crypto.randomUUID() });
  } catch (error) {
    folderSummary.textContent = "目录不可用";
    showMessage(error?.name === "NotFoundError" ? "找不到此视频的下载目录，可能已被移动或删除。" : error.message || "无法读取本地视频目录。", true);
  }
}

videoTitle.textContent = params.get("title") || "本地视频目录";
folderPath.textContent = directoryName || "未指定视频目录";
grantAccess.addEventListener("click", () => loadDirectory(true));
window.addEventListener("beforeunload", () => objectUrls.forEach(URL.revokeObjectURL));
loadDirectory().catch((error) => showMessage(error.message || "无法读取本地视频目录。", true));
