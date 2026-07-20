import { browser } from '$app/environment';
import { theme } from '$lib/stores/theme';
import { setEmbedTheme } from '$lib/stores/embed';

/**
 * postMessage bridge between the embedded OFD app and its host (the SimplyPrint
 * panel modal). Outbound: lifecycle signals so the host can react (e.g. close
 * the modal, toast on submit). Inbound: host-driven theme changes.
 *
 * Messages are namespaced `ofd:*`. Inbound messages are only honoured from a
 * trusted host origin.
 */

export type OutboundMessage =
	| { type: 'ofd:ready' }
	| { type: 'ofd:close' }
	| { type: 'ofd:submitted'; prUrl?: string; prNumber?: number };

const HOST_ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)*simplyprint\.io$/i;

function isTrustedOrigin(origin: string): boolean {
	// Allow the dev panel over http://localhost as well.
	return HOST_ORIGIN_RE.test(origin) || origin === 'http://localhost' || origin.startsWith('http://localhost:');
}

/** Send a message to the host window (no-op when not framed). */
export function postToHost(message: OutboundMessage): void {
	if (!browser) return;
	try {
		if (window.parent && window.parent !== window) {
			// Host origin is not known ahead of time (dev vs prod panel), and these
			// signals carry no secrets, so '*' is acceptable for outbound lifecycle.
			window.parent.postMessage(message, '*');
		}
	} catch {
		/* cross-origin access can throw in some browsers — ignore */
	}
}

let listening = false;

/** Start listening for host → iframe messages. Returns a teardown function. */
export function startEmbedBridge(): () => void {
	if (!browser || listening) return () => {};
	listening = true;

	const onMessage = (event: MessageEvent) => {
		if (!isTrustedOrigin(event.origin)) return;
		const data = event.data;
		if (!data || typeof data !== 'object') return;

		if (data.type === 'ofd:setTheme' && (data.theme === 'dark' || data.theme === 'light')) {
			setEmbedTheme(data.theme);
			// Apply immediately without persisting the host's choice as the user's
			// own OFD preference.
			document.documentElement.classList.toggle('dark', data.theme === 'dark');
		}
	};

	window.addEventListener('message', onMessage);

	// Tell the host we're up and ready to receive theme/config.
	postToHost({ type: 'ofd:ready' });

	return () => {
		window.removeEventListener('message', onMessage);
		listening = false;
	};
}

/** Apply a host-forced theme override to the DOM (does not touch user prefs). */
export function applyEmbedTheme(t: 'light' | 'dark' | null): void {
	if (!browser || !t) return;
	document.documentElement.classList.toggle('dark', t === 'dark');
}

// Re-export for convenience so callers can also read the user's own theme.
export { theme };
