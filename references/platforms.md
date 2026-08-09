# Agent platform notes

## Scheduling

Use the installed agent's native scheduler rather than system cron when possible so the job can
wake the agent and deliver into a configured chat. The scheduled prompt should invoke this
skill, fetch one due/new card, deliver it to the selected home channel, and stop if no card is
available. The agent gateway must remain running.

Do not create a schedule until the user supplies the channel/chat, IANA timezone, local time,
and desired card count. Keep schedules in Hermes or OpenClaw, not in the vocabulary database.

## WeChat

Treat personal WeChat through Hermes Weixin/iLink as a direct-message integration. Ordinary
group events are commonly unavailable for iLink bot identities. Use numbered text choices and
send the revealed answer as a follow-up message after the user's rating.

For Hermes, run `hermes gateway setup`, select Weixin, complete QR login, configure an allowlist,
and keep the gateway running. If the skill is invoked from the target WeChat DM, reply to that
current chat. Otherwise ask which configured home channel/contact should receive cards.

## Telegram

Prefer native inline choices when the agent exposes structured prompts. Fall back to numbered
text if arbitrary callbacks are unavailable. Keep stale callback protection based on card ID and
review count.

Use the current inbound chat by default. If setup is missing, use the agent platform's channel
setup flow (for example `hermes gateway setup` or `openclaw channels add`) and require an
allowlist before accepting messages.

## WhatsApp

Prefer native choices when available; otherwise use numbered text. Official WhatsApp Cloud API
free-form delivery is limited to the 24-hour customer-service window after the user's last
message. Do not promise an out-of-window scheduled message unless the configured agent supports
approved templates. Personal WhatsApp Web/Baileys bridges may allow delivery but carry the
platform and account risks documented by the agent provider.

OpenClaw ships Telegram support and installs WhatsApp through its channel system. WeChat support
depends on an external plugin; do not claim it is available until the installed plugin is
verified. Use `openclaw onboard` or `openclaw channels add` rather than editing unknown channel
credentials by hand.
