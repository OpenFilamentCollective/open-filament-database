import { json } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import { SCHEMA_DIR } from '$lib/server/entityConfig';
import { IS_CLOUD, API_BASE } from '$lib/server/cloudProxy';

/**
 * The shared name → trait rule table (`schemas/trait_rules.json`).
 *
 * Served here so the editor's suggestion panel applies exactly the rules the
 * validator and `ofd script apply_fiber_traits` do. Local mode reads the file off
 * disk; cloud mode fetches the copy the build publishes at /api/v1/trait-rules.json.
 *
 * Kept separate from /api/schemas/* because these are not a JSON Schema and are not
 * tied to a particular entity: a rule maps a name to trait keys and says nothing
 * about which entity carries them, so it survives traits moving to the filament.
 *
 * An empty table degrades to "no suggestions", never an error — the form must render
 * whether or not this resolves.
 */

const EMPTY = { version: 0, rules: [] };

let cloudCache: unknown | null = null;

export async function GET() {
	try {
		if (IS_CLOUD) {
			if (cloudCache === null) {
				const res = await fetch(`${API_BASE}/api/v1/trait-rules.json`);
				// Not published yet on an older dataset build.
				cloudCache = res.ok ? await res.json() : null;
			}
			return json(cloudCache ?? EMPTY);
		}
		return json(JSON.parse(await fs.readFile(`${SCHEMA_DIR}/trait_rules.json`, 'utf-8')));
	} catch (error) {
		console.error('Error reading trait rules:', error);
		return json(EMPTY);
	}
}
