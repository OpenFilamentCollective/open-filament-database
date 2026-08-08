/**
 * Renders the final page shown in the OAuth *popup* (embedded-mode login).
 *
 * The popup completed the provider round-trip in its own top-level (first-party
 * OFD) context. It now hands the outcome back to the opener — the OFD iframe
 * inside the SimplyPrint panel — over postMessage, then closes itself. The
 * iframe adopts the sealed tokens into its own cookie partition (see the
 * matching `/adopt` route). On failure it relays an error so the frame can
 * surface it instead of hanging.
 *
 * Only the sealed (opaque) blob crosses the postMessage boundary; the raw tokens
 * never touch page scripts. We target the OFD origin explicitly so no other
 * frame can read the message.
 */

type Outcome = { sealed: string } | { error: string };

export function popupHandoffPage(
	origin: string,
	provider: 'simplyprint' | 'github',
	outcome: Outcome
): Response {
	const message = { type: `ofd:${provider}-auth`, ...outcome };
	// origin + message are our own values (origin = this deploy; sealed = base64url;
	// error = a fixed slug), but JSON.stringify keeps the inline script well-formed.
	const payload = JSON.stringify(message);
	const target = JSON.stringify(origin);
	const ok = 'sealed' in outcome;

	const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Signing in…</title>
<style>
  html,body{height:100%;margin:0}
  body{display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;
       background:#0b0b0c;color:#e5e5e5}
  .box{text-align:center;padding:2rem}
  .spin{width:28px;height:28px;border:3px solid #333;border-top-color:#4f8cff;border-radius:50%;
        margin:0 auto 1rem;animation:s .8s linear infinite}
  @keyframes s{to{transform:rotate(360deg)}}
</style></head>
<body>
  <div class="box">
    <div class="spin"></div>
    <p>${ok ? 'Signing you in…' : 'Sign-in failed. You can close this window.'}</p>
  </div>
  <script>
    (function () {
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(${payload}, ${target});
        }
      } catch (e) { /* opener gone — nothing to hand back */ }
      // Give the message a tick to deliver, then close.
      setTimeout(function () { try { window.close(); } catch (e) {} }, 150);
    })();
  </script>
</body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'cache-control': 'no-store'
		}
	});
}
