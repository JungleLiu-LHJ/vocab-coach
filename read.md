# Vocab Coach 启动指南

## 环境要求

- Python 3.12–3.14
- [uv](https://docs.astral.sh/uv/)

## 首次启动

在项目根目录执行：

```bash
uv sync
cp .env.example .env
uv run uvicorn vocab_coach.main:app --host 127.0.0.1 --port 8000
```

随后在浏览器打开 [http://127.0.0.1:8000](http://127.0.0.1:8000)。

启动时会自动创建并初始化 SQLite 数据库；默认数据库文件是 `data/vocab.db`。

## 开发模式

若希望修改后自动重启服务，使用：

```bash
uv run uvicorn vocab_coach.main:app --host 127.0.0.1 --port 8000 --reload
```

## 可选：配置 LLM 自动补全

不配置模型也可以正常新增、导入和复习单词。若需要自动补全单词信息，在 `.env` 中填写：

```dotenv
LLM_BASE_URL=https://api.deepseek.com
LLM_API_KEY=your-api-key
LLM_MODEL=deepseek-v4-flash
```

也可按需要配置服务地址：

```dotenv
VOCAB_HOST=127.0.0.1
VOCAB_PORT=8000
VOCAB_DATABASE_URL=sqlite:///data/vocab.db
```

修改端口后，请用 `http://127.0.0.1:端口号` 访问。

## 常用命令

```bash
# 运行测试
uv run pytest

# 执行数据库迁移（修改数据模型后使用）
uv run alembic upgrade head
```

服务运行时，在终端按 `Ctrl+C` 即可停止。接口文档位于 [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)。
