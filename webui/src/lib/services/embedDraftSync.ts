/**
 * Account-backed overlay sync for the SimplyPrint embed.
 *
 * When the OFD editor runs embedded in the SimplyPrint panel, the user's layered
 * changeset (the "overlay") is persisted to their SimplyPrint *account* instead
 * of browser localStorage, so their in-progress contribution and uploaded logos
 * follow them across devices. Standalone OFD keeps using localStorage untouched.
 *
 * This module is a thin postMessage client — the SimplyPrint host page owns all
 * persistence (cookie-authed panel endpoints + CDN upload). We only:
 *   - request the saved overlay on load and apply it (changeStore.importChanges)
 *   - autosave the overlay (debounced) whenever the change store updates
 *   - ship draft images out to the CDN (via the host) and store their URLs, so
 *     the saved changeset stays small and images are account-portable.
 *
 * Message protocol (must match ofd-embed.svelte on the SimplyPrint side):
 *   OFD → host:  ofd:draft-request
 *                ofd:draft-save   { draft:{metadata,changes}, images:{id:{url,filename,mimeType}} }
 *                ofd:draft-clear
 *                ofd:image-upload { requestId, id, image, contentType, filename }
 *   host → OFD:  ofd:draft-restore  { draft, images }
 *                ofd:image-uploaded { requestId, id, url }
 *
 * Integration: call `initEmbedDraftSync()` once, only when embedded (e.g. from
 * the embed layout's onMount, alongside the theme/close bridge).
 */
import { browser } from '$app/environment';
import { changeStore } from '$lib/stores/changes';
import type { ChangeExport } from '$lib/types/changes';

const SAVE_DEBOUNCE_MS = 900;
const UPLOAD_TIMEOUT_MS = 30_000;

type ImageMeta = { url: string; filename: string; mimeType: string };

let started = false;
let hydrated = false; // have we restored the account draft yet?
let restoring = false; // guard: don't autosave while applying a restore
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const uploadWaiters = new Map<string, (url: string | null) => void>();
const imageUrlCache = new Map<string, ImageMeta>(); // imageId -> already-on-CDN

function post(msg: unknown) {
	if (browser && window.parent && window.parent !== window) {
		// Host origin varies (test/prod panel); these messages carry no secrets.
		window.parent.postMessage(msg, '*');
	}
}

function genId(): string {
	return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function uploadImage(id: string, img: { filename: string; mimeType: string; data: string }): Promise<string | null> {
	const requestId = genId();
	return new Promise((resolve) => {
		uploadWaiters.set(requestId, resolve);
		post({ type: 'ofd:image-upload', requestId, id, image: img.data, contentType: img.mimeType, filename: img.filename });
		setTimeout(() => {
			if (uploadWaiters.has(requestId)) {
				uploadWaiters.delete(requestId);
				resolve(null);
			}
		}, UPLOAD_TIMEOUT_MS);
	});
}

async function doSave() {
	if (restoring) return;
	const exp = await changeStore.exportChanges();

	// Empty overlay -> discard the account draft.
	if (!exp.changes.length && !Object.keys(exp.images).length) {
		post({ type: 'ofd:draft-clear' });
		return;
	}

	// Upload any images not yet on the CDN; build the id -> url map.
	const images: Record<string, ImageMeta> = {};
	for (const [imageId, img] of Object.entries(exp.images)) {
		let meta = imageUrlCache.get(imageId);
		if (!meta) {
			const url = await uploadImage(imageId, img);
			if (url) {
				meta = { url, filename: img.filename, mimeType: img.mimeType };
				imageUrlCache.set(imageId, meta);
			}
		}
		if (meta) images[imageId] = meta;
	}

	// Store the changeset WITHOUT base64 blobs — images travel as CDN URLs.
	post({ type: 'ofd:draft-save', draft: { metadata: exp.metadata, changes: exp.changes }, images });
}

function scheduleSave() {
	if (restoring) return;
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(() => void doSave().catch(() => {}), SAVE_DEBOUNCE_MS);
}

async function dataUrlFromUrl(url: string): Promise<string | null> {
	try {
		const res = await fetch(url);
		if (!res.ok) return null;
		const blob = await res.blob();
		return await new Promise((resolve) => {
			const fr = new FileReader();
			fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : null);
			fr.onerror = () => resolve(null);
			fr.readAsDataURL(blob);
		});
	} catch {
		return null;
	}
}

async function applyRestore(draft: any, images: Record<string, ImageMeta>) {
	hydrated = true;
	// Nothing stored on the account — keep whatever localStorage already hydrated
	// (acts as a cache; the next edit migrates it to the account).
	if (!draft || !Array.isArray(draft.changes) || !draft.changes.length) return;

	restoring = true;
	try {
		// Rebuild ChangeExport.images by pulling each CDN url back into base64.
		const expImages: ChangeExport['images'] = {};
		for (const [imageId, meta] of Object.entries(images || {})) {
			const dataUrl = await dataUrlFromUrl(meta.url);
			if (dataUrl) {
				expImages[imageId] = { filename: meta.filename, mimeType: meta.mimeType, data: dataUrl };
				imageUrlCache.set(imageId, meta); // already uploaded — don't re-upload
			}
		}
		const exportData: ChangeExport = {
			metadata: draft.metadata ?? {
				exportedAt: Date.now(),
				version: '1.0.0',
				changeCount: draft.changes.length,
				imageCount: Object.keys(expImages).length
			},
			changes: draft.changes,
			images: expImages
		};
		await changeStore.importChanges(exportData);
	} finally {
		// Let importChanges' store update settle before re-enabling autosave.
		setTimeout(() => (restoring = false), 0);
	}
}

function onMessage(e: MessageEvent) {
	const data = e.data;
	if (!data || typeof data !== 'object') return;
	switch (data.type) {
		case 'ofd:draft-restore':
			void applyRestore(data.draft, data.images || {});
			break;
		case 'ofd:image-uploaded': {
			const resolve = uploadWaiters.get(data.requestId);
			if (resolve) {
				uploadWaiters.delete(data.requestId);
				resolve(data.url ?? null);
			}
			break;
		}
	}
}

/** Start syncing the overlay to the SimplyPrint account. Call once, embed-only. */
export function initEmbedDraftSync() {
	if (!browser || started) return;
	started = true;

	window.addEventListener('message', onMessage);

	// Restore the account draft first, then autosave on subsequent changes.
	post({ type: 'ofd:draft-request' });
	changeStore.subscribe(() => {
		if (!hydrated) return; // ignore the initial localStorage value until restore lands
		scheduleSave();
	});
}
