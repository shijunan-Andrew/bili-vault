# bilibili 2015 首页 · 1:1 复刻

复刻成品：[`index.html`](index.html)（692 KB 外壳 + `assets/` 里的图片，完全离线自包含：断网也能打开）。原页面：
<http://web.archive.org/web/20150701082208/http://www.bilibili.com/>

**点页面上的任何位置都会跳转到 <https://www.bilibili.com/>**（新标签页打开）。
660 个链接全部指向该地址；非链接元素（轮播圆点、侧边导航、标签页、搜索框、空白区域）由一段
内联的点击代理接管。

## 直接打开

双击 `index.html` 即可，不需要服务器、不需要联网。想用本地服务器预览：

```powershell
node tools/serve.js 8099        # http://127.0.0.1:8099/index.html
```

## 复刻到底有多"像"（请先看这段）

| 部分 | 状态 |
|---|---|
| 页头 / 主导航 / 搜索框 / 页脚 | **原始字节**：直接来自 2015-07-01 的归档 HTML |
| 顶部轮播、推广、10 个分区行、番剧表、特别推荐、在线人数 | **2015 真实数据**：来自归档的 `index/*.json`（**日期见下一节，有 4 份是错代替代品**） |
| 新投稿小角标（动画 84 / 音乐 57 …） | **真实数值**：来自归档 `online.js`（原页面由 JS 注入） |
| 十个分区的右栏排行榜 | **各自独立的数据**：每区取自己的 `/index/catalogy/<tid>-3day.json`，"全部"/"原创"= `hot.list` / `hot_original.list` |
| CSS | 2015 年 `new_z2.css`（259.6 KB，含内联 sprite） |
| 字体 / 背景 / 图标 | 原站 sprite，已 base64 内联 |
| 视频缩略图 | **大部分找回**：253 个槽位中 130 个有图（123 个来自档案、7 个是同 aid 的现行封面），123 个是灰色占位块 |
| 一周排行榜 | **7 个分区没有数据**（归档里根本没有捕获） |

### 分区排行榜的来源（同样带日期）

| 分区 | 本地文件 | 真实抓取时间 | 差 2015-07-01 |
|---|---|---|---|
| 动画 (tid 1) | `_ref/json/catalogy/1-douga-3day.json` | 2015-08-22 | +52 天 |
| 音乐 (3) | `3-music-3day.json` | 2015-07-11 | +10 天 |
| 游戏 (4) | `4-game-3day.json` | 2015-07-15 | +14 天 |
| 娱乐 (5) | `5-ent-3day.json` | 2015-07-15 | +14 天 |
| 电视剧 (11) | `11-teleplay-3day.json` | 2015-07-15 | +14 天 |
| 番剧 (13) | `13-bangumi-3day.json` | **2015-02-03** | −148 天 |
| 电影 (23) | `23-movie-3day.json` | 2015-07-15 | +14 天 |
| 科技 (36) | `36-technology-3day.json` | 2015-07-15 | +14 天 |
| 鬼畜 (119) | `119-kichiku-3day.json` | 2015-07-15 | +14 天 |
| 舞蹈 (129) | `129-dance-3day.json` | 2015-07-12 | +11 天 |

逐份时间戳与 SHA-1 见 [`_ref/json/catalogy/SOURCES.json`](_ref/json/catalogy/SOURCES.json)。

## 图片是怎么找回来的

2015 年的缩略图托管在 `i0|i1|i2.hdslb.com/<尺寸>/…`（如 `320_180/video/3b/3b233976….jpg`）。
这些主机今天仍在，但**当年的文件已经不存在**，Internet Archive 当年也没抓全。

整个页面（含样式表背景）一共需要 **475** 个图片文件：

| | 数量 | 说明 |
|---|---|---|
| 找回来了 | **325**（68.4%） | 257 个来自 Wayback，46 个今天仍在 CDN 上，22 个来自前一轮抓取；磁盘上 5.08 MiB |
| 永久消失 | **150**（31.6%） | 逐条复核：Wayback 内容接口 404 **且** CDX 索引在 2010–2018 全区间零捕获 |

