import "./subsystem-kzdGVyce.js";
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
import "./message-channel-FOsBizRL.js";
import "./tailscale-DwUR_aBY.js";
import "./tailnet-BEiNr4qb.js";
import "./ws-BzHIlqUk.js";
import "./auth-ztX1XT7i.js";
import "./credentials-UUOBfSK0.js";
import "./sessions-Bh025Q5O.js";
import "./paths-D3cXuvcv.js";
import "./chat-envelope-Ba8wEdTK.js";
import "./call-BfhGytph.js";
import "./pairing-token-Bu2Xt1ri.js";
import "./onboard-helpers-Be9c-Ktq.js";
import "./prompt-style-DMLxb9pN.js";
import "./note-D7vkWKMM.js";
import "./daemon-install-plan.shared-D5f-djeh.js";
import "./runtime-guard-qGANlyDE.js";
import { n as buildGatewayInstallPlan, r as gatewayInstallErrorHint, t as resolveGatewayInstallToken } from "./gateway-install-token-BGQWARl6.js";
import { r as isGatewayDaemonRuntime } from "./daemon-runtime-D9VSfwQu.js";
import { i as isSystemdUserServiceAvailable } from "./systemd-CKDkXL0B.js";
import { t as resolveGatewayService } from "./service-CdVcSUMi.js";
import { n as ensureSystemdUserLingerNonInteractive } from "./systemd-linger-B3024S1v.js";
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
