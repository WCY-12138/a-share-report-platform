# A股日报平台

一个本地运行的 A 股个人持仓日报查看平台，按你的提示词结构展示大盘、个股跟踪、板块联动和明日关注，并支持历史日报、复盘记录和 Markdown 导入。

## 启动

双击 `start.bat`，或运行：

```powershell
python server.py
```

然后打开 [http://127.0.0.1:8765](http://127.0.0.1:8765)。

## 日报来源

网页会读取 `reports/` 文件夹里的 `.md` / `.txt` 文件。每次生成日报后，把文件保存为：

```text
reports/2026-08-05.md
```

然后在网页里点击“刷新”即可看到。也可以在“导入”页面直接粘贴或上传 Markdown 日报并保存。

## 数据结构

`server.py` 提供本地 API：

- `GET /api/reports`：列出全部日报及原始 Markdown
- `POST /api/reports`：保存日报，JSON 为 `{"date": "2026-08-05", "content": "..."}`
- `DELETE /api/reports/2026-08-05.md`：删除指定日报

复盘笔记保存在浏览器本地存储中。

## 部署到 GitHub Pages

平台已支持静态托管模式。GitHub Pages 使用 `main` 分支根目录发布，因此每次新增或修改日报后，需要先构建静态数据：

```powershell
python build_reports.py
```

然后提交 `reports/YYYY-MM-DD.md` 和 `data/reports.json` 并推送到 `main`，GitHub Pages 会自动更新网页。