具体到本页的图片槽位：**253 个槽位里 130 个有图，123 个留灰色占位**；样式表里 224 处
`url()` 已内联成图，27 处装饰性 sprite（jQuery-UI 主题、`battery/img/*`，本页根本不会显示）
换成透明像素。

**这些图是不是 2015 年那张？** 分两种，说法不一样：

- **顶部 6 张轮播大图：字节级确认。** 那批 URL 是 `promote/<md5>.jpg`，文件本身就是内容，下载
  回来的字节 md5 与文件名逐位相同（`tools/verify-md5.js`：6/6 命中）。
- **缩略图：不是"原文件"，是"同一张图"。** 这些 URL 是**尺寸前缀的转码件**
  （`320_180` / `240_180`），文件名里的 md5 是**原始上传**的 md5，转码后的字节当然对不上
  （实测 8/236 命中，那 8 个里 6 个就是轮播图）。所以不能声称"字节等于 2015"。
  能证明的是另一条：**同一个 URL 在任何年份抓下来都是同一张图**——
  `node assets/_tools/stability-proof.js` 用 2019 年的抓取重新下载了 8 个本地来自 2014/2015
  抓取的文件，**8 个字节全同、0 个不同**。也就是说档案里 2014 年抓的和 2019 年抓的是同一张，
  抓取年份不影响画面内容。
  （这条要重放得能连上 archive.org；我最后复跑时 archive.org 恰好不可达，只重放出了"文件名
  md5 不成立"那一半，所以 8/8 这个数字是队友那次运行的结果，脚本本身可重跑。）逐项来源见 [`assets/INDEX.md`](assets/INDEX.md)、
  [`assets/MANIFEST.json`](assets/MANIFEST.json)、[`assets/thumbs.json`](assets/thumbs.json)。

灰色占位的 123 个槽位保持 2015 年的原始尺寸，当年的图片地址留在 `data-empty` 属性里，方便
日后核对。**没有用别的视频的图去顶替。**

> 另有一条工具链细节：`assets/pic/` 里有 4 个文件扩展名是 `.png` 但内容是 JPEG 字节（2015 年的
> CDN 就是这么发的）。`tools/build.js` 用魔数判断真实类型再生成 `data:` URI，不信任扩展名。



## 一个必须说清楚的事：归档数据的**日期**

页面的骨架（页头、导航、页脚、CSS、链接结构）是**原封不动的 2015-07-01 归档字节**。但中间那些
动态面板的数据，取的是 Internet Archive 里**离 2015-07-01 最近的那一份**——有些最近份也不是
2015 年 7 月：

| 面板 | 数据抓取时间 | 差 2015-07-01 |
|---|---|---|
| 顶部轮播 `slideshow.json` | 2015-07-11 | +10 天 |
| 顶部排行（默认"三日"）`ranking-3day.json` | 2015-07-11 | +10 天 |
| 推广 `promote.json` | 2015-07-02 | +1 天 |
| `ding.json` / `ding-count.json` | 2015-07-11 / 2015-06-23 | ±10 天 |
| 一键三连位 `promote-12.json` | 2015-08-22 | +52 天 |
| 番剧表 `bangumi.json` | **2015-02-03** | −5 个月 |
| 特别推荐 `recommend.json` | **2016-01-04** | +6 个月 |
| 顶部排行"昨日"档 `ranking.json` | **2016-01-21** | +7 个月 |
| 顶部排行"一周"档 `ranking-week.json` | **2014-07-15** | −1 年 |

这不是我们偷懒：`recommend.json` 在整个 2015 年**一份归档都没有**，`ranking.json` 在 2015 年
一份也没有，`ranking-week.json` 在 2014–2016 区间各**只有一份**。要么用离得最近的那份，要么该
面板空着——我们选了前者，并把每一份的真实抓取时间都标出来。逐份证据（含 SHA-1 字节校验、
抓取时间探针）见 [`_ref/json/SOURCES.md`](_ref/json/SOURCES.md)。

