import "./paths-BJV7vkaX.js";
import { f as defaultRuntime, k as theme } from "./subsystem-4K-e3L3i.js";
import { S as shortenHomePath } from "./utils-BhZbo8Nw.js";
import { D as ensureAgentWorkspace, v as DEFAULT_AGENT_WORKSPACE_DIR } from "./agent-scope-CZF6h_5g.js";
import "./openclaw-root-DrFjwUcG.js";
import "./logger-BDhFOulu.js";
import "./exec-WYU5B_af.js";
import { dn as writeConfigFile, en as createConfigIO } from "./model-selection-Dovilo6b.js";
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
import "./tailnet-DJJYEayb.js";
import "./ws-BSKgXzsx.js";
import "./credentials-BhjOnp5p.js";
import "./redact-D64ODmQM.js";
import "./errors-BOqrY9lx.js";
import "./accounts-DCl2uuiL.js";
import "./channel-config-helpers-IZvZlvD6.js";
import "./accounts-BH8lVXqk.js";
import { o as resolveSessionTranscriptsDir } from "./paths-BXRmsWer.js";
import "./chat-envelope-BkySjpPY.js";
import "./call-Bt8r959b.js";
import "./pairing-token-CYfrO-Yo.js";
import "./onboard-helpers-qnb8BYWo.js";
import "./prompt-style-D9KjtA09.js";
import { t as formatDocsLink } from "./links-BQUKbxMp.js";
import { n as runCommandWithRuntime } from "./cli-utils-B5O9_EBZ.js";
import "./progress-B8wjC50f.js";
import "./runtime-guard-CsQ4WVFm.js";
import { t as hasExplicitOptions } from "./command-options-BjNiQwPL.js";
import "./note-Cew4NgiY.js";
import "./clack-prompter-8Yz_I3SK.js";
import "./onboarding.secret-input-CsrOBz6h.js";
import "./onboarding-DdTtYcWy.js";
import { n as logConfigUpdated, t as formatConfigPath } from "./logging-YCHxe4L1.js";
import { t as onboardCommand } from "./onboard-C94pWdUZ.js";
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
