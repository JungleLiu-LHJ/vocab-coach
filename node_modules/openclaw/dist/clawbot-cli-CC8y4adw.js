import "./paths-BJV7vkaX.js";
import { k as theme } from "./subsystem-4K-e3L3i.js";
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
import "./resolve-configured-secret-input-string-D-y9gugr.js";
import "./call-Bt8r959b.js";
import "./pairing-token-CYfrO-Yo.js";
import "./runtime-config-collectors-CpWVr-ov.js";
import "./command-secret-targets-7ljJh5Io.js";
import { t as formatDocsLink } from "./links-BQUKbxMp.js";
import { n as registerQrCli } from "./qr-cli-wBvyxN8r.js";
//#region src/cli/clawbot-cli.ts
function registerClawbotCli(program) {
	registerQrCli(program.command("clawbot").description("Legacy clawbot command aliases").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/clawbot", "docs.openclaw.ai/cli/clawbot")}\n`));
}
//#endregion
export { registerClawbotCli };