## 目录

| 路径 | 内容 |
|---|---|
| `index.html` | **交付物**：692 KB 的页面壳（1.11.0 起图片不再是内联 base64，改成 `assets/` 下的外链） |
| `_ref/` | 归档原料：原始 HTML、head/body 片段、`new_z2.css`、`page.core.js` 等 |
| `_ref/json/` | 归档的 `index/*.json`（轮播/排行/推广/番剧/推荐…），`SOURCES.md` 记录每份的真实抓取时间 |
| `assets/` | 找回来的图片资源 + `MANIFEST.json` + `COVER-MAP.json` |
| `spec/structure.md` | 从归档 JS 还原出的 DOM 结构与数据字段映射规范 |
| `build/` | 中间产物：`index.css`（已内联 sprite）、`fragments.json`（各区块 HTML）、`data/online.json` |
| `tools/` | 全部脚本，见下 |

## 重新构建

```powershell
node build/generate.js            # 归档 JSON → 各区块 HTML（build/fragments.json）
node tools/offline.js --no-inline # new_z2.css → build/index.css（图片写成 assets/… 相对路径）
node tools/build.js               # 组装 index.html（内联 CSS、改链接、注入点击代理）
node tools/verify.js              # 验收检查（链接、离线自包含、结构、计数器）
node tools/verify-md5.js          # 内容寻址图片的字节级校验
```

> **1.11.0 起默认输出「外链形态」**：图片留在 `assets/`，`index.html` 里写 `src="assets/…"`。
> 原因：老形态把 551 处引用全部内联成 base64，其中只有 192 张唯一图片 —— 重复占了 6.6 MB。
> 想要回「单文件、随手拷走」的形态，构建时加一个开关：
> `node tools/build.js` 之外先跑 `INLINE_LIMIT=Infinity node tools/build.js`（此时 `offline.js`
> 也不要带 `--no-inline`）。两种形态的渲染完全一致，`tools/verify.js` 两种都认。
> 扩展发行包里只带**运行期子集**（`index.html` + `egg-2015.js` + `assets/` 里的图片），
> 清单与排除规则写在仓库根的 `pack.ps1`。

`tools/build.js` 做的事：删掉归档页里的所有 `<script>`、用生成的区块**整体替换**归档
`#index_container` 里那两行空占位（`container-top-wrapper` + `#b_promote`）、把
`build/index.css` + `jquery-ui.css` 内联成 `<style>`、把 `<img data-img="…">` 换成 base64
（`INLINE_LIMIT=Infinity`）或 `assets/` 相对路径（默认）、
把所有 `<a href>` 改写为 `https://www.bilibili.com/`，并在最后追加点击代理。

## 已知取舍

- **打开方式是新标签页**（`target="_blank"`）。要求"点击任何元素都跳转到现在的 b 站主页"，新
  标签页能保住复刻页本身不被覆盖；要改成当前标签页，把 `tools/build.js` 里的 `TARGET` 行去掉
  `target="_blank"` 并重新构建即可。（非链接元素、轮播圆点、侧边导航、搜索框由捕获阶段的点击
  代理调用 `window.open`，实测点"推广"标题会打开 https://www.bilibili.com/ 。）
- 侧边浮动导航（`#index_nav`）在原站由 JS 定位，静态版按原几何（贴右、垂直居中）在 CSS 里
  还原。
- 在线人数用的是归档 HTML 里的 `在线:271992 / 正在观看:309274`；`online.js` 同时抓到的另一组
  数值（89580 / 102968）时间更早，未采用。
- 少数样式表背景图（jQuery-UI 主题的 `ui-bg_*` / `ui-icons` sprite）全网已无，用 1×1 透明像素
  顶替，仅影响本页不显示的弹窗样式。
- 一周排行榜（`-week`）只有 3 个分区有归档，本页对没有数据的分区保留"一周"档但不渲染内容。
