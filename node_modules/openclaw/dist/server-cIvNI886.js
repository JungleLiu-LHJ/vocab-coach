import "./paths-BJV7vkaX.js";
import { t as createSubsystemLogger } from "./subsystem-4K-e3L3i.js";
import "./utils-BhZbo8Nw.js";
import "./agent-scope-CZF6h_5g.js";
import "./openclaw-root-DrFjwUcG.js";
import "./logger-BDhFOulu.js";
import "./exec-WYU5B_af.js";
import { rn as loadConfig } from "./model-selection-Dovilo6b.js";
import "./github-copilot-token-D37fjdwy.js";
import "./boolean-CJxfhBkG.js";
import "./env-BL7t1mkY.js";
import "./host-env-security-3AOqVC6Z.js";
import "./registry-D5r9Pc2H.js";
import "./manifest-registry-Ix-Y_M6l.js";
import "./chrome-zmDkfOk2.js";
import "./tailscale-C0adBA0J.js";
import "./tailnet-DJJYEayb.js";
import "./ws-BSKgXzsx.js";
import "./auth-CZOQIbmN.js";
import "./credentials-BhjOnp5p.js";
import "./resolve-configured-secret-input-string-D-y9gugr.js";
import { c as resolveBrowserControlAuth, i as resolveBrowserConfig, r as registerBrowserRoutes, s as ensureBrowserControlAuth, t as createBrowserRouteContext } from "./server-context-BrHTnAHF.js";
import "./path-alias-guards-WL7vop6P.js";
import "./paths-D3yvzAGG.js";
import "./proxy-env-DWmS7QpH.js";
import "./redact-D64ODmQM.js";
import "./errors-BOqrY9lx.js";
import "./fs-safe-XTpVePQ3.js";
import "./image-ops-C7PfPJb_.js";
import "./store-CF7lpR6V.js";
import "./ports-CQ-Y9tpn.js";
import "./trash-CklSLfYF.js";
import { n as installBrowserCommonMiddleware, t as installBrowserAuthMiddleware } from "./server-middleware-CiGUwte4.js";
import { n as stopBrowserRuntime, t as createBrowserRuntimeState } from "./runtime-lifecycle-QlGWZQEX.js";
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
