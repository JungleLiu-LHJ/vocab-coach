import "./paths-BJV7vkaX.js";
import { _ as danger, f as defaultRuntime, k as theme } from "./subsystem-4K-e3L3i.js";
import "./utils-BhZbo8Nw.js";
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
import "./message-channel-DOl5pebL.js";
import "./tailnet-DJJYEayb.js";
import "./ws-BSKgXzsx.js";
import "./credentials-BhjOnp5p.js";
import "./call-Bt8r959b.js";
import "./pairing-token-CYfrO-Yo.js";
import { t as formatDocsLink } from "./links-BQUKbxMp.js";
import "./progress-B8wjC50f.js";
import { n as callGatewayFromCli, t as addGatewayClientOptions } from "./gateway-rpc-B6t0pz5X.js";
//#region src/cli/system-cli.ts
const normalizeWakeMode = (raw) => {
	const mode = typeof raw === "string" ? raw.trim() : "";
	if (!mode) return "next-heartbeat";
	if (mode === "now" || mode === "next-heartbeat") return mode;
	throw new Error("--mode must be now or next-heartbeat");
};
async function runSystemGatewayCommand(opts, action, successText) {
	try {
		const result = await action();
		if (opts.json || successText === void 0) defaultRuntime.log(JSON.stringify(result, null, 2));
		else defaultRuntime.log(successText);
	} catch (err) {
		defaultRuntime.error(danger(String(err)));
		defaultRuntime.exit(1);
	}
}
function registerSystemCli(program) {
	const system = program.command("system").description("System tools (events, heartbeat, presence)").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/system", "docs.openclaw.ai/cli/system")}\n`);
	addGatewayClientOptions(system.command("event").description("Enqueue a system event and optionally trigger a heartbeat").requiredOption("--text <text>", "System event text").option("--mode <mode>", "Wake mode (now|next-heartbeat)", "next-heartbeat").option("--json", "Output JSON", false)).action(async (opts) => {
		await runSystemGatewayCommand(opts, async () => {
			const text = typeof opts.text === "string" ? opts.text.trim() : "";
			if (!text) throw new Error("--text is required");
			return await callGatewayFromCli("wake", opts, {
				mode: normalizeWakeMode(opts.mode),
				text
			}, { expectFinal: false });
		}, "ok");
	});
	const heartbeat = system.command("heartbeat").description("Heartbeat controls");
	addGatewayClientOptions(heartbeat.command("last").description("Show the last heartbeat event").option("--json", "Output JSON", false)).action(async (opts) => {
		await runSystemGatewayCommand(opts, async () => {
			return await callGatewayFromCli("last-heartbeat", opts, void 0, { expectFinal: false });
		});
	});
	addGatewayClientOptions(heartbeat.command("enable").description("Enable heartbeats").option("--json", "Output JSON", false)).action(async (opts) => {
		await runSystemGatewayCommand(opts, async () => {
			return await callGatewayFromCli("set-heartbeats", opts, { enabled: true }, { expectFinal: false });
		});
	});
	addGatewayClientOptions(heartbeat.command("disable").description("Disable heartbeats").option("--json", "Output JSON", false)).action(async (opts) => {
		await runSystemGatewayCommand(opts, async () => {
			return await callGatewayFromCli("set-heartbeats", opts, { enabled: false }, { expectFinal: false });
		});
	});
	addGatewayClientOptions(system.command("presence").description("List system presence entries").option("--json", "Output JSON", false)).action(async (opts) => {
		await runSystemGatewayCommand(opts, async () => {
			return await callGatewayFromCli("system-presence", opts, void 0, { expectFinal: false });
		});
	});
}
//#endregion
export { registerSystemCli };
