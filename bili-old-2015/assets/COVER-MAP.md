# COVER-MAP

Thumbnail backfill for the 2015-07-01 homepage replica.

Every 2015 video thumbnail was served from `i0|i1|i2.hdslb.com`, a host that is dead today. Each archived video is matched by `aid` against the live API `https://api.bilibili.com/x/web-interface/view?aid=<aid>`, and the **current** cover (`data.pic`) is downloaded to `assets/cover/<aid>.<ext>`.

- `aid` — archived video id.
- `title` — title from the API when it answered, otherwise the archived 2015 title (truncated to 40 chars).
- `status` — `downloaded` (valid image on disk) | `missing` (deleted/private, API returned a non-zero code) | `failed` (network/HTTP/validation failure) | `not attempted` (run was interrupted or limited).
- `local file` — path under `assets/cover/`, empty when nothing was written.
- `source pic URL` — the cover url the API returned (the 2015 archived url is shown for entries whose API lookup never succeeded).
- `reason` — empty for `downloaded`; otherwise the API code/message or the failure detail.
- `from` — the archived JSON payload(s) the aid was collected from.

Generated: 2026-10-13T14:03:52.626Z · node v24.21.0 · `node tools/fetch-covers.js`

**Summary — total aids: 319 · downloaded: 189 · missing (deleted/private): 130 · failed: 0 · not attempted: 0**

