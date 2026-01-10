import { json } from '@sveltejs/kit';
import { refreshDatabase } from '$lib/dataCacher';
import { setFlash } from 'sveltekit-flash-message/server';

export async function POST({ cookies }) {
    try {
      await refreshDatabase();
      console.log("Refreshed DB!");
      setFlash({ type: 'success', message: 'Successfully reloaded DB!' }, cookies);
      return json({ error: 'Refreshed!' }, { status: 200 });
    } catch (error) {
    console.error('Refresh error:', error);
    setFlash({ type: 'error', message: 'Refresh DB error :/' }, cookies);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
