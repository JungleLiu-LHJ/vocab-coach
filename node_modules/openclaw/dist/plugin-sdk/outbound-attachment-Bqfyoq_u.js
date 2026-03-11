import { a as saveMediaBuffer } from "./store-BjPGnmu2.js";
import { _ as loadWebMedia } from "./ir-zNw6Of4b.js";
import { t as buildOutboundMediaLoadOptions } from "./load-options-Bdwr4pWG.js";
//#region src/media/outbound-attachment.ts
async function resolveOutboundAttachmentFromUrl(mediaUrl, maxBytes, options) {
	const media = await loadWebMedia(mediaUrl, buildOutboundMediaLoadOptions({
		maxBytes,
		mediaLocalRoots: options?.localRoots
	}));
	const saved = await saveMediaBuffer(media.buffer, media.contentType ?? void 0, "outbound", maxBytes);
	return {
		path: saved.path,
		contentType: saved.contentType
	};
}
//#endregion
export { resolveOutboundAttachmentFromUrl as t };
