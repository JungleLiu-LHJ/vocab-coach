import "./paths-BJV7vkaX.js";
import { f as defaultRuntime, k as theme } from "./subsystem-4K-e3L3i.js";
import "./utils-BhZbo8Nw.js";
import "./thinking-BYwvlJ3S.js";
import "./agent-scope-CZF6h_5g.js";
import "./openclaw-root-DrFjwUcG.js";
import "./logger-BDhFOulu.js";
import "./exec-WYU5B_af.js";
import "./model-selection-Dovilo6b.js";
import "./github-copilot-token-D37fjdwy.js";
import "./boolean-CJxfhBkG.js";
import "./env-BL7t1mkY.js";
import "./host-env-security-3AOqVC6Z.js";
import "./registry-D5r9Pc2H.js";
import "./manifest-registry-Ix-Y_M6l.js";
import "./dock-DqLW1i1m.js";
import "./message-channel-DOl5pebL.js";
import "./plugins-B4oqCXNl.js";
import "./sessions-DTVAB3HG.js";
import "./pi-embedded-helpers-BDDoCPNX.js";
import "./sandbox-mimqB061.js";
import "./tool-catalog-Dm7UDWav.js";
import "./chrome-zmDkfOk2.js";
import "./tailscale-C0adBA0J.js";
import "./tailnet-DJJYEayb.js";
import "./ws-BSKgXzsx.js";
import "./auth-CZOQIbmN.js";
import "./credentials-BhjOnp5p.js";
import "./resolve-configured-secret-input-string-D-y9gugr.js";
import "./server-context-BrHTnAHF.js";
import "./frontmatter-NDnrpxIv.js";
import "./env-overrides-lUwusxOI.js";
import "./path-alias-guards-WL7vop6P.js";
import "./skills-D9zp-Tdj.js";
import "./paths-D3yvzAGG.js";
import "./proxy-env-DWmS7QpH.js";
import "./redact-D64ODmQM.js";
import "./errors-BOqrY9lx.js";
import "./fs-safe-XTpVePQ3.js";
import "./image-ops-C7PfPJb_.js";
import "./store-CF7lpR6V.js";
import "./ports-CQ-Y9tpn.js";
import "./trash-CklSLfYF.js";
import "./server-middleware-CiGUwte4.js";
import "./accounts-DCl2uuiL.js";
import "./channel-config-helpers-IZvZlvD6.js";
import "./accounts-BH8lVXqk.js";
import "./paths-BXRmsWer.js";
import "./chat-envelope-BkySjpPY.js";
import "./tool-images-L9XyoWe9.js";
import "./tool-display-CIuMJQho.js";
import "./commands-BYk9iATH.js";
import "./commands-registry-CEWhKPt4.js";
import "./call-Bt8r959b.js";
import "./pairing-token-CYfrO-Yo.js";
import { t as parseTimeoutMs } from "./parse-timeout-73Zg_jwg.js";
import { t as formatDocsLink } from "./links-BQUKbxMp.js";
import { t as runTui } from "./tui-B9JAWxFc.js";
//#region src/cli/tui-cli.ts
function registerTuiCli(program) {
	program.command("tui").description("Open a terminal UI connected to the Gateway").option("--url <url>", "Gateway WebSocket URL (defaults to gateway.remote.url when configured)").option("--token <token>", "Gateway token (if required)").option("--password <password>", "Gateway password (if required)").option("--session <key>", "Session key (default: \"main\", or \"global\" when scope is global)").option("--deliver", "Deliver assistant replies", false).option("--thinking <level>", "Thinking level override").option("--message <text>", "Send an initial message after connecting").option("--timeout-ms <ms>", "Agent timeout in ms (defaults to agents.defaults.timeoutSeconds)").option("--history-limit <n>", "History entries to load", "200").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/tui", "docs.openclaw.ai/cli/tui")}\n`).action(async (opts) => {
		try {
			const timeoutMs = parseTimeoutMs(opts.timeoutMs);
			if (opts.timeoutMs !== void 0 && timeoutMs === void 0) defaultRuntime.error(`warning: invalid --timeout-ms "${String(opts.timeoutMs)}"; ignoring`);
			const historyLimit = Number.parseInt(String(opts.historyLimit ?? "200"), 10);
			await runTui({
				url: opts.url,
				token: opts.token,
				password: opts.password,
				session: opts.session,
				deliver: Boolean(opts.deliver),
				thinking: opts.thinking,
				message: opts.message,
				timeoutMs,
				historyLimit: Number.isNaN(historyLimit) ? void 0 : historyLimit
			});
		} catch (err) {
			defaultRuntime.error(String(err));
			defaultRuntime.exit(1);
		}
	});
}
//#endregion
export { registerTuiCli };
