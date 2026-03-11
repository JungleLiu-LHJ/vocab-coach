import { t as createSubsystemLogger } from "./subsystem-kzdGVyce.js";
import "./paths-BfR2LXbA.js";
import "./boolean-BHdNsbzF.js";
import { H as loadConfig } from "./auth-profiles-UpqQjKB-.js";
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
import "./image-ops-BZX4S9OA.js";
import "./chrome-_dzns-pF.js";
import "./tailscale-DwUR_aBY.js";
import "./tailnet-BEiNr4qb.js";
import "./ws-BzHIlqUk.js";
import "./auth-ztX1XT7i.js";
import "./credentials-UUOBfSK0.js";
import "./resolve-configured-secret-input-string-CALUVGLW.js";
import { c as resolveBrowserControlAuth, i as resolveBrowserConfig, r as registerBrowserRoutes, s as ensureBrowserControlAuth, t as createBrowserRouteContext } from "./server-context-Cysq8uwv.js";
import "./path-alias-guards-2B2VwR9Z.js";
import "./paths-Bv0Fd5hm.js";
import "./proxy-env-DBXIh4R2.js";
import "./redact-b9XS0Muh.js";
import "./errors-oTqWODa8.js";
import "./fs-safe-DnLkCsXk.js";
import "./store-Cpd6HHUc.js";
import "./ports-DwmubRiU.js";
import "./trash-CKkKoeyk.js";
import { n as installBrowserCommonMiddleware, t as installBrowserAuthMiddleware } from "./server-middleware-D5JzODMR.js";
import { n as stopBrowserRuntime, t as createBrowserRuntimeState } from "./runtime-lifecycle-CI5BW-bB.js";
import express from "express";
//#region src/browser/server.ts
let state = null;
const logServer = createSubsystemLogger("browser").child("server");
async function startBrowserControlServerFromConfig() {
	if (state) return state;
	const cfg = loadConfig();
	const resolved = resolveBrowserConfig(cfg.browser, cfg);
	if (!resolved.enabled) return null;
	let browserAuth = resolveBrowserControlAuth(cfg);
	let browserAuthBootstrapFailed = false;
	try {
		const ensured = await ensureBrowserControlAuth({ cfg });
		browserAuth = ensured.auth;
		if (ensured.generatedToken) logServer.info("No browser auth configured; generated gateway.auth.token automatically.");
	} catch (err) {
		logServer.warn(`failed to auto-configure browser auth: ${String(err)}`);
		browserAuthBootstrapFailed = true;
	}
	if (browserAuthBootstrapFailed && !browserAuth.token && !browserAuth.password) {
		logServer.error("browser control startup aborted: authentication bootstrap failed and no fallback auth is configured.");
		return null;
	}
	const app = express();
	installBrowserCommonMiddleware(app);
	installBrowserAuthMiddleware(app, browserAuth);
	registerBrowserRoutes(app, createBrowserRouteContext({
		getState: () => state,
		refreshConfigFromDisk: true
	}));
	const port = resolved.controlPort;
	const server = await new Promise((resolve, reject) => {
		const s = app.listen(port, "127.0.0.1", () => resolve(s));
		s.once("error", reject);
	}).catch((err) => {
		logServer.error(`openclaw browser server failed to bind 127.0.0.1:${port}: ${String(err)}`);
		return null;
	});
	if (!server) return null;
	state = await createBrowserRuntimeState({
		server,
		port,
		resolved,
		onWarn: (message) => logServer.warn(message)
	});
	const authMode = browserAuth.token ? "token" : browserAuth.password ? "password" : "off";
	logServer.info(`Browser control listening on http://127.0.0.1:${port}/ (auth=${authMode})`);
	return state;
}
async function stopBrowserControlServer() {
	await stopBrowserRuntime({
		current: state,
		getState: () => state,
		clearState: () => {
			state = null;
		},
		closeServer: true,
		onWarn: (message) => logServer.warn(message)
	});
}
//#endregion
export { startBrowserControlServerFromConfig, stopBrowserControlServer };
