import { f as defaultRuntime, k as theme } from "./subsystem-kzdGVyce.js";
import "./paths-BfR2LXbA.js";
import "./boolean-BHdNsbzF.js";
import { X as writeConfigFile, z as createConfigIO } from "./auth-profiles-UpqQjKB-.js";
import { D as ensureAgentWorkspace, v as DEFAULT_AGENT_WORKSPACE_DIR } from "./agent-scope-BDXYqF89.js";
import { x as shortenHomePath } from "./utils-B4wShrgI.js";
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
import "./message-channel-FOsBizRL.js";
import "./tailnet-BEiNr4qb.js";
import "./ws-BzHIlqUk.js";
import "./credentials-UUOBfSK0.js";
import "./redact-b9XS0Muh.js";
import "./errors-oTqWODa8.js";
import "./sessions-Bh025Q5O.js";
import { o as resolveSessionTranscriptsDir } from "./paths-D3cXuvcv.js";
import "./chat-envelope-Ba8wEdTK.js";
import "./call-BfhGytph.js";
import "./pairing-token-Bu2Xt1ri.js";
import "./onboard-helpers-Be9c-Ktq.js";
import "./prompt-style-DMLxb9pN.js";
import { t as formatDocsLink } from "./links-CVgNb7TN.js";
import { n as runCommandWithRuntime } from "./cli-utils-ChNkua_i.js";
import "./progress-BVJ8qDnh.js";
import { t as hasExplicitOptions } from "./command-options-BihXZRbG.js";
import "./note-D7vkWKMM.js";
import "./clack-prompter-G-XGtgN3.js";
import "./runtime-guard-qGANlyDE.js";
import "./onboarding.secret-input-DHqDidXH.js";
import "./onboarding-Biq7B2y0.js";
import { n as logConfigUpdated, t as formatConfigPath } from "./logging-BvRxc8kO.js";
import { t as onboardCommand } from "./onboard-BxlIqZ7q.js";
import JSON5 from "json5";
import fs from "node:fs/promises";
//#region src/commands/setup.ts
async function readConfigFileRaw(configPath) {
	try {
		const raw = await fs.readFile(configPath, "utf-8");
		const parsed = JSON5.parse(raw);
		if (parsed && typeof parsed === "object") return {
			exists: true,
			parsed
		};
		return {
			exists: true,
			parsed: {}
		};
	} catch {
		return {
			exists: false,
			parsed: {}
		};
	}
}
async function setupCommand(opts, runtime = defaultRuntime) {
	const desiredWorkspace = typeof opts?.workspace === "string" && opts.workspace.trim() ? opts.workspace.trim() : void 0;
	const configPath = createConfigIO().configPath;
	const existingRaw = await readConfigFileRaw(configPath);
	const cfg = existingRaw.parsed;
	const defaults = cfg.agents?.defaults ?? {};
	const workspace = desiredWorkspace ?? defaults.workspace ?? DEFAULT_AGENT_WORKSPACE_DIR;
	const next = {
		...cfg,
		agents: {
			...cfg.agents,
			defaults: {
				...defaults,
				workspace
			}
		},
		gateway: {
			...cfg.gateway,
			mode: cfg.gateway?.mode ?? "local"
		}
	};
	if (!existingRaw.exists || defaults.workspace !== workspace || cfg.gateway?.mode !== next.gateway?.mode) {
		await writeConfigFile(next);
		if (!existingRaw.exists) runtime.log(`Wrote ${formatConfigPath(configPath)}`);
		else {
			const updates = [];
			if (defaults.workspace !== workspace) updates.push("set agents.defaults.workspace");
			if (cfg.gateway?.mode !== next.gateway?.mode) updates.push("set gateway.mode");
			logConfigUpdated(runtime, {
				path: configPath,
				suffix: updates.length > 0 ? `(${updates.join(", ")})` : void 0
			});
		}
	} else runtime.log(`Config OK: ${formatConfigPath(configPath)}`);
	const ws = await ensureAgentWorkspace({
		dir: workspace,
		ensureBootstrapFiles: !next.agents?.defaults?.skipBootstrap
	});
	runtime.log(`Workspace OK: ${shortenHomePath(ws.dir)}`);
	const sessionsDir = resolveSessionTranscriptsDir();
	await fs.mkdir(sessionsDir, { recursive: true });
	runtime.log(`Sessions OK: ${shortenHomePath(sessionsDir)}`);
}
//#endregion
//#region src/cli/program/register.setup.ts
function registerSetupCommand(program) {
	program.command("setup").description("Initialize ~/.openclaw/openclaw.json and the agent workspace").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/setup", "docs.openclaw.ai/cli/setup")}\n`).option("--workspace <dir>", "Agent workspace directory (default: ~/.openclaw/workspace; stored as agents.defaults.workspace)").option("--wizard", "Run the interactive onboarding wizard", false).option("--non-interactive", "Run the wizard without prompts", false).option("--mode <mode>", "Wizard mode: local|remote").option("--remote-url <url>", "Remote Gateway WebSocket URL").option("--remote-token <token>", "Remote Gateway token (optional)").action(async (opts, command) => {
		await runCommandWithRuntime(defaultRuntime, async () => {
			const hasWizardFlags = hasExplicitOptions(command, [
				"wizard",
				"nonInteractive",
				"mode",
				"remoteUrl",
				"remoteToken"
			]);
			if (opts.wizard || hasWizardFlags) {
				await onboardCommand({
					workspace: opts.workspace,
					nonInteractive: Boolean(opts.nonInteractive),
					mode: opts.mode,
					remoteUrl: opts.remoteUrl,
					remoteToken: opts.remoteToken
				}, defaultRuntime);
				return;
			}
			await setupCommand({ workspace: opts.workspace }, defaultRuntime);
		});
	});
}
//#endregion
export { registerSetupCommand };
