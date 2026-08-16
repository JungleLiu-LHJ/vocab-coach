# Vocab Coach

Vocab Coach 是一个本地优先、由 FSRS 6 驱动的轻量背单词项目。它只处理词汇录入、学习、
复习、查询和必要统计；数据默认保存在本机 SQLite 中，没有网络或 LLM 配置时也能完成核心
背词流程。

项目同时提供网页、HTTP API、结构化 CLI 和本地 stdio MCP Server。Hermes、OpenClaw 等
Agent 通过 MCP 调用同一套业务服务，Telegram、WhatsApp、微信、飞书等渠道的鉴权、收发
消息和定时任务仍由 Agent Gateway 管理。

## 核心特性

- FSRS 6 是唯一的复习调度器。
- 新词显示中英文释义、音标和双语例句。
- 复习词评分前隐藏中文释义和例句翻译，评分成功后再揭晓答案。
- `request_id + review_count` 防止网络重试、旧按钮和迟到消息重复评分。
- SQLite、本地 Web 和 CLI 不依赖 LLM。
- MCP 返回平台无关的展示数据；渠道支持按钮/卡片时用原生交互，否则使用编号文字。

## Hermes / OpenClaw 一键接入

需要 macOS 或 Linux、Git、`uv`，以及已经安装的 Hermes 或 OpenClaw。没有本地 checkout 时
执行：

```bash
curl -fsSL https://raw.githubusercontent.com/JungleLiu-LHJ/vocab-coach/main/scripts/install-agent.sh | sh -s -- --agent auto
```

已有仓库时执行：

```bash
./scripts/install-agent.sh --agent auto
```

`--agent` 支持 `auto`、`hermes`、`openclaw` 和 `both`。安装器会：

1. 将程序安装到 `${VOCAB_COACH_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/vocab-coach}`。
2. 将代码、`.env` 和 SQLite 数据分开保存，更新时保留现有数据。
3. 安装 MCP 可选依赖和完整的 `vocab-coach` Skill。
4. 用绝对路径为检测到的 Agent 注册本地 stdio MCP Server。
5. 运行数据库 doctor、MCP discovery 和连接检查。

安装完成后重启 Agent。可用下面的自然语言直接触发 Skill：

```text
开始复习单词
查看我今天的学习统计
帮我查一下 serendipity
从这个网页整理 20 个生词并加入词库
每天晚上 8 点通过当前 Telegram 对话发一张复习卡
```

### Agent 交互流程

```text
用户消息
  → Hermes/OpenClaw 识别 vocab-coach Skill
  → 调用本地 vocab_coach_* MCP 工具
  → Vocab Coach 查询 SQLite 并执行 FSRS
  → 返回 text + actions + fallback_text
  → Agent Gateway 使用按钮/卡片或编号文字发送
```

每个聊天会话同一时间只保留一张活跃卡片。新词使用 `Easy/Again`；复习词始终使用
`Easy/Good/Hard/Again` 四档。如果渠道无法完整显示四个按钮，必须降级为编号文字，不能
合并或改变 FSRS 评分。

| 渠道 | 首选展示 | 降级方式 |
| --- | --- | --- |
| Telegram | inline buttons | 编号文字 |
| 飞书/Lark | 交互卡片和按钮 | Markdown 或纯文字 |
| WhatsApp | 能完整表达所有选项时使用原生交互 | 编号文字 |
| 微信/Weixin | 纯文字 | 纯文字 |
| 其他渠道 | Agent 声明的原生展示能力 | 编号文字 |

渠道本身需要先在 Hermes/OpenClaw 中配置并通过健康检查。Vocab Coach 不读取或保存渠道
token、联系人、群组或定时任务。

### MCP 工具

| 工具 | 用途 |
| --- | --- |
| `vocab_coach_doctor` | 初始化并检查数据库、migration 和版本 |
| `vocab_coach_import` | 原子化导入结构化词汇，默认跳过已有词 |
| `vocab_coach_lookup` | 查询词义、FSRS 状态和复习记录 |
| `vocab_coach_next_card` | 获取一张到期或新卡片 |
| `vocab_coach_review` | 幂等提交一次 FSRS 评分并揭晓答案 |
| `vocab_coach_stats` | 查询指定时区的今日统计 |

所有 MCP 工具返回 `schema_version` 和 `status`；成功时包含 `data`，失败时包含结构化
`error`。需要展示的工具还返回 `presentation.text`、`presentation.actions` 和
`presentation.fallback_text`。完整工具参数和错误恢复规则位于
[Skill 工具协议](skill/vocab-coach/references/tools.md)。

## 启动网页

需要 Python 3.12–3.14 和 [uv](https://docs.astral.sh/uv/)：

```bash
uv sync
cp .env.example .env
uv run uvicorn vocab_coach.main:app --host 127.0.0.1 --port 8000
```

打开 <http://127.0.0.1:8000>。默认数据库为 `data/vocab.db`，首次启动自动执行 Alembic
migration 并创建默认 FSRS 配置。

## 批量导入

JSON 根节点是数组，每个词必须包含完整释义、英美音标和至少一条双语例句：

```json
[
  {
    "word": "serendipity",
    "translation": "意外发现美好事物的机缘",
    "origin_translation": "The pleasant discovery of something valuable by chance.",
    "phonetic_us": "/ˌserənˈdɪpəti/",
    "phonetic_uk": "/ˌserənˈdɪpɪti/",
    "examples": [
      {
        "sentence": "Finding that café was pure serendipity.",
        "translation": "偶然发现那家咖啡馆真是意外之喜。"
      }
    ]
  }
]
```

CLI 导入：

```bash
uv run vocab-coach import --format json < words.json
```

CSV 使用 `word,translation,origin_translation,phonetic_us,phonetic_uk,examples` 六列，
`examples` 是 JSON 数组。导入会先校验整批数据，再在一个事务中写入；任何记录无效时不会
写入部分结果。

## 可选 LLM 补全

LLM 只用于补全释义、音标和例句，不参与保存、查询或 FSRS 复习。在 `.env` 中配置任意
OpenAI-compatible Chat Completions 服务：

```dotenv
LLM_BASE_URL=https://api.deepseek.com
LLM_API_KEY=your-key
LLM_MODEL=deepseek-v4-flash
```

不配置时，录入、导入、查询和复习仍可离线使用。

## CLI 与 API

结构化 CLI 不要求 Web 服务常驻：

```bash
uv run vocab-coach doctor
uv run vocab-coach lookup serendipity
uv run vocab-coach cards --count 1 --channel wechat
uv run vocab-coach review CARD_ID good \
  --request-id 550e8400-e29b-41d4-a716-446655440000 \
  --expected-review-count 3 \
  --channel wechat
uv run vocab-coach stats --timezone-offset-minutes -480
```

HTTP API 启动后访问 <http://127.0.0.1:8000/docs> 查看完整 OpenAPI。主要接口：

- `GET /api/sessions/cards`
- `POST /api/cards/{card_id}/reviews`
- `POST /api/vocabulary`
- `GET /api/vocabulary/lookup`
- `POST /api/vocabulary/import`
- `GET /api/stats/today`

## 开发验证

```bash
uv sync --extra agent
uv run pytest
uv build
```

修改数据库模型时必须同时添加 Alembic migration，并运行：

```bash
uv run alembic upgrade head
```
