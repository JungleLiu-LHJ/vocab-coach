import "./paths-BJV7vkaX.js";
import { w as shouldLogVerbose, x as logVerbose } from "./subsystem-4K-e3L3i.js";
import "./utils-BhZbo8Nw.js";
import "./thinking-BYwvlJ3S.js";
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
import { d as isAudioAttachment, i as normalizeMediaAttachments, o as resolveMediaAttachmentLocalRoots, t as runAudioTranscription } from "./audio-transcription-runner-9BfH2XEJ.js";
import "./image-CVfYjry_.js";
import "./models-config-CC0tOC2Q.js";
import "./pi-embedded-helpers-BDDoCPNX.js";
import "./sandbox-mimqB061.js";
import "./tool-catalog-Dm7UDWav.js";
import "./chrome-zmDkfOk2.js";
import "./tailscale-C0adBA0J.js";
import "./tailnet-DJJYEayb.js";
import "./ws-BSKgXzsx.js";
import "./auth-CZOQIbmN.js";
import "./credentials-BhjOnp5p.js";
import "./resolve-configured-secret-input-string-D-y9gugr.js";
import "./server-context-BrHTnAHF.js";
import "./frontmatter-NDnrpxIv.js";
import "./env-overrides-lUwusxOI.js";
import "./path-alias-guards-WL7vop6P.js";
import "./skills-D9zp-Tdj.js";
import "./paths-D3yvzAGG.js";
import "./proxy-env-DWmS7QpH.js";
import "./redact-D64ODmQM.js";
import "./errors-BOqrY9lx.js";
import "./fs-safe-XTpVePQ3.js";
import "./image-ops-C7PfPJb_.js";
import "./store-CF7lpR6V.js";
import "./ports-CQ-Y9tpn.js";
import "./trash-CklSLfYF.js";
import "./server-middleware-CiGUwte4.js";
import "./accounts-DCl2uuiL.js";
import "./channel-config-helpers-IZvZlvD6.js";
import "./accounts-BH8lVXqk.js";
import "./paths-BXRmsWer.js";
import "./chat-envelope-BkySjpPY.js";
import "./tool-images-L9XyoWe9.js";
import "./tool-display-CIuMJQho.js";
import "./fetch-guard-CEIL7OSV.js";
import "./api-key-rotation-wzo3w_dE.js";
import "./local-roots-B7FLdvEW.js";
import "./model-catalog-Dg5d3V3D.js";
import "./proxy-fetch-B79ly90H.js";
//#region src/media-understanding/audio-preflight.ts
/**
* Transcribes the first audio attachment BEFORE mention checking.
* This allows voice notes to be processed in group chats with requireMention: true.
* Returns the transcript or undefined if transcription fails or no audio is found.
*/
async function transcribeFirstAudio(params) {
	const { ctx, cfg } = params;
	const audioConfig = cfg.tools?.media?.audio;
	if (!audioConfig || audioConfig.enabled === false) return;
	const attachments = normalizeMediaAttachments(ctx);
	if (!attachments || attachments.length === 0) return;
	const firstAudio = attachments.find((att) => att && isAudioAttachment(att) && !att.alreadyTranscribed);
	if (!firstAudio) return;
	if (shouldLogVerbose()) logVerbose(`audio-preflight: transcribing attachment ${firstAudio.index} for mention check`);
	try {
		const { transcript } = await runAudioTranscription({
			ctx,
			cfg,
			attachments,
			agentDir: params.agentDir,
			providers: params.providers,
			activeModel: params.activeModel,
			localPathRoots: resolveMediaAttachmentLocalRoots({
				cfg,
				ctx
			})
		});
		if (!transcript) return;
		firstAudio.alreadyTranscribed = true;
		if (shouldLogVerbose()) logVerbose(`audio-preflight: transcribed ${transcript.length} chars from attachment ${firstAudio.index}`);
		return transcript;
	} catch (err) {
		if (shouldLogVerbose()) logVerbose(`audio-preflight: transcription failed: ${String(err)}`);
		return;
	}
}
//#endregion
export { transcribeFirstAudio };
