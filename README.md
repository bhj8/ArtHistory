# 美术史漫游地图

中文为主、中英对照的交互美术史导航。目前收录 233 个条目、637 幅配图、237 组关联和 23 条学习路线。

包含时代与地域地图、图解词典、多作品图库、搜索筛选、主题路线、收藏及两项对照。全部 233 个条目已有配图，其中 176 个条目支持多图浏览。配图包括作品、建筑、展览现场、工艺记录和 4 幅明确标注的本站学习图解。支持只看有图、最近阅读、卡片多图预览和大图细节放大。条目在居中宽幅阅读页中打开，桌面并排展示图文，手机上下阅读；缩略图位于大图上方，可同屏逐幅切换。内容覆盖史前至当代及设计、视觉媒介；这是学习导航，并非穷尽的世界美术史。

## 本地开发

条目按学习顺序分为 42 个「核心必读」、79 个「重点了解」、112 个「专题拓展」。首页默认核心主线，可切换核心＋重点或全部条目，并按学习优先排序。条目直接展示视觉特征、历史背景、人物与作品和参考资料。层级保存在分享链接中；搜索会提示其他层级的匹配结果。

要求 Node.js 22 或更高版本。无第三方运行时依赖，无需 `npm install`。

```sh
npm run dev
```

打开终端显示的本地地址。由于数据使用 JSON 加载，请通过 HTTP 服务预览，不要双击 `index.html`。

```sh
npm run check    # 检查数据、引用、图片和 JavaScript 语法
npm run build    # 校验后将网站文件输出到 dist/
npm run preview  # 预览 dist/
```

## 文件职责

| 位置                          | 用途                                      |
| ----------------------------- | ----------------------------------------- |
| `index.html`                  | 页面骨架，无内嵌图片或知识数据            |
| `src/main.js`                 | 初始化、状态、交互及详情面板              |
| `src/ui/views.js`             | 地图、目录、图库与路线                    |
| `src/ui/detail.js`            | 详情、多图与对照                          |
| `src/ui/helpers.js`           | 通用图片、链接与转义组件                  |
| `src/content.js`              | 数据加载与索引，兼容 GitHub Pages 子路径  |
| `src/storage.js`              | 本地收藏与浏览记录                        |
| `src/styles/main.css`         | 页面样式与响应式布局                      |
| `data/entries/*.json`         | 按六条线索分别维护知识条目                |
| `data/artworks.json`          | 独立作品 ID、多条目关联、图片、作者与出处 |
| `data/relationships.json`     | 关联节点、关系类型与解释                  |
| `data/routes.json`            | 学习路线及条目顺序                        |
| `data/taxonomy.json`          | 分区和时代定义                            |
| `data/sources.json`           | 已收录的资料来源                          |
| `assets/artworks/*.{webp,svg}`      | 独立图片文件，支持浏览器缓存与按需加载    |
| `scripts/`                    | 零依赖校验、构建与本地预览工具            |
| `.github/workflows/pages.yml` | PR 校验及 main 分支自动发布               |

新增内容、图片和关系的具体操作见 [内容维护说明](docs/content-guide.md)。

## GitHub Pages

仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。首次启用后，在 Actions 运行 `Validate and deploy Pages`；以后提交到 `main` 会自动校验并发布，校验失败不会部署。PR 只校验，不部署。

在线网址：https://baohongjiang.com/ArtHistory/ 。

## 图片与资料

图片来自 The Metropolitan Museum of Art、Cleveland Museum of Art、国立故宫博物院、南澳艺术馆、中央美院公开作品记录，以及 Wikimedia Commons 的图片档案。已有的 328 张克利夫兰馆藏图片均按馆方 CC0 字段筛选，保存中文标题、原题、作者归属限定、年代、材质、馆藏记录及许可链接。作者、年代、馆藏链接和权利元数据在 `data/artworks.json` 中保留；来源还包括 V&A 与 MoMA 的公开专题。作品与摄影的权利分别处理：Commons 图片保留摄影者、来源、许可链接与转换说明，照片许可不等同于所摄作品的权利。另有明确标注版权保留的馆方作品图；不把可访问图片统一声明为公共领域。本站学习图解不是历史作品，可用 `node scripts/generate-guides.mjs` 重新生成。代码仓库不替图片统一授予许可。

收藏保存在浏览器本地，不上传服务器；部署域名改变时，不同域名之间的收藏不会自动迁移。
