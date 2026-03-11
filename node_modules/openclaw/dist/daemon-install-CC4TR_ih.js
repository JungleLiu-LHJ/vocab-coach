import "./paths-BJV7vkaX.js";
import "./subsystem-4K-e3L3i.js";
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
import "./dock-DqLW1i1m.js";
import "./message-channel-DOl5pebL.js";
import "./plugins-B4oqCXNl.js";
import "./sessions-DTVAB3HG.js";
import "./tailscale-C0adBA0J.js";
import "./tailnet-DJJYEayb.js";
import "./ws-BSKgXzsx.js";
import "./auth-CZOQIbmN.js";
import "./credentials-BhjOnp5p.js";
import "./accounts-DCl2uuiL.js";
import "./channel-config-helpers-IZvZlvD6.js";
import "./accounts-BH8lVXqk.js";
import "./paths-BXRmsWer.js";
import "./chat-envelope-BkySjpPY.js";
import "./call-Bt8r959b.js";
import "./pairing-token-CYfrO-Yo.js";
import "./onboard-helpers-qnb8BYWo.js";
import "./prompt-style-D9KjtA09.js";
import "./runtime-guard-CsQ4WVFm.js";
import "./note-Cew4NgiY.js";
import "./daemon-install-plan.shared-Cojj3Yab.js";
import { n as buildGatewayInstallPlan, r as gatewayInstallErrorHint, t as resolveGatewayInstallToken } from "./gateway-install-token-u1pUgFVC.js";
import { r as isGatewayDaemonRuntime } from "./daemon-runtime-BSeNz-AR.js";
import { i as isSystemdUserServiceAvailable } from "./systemd-D6iXPkQu.js";
import { t as resolveGatewayService } from "./service-47UB2d5k.js";
import { n as ensureSystemdUserLingerNonInteractive } from "./systemd-linger-CBBm7axF.js";
//#region src/commands/onboard-non-interactive/local/daemon-install.ts
async function installGatewayDaemonNonInteractive(params) {
	const { opts, runtime, port } = params;
	if (!opts.installDaemon) return;
	const daemonRuntimeRaw = opts.daemonRuntime ?? "node";
	const systemdAvailable = process.platform === "linux" ? await isSystemdUserServiceAvailable() : true;
	if (process.platform === "linux" && !systemdAvailable) {
		runtime.log("Systemd user services are unavailable; skipping service install.");
		return;
	}
	if (!isGatewayDaemonRuntime(daemonRuntimeRaw)) {
		runtime.error("Invalid --daemon-runtime (use node or bun)");
		runtime.exit(1);
		return;
	}
	const service = resolveGatewayService();
	const tokenResolution = await resolveGatewayInstallToken({
		config: params.nextConfig,
		env: process.env
	});
	for (const warning of tokenResolution.warnings) runtime.log(warning);
	if (tokenResolution.unavailableReason) {
		runtime.error([
			"Gateway install blocked:",
			tokenResolution.unavailableReason,
			"Fix gateway auth config/token input and rerun onboarding."
		].join(" "));
		runtime.exit(1);
		return;
	}
	const { programArguments, workingDirectory, environment } = await buildGatewayInstallPlan({
		env: process.env,
		port,
		runtime: daemonRuntimeRaw,
		warn: (message) => runtime.log(message),
		config: params.nextConfig
	});
	try {
		await service.install({
			env: process.env,
			stdout: process.stdout,
			programArguments,
			workingDirectory,
			environment
		});
	} catch (err) {
		runtime.error(`Gateway service install failed: ${String(err)}`);
		runtime.log(gatewayInstallErrorHint());
		return;
	}
	await ensureSystemdUserLingerNonInteractive({ runtime });
}
//#endregion
export { installGatewayDaemonNonInteractive };
