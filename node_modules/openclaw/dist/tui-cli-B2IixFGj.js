import { f as defaultRuntime, k as theme } from "./subsystem-kzdGVyce.js";
import "./paths-BfR2LXbA.js";
import "./boolean-BHdNsbzF.js";
import "./auth-profiles-UpqQjKB-.js";
import "./agent-scope-BDXYqF89.js";
import "./utils-B4wShrgI.js";
import "./boundary-file-read-CcBHg_z-.js";
import "./logger-BWbD2ty6.js";
import "./exec-CDUUaRm4.js";
import "./github-copilot-token-CcBrBN3h.js";
import "./host-env-security-blJbxyQo.js";
import "./version-Bxx5bg6l.js";
import "./registry-Gs6xb3DK.js";
import "./manifest-registry-CFnC0yb4.js";
import "./dock-6TSCZqEs.js";
import "./plugins-v0UiRqAc.js";
import "./accounts-CFByy36g.js";
import "./channel-config-helpers-Cc37-fbu.js";
import "./accounts-Dd357WkV.js";
import "./image-ops-BZX4S9OA.js";
import "./message-channel-FOsBizRL.js";
import "./pi-embedded-helpers-nnm4iOi3.js";
import "./sandbox-D5S9pIUQ.js";
import "./tool-catalog-DAnzECvM.js";
import "./chrome-_dzns-pF.js";
import "./tailscale-DwUR_aBY.js";
import "./tailnet-BEiNr4qb.js";
import "./ws-BzHIlqUk.js";
import "./auth-ztX1XT7i.js";
import "./credentials-UUOBfSK0.js";
import "./resolve-configured-secret-input-string-CALUVGLW.js";
import "./server-context-Cysq8uwv.js";
import "./frontmatter-B5Xx_5Cp.js";
import "./env-overrides-CghEbWu_.js";
import "./path-alias-guards-2B2VwR9Z.js";
import "./skills-BcTP9HTD.js";
import "./paths-Bv0Fd5hm.js";
import "./proxy-env-DBXIh4R2.js";
import "./redact-b9XS0Muh.js";
import "./errors-oTqWODa8.js";
import "./fs-safe-DnLkCsXk.js";
import "./store-Cpd6HHUc.js";
import "./ports-DwmubRiU.js";
import "./trash-CKkKoeyk.js";
import "./server-middleware-D5JzODMR.js";
import "./sessions-Bh025Q5O.js";
import "./paths-D3cXuvcv.js";
import "./chat-envelope-Ba8wEdTK.js";
import "./tool-images-CpDLyo5v.js";
import "./thinking-CHrWXrB4.js";
import "./tool-display-BJIcX_xB.js";
import "./commands-7gthnTya.js";
import "./commands-registry-Cw8jiBIe.js";
import "./call-BfhGytph.js";
import "./pairing-token-Bu2Xt1ri.js";
import { t as parseTimeoutMs } from "./parse-timeout-BtTjGPGT.js";
import { t as formatDocsLink } from "./links-CVgNb7TN.js";
import { t as runTui } from "./tui-CzZt4WKc.js";
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
