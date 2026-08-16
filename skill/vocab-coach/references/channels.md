# Channel presentation policy

Use capability detection from the host Agent. Do not infer a capability from the platform name
alone, and do not change the four FSRS review grades to fit a button limit.

| Channel | Preferred output | Required fallback |
| --- | --- | --- |
| Telegram | inline buttons | numbered text |
| Feishu/Lark | interactive card/buttons | Markdown or plain text |
| WhatsApp | native actions only when all review grades fit | numbered text |
| WeChat/Weixin | plain text | plain text |
| Other channels | advertised native presentation | numbered text |

Channel setup remains outside this project. WhatsApp proactive delivery may be limited by the
configured provider's messaging window or templates. WeChat support depends on the Agent's
installed Weixin/WeChat plugin and is commonly DM-oriented. Do not promise a channel that the
current Agent has not configured and health-checked.
