---
name: vocab-coach
description: Operate the local-first Vocab Coach through its MCP tools. Use when a user asks to collect or import vocabulary from a topic, exam, file, or webpage; look up a word or phrase; start or continue an FSRS study session; submit a rating; view study statistics; or schedule vocabulary delivery through Hermes, OpenClaw, Telegram, WhatsApp, WeChat/Weixin, Feishu/Lark, or another Agent-managed channel.
---

# Vocab Coach

This repository entrypoint delegates to the distributable Skill. Before operating Vocab Coach,
read [skill/vocab-coach/SKILL.md](skill/vocab-coach/SKILL.md) completely and follow it as the
authoritative workflow. Load only the references it routes to:

- [MCP tool contract](skill/vocab-coach/references/tools.md) before the first import or review.
- [Hermes](skill/vocab-coach/references/hermes.md) when running in Hermes.
- [OpenClaw](skill/vocab-coach/references/openclaw.md) when running in OpenClaw.
- [Channel policy](skill/vocab-coach/references/channels.md) before choosing buttons or cards.

If this file was installed without the repository and those resources are missing, bootstrap the
complete app and Skill:

```bash
curl -fsSL https://raw.githubusercontent.com/JungleLiu-LHJ/vocab-coach/main/scripts/install-agent.sh | sh -s -- --agent auto
```

Restart the host Agent after installation and call `vocab_coach_doctor`. Keep vocabulary and FSRS
inside Vocab Coach; keep browsing, channel credentials, message delivery, and schedules in the
host Agent.
