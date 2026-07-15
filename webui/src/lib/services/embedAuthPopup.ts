/**
 * Embedded-mode OAuth via a popup window.
 *
 * SimplyPrint and GitHub both refuse to be framed, so when OFD runs inside the
 * SimplyPrint panel iframe we can't navigate the frame to their authorize pages.
 * Instead we open the OAuth flow in a top-level popup (where the provider is
 * first-party) and bridge the result back:
 *
 *   1. Open `/api/auth/<provider>/login?popup=1` in a popup.
 *   2. The popup completes the round-trip and postMessages a sealed blob back to
 *      this window (the opener) — see server `popupHandoff` + `seal`.
 *   3. We POST that blob to `/api/auth/<provider>/adopt` so the session cookie is
 *      written in THIS frame's partition (the popup's own cookies live in a
 *      different, unreachable partition).
 *
 * `window.open` must run inside the click's user gesture, so this is invoked
 * straight from the login button handlers (via the auth store).
 */
import { browser } from '$app/environment';

type Provider = 'simplyprint' | 'github';

const POPUP_W = 520;
const POPUP_H = 680;

export function loginViaPopup(provider: Provider): Promise<boolean> {
	if (!browser) return Promise.resolve(false);

	const origin = window.location.origin;

	// Center over the current window when we can; harmless if the browser ignores it.
	const sx = window.screenX ?? 0;
	const sy = window.screenY ?? 0;
	const ow = window.outerWidth || window.innerWidth || POPUP_W;
	const oh = window.outerHeight || window.innerHeight || POPUP_H;
	const left = Math.max(0, sx + (ow - POPUP_W) / 2);
	const top = Math.max(0, sy + (oh - POPUP_H) / 2);

	const popup = window.open(
		`/api/auth/${provider}/login?popup=1`,
		'ofd_oauth_' + provider,
		`width=${POPUP_W},height=${POPUP_H},left=${left},top=${top},noreferrer=no`
	);

	// Blocked (no user gesture / blocker). Caller can fall back / prompt.
	if (!popup) return Promise.resolve(false);

	return new Promise<boolean>((resolve) => {
		let settled = false;
		const finish = (ok: boolean) => {
			if (settled) return;
			settled = true;
			window.removeEventListener('message', onMessage);
			clearInterval(closedTimer);
			resolve(ok);
		};

		const onMessage = async (e: MessageEvent) => {
			// Only trust our own origin (the popup navigates back to OFD before posting).
			if (e.origin !== origin) return;
			const d = e.data;
			if (!d || typeof d !== 'object' || d.type !== `ofd:${provider}-auth`) return;

			try {
				popup.close();
			} catch {
				/* already closed */
			}

			if (d.error || typeof d.sealed !== 'string') {
				finish(false);
				return;
			}

			// Persist into this frame's cookie partition.
			try {
				const res = await fetch(`/api/auth/${provider}/adopt?embed=1`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify({ sealed: d.sealed })
				});
				finish(res.ok);
			} catch {
				finish(false);
			}
		};

		window.addEventListener('message', onMessage);

		// If the user closes the popup without finishing, stop waiting.
		const closedTimer = setInterval(() => {
			if (popup.closed) finish(false);
		}, 500);
	});
}