| aid | title | status | local file | source pic URL | reason | from |
| --- | --- | --- | --- | --- | --- | --- |
| 68389 | 殴打时配这个BGM没问题吗？ | missing |  | http://i2.hdslb.com/user/167/16756/12c443301-2514.gif | api code 62002 稿件不可见 | ding.json |
| 227058 | 【国产】中华小子 01-26话（全） | missing |  | http://i1.hdslb.com/320_180/user/403/40375/13311271630c5dff16f68a6b7e.png | api code -404 啥都木有 | ding.json |
| 282624 | 【岚少实况】 Hash Beat Step 【完结】【日文恐怖游戏】 | downloaded | assets/cover/282624.jpg | http://i0.hdslb.com/320_180/user/3743/374377/13394887484bd0b58850495f60.jpg |  | ding.json |
| 361216 | 【kz x 中島愛】「Transfer」Music Video | downloaded | assets/cover/361216.jpg | http://i1.hdslb.com/user/1869/186935/13483013966097754525e02c22.jpg |  | recommend.json |
| 520815 | 【凑诗】下弦之月（原唱：96猫）【中文填词翻唱】 | downloaded | assets/cover/520815.jpg | http://i2.hdslb.com/320_180/u_f/929fd9c1fbb72f90e4f44f5bf7437c8c.jpg |  | ding.json |
| 617629 | 【喘息 カブタン えふとん なみ(仮)】彩虹女孩 | downloaded | assets/cover/617629.jpg | http://i2.hdslb.com/320_180/u_user/8d4de58e3a6590e6dcb8a50c7b31e12e.jpg |  | ding.json |
| 621729 | 【泰剧】名门绅士之妙手佳人【全10集】 | missing |  | http://i2.hdslb.com/320_180/u_f/0260648526d0513122b407b2e963d3e7.jpg | api code 62002 稿件不可见 | ding.json |
| 646278 | Only My railgun神翻唱((比销魂版更销魂~~ | downloaded | assets/cover/646278.jpg | http://i2.hdslb.com/320_180/u_user/a0057b04912c8d972a2c12220e046d80.jpg |  | ding.json |
| 651480 | 【喵玉手书汉化】四季映姬的事件簿【第十七话】 | downloaded | assets/cover/651480.jpg | http://i0.hdslb.com/u_f/09f88a9e68d3a8b9a5c41627d0ad8f24.jpg |  | recommend.json |
| 658610 | 星际争霸二国服 虫群之心 残酷剧情 | downloaded | assets/cover/658610.jpg | http://i0.hdslb.com/320_180/u_f/f2f92698818b8e08e3c91c9de5a33d3c.jpg |  | ding.json |
| 803056 | 【東方MMD】ICE⑨战队－塞钱篇－(后編) | downloaded | assets/cover/803056.jpg | http://i2.hdslb.com/320_180/u_f/b6bedb25c40137d15950902fc7babef8.jpeg |  | ding.json |
| 871129 | 西游记11个版本大比拼 | downloaded | assets/cover/871129.jpg | http://i0.hdslb.com/320_180/u_f/bf8753533fbc36a9691f1213dca93328.jpg |  | ding.json |
| 907450 | 吾王Saber燃曲万能向~绝对燃爆你的听觉神经 剧透：最后是拔剑神曲，毫无违和感 | downloaded | assets/cover/907450.jpg | http://i1.hdslb.com/320_180/u_f/aec54aee24472764204e6f2a69d5eb3f.jpg |  | ding.json |
| 1002217 | 【北大力南逸峰】我的故事（完整版） | downloaded | assets/cover/1002217.jpg | http://i2.hdslb.com/320_180/u_user/a7436df4e34fa4d3becb9b62b2e3149f.jpg |  | ding.json |
| 1076887 | 【2012深夜日剧 渡边麻友】鲭鱼偶像/欺诈偶像【喜剧】 | missing |  | http://i2.hdslb.com/320_180/u_user/36cf8d30768f3c79836d9804091a9223.jpg | api code -404 啥都木有 | ding.json |
| 1097315 | 暴走大事件 第二季 10 | missing |  | http://i0.hdslb.com/320_180/u_user/d4727fcbec2c344b0c52f816d8bf20e7.jpg | api code -404 啥都木有 | ding.json |
| 1108618 | 【银土】手书—粘着系男子的15年纠缠不休 | downloaded | assets/cover/1108618.jpg | http://i0.hdslb.com/320_180/u_user/b041668a707ad5f5af64076f7222471f.jpg |  | ding.json |
| 1144009 | 【高清/漫改/治愈】白兔糖真人版（芦田爱菜/松山健一/香里奈/桐谷美玲） | missing |  | http://i2.hdslb.com/320_180/u_user/c049da5f93da19b7f5deb304713cffd2.jpg | api code -404 啥都木有 | ding.json |
| 1186139 | 过去同步都弱爆了~！ | missing |  | http://i2.hdslb.com/320_180/u_user/a5fb73c5027822cf1a2e8fdf8a9252bd.jpg | api code 62002 稿件不可见 | ding.json |
| 1241827 | 【大河剧】平清盛（2012） | missing |  | http://i2.hdslb.com/320_180/u_user/bff88db66e6d80a9814013a30b189710.jpg | api code 62002 稿件不可见 | ding.json |
| 1266401 | 【7月】花舞少女 01 | missing |  | http://i2.hdslb.com/240_180/video/74/748a7ba3a6c3a883f07de2449c61d918.jpg | api code -404 啥都木有 | ranking-week.json |
| 1266405 | 【7月】搞姬日常 01【幻之】 | missing |  | http://i2.hdslb.com/240_180/u_user/76d6c008d4b36b5dbb79805836eb7cc3.jpg | api code -404 啥都木有 | ranking-week.json |
| 1266411 | 【7月】Re：␣浜虎（第二季）01 | missing |  | http://i0.hdslb.com/240_180/video/c3/c359e05b4e0779a422a0826072162c01.jpg | api code -404 啥都木有 | ranking-week.json |
| 1266467 | 【7月】青春之旅 01 | downloaded | assets/cover/1266467.png | http://i0.hdslb.com/240_180/video/31/31d88b59cc78ae1842e021882a1cc3d8.jpg |  | ranking-week.json |
| 1266539 | 【神融合AMV】现实与二次元幻想 | downloaded | assets/cover/1266539.jpg | http://i0.hdslb.com/240_180/u_user/eb0ce4da725ac72777670598dba2778c.jpg |  | ranking-week.json |
| 1266635 | 万万没想到 第二季：第2集 | downloaded | assets/cover/1266635.jpg | http://i1.hdslb.com/240_180/u_f/f33f2ad46007422a507a0a806a72396f.jpg |  | ranking-week.json |
| 1266854 | 完美世界DOTA2 2014年国际邀请赛 中国战队征战西雅图 宣传片 | downloaded | assets/cover/1266854.jpg | http://i2.hdslb.com/240_180/u_user/3543898541d1a22ae0eb7a00c5d1ea70.jpg |  | ranking-week.json |
| 1266959 | 【金坷垃】肥一直下 feat.元首 德国boy 标准结局篇 | missing |  | http://i1.hdslb.com/240_180/u_user/a2bef407046e9b5c67093d37c7446183.jpg | api code 62002 稿件不可见 | ranking-week.json |
| 1267215 | 吓！炸！肾！大片级实况【死魂曲: 新解】被吓到另一个世界线上了!【第8-9章】 | downloaded | assets/cover/1267215.jpg | http://i0.hdslb.com/240_180/video/72/72d16683dba341b3c54d86a075e33a0a.jpg |  | ranking-week.json |
| 1267572 | 当胡椒粉遇上洗手液，如此简单就带来惊讶 | downloaded | assets/cover/1267572.jpg | http://i1.hdslb.com/240_180/u_f/2ee9d807fce2df0609584e6a3be82434.jpg |  | ranking-week.json |
| 1267620 | 【暴走翻唱】千本幼女【完整版】 | missing |  | http://i0.hdslb.com/240_180/video/1a/1a733758b4a2ffb9692db12a4a2a9f2c.jpg | api code 62002 稿件不可见 | ranking-week.json |
| 1268450 | 日本屌丝 第一集 | missing |  | http://i2.hdslb.com/240_180/u_f/850d49ca9bfc41100f475d300c49288e.jpg | api code 62002 稿件不可见 | ranking-week.json |
| 1268718 | 鲁鲁修正确的打开方式~~【友军之围】 | missing |  | http://i2.hdslb.com/240_180/u_user/f8802efbcd17cf0424c2a1839f463cb0.jpg | api code -404 啥都木有 | ranking-week.json |
| 1268767 | 【偶像言情】杉杉来了/杉杉来吃 01-03【顾漫小说改编】 | missing |  | http://i2.hdslb.com/240_180/u_user/a73dd002d50b03c262af44ba6b597939.jpg | api code -404 啥都木有 | ranking-week.json |
| 1269118 | 【二次元专属舞蹈】一起跳二次元广场舞！我们要和大妈决一死战！【NERV宅舞总部】 | downloaded | assets/cover/1269118.jpg | http://i1.hdslb.com/240_180/video/8b/8ba7ba03723ad10369fb39154ee4c070.jpg |  | ranking-week.json |
| 1269404 | 中日合作：[在幻想乡中心呼唤爱]日语配音版 | downloaded | assets/cover/1269404.jpg | http://i0.hdslb.com/240_180/u_user/d3b59db5497d94e6005dd719b706d018.jpg |  | ranking-week.json |
| 1269935 | 【7月】桃剑 01 | missing |  | http://i1.hdslb.com/240_180/video/42/4290b3051487e4fe3b94cd5e83153210.jpg | api code -404 啥都木有 | ranking-week.json |
| 1270057 | 一句歌毁掉古剑正剧 | downloaded | assets/cover/1270057.jpg | http://i0.hdslb.com/240_180/u_user/1a0250e006960181727873cd16210b5a.jpg |  | ranking-week.json |
| 1270248 | 【治愈系】谢谢你 让我学会放手【综漫】 | missing |  | http://i2.hdslb.com/240_180/u_user/8e46881c66ff146e85199113b4f50732.jpg | api code 62002 稿件不可见 | ranking-week.json |
| 1270861 | 【神BGM】浪客剑心追忆篇 | downloaded | assets/cover/1270861.jpg | http://i1.hdslb.com/240_180/video/78/7873a4409054b047d7abedf030637519.jpg |  | ranking-week.json |
| 1270900 | 羞耻感什么的，棒子已经丢掉了 | missing |  | http://i0.hdslb.com/240_180/u_user/94ee2033a57da8d322668b15c1b410fe.jpg | api code 62002 稿件不可见 | ranking-week.json |
| 1270922 | 《Game囧很大》没女游戏直播鬼畜合集 | downloaded | assets/cover/1270922.jpg | http://i2.hdslb.com/240_180/u_f/efb632d9c389806d9f9a3d7ef3f6e1c9.jpg |  | ranking-week.json |
| 1271205 | 【三千宫魔王】背叛的晚霞【Drr】 | downloaded | assets/cover/1271205.jpg | http://i0.hdslb.com/240_180/u_user/6e115ff47da60cea0ee87dda71b1ce73.jpg |  | ranking-week.json |
| 1272041 | 【10月】全职猎人2011 第137话 选举篇【异域】 | missing |  | http://i1.hdslb.com/240_180/video/d8/d852267b2449a0fcb6aa5c4d3008abde.png | api code -404 啥都木有 | ranking-week.json |
| 1272152 | 60秒 将改变你的思想 | downloaded | assets/cover/1272152.jpg | http://i2.hdslb.com/240_180/u_user/4162fcab319699235798e1ac7f7b2e4b.jpg |  | ranking-week.json |
| 1272190 | 【DOTA2TI4应援】中国队加油！重夺荣耀！问鼎DOTA！ | downloaded | assets/cover/1272190.jpg | http://i1.hdslb.com/240_180/video/51/51a64dfd152486f59e08aa627672409c.jpg |  | ranking-week.json |
| 1272593 | 【7月】Free! 第二季 02 | missing |  | http://i2.hdslb.com/240_180/video/84/84074bef27ccec1e43f219f743bc3cbc.jpg | api code -404 啥都木有 | ranking-week.json |
| 1272637 | 古剑奇谭电视剧现代宣传片 大西轰帅到没朋友 | downloaded | assets/cover/1272637.jpg | http://i2.hdslb.com/240_180/u_user/6a58af52d424a6fcd10ba20426f0159a.jpg |  | ranking-week.json |
| 1272674 | 【仙侠玄幻古装剧】古剑奇谭 05-06【游戏改编】 | missing |  | http://i0.hdslb.com/240_180/u_user/da73757e800d37ae991ef44068241b6c.jpg | api code -404 啥都木有 | ranking-week.json |
| 1272862 | 【若风冷门】灭世妖狐！华丽漂移秀爆全场 | downloaded | assets/cover/1272862.jpg | http://i1.hdslb.com/240_180/video/e5/e51005247c028568152eb739346e25fc.jpg |  | ranking-week.json |
| 1273190 | 【清晰HDTC】【明日边缘】汤姆克鲁斯全金属杀戮轮回【官方中字高分科幻2014】 | missing |  | http://i0.hdslb.com/240_180/u_user/1ebf01797ac8b02dc8604fc45f997ba3.jpg | api code -404 啥都木有 | ranking-week.json |
| 1273211 | 【每日一暴精彩合集】暴漫造星工程开屎 涮尽节操刷爆底线 | missing |  | http://i1.hdslb.com/240_180/video/29/296be156d2fd581ea24ee36c51f4e94c.jpg | api code -404 啥都木有 | ranking-week.json |
| 1273760 | 植物大战僵尸2未来世界 | downloaded | assets/cover/1273760.jpg | http://i0.hdslb.com/240_180/u_user/54b63fd125965b5d7e0d9a5d52afccf1.jpg |  | ranking-week.json |
| 1273772 | [散人]直播欢乐瞬间（第二期） | downloaded | assets/cover/1273772.jpg | http://i0.hdslb.com/240_180/video/1f/1f42c49d267c26581f02dead82347fa8.jpg |  | ranking-week.json |
| 1273786 | 【高橋貓】手把手教你捏一个妹纸 | downloaded | assets/cover/1273786.jpg | http://i1.hdslb.com/240_180/u_user/f3ae497a6baf5c3922b4cfa9ad736027.jpg |  | ranking-week.json |
| 1273822 | 那些年我们空耳过的动漫歌曲精选 第十九弹 | downloaded | assets/cover/1273822.jpg | http://i1.hdslb.com/240_180/video/e2/e21e2f4b8b79596e698c254084e886bb.jpg |  | ranking-week.json |
| 1273889 | 【MAD】NGNL - 最弱的最强 [完结纪念] | downloaded | assets/cover/1273889.jpg | http://i1.hdslb.com/240_180/video/dc/dc7459bc8d0586226a8f0da8c9cf874c.jpg |  | ranking-week.json |
| 1274089 | 【古剑基谭】大师兄不干了啦【越苏大法好】 | downloaded | assets/cover/1274089.jpg | http://i0.hdslb.com/240_180/u_user/5cc104e78974e9bf77781b16521075a9.jpg |  | ranking-week.json |
| 1274135 | 【小缘翻唱】白梦之茧～Ricordando il passato～ | downloaded | assets/cover/1274135.jpg | http://i2.hdslb.com/240_180/video/f8/f83eef51c6bf28d2af4c9b629f1c4b06.jpg |  | ranking-week.json |
| 1274586 | 我的游戏开发日记02 | downloaded | assets/cover/1274586.jpg | http://i2.hdslb.com/240_180/video/b3/b30990911f6e97cc6748feab6805e984.jpg |  | ranking-week.json |
| 1274658 | 【节操君】评点那些知名UP主(第2期) | missing |  | http://i0.hdslb.com/240_180/video/2c/2cd4526abb60abfa602ce5679a04829e.jpg | api code 62012 62012 | ranking-week.json |
| 1275467 | 【尋音】東京喰種OP-unravel（Dubstep dj-Jo）【国人翻唱】 | missing |  | http://i0.hdslb.com/240_180/u_user/9668c75728765d30d17cb768609cace8.jpg | api code 62002 稿件不可见 | ranking-week.json |
| 1275723 | 深井冰配音版lovelive 第一话 | missing |  | http://i0.hdslb.com/240_180/video/15/15f007772e983db7490704833d768b97.jpg | api code 62002 稿件不可见 | ranking-week.json |
| 1275998 | 【7月】 东京食尸鬼 02 | missing |  | http://i0.hdslb.com/240_180/video/af/af6fa1526c43b71374d6bc019b7948ad.jpg | api code 62002 稿件不可见 | ranking-week.json |
| 1276025 | 【仙侠玄幻古装剧】古剑奇谭 07-08【游戏改编】 | missing |  | http://i0.hdslb.com/240_180/u_user/9b5f64de47f2d02baaa55d0bb03c7524.jpg | api code -404 啥都木有 | ranking-week.json |
| 1276040 | 【允星河】节操同好会（二）——这是我做过最正经的一次 | missing |  | http://i1.hdslb.com/240_180/video/cb/cb400aba8065896ffc8925f10cb9c884.jpg | api code 62002 稿件不可见 | ranking-week.json |
| 1276067 | 【小福利】 心跳的旋律！！！ | missing |  | http://i0.hdslb.com/240_180/video/64/64a17a0a9676e01f5107c2bd866c9581.jpg | api code -404 啥都木有 | ranking-week.json |
| 1276087 | 【7月】东京残响 01 | missing |  | http://i2.hdslb.com/240_180/video/ad/ade2e3ce836b1a716078059c3cb07037.jpg | api code 62002 稿件不可见 | ranking-week.json |
| 1276675 | 暴走大事件 第三季 03 | missing |  | http://i1.hdslb.com/240_180/video/41/41abd668e831e22b27942bc1a3c10afb.jpg | api code -404 啥都木有 | ranking-week.json |
| 1276729 | 【电视剧古剑奇谭 苏兰苏】古剑奇谭之 标准偶像剧 | missing |  | http://i1.hdslb.com/240_180/u_user/1f2105d2ce0d034b94163368f5edc6b0.jpg | api code 62002 稿件不可见 | ranking-week.json |
| 1276951 | 【7月日剧】孤独的美食家 第四季01【SABER】 | missing |  | http://i0.hdslb.com/240_180/video/9c/9c36235e54c219b50f3192bf8d031506.jpg | api code -404 啥都木有 | ranking-week.json |
| 1276981 | 我把敌人包围了！向我开....原子弹？！【德军总部：新秩序】完结 | downloaded | assets/cover/1276981.jpg | http://i1.hdslb.com/240_180/video/a5/a561a1b10532cbc4c6c6a4828b790956.jpg |  | ranking-week.json |
| 1277658 | [MAD樱花庄 | missing |  | http://i1.hdslb.com/240_180/u_user/ccbc3d77b6994005e9f11050c67a8098.jpg | api code 62012 62012 | ranking-week.json |
| 1277713 | 【军武次位面Lite】08：御风而战 | downloaded | assets/cover/1277713.png | http://i1.hdslb.com/240_180/video/18/1834c07277c3a537e5a43c87cd5ba3aa.png |  | ranking-week.json |
| 1278001 | 【渣制作】献给B站所有的学渣们 学渣之怨念 | missing |  | http://i0.hdslb.com/240_180/video/62/62b1b66fa29654cae790753cc0798ee7.jpg | api code 62002 稿件不可见 | ranking-week.json |
| 1278409 | 不剧透的才是好孩子 | downloaded | assets/cover/1278409.jpg | http://i0.hdslb.com/240_180/video/c3/c3503841cb5bad3b02fffc103d863363.jpg |  | ranking-week.json |
| 1279300 | 【绘图录像】幽幽子同人绘，墨染之樱听歌向 | downloaded | assets/cover/1279300.jpg | http://i1.hdslb.com/240_180/video/94/949a49f0cfb65d5f2adecf4354cfd7e1.jpg |  | ranking-week.json |
| 1279525 | 纯黑《看门狗》迅猛式视频攻略解说 第九期 最高难度 中文剧情 | downloaded | assets/cover/1279525.jpg | http://i2.hdslb.com/240_180/video/ef/ef495413b8c79f2c5477ef1b7dc9a5d8.jpg |  | ranking-week.json |
| 1279574 | 【7月】三坪房间的侵略者 01 | missing |  | http://i2.hdslb.com/240_180/video/d4/d4daaf69a9eb226287c0cdff7f7d4c09.jpg | api code -404 啥都木有 | ranking-week.json |
| 1279663 | 冰爽一夏③-水羊羹&amp;抹茶水羊羹 | missing |  | http://i1.hdslb.com/240_180/video/26/266dd59ac6dd4d5ff47fb06e44932e95.jpg | api code 62002 稿件不可见 | ranking-week.json |
| 1279708 | 【老E】史上最业余的足球游戏 | downloaded | assets/cover/1279708.jpg | http://i0.hdslb.com/240_180/video/e2/e23082448a48995d37f3868a4f568a37.jpg |  | ranking-week.json |
| 1279911 | 编辑部的故事：08 暴走动物园:断禁的人与兽 | missing |  | http://i0.hdslb.com/240_180/video/d3/d3a899686f524b419cf7e5320f05ca22.jpg | api code -404 啥都木有 | ranking-week.json |
| 1280335 | 究极外挂生物！Up主已成功向非人类完成进化 | downloaded | assets/cover/1280335.jpg | http://i0.hdslb.com/240_180/video/aa/aa6a50653a66efd60397066c20d24e26.jpg |  | ranking-week.json |
| 1280529 | 这游戏应该推荐给仇人玩【德国BOY附体】 | downloaded | assets/cover/1280529.jpg | http://i0.hdslb.com/240_180/video/91/91d3a4d3dec04b3de084a05c20150eea.jpg |  | ranking-week.json |
| 1280642 | 战斗方块剧场高手向实况，一！二！三！四！四步教你成高手 | downloaded | assets/cover/1280642.jpg | http://i0.hdslb.com/240_180/video/df/df4b59d068cc61c1da83a434fd4966a6.jpg |  | ranking-week.json |
| 1280933 | 【4月】JOJO的奇妙冒险 星尘十字军 15【JOJO奇妙冒险吧&amp;... | missing |  | http://i1.hdslb.com/240_180/video/b1/b12353d9d9b97d912f91c7f921217d6e.jpg | api code 62002 稿件不可见 | ranking-week.json |
| 1281219 | 【金坷垃】sleeping kela | downloaded | assets/cover/1281219.jpg | http://i0.hdslb.com/240_180/video/e9/e9b01458d7d2e7243e900fc4d250c5a5.png |  | ranking-week.json |
| 1281859 | 【26位少男少女让你承包鱼塘】blessing【男女双组】 | downloaded | assets/cover/1281859.jpg | http://i2.hdslb.com/240_180/u_user/f295d190b4a61ecf173f358931ad91c4.jpg |  | ranking-week.json |
| 1282110 | Pi,mc怒射森林P7~9 | downloaded | assets/cover/1282110.jpg | http://i0.hdslb.com/240_180/u_user/49d6550d78a2c4175d66049226295ab7.jpg |  | ranking-week.json |
| 1282362 | 【7月】刀剑神域 第二季 02 | missing |  | http://i1.hdslb.com/240_180/video/0c/0ca6f1ede6d04359b5b18fbdc0dcbb4b.jpg | api code 62002 稿件不可见 | ranking-week.json |
| 1283471 | 【4月】魔法科高校的劣等生 15【华盟x澄空】 | missing |  | http://i1.hdslb.com/240_180/u_user/c8488132689abeebdee2ad7adc634488.jpg | api code -404 啥都木有 | ranking-week.json |
| 1283825 | 【法国超短剧】总而言之 61 女友炮友的修罗场【弘子】 | missing |  | http://i0.hdslb.com/240_180/video/49/49017a5c8db58ee630853550b54aa255.jpg | api code -404 啥都木有 | ranking-week.json |
| 1283860 | 陆夫人自（女）攻（版）自（男）受（版）绘制过程？！ | downloaded | assets/cover/1283860.jpg | http://i2.hdslb.com/240_180/video/70/7059d7d79f2a3337e16ecb4ea74dff70.jpg |  | ranking-week.json |
| 1284645 | 【古剑奇谭 · 越苏】生命之花（三生三世）by无良猫控 | downloaded | assets/cover/1284645.jpg | http://i1.hdslb.com/240_180/u_user/2a314dbb7092f1bc83d1321640bdea09.jpg |  | ranking-week.json |
| 1284806 | 【闲言】浓缩卡婊30年经典 鬼武者魂要钱又要脸 | downloaded | assets/cover/1284806.jpg | http://i2.hdslb.com/240_180/u_user/34e9dc2d137164fd28419b65decb7522.jpg |  | ranking-week.json |
| 1285112 | 深井冰配音版lovelive 第2~3话 | downloaded | assets/cover/1285112.jpg | http://i1.hdslb.com/240_180/video/84/84a8e878ce0fde66c698487db51681b1.jpg |  | ranking-week.json |
| 1285697 | 【板绘】画只魔理沙~专治上升气流五百年XDD（有声读物） | downloaded | assets/cover/1285697.jpg | http://i2.hdslb.com/240_180/u_user/1b4b6aa4dbd33f6f9939e344cf3d2568.jpg |  | ranking-week.json |
| 1285828 | 【7月】浦安铁筋家族 02 | downloaded | assets/cover/1285828.jpg | http://i0.hdslb.com/240_180/video/d3/d3ed857cae009b9399aba417ef45a5c7.jpg |  | ranking-week.json |
| 1286064 | 【7月】斩·赤红之瞳 02 | missing |  | http://i2.hdslb.com/240_180/video/17/172dbdac78eb540abf6f32f84f22e699.jpg | api code -404 啥都木有 | ranking-week.json |
| 1286204 | 【7月】月刊少女野崎君 02 | missing |  | http://i2.hdslb.com/240_180/video/8f/8f2aa1ce5277b09c77a27bf0fbbf518a.jpg | api code -404 啥都木有 | ranking-week.json |
| 1288548 | 日本屌丝 第二集 命运的邂逅 | missing |  | http://i2.hdslb.com/240_180/u_f/850d49ca9bfc41100f475d300c49288e.jpg | api code -404 啥都木有 | ranking-week.json |
| 1290098 | 万万没想到 第二季：第3集 | downloaded | assets/cover/1290098.jpg | http://i2.hdslb.com/240_180/u_user/7116894e5760d289aa777374cedc4d2d.jpg |  | ranking-week.json |
| 1302859 | 【VS岚】【字】140710 2小时SP- 关8 小园浩己 （游戏部分） | missing |  | http://i1.hdslb.com/320_180/u_user/1d99e631eb83241e975c7fc37fcded4a.jpg | api code -404 啥都木有 | ding.json |
| 1345743 | 【法鲨】【英剧】【中字】女巫 HEX 第一季【2005】 | missing |  | http://i1.hdslb.com/320_180/u_user/1663874011dc288b4e50bd97e2cfc4d5.jpg | api code -404 啥都木有 | ding.json |
| 1404335 | 【史蒂芬·斯皮尔伯格-经典冒险科幻片】第三类接触.1977.720P-高清版 | missing |  | http://i0.hdslb.com/320_180/video/a6/a64be8e157e78e232a3de9c049ebd89a.jpg | api code -404 啥都木有 | ding.json |
| 1490912 | 【高清】在无限大的梦想之后 就算是空无一物的世界也一定可以飞翔 | downloaded | assets/cover/1490912.jpg | http://i2.hdslb.com/320_180/u_user/9dd2b725053da0c43ef5bc9d8508d2ac.jpg |  | ding.json |
| 1665218 | 【合集】旋风管家！第一季【官方中文正版】 | missing |  | http://i0.hdslb.com/320_180/video/46/463b6a73368dd0230d4fa031e5c0ff48.jpg | api code 62002 稿件不可见 | promote.json |
| 1673690 | 那些年追过的电视剧和歌曲（一） | downloaded | assets/cover/1673690.jpg | http://i2.hdslb.com/320_180/u_user/785030478e2aa7eb0499c48ce4e495da.jpg |  | ding.json |
| 1688783 | 【军烨】情敌见面分外脸红——《画魂》军烨CUT | missing |  | http://i1.hdslb.com/320_180/video/3d/3df11f9bcab7947d6cbb47751233df7f.jpg | api code -404 啥都木有 | ding.json |
| 1830404 | 【合集】无头骑士异闻录 第一季 | downloaded | assets/cover/1830404.jpg | http://i2.hdslb.com/320_180/video/7a/7adf675ee556102840572a90ddfab59c.jpg |  | ding.json |
| 1901205 | 2014下半年B站动画区收藏超4千的自制类投稿排行 | missing |  | http://i1.hdslb.com/320_180/video/4f/4f2f26820752749d102aaad8043098e4.jpg | api code -403 访问权限不足 | ding.json |
| 1906435 | 【合集】黑子的篮球 第一期【bilibili正版】 | downloaded | assets/cover/1906435.jpg | http://i1.hdslb.com/320_180/video/f9/f958dec6687f50caeaacb1036ca581c0.jpg |  | ding.json |
| 1913081 | 【合集】夏目友人帐 叁【bilibili正版】 | downloaded | assets/cover/1913081.jpg | http://i1.hdslb.com/320_180/video/57/57bd6b0628b1b81ac0ba803e9ac4e6e0.jpg |  | ding.json |
| 1919425 | 【小杰X汤瑞】高能的 Lamb ♬ 投稿一周年❤ 么么哒☆ | downloaded | assets/cover/1919425.jpg | http://i0.hdslb.com/320_180/video/dc/dcdd13b76a3c11575c476625c57d5467.jpg |  | ding.json |
| 1923035 | 【百家讲坛】国号（全集） | missing |  | http://i0.hdslb.com/320_180/video/33/33193f14b8edc8ad6fdd1b29b4b803fe.jpg | api code -404 啥都木有 | ding.json |
| 1936005 | 【日本宅男】后半部 公介品尝中国军粮 收到了日本绅士山下智博的礼物！【公介美食】 | downloaded | assets/cover/1936005.jpg | http://i2.hdslb.com/320_180/u_user/3c6de298c89536f083562cf7bd55839b.jpg |  | ding.json |
| 1977463 | 【毒舌老外】Fate无限预算夜第一季吐槽回顾 | downloaded | assets/cover/1977463.jpg | http://i2.hdslb.com/320_180/u_user/be90eefe92ed916c8a3da6ea491cc3f6.jpg |  | ding.json |
| 1984778 | 「科技美学」iPad Air2、Surface pro3、Yoga2对比测评 | downloaded | assets/cover/1984778.jpg | http://i0.hdslb.com/320_180/u_user/8595097c612ed98ca2eb5215184dbdaa.jpg |  | ding.json |
| 2027667 | 【心华】光【原创曲PV付】【Sodatune】 | downloaded | assets/cover/2027667.jpg | http://i2.hdslb.com/320_180/u_user/752b80d3c6a1a41cbee1c7ef89e8cc7d.jpg |  | ding.json |
| 2103101 | 【DVD】游戏王GX | missing |  | http://i1.hdslb.com/320_180/u_user/36a4774719ad87177a9bf3501960afa7.jpg | api code -404 啥都木有 | ding.json |
| 2129461 | 洛天依，言和原创《普通DISCO》 | downloaded | assets/cover/2129461.jpg | http://i1.hdslb.com/320_180/u_user/c79898d1f0c02885801e3c5e4fe4f581.jpg |  | ding.json |
| 2131548 | 【完结】无间双龙~这份爱，才是正义 10 生田斗真/小栗旬/上野树里【新酱】 | missing |  | http://i0.hdslb.com/320_180/video/db/db9eaf39556903c36388b9eabfd1d6dc.jpg | api code -404 啥都木有 | ding.json |
| 2212297 | 【合】jewel giga feat.nqrse | downloaded | assets/cover/2212297.jpg | http://i2.hdslb.com/320_180/video/63/63e557bd3dd483ee68837698f50a8317.jpg |  | ding.json |
| 2213287 | 千本迪迦 | downloaded | assets/cover/2213287.jpg | http://i2.hdslb.com/320_180/video/40/405a8d80a1e33efd1e656df22985ba99.jpg |  | ding.json |
| 2286846 | 【动画】芭比节日系列-芭比之圣诞颂歌 2008【英语中字】 | missing |  | http://i1.hdslb.com/320_180/video/52/523bcee870a870fb5bb46997790fbfb3.jpg | api code -404 啥都木有 | ding.json |
| 2298919 | 【1080P】你眼中的世界 (2014) 【科幻爱情小清新 最容易忽视的好电影】 | missing |  | http://i2.hdslb.com/320_180/video/fe/fe4c99e10dd214b7a21f5d6b9f4a7f98.jpg | api code -404 啥都木有 | ding.json |
| 2371481 | 【人类大历史】S01E02 马的力量【UnIon字幕组】 | missing |  | http://i2.hdslb.com/320_180/video/91/913168f62d41a66df1f0472cc2a17c48.jpg | api code -404 啥都木有 | ding.json |
| 2403036 | 【4月】英国一家，吃在日本 07 【F宅】 | missing |  | http://i0.hdslb.com/320_180/video/c8/c81f2306125ef22737b234c9625007fe.jpg | api code -404 啥都木有 | ding.json |
| 2435973 | [2015夏]新番介绍 | downloaded | assets/cover/2435973.jpg | http://i0.hdslb.com/320_180/video/d6/d6f22d0e4a260357b4fbe3d5b7f3ac96.jpg |  | ding.json |
| 2443708 | 【老游侠】喜剧末日生存60s 能存活几天！ | missing |  | http://i1.hdslb.com/320_180/video/05/057e8cb32df0dc46824b34a11641e62c.jpg | api code 62002 稿件不可见 | ding.json |
| 2451293 | 【綦冰】【自制单人声剧】被变态说教绝望之论【熟肉】 | downloaded | assets/cover/2451293.png | http://i1.hdslb.com/320_180/u_user/5d3d5ea5c0aee89ad3ef60a94bda8d2a.jpg |  | ding.json |
| 2452568 | 《魔兽世界：德拉诺之王》6.2版本——地狱火危机 | downloaded | assets/cover/2452568.jpg | http://i1.hdslb.com/320_180/video/c3/c3916ef8ce293f626ac54d21683030eb.jpg |  | promote.json |
| 2475524 | 【かみん】恋爱循环- ironyMIX-【_(┐「ε:)_】 | downloaded | assets/cover/2475524.jpg | http://i1.hdslb.com/320_180/video/4e/4ec14e953ef57890ab520e397cc8d2f1.jpg |  | ding.json |
| 2483696 | 9个姿势标志着喵星人密谋独霸世界 @柚子木字幕组 | downloaded | assets/cover/2483696.jpg | http://i1.hdslb.com/320_180/video/7f/7f89f0b6b4c893959b15e1b8af078727.jpg |  | promote.json |
| 2484527 | 【第二届弹幕大赛】弹幕艺术，触手可及！ | downloaded | assets/cover/2484527.jpg | http://i2.hdslb.com/320_180/video/47/47ac5a035c54a98b3bacf966ee0423c9.jpg |  | ding.json |
| 2505151 | 【2月】手里剑战队18【梦星】 | missing |  | http://i2.hdslb.com/320_180/video/b0/b0ac12a002c45e25dea84e483f9c45a3.jpg | api code -404 啥都木有 | ding.json |
| 2508696 | 【中字】怎样上传你的意识？How to Upload Your Mind@... | downloaded | assets/cover/2508696.jpg | http://i1.hdslb.com/320_180/video/63/63c9ff5ece0c895017cb140099fe29ef.jpg |  | promote.json |
| 2510243 | 让B站感受到UP主的深深恶意吧！【用生命作死向】 | downloaded | assets/cover/2510243.jpg | http://i0.hdslb.com/320_180/video/48/48220bca65277ecc76ba2587586c38a6.jpg |  | ding.json |
| 2511089 | 【一周年庆】BLESSING 【爱马琳V脸Z星IX麦茶岸四祭】 | downloaded | assets/cover/2511089.jpg | http://i0.hdslb.com/320_180/video/08/08f464b3be829addd05431a1e9b68124.jpg |  | promote.json |
| 2511984 | 【MMD】1～8部 Colorful World【JOJO】 | missing |  | http://i0.hdslb.com/320_180/video/be/bedcd9217c821cee703181fec07898e2.jpg | api code 62002 稿件不可见 | promote.json |
| 2513908 | 《天策的最脏教学》第五期:一秒十脚一脚五杀 | downloaded | assets/cover/2513908.jpg | http://i0.hdslb.com/320_180/video/84/848b017f62cc774af8d667c23ffcb8b3.jpg |  | ding.json |
| 2523328 | 【全明星】被鬼畜妄想全明星 | missing |  | http://i1.hdslb.com/320_180/video/dc/dc9b91b5bba21fdea6af6220ab9ba08a.jpg | api code -403 访问权限不足 | ding.json |
| 2523571 | 【MC】终章：如果食物都不可食用 | missing |  | http://i2.hdslb.com/320_180/video/b3/b3006d8147ba4096c105cfa4e8e65249.jpg | api code 62002 稿件不可见 | ding.json |
| 2526387 | 【惊悚】爱丽丝 1988 【经典诡异奇幻惊悚】 | missing |  | http://i1.hdslb.com/320_180/video/35/35e40d078e4107547dc0554e630b72ff.jpg | api code 62002 稿件不可见 | ding.json |
| 2533643 | 【坦克世界】御坂的日常娱乐实况2015第一季（4） | downloaded | assets/cover/2533643.jpg | http://i0.hdslb.com/320_180/video/3d/3d3fd89fbfcbc75c863f66259a9f37ec.jpg |  | ding.json |
| 2534509 | 【新版】当《大圣归来》遇上西游序曲升级版，燃起来！ | downloaded | assets/cover/2534509.png | http://i1.hdslb.com/320_180/u_user/ea6d98e15b5be0c2b0b09fb2cead7deb.jpg |  | ding.json |
| 2535063 | 【梁逸峰×郎朗】最终鬼畜梁逸朗——表情帝大对决 | missing |  | http://i2.hdslb.com/320_180/video/70/70ddf6614f1bd61a74c87c654f95b4d9.jpg | api code 62002 稿件不可见 | ding.json |
| 2536138 | 【国产】无心法师 02 | missing |  | http://i1.hdslb.com/320_180/video/2c/2c8b51dad6d71689cb3a09fb0b5a619e.jpg | api code -404 啥都木有 | ding.json |
| 2540284 | 【伪·国产希望】虹猫蓝兔六花传2015 | downloaded | assets/cover/2540284.jpg | http://i1.hdslb.com/320_180/video/e6/e60ead5c3768ece7698cea31fc5dcac8.jpg |  | ding.json |
| 2541294 | 【群像】大圣（12个版本孙悟空混剪，含大圣归来） | downloaded | assets/cover/2541294.jpg | http://i0.hdslb.com/320_180/video/3b/3b233976a5dae0872604b5203099437d.jpg |  | ding.json |
| 2542104 | 【初音ミク】Hand in Hand (Magical Mirai ver... | downloaded | assets/cover/2542104.jpg | http://i0.hdslb.com/320_180/video/a3/a32f3086071db498b582e1fe37d64103.jpg |  | ding.json |
| 2542941 | 全明星 江南Style【非洲BOY领衔】 | downloaded | assets/cover/2542941.jpg | http://i1.hdslb.com/320_180/video/95/95743e529ce1837c325f5a185419461b.jpg |  | ding.json |
| 2543670 | 【大保健字幕组】记一次把各种金属溶液倒进水里的作死过程 | missing |  | http://i1.hdslb.com/320_180/video/32/32c4d58aeb4db7538b599a0ff954bab7.jpg | api code 62002 稿件不可见 | ding.json |
| 2544805 | 【德剧】屌丝元首【全明星助阵】 | downloaded | assets/cover/2544805.jpg | http://i0.hdslb.com/320_180/video/4a/4aac3d13370a1557589b4c1fa7f11ebe.jpg |  | ranking-3day.json |
| 2544961 | 【丞相RAP】妈妈，我的烂苹果和他们的不一样！ | downloaded | assets/cover/2544961.jpg | http://i0.hdslb.com/320_180/video/37/37a80b54694d33bfc013b37153826989.jpg |  | ding.json |
| 2545247 | 【金坷垃】LoveLive坷垃组曲 | downloaded | assets/cover/2545247.jpg | http://i1.hdslb.com/320_180/video/e4/e4e9a8e0a3941def04c11021ce6e0abd.jpg |  | ranking-3day.json, ding.json |
| 2546396 | 【洛天依原创曲】EXpres【PV付/咏吟轩】《行星∞》收录曲 | downloaded | assets/cover/2546396.jpg | http://i2.hdslb.com/320_180/video/c9/c9e545b5bdb24484311fff33c26e17f8.jpg |  | ranking-3day.json |
| 2546496 | 【AMV】T.W.U.W / 恋爱的游戏 | downloaded | assets/cover/2546496.jpg | http://i0.hdslb.com/320_180/video/aa/aa3ab32afb3b5d768beede25fe683d59.jpg |  | ding.json |
| 2547434 | 海贼王 艾斯 不曾后悔活着 | missing |  | http://i2.hdslb.com/320_180/video/3b/3be0f8c0b81f1014842423882a8a0527.jpg | api code -404 啥都木有 | ranking-3day.json |
| 2547916 | 【超级工厂】菲多利薯片 | downloaded | assets/cover/2547916.jpg | http://i0.hdslb.com/320_180/video/0e/0e3b66b6775829e8f36ffd7ab69a70f3.jpg |  | ding.json |
| 2548203 | tg 那国的出租车最叼？ | downloaded | assets/cover/2548203.jpg | http://i1.hdslb.com/320_180/video/23/238709f24d384974347c5e75efe72e6e.jpg |  | ding.json |
| 2548580 | 【电锯实况】合金弹头2 两币游聚通关解说 | missing |  | http://i1.hdslb.com/320_180/video/6e/6e19617560c4dfc3b2a9912c32f38fc2.jpg | api code 62002 稿件不可见 | ding.json |
| 2548800 | 【7月】学园孤岛 01【bilibili正版】 | downloaded | assets/cover/2548800.jpg | http://i1.hdslb.com/320_180/video/f5/f5a422af911e9ad0beee204bb53621b6.jpg |  | ding.json |
| 2548994 | 美帝爸爸航母日常 E2起飞+妹子手动上炸弹 | missing |  | http://i0.hdslb.com/320_180/video/9f/9f0de15ffd1f3c70df07a5bcb6888be4.jpg | api code 62002 稿件不可见 | ding.json |
| 2549102 | 屎蛋说：日本动画业破产了吗？ | downloaded | assets/cover/2549102.jpg | http://i2.hdslb.com/320_180/video/89/89db14e18d29309505537bcc1b7926fb.jpg |  | ranking-3day.json |
| 2549520 | 【楽小漫×小梵×小起】Masked Bitch 【*CLB】 | missing |  | http://i2.hdslb.com/320_180/video/60/60d65ee5205e4e953b5545b13f64b270.jpg | api code 62002 稿件不可见 | ranking-3day.json |
| 2549888 | 【暴走大事件第四季】1 大事件惊艳归来,王尼玛深情告白！ | missing |  | http://i2.hdslb.com/320_180/video/ff/ffe598c8c8af50e9ce54d3f70f2b6e2e.jpg | api code -404 啥都木有 | ding.json |
| 2549928 | 【Soul Dance 】超强节奏的齐舞-嘻哈美女子Girin新编排【Up... | downloaded | assets/cover/2549928.jpg | http://i1.hdslb.com/320_180/video/92/92c2c00d459b2e1320b48bbd839a9de7.jpg |  | ding.json |
| 2550515 | 【国产】华胥引 01-02 | missing |  | http://i1.hdslb.com/320_180/video/64/64a6d9cfb614b95356c20feae237259c.jpg | api code -404 啥都木有 | ding.json |
| 2551130 | 【洛天依】莎图温的裙摆【跳蝻P】【咏吟轩《行星∞》收录/土星】 | downloaded | assets/cover/2551130.jpg | http://i0.hdslb.com/320_180/video/b1/b1709e7955ba593318e57ac9603926c7.jpg |  | ding.json |
| 2552373 | 【狮子/⑨命猫/黑石稔】JOJO体操X爱杀宝贝ED | downloaded | assets/cover/2552373.jpg | http://i1.hdslb.com/320_180/video/30/30a32f1adce0904e1c364d29db35edf7.jpg |  | ding.json |
| 2552907 | 【全明星】千本坷垃 | downloaded | assets/cover/2552907.jpg | http://i1.hdslb.com/320_180/video/b1/b1f1e9ad86a018f06d24b1664b579fa6.jpg |  | ranking-3day.json |
| 2553074 | 【吃货木下】冲绳的猪骨汤拉面（逆风字幕） | missing |  | http://i0.hdslb.com/320_180/video/cf/cf1a77a277413d2189856db9040fac73.jpg | api code 62002 稿件不可见 | ding.json |
| 2553204 | 【撸大师】变性手术现场直播~啦啦啦 | downloaded | assets/cover/2553204.jpg | http://i2.hdslb.com/320_180/video/ab/ab8941af3609b6c57230f4220d598e5c.jpg |  | ding.json |
| 2553247 | 【恐怖/惊悚】绝魂站/地铁四重奏 End of the Line 2007... | missing |  | http://i1.hdslb.com/320_180/video/2e/2ea69edfa535e1a9f2ca4ba44107a04c.jpg | api code 62002 稿件不可见 | ding.json |
| 2553270 | 【泠鸢】魔法旋律 | downloaded | assets/cover/2553270.jpg | http://i0.hdslb.com/320_180/video/b8/b8ca209b8a741d4f611ca9181c8325bb.jpg |  | ranking-3day.json |
| 2553895 | 【7月】若叶女孩 02【独家正版】 | downloaded | assets/cover/2553895.jpg | http://i1.hdslb.com/320_180/video/92/9287ebf66d0e06d34fb27ce824628a79.jpg |  | ding.json |
| 2554020 | 【排骨】牵丝戏，（伪）女声翻唱，我还是不要告诉你们我是男孩子好了 | downloaded | assets/cover/2554020.jpg | http://i2.hdslb.com/320_180/video/70/70f6b04725a55642dc188873a881a62f.jpg |  | ding.json |
| 2554030 | 【六国编舞对比】中美法乌韩日编舞神曲Partition 哪个风格你最爱？ | downloaded | assets/cover/2554030.jpg | http://i1.hdslb.com/320_180/video/86/86f75899c1dc570402a4250c744dc331.jpg |  | ding.json |
| 2554113 | 【めろちん】Little Parade【原创振付】 | downloaded | assets/cover/2554113.jpg | http://i0.hdslb.com/320_180/video/05/0581474cb557107f05b5a417fea12577.jpg |  | ding.json |
| 2554317 | 【7月】黑白小姐 第二季 02【独家正版】 | downloaded | assets/cover/2554317.jpg | http://i1.hdslb.com/320_180/video/c5/c5c64bb4ebf5d3e107bb21f84f52e84f.jpg |  | ding.json |
| 2554868 | 【1080P】【喜剧】泰迪熊2 2015【中文字幕】 | missing |  | http://i0.hdslb.com/320_180/video/f7/f7fd2d66f300ff17b5388854a2a320da.jpg | api code -404 啥都木有 | ding.json |
| 2555291 | 陆夫人童年老游戏第四部《大富翁四》！ | downloaded | assets/cover/2555291.jpg | http://i1.hdslb.com/320_180/video/44/44117a5b78566f867f18740e3fa2dca0.jpg |  | ding.json |
| 2555655 | 终极·零下·相变·装机 @西欧帝字幕组 #Linus土豪 | downloaded | assets/cover/2555655.jpg | http://i1.hdslb.com/320_180/video/1e/1e719746fe4df108cad4732857eeefc6.jpg |  | ding.json |
| 2556196 | 【求生之路】牺牲 · 孤身一人模式（专家）✔ | downloaded | assets/cover/2556196.jpg | http://i1.hdslb.com/320_180/video/ce/ce60de7048e4c943220ecfab766438ec.jpg |  | ding.json |
| 2556285 | 【喜剧 / 恐怖】僵尸噩夜 Zombie Night (2003) 高清 ... | missing |  | http://i2.hdslb.com/320_180/video/35/3586c3257ff1523c1b4a700d5e21320c.jpg | api code 62002 稿件不可见 | ding.json |
| 2556395 | 看的我腿都软了 2015极限运动合集 PEOPLE ARE AMAZING... | downloaded | assets/cover/2556395.jpg | http://i2.hdslb.com/320_180/video/f8/f8197ef7c5aa073b364c6c6363a06253.jpg |  | ding.json |
| 2557058 | 【全明星】爱啦啦 | downloaded | assets/cover/2557058.jpg | http://i2.hdslb.com/320_180/video/1d/1d4ad4afe9731cf91636fe5798877f41.jpg |  | ding.json |
| 2557371 | 童心2.0 智商upup的高颜值小王子（上） | missing |  | http://i1.hdslb.com/320_180/video/c4/c48c36d18966f5e4b3687cb12afb9b26.jpg | api code 62002 稿件不可见 | ding.json |
| 2557507 | 逆袭网络剧拍摄花絮未调色版 | missing |  | http://i2.hdslb.com/320_180/u_user/126565a04a9c347e0b2ff349499d2023.jpg | api code 62002 稿件不可见 | ding.json |
| 2557594 | 初投稿 2015 CCG漫展宅舞 | missing |  | http://i0.hdslb.com/320_180/video/87/87d3b6c1aa19684e53d30c482c70b186.jpg | api code 62002 稿件不可见 | ding.json |
| 2557597 | 【 蛋乃☆☆】神的随波逐流【新人初投】 | downloaded | assets/cover/2557597.jpg | http://i2.hdslb.com/320_180/video/12/126173aa22d21f9baa94b919d35b71ac.jpg |  | ding.json |
| 2557629 | 【Hey!Say!JUMP】冠番“攻顶 HIGH JUMP”第一期 070... | downloaded | assets/cover/2557629.jpg | http://i1.hdslb.com/320_180/video/99/99a4a726be3ed82cd24273bde8c34fe8.jpg |  | ding.json |
| 2557802 | 【张坤解说三国杀】(先行版)周末娱乐，新破军强扒防具，孙休凌统强力菊花 | missing |  | http://i0.hdslb.com/320_180/u_user/f3467939a748681092acc37d945a391e.jpg | api code 62002 稿件不可见 | ding.json |
| 2557856 | 【AMV/樱花庄的宠物女孩】突然好想你 | missing |  | http://i1.hdslb.com/320_180/video/5b/5babcc713de3a3e8335d7c7fc6774aee.jpg | api code 62002 稿件不可见 | ding.json |
| 2557931 | 【Gero】爱的剧本 | downloaded | assets/cover/2557931.jpg | http://i2.hdslb.com/320_180/video/b8/b869a2764cd3877b718fcd65a9a1825c.jpg |  | ding.json |
| 2558095 | 【わいぱースミD】偶像活动！第三季OP - Du-Du-Wa DO IT!! | downloaded | assets/cover/2558095.jpg | http://i0.hdslb.com/320_180/video/81/811d8a0ecba86373ec59d462cc746a16.jpg |  | ding.json |
| 3480775 | 【多留】命运石之门0 Steins;Gate0 中文解说 第五期 | downloaded | assets/cover/3480775.jpg | http://i2.hdslb.com/video/15/151a6a797da2511b5031888eedf45671.jpg |  | recommend.json |
| 3487666 | MOTA动作制作组成员动作练习DEMO【第二期】 | downloaded | assets/cover/3487666.jpg | http://i2.hdslb.com/video/8e/8e459c8fa5edd613f23162a8c5646f78.jpg |  | recommend.json |
| 3491898 | 【手书】【手绘】可塑性记忆 ed（含制作全过程） | downloaded | assets/cover/3491898.jpg | http://i0.hdslb.com/video/a6/a6075d6ef9a5db6eb4a107edbfbe8861.jpg |  | recommend.json |
| 3509697 | JOJO的奇妙冒险—对撞灵魂革命 | downloaded | assets/cover/3509697.jpg | http://i1.hdslb.com/video/55/55358da23b2d9d781886ebc811cbf63f.jpg |  | recommend.json |
| 3621937 | 【TV未放送】Classroom☆Crisis教室危机5.5【F宅】 | downloaded | assets/cover/3621937.jpg | http://i2.hdslb.com/320_200/video/65/655cf3e2601c50688e30c005baf5cf77.jpg |  | ranking.json |
| 3622737 | 【1月】氰化欢乐秀番外篇之安全措施【阿尔法小分队】 | downloaded | assets/cover/3622737.jpg | http://i2.hdslb.com/320_200/video/60/60b6246c0010002a643b73252c975d0c.jpg |  | ranking.json |
| 3623536 | 【1月】寿司警察 SUSHI POLICE 03【独家正版】 | downloaded | assets/cover/3623536.jpg | http://i2.hdslb.com/320_200/video/ee/ee7597190c5c55bc873cab90378d4c13.jpg |  | ranking.json |
| 3623572 | 【10月】侦探小队KZ事件簿 15【独家正版】 | downloaded | assets/cover/3623572.jpg | http://i2.hdslb.com/320_200/video/9e/9e51a660e0b54278fbb473ac02a97a78.jpg |  | ranking.json |
| 3623894 | 【海妖】【太子妃升职记ED】可念不可说 | missing |  | http://i1.hdslb.com/320_200/video/7d/7d575fd662b4164bb7fc05fce94fc088.jpg | api code 62002 稿件不可见 | ranking.json |
| 3624107 | 【1月熟肉】忍者神龟2012第四季第六集【人人字幕】 | missing |  | http://i0.hdslb.com/320_200/video/16/1698c2ca932b466f72e0abba26482f52.jpg | api code 62002 稿件不可见 | ranking.json |
| 3624176 | 【自由合作】2016音MAD自由合作 | downloaded | assets/cover/3624176.jpg | http://i2.hdslb.com/320_200/video/10/10722bc4e5b2dca2a78eab74658f83d0.jpg |  | ranking.json |
| 3624187 | 【8月】日常工作/Regular Show S07E19【康复中心】 | missing |  | http://i2.hdslb.com/320_200/video/6f/6fb337b017de7354b12d45b80d2ad097.jpg | api code -404 啥都木有 | ranking.json |
| 3624220 | 【一点都不污的撸啊撸】女英雄们的Nobody时间 | missing |  | http://i2.hdslb.com/320_200/video/05/058bb70b5b71b68c9ef46266d58a81eb.jpg | api code 62002 稿件不可见 | ranking.json |
| 3625072 | 【APH/MMD】★黑三角★====Perfume Global==== | missing |  | http://i2.hdslb.com/320_200/video/2c/2ced06be3f5e01b8115a96db14c6c656.jpg | api code -404 啥都木有 | ranking.json |
| 3625113 | 【33娘】妄想税[硬币税] | downloaded | assets/cover/3625113.jpg | http://i2.hdslb.com/320_200/video/88/887cba2482ca40906a97dc969a5b6c22.jpg |  | ranking.json |
| 3625352 | 比企谷八幡，依然孤身一人。 ｜ 春物 AMV | downloaded | assets/cover/3625352.jpg | http://i2.hdslb.com/320_200/video/c0/c0d2cd1fb6f5bb32f737e924820262b1.jpg |  | ranking.json |
| 3625444 | 【东方偶像乡 MMD】爱丽丝-忘却的前世 | missing |  | http://i1.hdslb.com/320_200/video/92/921a719e43d0ed5b717659b42bc0d48d.jpg | api code 62002 稿件不可见 | ranking.json |
| 3625752 | 【言和】Renew【原创】【豆腐P】 | downloaded | assets/cover/3625752.jpg | http://i1.hdslb.com/320_200/video/cc/cc2f6ec8873001f31dd754fb2f8517fd.jpg |  | ranking.json |
| 3626564 | 【小剧场】弱酸性百万亚瑟王 10【F宅】 | downloaded | assets/cover/3626564.jpg | http://i0.hdslb.com/320_200/video/c8/c84f5dfa306a71e9175e01d019ef13c7.jpg |  | ranking.json |
| 3627236 | 【4月年番】战魂王：烈火斗魂 41 | missing |  | http://i2.hdslb.com/320_200/video/b5/b57be63d32d87e1ef6a3a5be70e44f15.jpg | api code -404 啥都木有 | ranking.json |
| 3628602 | 【武汉PC势崛舞蹈】I SWAER SISTAR 舞蹈模仿 | downloaded | assets/cover/3628602.jpg | http://i1.hdslb.com/320_200/video/fc/fc4d43cc24e3cdc5e9ab23bc53eb342b.jpg |  | ranking.json |
| 3628656 | 【绯缨白X桃桃X神秘客串】脑浆炸裂女孩【镜面翻转】 | downloaded | assets/cover/3628656.png | http://i0.hdslb.com/320_200/u_user/2aa08dbfd9f79a609fab4a3f9d39e4c9.jpg |  | ranking.json |
| 3628941 | 【Love Live】Snow Halation | missing |  | http://i0.hdslb.com/320_200/video/84/84075c09455014e1885e2c6497e683f9.jpg | api code 62002 稿件不可见 | ranking.json |
| 3629349 | 【Kathleenlights】Drugstore Makeup Haul... | downloaded | assets/cover/3629349.jpg | http://i1.hdslb.com/320_200/video/e8/e85b6c13a15bae06e6efb1e95ff25e20.jpg |  | ranking.json |
| 3629361 | 【孙科】逼上梁山 | downloaded | assets/cover/3629361.jpg | http://i0.hdslb.com/320_200/video/bc/bccf1cc0b7cd02fa5adda12879578d4d.jpg |  | ranking.json |
| 3629447 | 【米八】【失踪人口回归】【青春无敌美少女】校篮球比赛中场表演舞蹈（练习室） | downloaded | assets/cover/3629447.jpg | http://i0.hdslb.com/320_200/video/30/301f1a2e61998536ae6fe6d33c66c070.jpg |  | ranking.json |
| 3629474 | Dolce&Gabbana Men\'s Fall-Winter 2016... | downloaded | assets/cover/3629474.png | http://i0.hdslb.com/320_200/u_user/b0eee086e6866cc13b5ed289de55a983.jpg |  | ranking.json |
| 3629482 | 【 刘迦 】首尔国际舞蹈比赛《孔雀》+《心舞》 | downloaded | assets/cover/3629482.jpg | http://i1.hdslb.com/320_200/video/2c/2cf543a42dcecfd02db37f74efd5f79b.jpg |  | ranking.json |
| 3629534 | 好无聊，容我调戏一下班长 | downloaded | assets/cover/3629534.jpg | http://i1.hdslb.com/320_200/video/f4/f4245a9185468c6e77d8ece23b3337c4.jpg |  | ranking.json |
| 3629535 | 【Yes舞蹈工作室】“百秒曳步舞”教学第九期——feelin shuffl... | downloaded | assets/cover/3629535.jpg | http://i1.hdslb.com/320_200/u_user/e5a449dcf651808e8960045f6adbc56b.jpg |  | ranking.json |
| 3629627 | 后台【JUNN.J】【Corneliani】【COSTUME NATION... | downloaded | assets/cover/3629627.png | http://i2.hdslb.com/320_200/u_user/84ed76089f253b301f83a466b8279065.jpg |  | ranking.json |
| 3629662 | 【桃哥说】强烈推荐——头屑困扰一扫空！ | downloaded | assets/cover/3629662.png | http://i0.hdslb.com/320_200/u_user/0274fe3a0de8a207e9e6952ded8d0fde.jpg |  | ranking.json |
| 3629677 | 【个人翻译】【Zabrena】美妆蛋的10个用途！ | downloaded | assets/cover/3629677.jpg | http://i0.hdslb.com/320_200/video/e9/e987ef5aa28db0d3608fdd52cc33554f.jpg |  | ranking.json |
| 3629687 | Tokyo♂Fa!(Ableton Live的Fa乐器) | downloaded | assets/cover/3629687.png | http://i0.hdslb.com/320_200/u_user/f931b438dc349e1d6a22bae3a9afb95d.jpg |  | ranking.json |
| 3629696 | Kayley｜中字 拥抱清爽 拯救油腻的三日发型教程 | downloaded | assets/cover/3629696.jpg | http://i1.hdslb.com/320_200/video/23/231dee55b33f8fcee32748d94b67c730.jpg |  | ranking.json |
| 3629739 | 【1M舞室】Eunho Kim帅气群舞Lyrical编舞Fine By Me | downloaded | assets/cover/3629739.jpg | http://i1.hdslb.com/320_200/video/8d/8d78d328efdf53133bf5c41342d0ca64.jpg |  | ranking.json |
| 3629764 | 健身女ChelseaLifts挑战100个俯卧撑 | missing |  | http://i0.hdslb.com/320_200/video/de/de340490af49389d53b849c81572675b.jpg | api code 62002 稿件不可见 | ranking.json |
| 3629773 | 【WOTA艺】不能飞的魔法使 | downloaded | assets/cover/3629773.jpg | http://i2.hdslb.com/320_200/video/3a/3a76d029aeaef1e4c05089f9a53298a2.jpg |  | ranking.json |
| 3629782 | 【NALA美人计】如何分辨自己属于什么脸型 | downloaded | assets/cover/3629782.jpg | http://i2.hdslb.com/320_200/video/40/40ba697ee2500f67c33f284d4de2444e.jpg |  | ranking.json |
| 3629823 | 自行车小哥Erik收到了来自ChelseaLifts的100个俯卧撑挑战 | missing |  | http://i2.hdslb.com/320_200/video/71/71112f64624f5e582695f38d95aae15f.jpg | api code 62002 稿件不可见 | ranking.json |
| 3629838 | 【AMV/多素材衔接】燃息不止 | missing |  | http://i1.hdslb.com/320_200/video/f5/f5afab444c9705b5415b78adebb716cf.jpg | api code 62002 稿件不可见 | ranking.json |
| 3629839 | 火锅战场 | downloaded | assets/cover/3629839.png | http://i1.hdslb.com/320_200/u_user/fcd61e3369f6e48a5c3bd2ccd92e7ec1.jpg |  | ranking.json |
| 3629864 | 【弹丸论破1+2/AMV】TAKE ME | downloaded | assets/cover/3629864.jpg | http://i2.hdslb.com/320_200/video/9e/9e4e285d95e7ed73fa200c44d88b5559.jpg |  | ranking.json |
| 3629879 | 【APH/MMD】Insanity Love[燕] | downloaded | assets/cover/3629879.jpg | http://i0.hdslb.com/320_200/video/8a/8a638565b3d57a6e4df2ca2d9dbd9c54.jpg |  | ranking.json |
| 3629904 | 【素材】精彩片段 01 | missing |  | http://i0.hdslb.com/320_200/video/95/959d908cfbcdebeacc939a4668375e1a.jpg | api code 62002 稿件不可见 | ranking.json |
| 3629919 | 【MMD/初音ミク】冷如冰系列「再见了四月的分身」 | downloaded | assets/cover/3629919.jpg | http://i2.hdslb.com/320_200/video/97/9734991b42a1512de1dbd76355984a26.jpg |  | ranking.json |
| 3629948 | 韩国电影《聚会的目的》：看已婚寂寞男如何俘获新进漂亮女同事！ | missing |  | http://i1.hdslb.com/320_200/video/dc/dca60e6d455787378038a1a5adb9f54d.jpg | api code 62002 稿件不可见 | ranking.json |
| 3629952 | 【科幻/惊悚】极速凶间 1997【DVD】 | missing |  | http://i2.hdslb.com/320_200/video/4f/4f7a9c8d33080937ccc1a54ffb2e33f9.jpg | api code -404 啥都木有 | ranking.json |
| 3629966 | 初吻一混剪苏菲玛索舔屏向 | downloaded | assets/cover/3629966.jpg | http://i1.hdslb.com/320_200/video/cb/cb389dc6dfa7c764e836fe5e0b51a025.jpg |  | ranking.json |
| 3629969 | 竹下的热血汉 | downloaded | assets/cover/3629969.png | http://i0.hdslb.com/320_200/u_user/06a9850a84b01e4ae9835f29165c3181.jpg |  | ranking.json |
| 3629973 | 【刀剑乱舞】五虎退的疑心暗鬼 | missing |  | http://i1.hdslb.com/320_200/video/c0/c02af09fe20a3a4b083a3e7878d57b9c.jpg | api code 62002 稿件不可见 | ranking.json |
| 3629994 | 佐藤健电影发布会 如果猫从这个世界消失20160120 | downloaded | assets/cover/3629994.jpg | http://i1.hdslb.com/320_200/video/00/00ee4bbe57d7e9e913494bf0657fa95c.jpg |  | ranking.json |
| 3629997 | 吔吔吔屎啦！梁非凡！ | downloaded | assets/cover/3629997.png | http://i2.hdslb.com/320_200/u_user/9986a00193da650252961abe3f448558.jpg |  | ranking.json |
| 3630000 | 【Jude Law】《副作用》访谈：贵圈有多小 Jude盛赞钱老板 | missing |  | http://i2.hdslb.com/320_200/video/8a/8a9d8d20d57be587d1de6f006bf3d5fa.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630007 | （喜剧）<我滴个神啊>精彩片段（不要小看印度电影哦） | missing |  | http://i2.hdslb.com/320_200/video/0a/0a61a93bcd956952cf4de60e10fb882b.jpg | api code -404 啥都木有 | ranking.json |
| 3630013 | Start:Dash!!线描（才不是呢）入坑曲 | downloaded | assets/cover/3630013.jpg | http://i2.hdslb.com/320_200/video/7b/7b26a152644cf6a6d4c4c9f234692fc3.jpg |  | ranking.json |
| 3630023 | 【雪花秘扇】--《无聊女事》mv剪辑 | downloaded | assets/cover/3630023.jpg | http://i2.hdslb.com/320_200/video/e2/e2b9d1b72143665dde3b995782cc1913.jpg |  | ranking.json |
| 3630048 | 【金坷垃】-I'm Yours [新人制作] | missing |  | http://i0.hdslb.com/320_200/video/08/08e1efd2dc438942622c47c9ff429880.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630059 | 胡子哥的rx1rII测评 | downloaded | assets/cover/3630059.png | http://i0.hdslb.com/320_200/u_user/b8ec9b82e4e3afc46633f28d39ebea6b.jpg |  | ranking.json |
| 3630067 | 【ＭＭＤ】 Calc. Piano ver Trafalgar Law | downloaded | assets/cover/3630067.jpg | http://static.hdslb.com/images/transparent.gif |  | ranking.json |
| 3630079 | 【太子妃升职记】【齐晟X张芃芃】昨日江南春又雨 | missing |  | http://i1.hdslb.com/320_200/video/23/23acd85226cc26d07843e853eb0abd9e.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630081 | 岳绮罗 | missing |  | http://i0.hdslb.com/320_200/video/8f/8fd78bdf9b3783aa2de8f87b0a70baa4.jpg | api code -404 啥都木有 | ranking.json |
| 3630087 | 「METAL BUILD 命运高达＆强袭自由高达光之翼套装」宣传影像 | downloaded | assets/cover/3630087.jpg | http://i2.hdslb.com/320_200/video/64/647aa9c836d21b8dc7f968cea7051f7c.jpg |  | ranking.json |
| 3630106 | 【clattanoia】decade剧场版 | missing |  | http://i1.hdslb.com/320_200/video/28/28156681bd5a00425694f3c27641beab.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630112 | 脸大如盆的糙汉如何成为网骗少女 | missing |  | http://i1.hdslb.com/320_200/u_user/761dd919833977a109f57d0a4e426560.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630118 | So♂Baked(非常♂灼热） | downloaded | assets/cover/3630118.jpg | http://i1.hdslb.com/320_200/video/46/460fe37977faeff82d4cb2d755171733.jpg |  | ranking.json |
| 3630119 | 【Remember - 儿子的战争】Making-振宇和爸爸在家唱歌跳舞回... | downloaded | assets/cover/3630119.jpg | http://i1.hdslb.com/320_200/video/c7/c7ab338724ef933657f11c51ef476492.jpg |  | ranking.json |
| 3630132 | 【怪谈新耳袋】全集「07SP左篇：黑衣人」 | missing |  | http://i2.hdslb.com/320_200/video/19/197e5a4575019773b36d6487e5c19709.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630133 | 「小知识」手机 单反怎么选？ | downloaded | assets/cover/3630133.jpg | http://i2.hdslb.com/320_200/video/27/275c4ba57915ec8019ba0da8cfd0e926.jpg |  | ranking.json |
| 3630135 | [SFM]EH-QUES-TREE-UHH | missing |  | http://static.hdslb.com/images/transparent.gif | api code -404 啥都木有 | ranking.json |
| 3630159 | 俄在克里米亚测试新型远程控制炮塔 | downloaded | assets/cover/3630159.png | http://static.hdslb.com/images/transparent.gif |  | ranking.json |
| 3630164 | 朴海镇2014-JTBC专访 关于理想型 | downloaded | assets/cover/3630164.jpg | http://i1.hdslb.com/320_200/video/59/59d06c5d556060e5e9022efe1f2d3857.jpg |  | ranking.json |
| 3630167 | 【无人生还】【爱蛋个人舔屏向】I'm so sorry | downloaded | assets/cover/3630167.jpg | http://i1.hdslb.com/320_200/video/3b/3b6721882a24896f3ec1fab3619bb5d4.jpg |  | ranking.json |
| 3630180 | 非凡吔吔吔 | missing |  | http://i1.hdslb.com/320_200/video/00/0025a6e0bafbd08f39b56e8864b3a8b5.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630190 | 太子妃升职记剪辑 主天爱 | missing |  | http://i2.hdslb.com/320_200/u_user/c596d1de25b862cdccdfec7225ee9247.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630203 | 一个老外给他妈试了下Windows Longhorn Build 4074... | downloaded | assets/cover/3630203.png | http://i2.hdslb.com/320_200/u_user/3edc6f0dcc402b95b65e709eedef8964.jpg |  | ranking.json |
| 3630215 | 威爾·史密斯 - Men In Black | downloaded | assets/cover/3630215.jpg | http://i0.hdslb.com/320_200/video/10/10919fa27683ee0543ca6b03415592b8.jpg |  | ranking.json |
| 3630223 | 韩剧混剪粉红瞬间一 | missing |  | http://i1.hdslb.com/320_200/u_user/79056df72ced13b6a8071bbdfb02dc30.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630225 | 【全明星RAP】光头的天堂与地狱 | missing |  | http://i0.hdslb.com/320_200/video/e0/e0fb37f04db18c352eaea29858003e95.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630232 | 【徳永英明】 日剧「科搜研之女 第16季」主題歌MV短版 | downloaded | assets/cover/3630232.jpg | http://i2.hdslb.com/320_200/video/c2/c2a4fc71b294c43494c30a8faf4c3aeb.jpg |  | ranking.json |
| 3630234 | 【枪声音乐】反恐精英OL2+QQ飞车 | missing |  | http://i0.hdslb.com/320_200/video/77/7799b8270375453673048d93667fc4ed.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630235 | 【嗨科技】三星Galaxy A5(2016)评测：逼格满分性能一般 | downloaded | assets/cover/3630235.jpg | http://i1.hdslb.com/320_200/video/ec/ec433a390db990127605640ce4d914e8.jpg |  | ranking.json |
| 3630237 | 『@三分连连看』 | downloaded | assets/cover/3630237.jpg | http://i1.hdslb.com/320_200/video/63/633d43c1a5851d2fc2e1c51104af099e.jpg |  | ranking.json |
| 3630240 | 《漫无边际》第十二期 默写是创作的开端 | downloaded | assets/cover/3630240.jpg | http://i2.hdslb.com/320_200/video/20/2067e378652bc663c45473fb1a839c93.jpg |  | ranking.json |
| 3630242 | 【国家地理】伟大工程巡礼系列E111.大峡谷人造高索桥 720p | downloaded | assets/cover/3630242.jpg | http://i1.hdslb.com/320_200/video/f8/f8e616bf060d7a4f3d7335d982a9df1d.jpg |  | ranking.json |
| 3630244 | 【钢琴/乐谱】嵐「谁也不知道」死神君主题歌（付歌词/键盘） | downloaded | assets/cover/3630244.png | http://i0.hdslb.com/320_200/u_user/6c709f6cadc9009dcdaf41f7d46d4cfd.jpg |  | ranking.json |
| 3630249 | 《我可能不会爱你》经典台词 第五集 | missing |  | http://i2.hdslb.com/320_200/video/fc/fc5c6805afa4971eb4994ee7d26511aa.jpg | api code -404 啥都木有 | ranking.json |
| 3630253 | 【知念里奈】Growing Tour 1999 | downloaded | assets/cover/3630253.jpg | http://i1.hdslb.com/320_200/video/50/50f5579082c965a098110901567c7c44.jpg |  | ranking.json |
| 3630257 | 【Matthew Lush】IN LOVE | missing |  | http://i0.hdslb.com/320_200/video/a4/a470db4303764ae921bfe9b61be2600b.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630259 | 【少女时代】160120 30th 金唱片大赏 泰妍&徐贤 受赏后 采访 一则 | downloaded | assets/cover/3630259.png | http://i1.hdslb.com/320_200/u_user/756fe38bfabbb5c004761447cf8abe6b.jpg |  | ranking.json |
| 3630272 | 【张艺兴】甜菜对我们表白啦~ | missing |  | http://i2.hdslb.com/320_200/video/ed/ed77dc3ede0c9c51315439dc0fcc7906.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630286 | 暗黑破坏神III 大米日常 | downloaded | assets/cover/3630286.png | http://i0.hdslb.com/320_200/u_user/7e20f2c0a77a4b9dc360ba4e919f13b1.jpg |  | ranking.json |
| 3630288 | 【吃货木下】【UUUM字幕】终于吃肯德基啦！！ | missing |  | http://i2.hdslb.com/320_200/video/09/09e3904855c6a9cdaa098f36b515c0c1.jpg | api code -404 啥都木有 | ranking.json |
| 3630291 | 今天脑门尤其的亮！ 老寿星的脑门自带反光镜。鸭血粉丝汤和汤包 | missing |  | http://i1.hdslb.com/320_200/video/14/1430ef666044b087b3a955f990049f75.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630294 | 【CHON】幽城幻剑录[04]——我来告诉你，什么叫真正的人生赢家 | downloaded | assets/cover/3630294.jpg | http://i2.hdslb.com/320_200/video/28/28c130029678508fa69fef1695ec0749.jpg |  | ranking.json |
| 3630295 | 【ふるる】痒。【女声】 | missing |  | http://i0.hdslb.com/320_200/video/5c/5c4fb233e0a20cba8b304b3e97b2997a.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630300 | 《青铜大神狗带日常》第3期 小提莫已彻底哭晕！！！英雄联盟爆笑集锦！ | downloaded | assets/cover/3630300.jpg | http://i0.hdslb.com/320_200/video/b5/b5c694d01c31bd57127a443e85259c81.jpg |  | ranking.json |
| 3630305 | 【GTA5】兰博基尼LP700-4 MOD | missing |  | http://i1.hdslb.com/320_200/video/93/93809e9c40b9af3414748d62235d8a94.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630307 | 【呦猫X祈Inory】超时空要塞Δ【抖腿神曲】《禁绝边境线》 | downloaded | assets/cover/3630307.jpg | http://i0.hdslb.com/320_200/video/b0/b0ebaed22e7bb0e2b808fd0290487139.jpg |  | ranking.json |
| 3630310 | 【10月】后裔：极恶世界 12【迪幻字幕组】 | missing |  | http://i1.hdslb.com/320_200/video/c2/c2414ac4736ddd7a0eaa5e65e55224e5.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630314 | 140123 首尔歌谣大赏 防弹少年团 N.O + No More Dre... | downloaded | assets/cover/3630314.jpg | http://i2.hdslb.com/320_200/video/d4/d43fd40aeed485b38d06bbba4724d89d.jpg |  | ranking.json |
| 3630319 | 阿凛每日集锦：钓鱼王再现江湖！ | downloaded | assets/cover/3630319.jpg | http://i1.hdslb.com/320_200/video/4d/4de2129ac356d24c91858c579f164ce4.jpg |  | ranking.json |
| 3630327 | 【恐怖微电影】诡言鬼语 之有鬼 2016 【其他信息】 | missing |  | http://i2.hdslb.com/320_200/u_user/2bc3ba0f9f82ce1bb91cc0b78e285167.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630329 | 【黑羽无判手元】第一期 KiRa-KiRa Sensation! | downloaded | assets/cover/3630329.jpg | http://i1.hdslb.com/320_200/video/e5/e517c5789536a6476176749f2a82f62c.jpg |  | ranking.json |
| 3630333 | 【1月】吃糖兽 05-06 | missing |  | http://i2.hdslb.com/320_200/video/29/29b48c7080fc4b07e196d9605388d399.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630344 | 于朦胧相关短视频汇总 | missing |  | http://i0.hdslb.com/320_200/video/04/049e3334c17ae34fd099c1aa922fa68c.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630349 | 东方同人音乐 | missing |  | http://i2.hdslb.com/320_200/video/82/8249ec229f3f9c87920a58c5faece9e7.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630351 | 【山下智久】【MY DEAR】 20111221 SGSB live cut | missing |  | http://i0.hdslb.com/320_200/video/94/94969033515255bebf53b05bb02a8942.jpg | api code -404 啥都木有 | ranking.json |
| 3630352 | 诺言《 如龙极》 直播实况01 | missing |  | http://i2.hdslb.com/320_200/video/fc/fc39305ff12b78f04155a173cbfdbd24.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630355 | 传智播客 张鹏 带你一周hold住html+css 第01讲 html标记... | downloaded | assets/cover/3630355.png | http://i0.hdslb.com/320_200/u_user/209386d3d2cd121792bc7b03b2d8c6ee.jpg |  | ranking.json |
| 3630356 | 不务正业x2 | downloaded | assets/cover/3630356.png | http://i2.hdslb.com/320_200/u_user/0698ad546a7fd3673e3eec761f6b989a.jpg |  | ranking.json |
| 3630365 | 【渣翻】兔子先生-泫漓 | missing |  | http://i0.hdslb.com/320_200/video/29/29e1807f2baf2ac847401c0df8a0de59.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630366 | 蘭寿富 Blu-ray DVD『L\'Ange LIVE』预告 | downloaded | assets/cover/3630366.png | http://i1.hdslb.com/320_200/u_user/4904bb7c7a11cce21c258bb0a985443d.jpg |  | ranking.json |
| 3630380 | 【紫雨carol】《侠盗猎车5（GTA5）》故事模式【30：胆大妄为】 | downloaded | assets/cover/3630380.jpg | http://i2.hdslb.com/320_200/video/1e/1e188445e26b1e4bd4af543a921defd1.jpg |  | ranking.json |
| 3630384 | 【千亿】【琴歌】权御天下【袅袅虚拟歌手】 | missing |  | http://i2.hdslb.com/320_200/video/6e/6e12ab2b40f3f5d0ac4fa7a040f975a2.jpg | api code 62002 稿件不可见 | ranking.json |
| 3630394 | 爱尔兰美少年--郭时旸 cut Part4 [End] | downloaded | assets/cover/3630394.jpg | http://i2.hdslb.com/320_200/video/7f/7f8a5cd38d4ef5b3b37a34d678b828f9.jpg |  | ranking.json |
| 3630404 | DNF女机械火山boss与绿名同在打法 | downloaded | assets/cover/3630404.png | http://i1.hdslb.com/320_200/u_user/12bda37016e1a84083e564c65574a56c.jpg |  | ranking.json |
| 3630405 | 【官网】《Hoopa and the Clash of Ages》上架预告 | downloaded | assets/cover/3630405.png | http://i2.hdslb.com/320_200/u_user/121090d77e55c09e55bb22640e5cf311.jpg |  | ranking.json |
| 3630414 | 【哔哔站中字】BANGTAN BOMB 2016合集 | downloaded | assets/cover/3630414.jpg | http://i0.hdslb.com/320_200/video/e4/e452fbb4f7670c248c9d520077650507.jpg |  | ranking.json |
| 3630416 | 【晚香玉】恋的2-4-11 in 那霸港口【世界第一的...最喜欢了唷】 | downloaded | assets/cover/3630416.jpg | http://i0.hdslb.com/320_200/video/51/510cf4b943cfa0e9a7dcaeda64a17614.jpg |  | ranking.json |
| 3630439 | 萌宠gif合集 第5期 | downloaded | assets/cover/3630439.jpg | http://i2.hdslb.com/320_200/video/9d/9db0225ba86d847361680a3551cf6bb6.jpg |  | ranking.json |
| 3630444 | 【爱恋狂潮】张耀扬cut | missing |  | http://i0.hdslb.com/320_200/video/3a/3a243b048d08df9ac0135c2350e9eb74.jpg | api code -404 啥都木有 | ranking.json |

## Summary

total aids: 319 · downloaded: 189 · missing (deleted/private): 130 · failed: 0 · not attempted: 0

This run: 0 freshly downloaded · 189 already on disk (skipped).

Bangumi entries carrying `spid`/`cover` instead of `aid` were skipped by design: 55.
Downloaded bytes: 17480986 (see `assets/cover/` for the on-disk size).

### Not downloaded

- `68389` — missing: api code 62002 稿件不可见 (殴打时配这个BGM没问题吗？)
- `227058` — missing: api code -404 啥都木有 (【国产】中华小子 01-26话（全）)
- `621729` — missing: api code 62002 稿件不可见 (【泰剧】名门绅士之妙手佳人【全10集】)
- `1076887` — missing: api code -404 啥都木有 (【2012深夜日剧 渡边麻友】鲭鱼偶像/欺诈偶像【喜剧】)
- `1097315` — missing: api code -404 啥都木有 (暴走大事件 第二季 10)
- `1144009` — missing: api code -404 啥都木有 (【高清/漫改/治愈】白兔糖真人版（芦田爱菜/松山健一/香里奈/桐谷美玲）)
- `1186139` — missing: api code 62002 稿件不可见 (过去同步都弱爆了~！)
- `1241827` — missing: api code 62002 稿件不可见 (【大河剧】平清盛（2012）)
- `1266401` — missing: api code -404 啥都木有 (【7月】花舞少女 01)
- `1266405` — missing: api code -404 啥都木有 (【7月】搞姬日常 01【幻之】)
- `1266411` — missing: api code -404 啥都木有 (【7月】Re：␣浜虎（第二季）01)
- `1266959` — missing: api code 62002 稿件不可见 (【金坷垃】肥一直下 feat.元首 德国boy 标准结局篇)
- `1267620` — missing: api code 62002 稿件不可见 (【暴走翻唱】千本幼女【完整版】)
- `1268450` — missing: api code 62002 稿件不可见 (日本屌丝 第一集)
- `1268718` — missing: api code -404 啥都木有 (鲁鲁修正确的打开方式~~【友军之围】)
- `1268767` — missing: api code -404 啥都木有 (【偶像言情】杉杉来了/杉杉来吃 01-03【顾漫小说改编】)
- `1269935` — missing: api code -404 啥都木有 (【7月】桃剑 01)
- `1270248` — missing: api code 62002 稿件不可见 (【治愈系】谢谢你 让我学会放手【综漫】)
- `1270900` — missing: api code 62002 稿件不可见 (羞耻感什么的，棒子已经丢掉了)
- `1272041` — missing: api code -404 啥都木有 (【10月】全职猎人2011 第137话 选举篇【异域】)
- `1272593` — missing: api code -404 啥都木有 (【7月】Free! 第二季 02)
- `1272674` — missing: api code -404 啥都木有 (【仙侠玄幻古装剧】古剑奇谭 05-06【游戏改编】)
- `1273190` — missing: api code -404 啥都木有 (【清晰HDTC】【明日边缘】汤姆克鲁斯全金属杀戮轮回【官方中字高分科幻2014】)
- `1273211` — missing: api code -404 啥都木有 (【每日一暴精彩合集】暴漫造星工程开屎 涮尽节操刷爆底线)
- `1274658` — missing: api code 62012 62012 (【节操君】评点那些知名UP主(第2期))
- `1275467` — missing: api code 62002 稿件不可见 (【尋音】東京喰種OP-unravel（Dubstep dj-Jo）【国人翻唱】)
- `1275723` — missing: api code 62002 稿件不可见 (深井冰配音版lovelive 第一话)
- `1275998` — missing: api code 62002 稿件不可见 (【7月】 东京食尸鬼 02)
- `1276025` — missing: api code -404 啥都木有 (【仙侠玄幻古装剧】古剑奇谭 07-08【游戏改编】)
- `1276040` — missing: api code 62002 稿件不可见 (【允星河】节操同好会（二）——这是我做过最正经的一次)
- `1276067` — missing: api code -404 啥都木有 (【小福利】 心跳的旋律！！！)
- `1276087` — missing: api code 62002 稿件不可见 (【7月】东京残响 01)
- `1276675` — missing: api code -404 啥都木有 (暴走大事件 第三季 03)
- `1276729` — missing: api code 62002 稿件不可见 (【电视剧古剑奇谭 苏兰苏】古剑奇谭之 标准偶像剧)
- `1276951` — missing: api code -404 啥都木有 (【7月日剧】孤独的美食家 第四季01【SABER】)
- `1277658` — missing: api code 62012 62012 ([MAD樱花庄)
- `1278001` — missing: api code 62002 稿件不可见 (【渣制作】献给B站所有的学渣们 学渣之怨念)
- `1279574` — missing: api code -404 啥都木有 (【7月】三坪房间的侵略者 01)
- `1279663` — missing: api code 62002 稿件不可见 (冰爽一夏③-水羊羹&amp;抹茶水羊羹)
- `1279911` — missing: api code -404 啥都木有 (编辑部的故事：08 暴走动物园:断禁的人与兽)
- `1280933` — missing: api code 62002 稿件不可见 (【4月】JOJO的奇妙冒险 星尘十字军 15【JOJO奇妙冒险吧&amp;...)
- `1282362` — missing: api code 62002 稿件不可见 (【7月】刀剑神域 第二季 02)
- `1283471` — missing: api code -404 啥都木有 (【4月】魔法科高校的劣等生 15【华盟x澄空】)
- `1283825` — missing: api code -404 啥都木有 (【法国超短剧】总而言之 61 女友炮友的修罗场【弘子】)
- `1286064` — missing: api code -404 啥都木有 (【7月】斩·赤红之瞳 02)
- `1286204` — missing: api code -404 啥都木有 (【7月】月刊少女野崎君 02)
- `1288548` — missing: api code -404 啥都木有 (日本屌丝 第二集 命运的邂逅)
- `1302859` — missing: api code -404 啥都木有 (【VS岚】【字】140710 2小时SP- 关8 小园浩己 （游戏部分）)
- `1345743` — missing: api code -404 啥都木有 (【法鲨】【英剧】【中字】女巫 HEX 第一季【2005】)
- `1404335` — missing: api code -404 啥都木有 (【史蒂芬·斯皮尔伯格-经典冒险科幻片】第三类接触.1977.720P-高清版)
- `1665218` — missing: api code 62002 稿件不可见 (【合集】旋风管家！第一季【官方中文正版】)
- `1688783` — missing: api code -404 啥都木有 (【军烨】情敌见面分外脸红——《画魂》军烨CUT)
- `1901205` — missing: api code -403 访问权限不足 (2014下半年B站动画区收藏超4千的自制类投稿排行)
- `1923035` — missing: api code -404 啥都木有 (【百家讲坛】国号（全集）)
- `2103101` — missing: api code -404 啥都木有 (【DVD】游戏王GX)
- `2131548` — missing: api code -404 啥都木有 (【完结】无间双龙~这份爱，才是正义 10 生田斗真/小栗旬/上野树里【新酱】)
- `2286846` — missing: api code -404 啥都木有 (【动画】芭比节日系列-芭比之圣诞颂歌 2008【英语中字】)
- `2298919` — missing: api code -404 啥都木有 (【1080P】你眼中的世界 (2014) 【科幻爱情小清新 最容易忽视的好电影】)
- `2371481` — missing: api code -404 啥都木有 (【人类大历史】S01E02 马的力量【UnIon字幕组】)
- `2403036` — missing: api code -404 啥都木有 (【4月】英国一家，吃在日本 07 【F宅】)
- `2443708` — missing: api code 62002 稿件不可见 (【老游侠】喜剧末日生存60s 能存活几天！)
- `2505151` — missing: api code -404 啥都木有 (【2月】手里剑战队18【梦星】)
- `2511984` — missing: api code 62002 稿件不可见 (【MMD】1～8部 Colorful World【JOJO】)
- `2523328` — missing: api code -403 访问权限不足 (【全明星】被鬼畜妄想全明星)
- `2523571` — missing: api code 62002 稿件不可见 (【MC】终章：如果食物都不可食用)
- `2526387` — missing: api code 62002 稿件不可见 (【惊悚】爱丽丝 1988 【经典诡异奇幻惊悚】)
- `2535063` — missing: api code 62002 稿件不可见 (【梁逸峰×郎朗】最终鬼畜梁逸朗——表情帝大对决)
- `2536138` — missing: api code -404 啥都木有 (【国产】无心法师 02)
- `2543670` — missing: api code 62002 稿件不可见 (【大保健字幕组】记一次把各种金属溶液倒进水里的作死过程)
- `2547434` — missing: api code -404 啥都木有 (海贼王 艾斯 不曾后悔活着)
- `2548580` — missing: api code 62002 稿件不可见 (【电锯实况】合金弹头2 两币游聚通关解说)
- `2548994` — missing: api code 62002 稿件不可见 (美帝爸爸航母日常 E2起飞+妹子手动上炸弹)
- `2549520` — missing: api code 62002 稿件不可见 (【楽小漫×小梵×小起】Masked Bitch 【*CLB】)
- `2549888` — missing: api code -404 啥都木有 (【暴走大事件第四季】1 大事件惊艳归来,王尼玛深情告白！)
- `2550515` — missing: api code -404 啥都木有 (【国产】华胥引 01-02)
- `2553074` — missing: api code 62002 稿件不可见 (【吃货木下】冲绳的猪骨汤拉面（逆风字幕）)
- `2553247` — missing: api code 62002 稿件不可见 (【恐怖/惊悚】绝魂站/地铁四重奏 End of the Line 2007...)
- `2554868` — missing: api code -404 啥都木有 (【1080P】【喜剧】泰迪熊2 2015【中文字幕】)
- `2556285` — missing: api code 62002 稿件不可见 (【喜剧 / 恐怖】僵尸噩夜 Zombie Night (2003) 高清 ...)
- `2557371` — missing: api code 62002 稿件不可见 (童心2.0 智商upup的高颜值小王子（上）)
- `2557507` — missing: api code 62002 稿件不可见 (逆袭网络剧拍摄花絮未调色版)
- `2557594` — missing: api code 62002 稿件不可见 (初投稿 2015 CCG漫展宅舞)
- `2557802` — missing: api code 62002 稿件不可见 (【张坤解说三国杀】(先行版)周末娱乐，新破军强扒防具，孙休凌统强力菊花)
- `2557856` — missing: api code 62002 稿件不可见 (【AMV/樱花庄的宠物女孩】突然好想你)
- `3623894` — missing: api code 62002 稿件不可见 (【海妖】【太子妃升职记ED】可念不可说)
- `3624107` — missing: api code 62002 稿件不可见 (【1月熟肉】忍者神龟2012第四季第六集【人人字幕】)
- `3624187` — missing: api code -404 啥都木有 (【8月】日常工作/Regular Show S07E19【康复中心】)
- `3624220` — missing: api code 62002 稿件不可见 (【一点都不污的撸啊撸】女英雄们的Nobody时间)
- `3625072` — missing: api code -404 啥都木有 (【APH/MMD】★黑三角★====Perfume Global====)
- `3625444` — missing: api code 62002 稿件不可见 (【东方偶像乡 MMD】爱丽丝-忘却的前世)
- `3627236` — missing: api code -404 啥都木有 (【4月年番】战魂王：烈火斗魂 41)
- `3628941` — missing: api code 62002 稿件不可见 (【Love Live】Snow Halation)
- `3629764` — missing: api code 62002 稿件不可见 (健身女ChelseaLifts挑战100个俯卧撑)
- `3629823` — missing: api code 62002 稿件不可见 (自行车小哥Erik收到了来自ChelseaLifts的100个俯卧撑挑战)
- `3629838` — missing: api code 62002 稿件不可见 (【AMV/多素材衔接】燃息不止)
- `3629904` — missing: api code 62002 稿件不可见 (【素材】精彩片段 01)
- `3629948` — missing: api code 62002 稿件不可见 (韩国电影《聚会的目的》：看已婚寂寞男如何俘获新进漂亮女同事！)
- `3629952` — missing: api code -404 啥都木有 (【科幻/惊悚】极速凶间 1997【DVD】)
- `3629973` — missing: api code 62002 稿件不可见 (【刀剑乱舞】五虎退的疑心暗鬼)
- `3630000` — missing: api code 62002 稿件不可见 (【Jude Law】《副作用》访谈：贵圈有多小 Jude盛赞钱老板)
- `3630007` — missing: api code -404 啥都木有 (（喜剧）<我滴个神啊>精彩片段（不要小看印度电影哦）)
- `3630048` — missing: api code 62002 稿件不可见 (【金坷垃】-I'm Yours [新人制作])
- `3630079` — missing: api code 62002 稿件不可见 (【太子妃升职记】【齐晟X张芃芃】昨日江南春又雨)
- `3630081` — missing: api code -404 啥都木有 (岳绮罗)
- `3630106` — missing: api code 62002 稿件不可见 (【clattanoia】decade剧场版)
- `3630112` — missing: api code 62002 稿件不可见 (脸大如盆的糙汉如何成为网骗少女)
- `3630132` — missing: api code 62002 稿件不可见 (【怪谈新耳袋】全集「07SP左篇：黑衣人」)
- `3630135` — missing: api code -404 啥都木有 ([SFM]EH-QUES-TREE-UHH)
- `3630180` — missing: api code 62002 稿件不可见 (非凡吔吔吔)
- `3630190` — missing: api code 62002 稿件不可见 (太子妃升职记剪辑 主天爱)
- `3630223` — missing: api code 62002 稿件不可见 (韩剧混剪粉红瞬间一)
- `3630225` — missing: api code 62002 稿件不可见 (【全明星RAP】光头的天堂与地狱)
- `3630234` — missing: api code 62002 稿件不可见 (【枪声音乐】反恐精英OL2+QQ飞车)
- `3630249` — missing: api code -404 啥都木有 (《我可能不会爱你》经典台词 第五集)
- `3630257` — missing: api code 62002 稿件不可见 (【Matthew Lush】IN LOVE)
- `3630272` — missing: api code 62002 稿件不可见 (【张艺兴】甜菜对我们表白啦~)
- `3630288` — missing: api code -404 啥都木有 (【吃货木下】【UUUM字幕】终于吃肯德基啦！！)
- `3630291` — missing: api code 62002 稿件不可见 (今天脑门尤其的亮！ 老寿星的脑门自带反光镜。鸭血粉丝汤和汤包)
- `3630295` — missing: api code 62002 稿件不可见 (【ふるる】痒。【女声】)
- `3630305` — missing: api code 62002 稿件不可见 (【GTA5】兰博基尼LP700-4 MOD)
- `3630310` — missing: api code 62002 稿件不可见 (【10月】后裔：极恶世界 12【迪幻字幕组】)
- `3630327` — missing: api code 62002 稿件不可见 (【恐怖微电影】诡言鬼语 之有鬼 2016 【其他信息】)
- `3630333` — missing: api code 62002 稿件不可见 (【1月】吃糖兽 05-06)
- `3630344` — missing: api code 62002 稿件不可见 (于朦胧相关短视频汇总)
- `3630349` — missing: api code 62002 稿件不可见 (东方同人音乐)
- `3630351` — missing: api code -404 啥都木有 (【山下智久】【MY DEAR】 20111221 SGSB live cut)
- `3630352` — missing: api code 62002 稿件不可见 (诺言《 如龙极》 直播实况01)
- `3630365` — missing: api code 62002 稿件不可见 (【渣翻】兔子先生-泫漓)
- `3630384` — missing: api code 62002 稿件不可见 (【千亿】【琴歌】权御天下【袅袅虚拟歌手】)
- `3630444` — missing: api code -404 啥都木有 (【爱恋狂潮】张耀扬cut)

_No cover was invented: a row is `downloaded` only if the bytes on disk passed a JPEG/PNG/WebP magic-number check._
