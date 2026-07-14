# Vocab Coach

一个本地优先、由 FSRS 6 驱动的轻量背单词程序。数据保存在 SQLite 中，页面和 API 都由 FastAPI 提供；业务服务可以在后续直接复用于 Docker、MCP 或聊天式 Skill。

## 启动

需要 Python 3.12–3.14 和 [uv](https://docs.astral.sh/uv/)。

```bash
uv sync
cp .env.example .env
uv run uvicorn vocab_coach.main:app
```

打开 <http://127.0.0.1:8000>。默认数据库为 `data/vocab.db`，首次启动会自动建表并创建默认 FSRS 配置。

如果修改了数据库模型，使用 Alembic 管理升级：

```bash
uv run alembic upgrade head
```

## LLM 自动补全

自动补全使用 OpenAI-compatible Chat Completions 接口。在 `.env` 中配置：

```dotenv
LLM_BASE_URL=https://api.deepseek.com
LLM_API_KEY=your-key
LLM_MODEL=deepseek-v4-flash
```

不配置时，新增、导入和复习功能仍可离线使用。自动补全不会覆盖已填写的释义或例句，结果会先返回页面供确认。

## 批量导入

JSON 文件的根节点是数组：

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

CSV 支持 `word,translation,origin_translation,phonetic_us,phonetic_uk,examples` 六列，其中音标字段使用带斜杠的 IPA，`examples` 是由 `{sentence, translation}` 对象组成的 JSON 数组。新导入数据要求英美音标以及每条例句的中文翻译完整；旧数据库中的数据仍可读取。导入采用全量校验和单事务写入：任何一行出错时都不会写入数据。

## API

- `GET /api/sessions/cards?count=20`：按到期规则获取学习卡片。
- `POST /api/cards/{card_id}/reviews`：提交 `again/hard/good/easy`。
- `POST /api/vocabulary/enrich`：补齐单词草稿。
- `POST /api/vocabulary`：保存完整单词。
- `GET /api/vocabulary/lookup?word=serendipity`：获取完整单词信息、FSRS 状态和复习记录；含空格或斜杠的短语请使用这个接口。
- `GET /api/vocabulary/{word}`：查询简单单词的便捷路径。
- `POST /api/vocabulary/{word}/enrich-missing`：显式调用模型，为旧卡补齐英美音标和双语例句。
- `POST /api/vocabulary/import`：上传 CSV 或 JSON。
- `GET /api/stats/today`：获取今日统计。
- `/docs`：交互式 OpenAPI 文档。

## 测试

```bash
uv run pytest
```
