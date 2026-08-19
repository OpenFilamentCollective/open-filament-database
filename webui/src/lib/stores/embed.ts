import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Embed mode — active when the app is loaded inside a host application's iframe
 * (e.g. the SimplyPrint panel modal) via `?embed=1`.
 *
 * When embedded we hide the marketing chrome (footer, welcome modal, big site
 * title) and keep the functional bits (browse, search, ChangesMenu preview,
 * submission wizard). Auth cookies also switch to SameSite=None; Partitioned so
 * the OAuth handshake survives the cross-site iframe (see lib/server/auth.ts).
 *
 * Embed state is sticky for the session: SvelteKit client navigations and the
 * OAuth callback redirect drop `?embed=1` from the URL, so once detected we
 * persist it in sessionStorage (partitioned to the host by the browser) and
 * keep treating the session as embedded.
 */

const SS_EMBED = 'ofd_embed';
const SS_WRAPPER = 'ofd_embed_wrapper';
const SS_THEME = 'ofd_embed_theme';

export interface EmbedState {
	/** Running inside a host iframe. */
	embedded: boolean;
	/** Attribution label for PRs, e.g. "SimplyPrint" (from `?wrapper=`). */
	wrapper: string | null;
	/** Host-forced theme, e.g. matching the panel's dark mode (from `?theme=`). */
	themeOverride: 'light' | 'dark' | null;
}

function ssGet(key: string): string | null {
	if (!browser) return null;
	try {
		return sessionStorage.getItem(key);
	} catch {
		return null;
	}
}

function ssSet(key: string, val: string | null): void {
	if (!browser) return;
	try {
		if (val === null) sessionStorage.removeItem(key);
		else sessionStorage.setItem(key, val);
	} catch {
		/* sessionStorage may be unavailable (partitioning / privacy modes) */
	}
}

function initialState(): EmbedState {
	return {
		embedded: ssGet(SS_EMBED) === '1',
		wrapper: ssGet(SS_WRAPPER),
		themeOverride: (ssGet(SS_THEME) as 'light' | 'dark' | null) || null
	};
}

const embedState = writable<EmbedState>(initialState());

/**
 * Initialise/refresh embed state from a URL's query params. Safe to call on
 * every navigation — once embedded, the session stays embedded even after the
 * `?embed=1` param disappears.
 */
export function initEmbedFromUrl(url: URL): void {
	const p = url.searchParams;
	const isEmbed = p.get('embed') === '1' || p.get('embed') === 'true';
	const themeParam = p.get('theme');
	const wrapperParam = p.get('wrapper');
	const theme = themeParam === 'dark' || themeParam === 'light' ? themeParam : null;

	embedState.update((s) => {
		const embedded = s.embedded || isEmbed;
		const wrapper = wrapperParam ?? s.wrapper;
		const themeOverride = theme ?? s.themeOverride;

		if (embedded) ssSet(SS_EMBED, '1');
		if (wrapper) ssSet(SS_WRAPPER, wrapper);
		if (themeOverride) ssSet(SS_THEME, themeOverride);

		return { embedded, wrapper, themeOverride };
	});
}

/** Update the host-forced theme (e.g. from a live `ofd:setTheme` postMessage). */
export function setEmbedTheme(t: 'light' | 'dark'): void {
	ssSet(SS_THEME, t);
	embedState.update((s) => ({ ...s, themeOverride: t }));
}

export const embed = { subscribe: embedState.subscribe };
export const isEmbedded = derived(embedState, ($s) => $s.embedded);
export const embedWrapper = derived(embedState, ($s) => $s.wrapper);
export const embedThemeOverride = derived(embedState, ($s) => $s.themeOverride);

export function getEmbedState(): EmbedState {
	return get(embedState);
}
