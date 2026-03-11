import { b as stopChromeExtensionRelayServer, o as stopOpenClawChrome, y as ensureChromeExtensionRelayServer } from "./chrome-zmDkfOk2.js";
import { a as resolveProfile, n as listKnownProfileNames, t as createBrowserRouteContext } from "./server-context-BrHTnAHF.js";
import { t as isPwAiLoaded } from "./pw-ai-state-NW5m_jkX.js";
//#region src/browser/server-lifecycle.ts
async function ensureExtensionRelayForProfiles(params) {
	for (const name of Object.keys(params.resolved.profiles)) {
		const profile = resolveProfile(params.resolved, name);
		if (!profile || profile.driver !== "extension") continue;
		await ensureChromeExtensionRelayServer({
			cdpUrl: profile.cdpUrl,
			bindHost: params.resolved.relayBindHost
		}).catch((err) => {
			params.onWarn(`Chrome extension relay init failed for profile "${name}": ${String(err)}`);
		});
	}
}
async function stopKnownBrowserProfiles(params) {
	const current = params.getState();
	if (!current) return;
	const ctx = createBrowserRouteContext({
		getState: params.getState,
		refreshConfigFromDisk: true
	});
	try {
		for (const name of listKnownProfileNames(current)) try {
			const runtime = current.profiles.get(name);
			if (runtime?.running) {
				await stopOpenClawChrome(runtime.running);
				runtime.running = null;
				continue;
			}
			if (runtime?.profile.driver === "extension") {
				await stopChromeExtensionRelayServer({ cdpUrl: runtime.profile.cdpUrl }).catch(() => false);
				continue;
			}
			await ctx.forProfile(name).stopRunningBrowser();
		} catch {}
	} catch (err) {
		params.onWarn(`openclaw browser stop failed: ${String(err)}`);
	}
}
//#endregion
//#region src/browser/runtime-lifecycle.ts
async function createBrowserRuntimeState(params) {
	const state = {
		server: params.server ?? null,
		port: params.port,
		resolved: params.resolved,
		profiles: /* @__PURE__ */ new Map()
	};
	await ensureExtensionRelayForProfiles({
		resolved: params.resolved,
		onWarn: params.onWarn
	});
	return state;
}
async function stopBrowserRuntime(params) {
	if (!params.current) return;
	await stopKnownBrowserProfiles({
		getState: params.getState,
		onWarn: params.onWarn
	});
	if (params.closeServer && params.current.server) await new Promise((resolve) => {
		params.current?.server?.close(() => resolve());
	});
	params.clearState();
	if (!isPwAiLoaded()) return;
	try {
		await (await import("./pw-ai-CY8ct-oB.js")).closePlaywrightBrowserConnection();
	} catch {}
}
//#endregion
export { stopBrowserRuntime as n, createBrowserRuntimeState as t };
