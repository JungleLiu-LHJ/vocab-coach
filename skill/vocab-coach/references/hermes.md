# Hermes

Configure the local stdio MCP server under `mcp_servers` and restart Hermes so the tools are
discovered. The installer prints the exact command and absolute executable path.

For a user-initiated review, call Hermes `clarify` with the card text and the action labels. Hermes
renders native choices on channels that support them and accepts the next numbered/text reply on
plain-text channels. Use the returned choice value as the `grade` passed to
`vocab_coach_review`.

For a scheduled card, do not leave a blocking `clarify` call open. Send the card through the
current gateway/home channel and include the numbered `fallback_text`; process a later reply only
if the same Agent conversation still contains the active card.

Hermes owns gateway credentials, allowlists, home-channel delivery, and cron. Vocab Coach does
not inspect or modify them.
