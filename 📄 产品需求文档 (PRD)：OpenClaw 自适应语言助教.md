这份 PRD（产品需求文档）旨在为你打造一个深度集成于 OpenClaw 的**主动式、自适应语言学习插件**。它将传统的间隔重复算法（SRS）与现代大语言模型（LLM）的生成能力相结合。

------

## 📄 产品需求文档 (PRD)：OpenClaw 自适应语言助教

### 1. 产品定位

一个“不劳而获”的单词助教。它不等待你打开 App，而是根据你的作息，在你的社交软件（微信/TG 等）中主动为你推送量身定制的学习内容。

### 2. 核心功能

- **智能时区调度**：仅在用户设定的活跃时区（如 09:00 - 22:00）内随机推送，避免深夜骚扰。
- **自适应难度（FSRS 算法）**：基于用户反馈（认识/模糊/忘记），动态调整单词下次出现的时间。
- **绝对去重**：通过本地索引过滤，确保 不会重复推荐已掌握的单词。
- **情境化生成**：LLM 根据用户当前水平，为单词实时生成符合语境的例句和助记逻辑。

### 3. 用户故事 (User Stories)

- “作为用户，我希望在上班路上随机收到一个单词，而不是每天早上 8 点死板的提醒。”
- “作为用户，我希望点击‘太简单了’之后，插件能自动提高后续单词的难度等级。”
- “作为用户，我不想自己维护词库，希望插件能自动下载网络上的标准词单。”
- “作为用户，我想同一个单词会不断推荐直到我记住”
- “作为用户，我想一个单词重复推荐的时候可能会隐藏释义，然后会根据我的反馈看后续推荐的频率或者是否停止推荐”

------

## 🛠️ High-Level 技术实现方案

### 1. 整体架构图

### 2. 数据流与组件设计

#### A. 词库引擎 (Data Source)

- **实现方式**：插件首次启动时，从 GitHub（如 ECDICT 或 CEFR 词库）异步 `fetch` 一个轻量级的索引 JSON。

- https://github.com/KyleBing/english-vocabulary

- **数据结构**：

  JSON

  ```
  { "id": 1024, "w": "resilient", "lv": "B2", "tag": "ielts" }
  ```

#### B. 调度器 (Smart Scheduler)

- **算法逻辑**：采用 **Poisson Process（泊松过程）** 模拟随机推送，或者简单的“时间窗随机化”。
- **时区处理**：使用 `Intl.DateTimeFormat` 自动识别环境时区，并结合用户配置的 `activeHours`。

#### C. 记忆算法 (SRS Engine)

- **核心公式**：采用简化版 **FSRS (Free Spaced Repetition Scheduler)**。

- 计算下一次复习间隔 $I$ 的逻辑：

  $$I_n = I_{n-1} \cdot e^{w \cdot (D-S)}$$

  *(其中 $S$ 为稳定性，$D$ 为难度，$w$ 为权重参数)*。这些参数全部持久化在 `context.storage` 中。

#### D. 交互回路 (Feedback Loop)

- **发送端**：`context.gateway.send` 发送带 Button 的卡片。
- **接收端**：插件监听 `onAction` 事件。当用户点击“认识”时，更新该词的稳定性；点击“忘记”时，重置其复习周期。

------

## 🚀 关键技术实现代码 (TS 伪代码)

### 1. 状态管理 (如何存进度)

TypeScript

```
interface UserProgress {
  level: number;       // 1-10 级
  history: number[];   // 已学词 ID
  weights: Record<number, { s: number, d: number, next: number }>; // 每个词的 FSRS 状态
}
```

### 2. 主动推送逻辑

------

## 🗓️ 实施路线图 (Roadmap)

1. **Phase 1 (MVP)**：实现 TS 插件基础框架，支持从 GitHub 下载静态 JSON 词库，实现简单的定时随机推送。
2. **Phase 2 (Intelligence)**：接入 `context.agent` 生成动态内容，实现 `context.storage` 记录学习历史，彻底解决“重复推送”问题。
3. **Phase 3 (Adaptive)**：引入 FSRS 算法逻辑，支持根据 `onAction` 反馈自动计算复习时机，支持手动/自动调整难度等级。
4. **Phase 4 (Release)**：优化安装包体积，完善 `openclaw.plugin.json` 的配置界面，发布到插件市场。