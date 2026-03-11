import { t as __exportAll } from "./rolldown-runtime-DUslC3ob.js";
import { o as displayPath } from "./utils-BhZbo8Nw.js";
import { en as createConfigIO } from "./model-selection-Dovilo6b.js";
//#region src/config/logging.ts
var logging_exports = /* @__PURE__ */ __exportAll({
	formatConfigPath: () => formatConfigPath,
	logConfigUpdated: () => logConfigUpdated
});
function formatConfigPath(path = createConfigIO().configPath) {
	return displayPath(path);
}
function logConfigUpdated(runtime, opts = {}) {
	const path = formatConfigPath(opts.path ?? createConfigIO().configPath);
	const suffix = opts.suffix ? ` ${opts.suffix}` : "";
	runtime.log(`Updated ${path}${suffix}`);
}
//#endregion
export { logConfigUpdated as n, logging_exports as r, formatConfigPath as t };
