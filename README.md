# 美术史漫游地图

中文为主、中英对照的交互美术史导航。目前收录 233 个条目、195 件作品图、237 组关联和 23 条学习路线。

包含时代与地域地图、条目目录、多作品图库、搜索筛选、主题路线、收藏及两项对照。内容覆盖史前至当代及设计、视觉媒介；这是学习导航，并非穷尽的世界美术史。

## 本地开发

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
| `assets/artworks/*.webp`      | 独立图片文件，支持浏览器缓存与按需加载    |
| `scripts/`                    | 零依赖校验、构建与本地预览工具            |
| `.github/workflows/pages.yml` | PR 校验及 main 分支自动发布               |

新增内容、图片和关系的具体操作见 [内容维护说明](docs/content-guide.md)。

## GitHub Pages

仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。首次启用后，在 Actions 运行 `Validate and deploy Pages`；以后提交到 `main` 会自动校验并发布，校验失败不会部署。PR 只校验，不部署。

在线网址：https://baohongjiang.com/ArtHistory/ 。

## 图片与资料

图片来自 The Metropolitan Museum of Art 的馆藏记录。作者、年代、馆藏链接和权利元数据在 `data/artworks.json` 中保留；来源还包括 V&A 与 MoMA 的公开专题。每件作品的权利状况以原始馆藏记录为准，代码仓库不替图片统一授予许可。

收藏保存在浏览器本地，不上传服务器；部署域名改变时，不同域名之间的收藏不会自动迁移。
