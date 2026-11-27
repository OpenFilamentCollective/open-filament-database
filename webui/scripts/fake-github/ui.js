// Minimal HTML UI for the fake GitHub: act as a maintainer on PRs, inspect outbox.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const CSS = `
body{font:14px/1.45 system-ui,sans-serif;margin:0;background:#f6f8fa;color:#1f2328}
header{background:#24292f;color:#fff;padding:10px 20px;display:flex;gap:18px;align-items:center}
header a{color:#fff;text-decoration:none;font-weight:600} header .grow{flex:1}
main{max-width:1100px;margin:20px auto;padding:0 16px}
.card{background:#fff;border:1px solid #d0d7de;border-radius:6px;padding:12px 16px;margin-bottom:14px}
h1{font-size:22px;margin:0 0 6px} h2{font-size:16px;margin:0 0 8px}
table{border-collapse:collapse;width:100%} td,th{border-bottom:1px solid #eee;padding:5px 6px;text-align:left;vertical-align:top}
.pill{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;color:#fff}
.open{background:#1f883d}.closed{background:#cf222e}.merged{background:#8250df}
.bot{background:#6e7781}.muted{color:#656d76;font-size:12px}
pre{white-space:pre-wrap;background:#f6f8fa;padding:8px;border-radius:4px;margin:4px 0;max-height:260px;overflow:auto}
textarea{width:100%;min-height:60px;font:inherit} input,select{font:inherit}
button{font:inherit;padding:4px 10px;border:1px solid #d0d7de;border-radius:6px;background:#f6f8fa;cursor:pointer}
button.primary{background:#1f883d;color:#fff;border-color:#1a7f37} button.danger{background:#cf222e;color:#fff;border-color:#a40e26}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0}
.thread{border-left:3px solid #d0d7de;padding-left:10px;margin:10px 0}
.thread.resolved{opacity:.55} .comment{margin:6px 0}
.ln{color:#999;user-select:none;display:inline-block;width:44px;text-align:right;margin-right:8px}
.diff{background:#e6ffec} .code a{color:inherit;text-decoration:none} .code div:hover{background:#fff8c5}
#toast{position:fixed;bottom:16px;right:16px;background:#24292f;color:#fff;padding:8px 14px;border-radius:6px;display:none;max-width:500px}
`;

const JS = `
const asSel = () => localStorage.getItem('fakegh_as') || 'maint';
function setAs(v){ localStorage.setItem('fakegh_as', v); document.querySelectorAll('.as').forEach(e=>e.textContent=v); }
async function ctl(path, body, reload=true){
  const res = await fetch('/__control'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({as:asSel(),...body})});
  const txt = await res.text();
  const t=document.getElementById('toast'); t.textContent = res.status+' '+txt.slice(0,300); t.style.display='block';
  if(res.ok && reload) setTimeout(()=>location.reload(), 400);
  return res;
}
function val(id){ return document.getElementById(id).value; }
window.addEventListener('DOMContentLoaded',()=>{ const s=document.getElementById('as'); if(s){ s.value=asSel(); setAs(asSel()); }});
`;

function page(title, body, users) {
	const opts = users ? Object.values(users).map((u) => `<option value="${esc(u.login)}">${esc(u.login)} (${u.type === 'Bot' ? 'bot' : u.perm})</option>`).join('') : '';
	return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} · fake GitHub</title><style>${CSS}</style><script>${JS}</script></head>
<body><header><a href="/">🧪 fake GitHub</a><a href="/__outbox">Outbox</a><span class="grow"></span>
${users ? `<label>Acting as <select id="as" onchange="setAs(this.value)">${opts}</select></label>` : ''}</header>
<main>${body}</main><div id="toast"></div></body></html>`;
}

function stateOf(pr) {
	if (pr.merged) return '<span class="pill merged">merged</span>';
	return `<span class="pill ${pr.state}">${pr.state}</span>`;
}

export function renderIndex({ S, UPSTREAM, prRest, GH_USERS }) {
	const rows = [...S.pulls]
		.reverse()
		.map((p) => prRest(p))
		.map(
			(p) =>
				`<tr><td><a href="${esc(p.html_url)}">#${p.number}</a></td><td>${stateOf(p)}</td><td><a href="${esc(p.html_url)}">${esc(p.title)}</a><div class="muted">${esc(p.head.label)}</div></td><td>${esc(p.user.login)}</td><td class="muted">${esc(p.updated_at)}</td></tr>`
		)
		.join('');
	const main = S.repos.get(UPSTREAM).refs.get('heads/main');
	return page(
		'Pull requests',
		`<div class="card"><h1>${esc(UPSTREAM)}</h1><div class="muted">main @ ${main.slice(0, 7)} · ${S.pulls.length} PRs · <a href="#" onclick="if(confirm('Reset all fake state?'))ctl('/reset',{});return false">reset everything</a></div></div>
<div class="card"><h2>Pull requests</h2><table><tr><th>#</th><th>State</th><th>Title</th><th>Author</th><th>Updated</th></tr>${rows || '<tr><td colspan=5 class=muted>None yet</td></tr>'}</table></div>
<div class="card"><h2>Commit directly to main</h2><div class="muted">Simulates another PR being merged meanwhile. One file per commit here; use the JSON API for more.</div>
<div class="row"><input id="mp" size="80" placeholder="data/brand/material/filament/variant/variant.json"></div>
<textarea id="mc" placeholder="Full new file content (leave empty + tick delete to remove)"></textarea>
<div class="row"><label><input type="checkbox" id="md"> delete file</label><button onclick="loadMain()">Load current content</button><button class="primary" onclick="ctl('/main/commit',{message:'Direct commit to main',files:{[val('mp')]: document.getElementById('md').checked?null:val('mc')}})">Commit</button></div></div>
<div class="card"><h2>Open a non-web-editor PR from a fork</h2><div class="row">branch <input id="fb" value="main" size="12"> title <input id="ft" size="40" value="Added brand lineup"></div>
<div class="row"><input id="fp" size="80" placeholder="path"></div><textarea id="fc" placeholder="content"></textarea>
<button onclick="ctl('/pr/create',{branch:val('fb'),title:val('ft'),files:{[val('fp')]:val('fc')}})">Open PR as <b class="as"></b></button></div>
<script>async function loadMain(){const r=await fetch('/repos/${UPSTREAM}/contents/'+val('mp')+'?ref=main');if(!r.ok){alert('not found');return}const j=await r.json();document.getElementById('mc').value=new TextDecoder().decode(Uint8Array.from(atob(j.content),c=>c.charCodeAt(0)));}</script>`,
		GH_USERS
	);
}

function commentHtml(c, extra = '') {
	return `<div class="comment"><b>${esc(c.author.login)}</b>${c.author.__typename === 'Bot' ? ' <span class="pill bot">bot</span>' : ''} <span class="muted">${esc(c.createdAt)} · id ${c.databaseId}${extra}</span><pre>${esc(c.body)}</pre></div>`;
}

export function renderPr({ pr, raw, files, gql, threads, GH_USERS }) {
	const n = pr.number;
	const fileOpts = files.map((f) => `<option value="${esc(f.filename)}">${esc(f.filename)} (${f.status})</option>`).join('');
	const fileList = files
		.map((f) => `<tr><td>${f.status}</td><td><a href="/${esc(pr.base.repo.full_name)}/pull/${n}/file?path=${encodeURIComponent(f.filename)}" target="filepane">${esc(f.filename)}</a>${f.previous_filename ? `<div class="muted">from ${esc(f.previous_filename)}</div>` : ''}</td></tr>`)
		.join('');
	const conv = gql.comments.nodes.map((c) => commentHtml(c)).join('') || '<div class="muted">No comments</div>';
	const reviews = gql.reviews.nodes
		.map(
			(r) =>
				`<div class="comment"><b>${esc(r.author.login)}</b> <span class="pill ${r.state === 'CHANGES_REQUESTED' ? 'closed' : r.state === 'APPROVED' ? 'open' : 'bot'}">${r.state}</span> <span class="muted">${esc(r.submittedAt)} · id ${r.databaseId}</span>${r.state !== 'DISMISSED' ? ` <button onclick="ctl('/review/${r.databaseId}/dismiss',{})">dismiss</button>` : ''}${r.body ? `<pre>${esc(r.body)}</pre>` : ''}</div>`
		)
		.join('') || '<div class="muted">No reviews</div>';
	const threadHtml = gql.reviewThreads.nodes
		.map((t, i) => {
			const raw = threads[i];
			return `<div class="thread ${t.isResolved ? 'resolved' : ''}"><div><b>${esc(t.path)}</b>:${t.line ?? (t.originalLine ? `(was ${t.originalLine})` : 'file')} ${t.isOutdated ? '<span class="pill bot">outdated</span>' : ''} ${t.isResolved ? '<span class="pill merged">resolved</span>' : ''} <span class="muted">thread ${raw.id}</span>
<button onclick="ctl('/thread/${raw.id}/resolve',{resolved:${!t.isResolved}})">${t.isResolved ? 'unresolve' : 'resolve'}</button>
<button onclick="ctl('/thread/${raw.id}/outdated',{outdated:${!raw.forcedOutdated}})">${raw.forcedOutdated ? 'un-outdate' : 'mark outdated'}</button></div>
${t.comments.nodes.map((c) => commentHtml(c, c.pullRequestReview ? ` · review ${c.pullRequestReview.databaseId}` : '')).join('')}
<div class="row"><input id="rp${raw.id}" size="70" placeholder="Reply…"><button onclick="ctl('/pr/${n}/reply',{thread:${raw.id},body:val('rp${raw.id}')})">Reply as <b class="as"></b></button></div></div>`;
		})
		.join('') || '<div class="muted">No inline threads</div>';

	return page(
		`#${n} ${pr.title}`,
		`<div class="card"><h1>${esc(pr.title)} <span class="muted">#${n}</span></h1>
<div>${stateOf(pr)} <b>${esc(pr.user.login)}</b> wants to merge <code>${esc(pr.head.label)}</code> into main · head ${esc((pr.head.sha || '').slice(0, 7))} · maintainer_can_modify=${pr.maintainer_can_modify}</div>
<pre>${esc(pr.body)}</pre>
<div class="row">
${pr.state === 'open' ? `<button class="danger" onclick="ctl('/pr/${n}/close',{comment:val('cc')||undefined})">Close${' '}as <b class="as"></b> (with comment below if any)</button><button class="primary" onclick="ctl('/pr/${n}/merge',{})">Merge as <b class="as"></b></button>` : pr.merged ? '' : `<button onclick="ctl('/pr/${n}/reopen',{})">Reopen as <b class="as"></b></button>`}
<button onclick="ctl('/pr/${n}/maintainer-can-modify',{value:${!pr.maintainer_can_modify}})">toggle maintainer_can_modify</button>
<button onclick="ctl('/pr/${n}/bulk-comments',{count:120})">+120 comments</button>
</div></div>

<div class="card"><h2>Files changed (${files.length})</h2><table>${fileList}</table>
<iframe name="filepane" style="width:100%;height:320px;border:1px solid #d0d7de;margin-top:8px"></iframe></div>

<div class="card"><h2>Conversation</h2>${conv}
<textarea id="cc" placeholder="Leave a comment (e.g. 'Rejected: duplicate of #800', 'NOTE: …')"></textarea>
<div class="row"><button class="primary" onclick="ctl('/pr/${n}/comment',{body:val('cc')})">Comment as <b class="as"></b></button></div></div>

<div class="card"><h2>Reviews</h2>${reviews}
<textarea id="rb" placeholder="Review body"></textarea>
<div class="row"><button onclick="ctl('/pr/${n}/review',{event:'COMMENT',body:val('rb')})">Comment</button>
<button class="danger" onclick="ctl('/pr/${n}/review',{event:'REQUEST_CHANGES',body:val('rb')})">Request changes</button>
<button class="primary" onclick="ctl('/pr/${n}/review',{event:'APPROVE',body:val('rb')})">Approve</button> as <b class="as"></b></div></div>

<div class="card"><h2>Inline threads</h2>${threadHtml}
<h2 style="margin-top:14px">New inline comment</h2><div class="row"><select id="ip">${fileOpts}</select> line <input id="il" size="5" placeholder="(file)"></div>
<textarea id="ib" placeholder="Inline comment"></textarea><div class="row"><button class="primary" onclick="ctl('/pr/${n}/inline',{path:val('ip'),line:val('il'),body:val('ib')})">Add as <b class="as"></b></button>
<span class="muted">Tip: click a line in the file pane to fill path + line.</span></div></div>

<div class="card"><h2>Inject AI review run (github-actions)</h2>
<div class="muted">One finding per line: <code>path:line: text</code> (line empty = file-level). A new run supersedes earlier runs.</div>
<textarea id="ai" style="min-height:90px">${esc(files.slice(0, 2).map((f) => `${f.filename}:3: 🟡 Please double-check this value against the product page. _(unverified: AI opinion)_`).join('\n'))}</textarea>
<button onclick="ctl('/pr/${n}/ai-review',{findings:val('ai').split('\\n').filter(Boolean).map(l=>{const m=l.match(/^([^:]+):(\\d*):\\s*(.*)$/);return m?{path:m[1],line:m[2]?Number(m[2]):null,body:m[3]}:null}).filter(Boolean)})">Post AI review</button></div>
<script>window.addEventListener('message',e=>{if(e.data&&e.data.pick){document.getElementById('ip').value=e.data.pick.path;document.getElementById('il').value=e.data.pick.line;}});</script>`,
		GH_USERS
	);
}

export function renderFile({ n, path, lines, diff }) {
	if (!lines) return `<p>File not present at head (deleted).</p>`;
	return `<!doctype html><meta charset=utf-8><style>${CSS} body{background:#fff;margin:6px}</style><div class="muted">${esc(path)} — green = commentable (part of the diff). Click a line to target it.</div><pre class="code">${lines
		.map((l, i) => `<div class="${diff?.has(i + 1) ? 'diff' : ''}" onclick="parent.postMessage({pick:{path:${esc(JSON.stringify(path))},line:${i + 1}}},'*')"><span class="ln">${i + 1}</span>${esc(l)}</div>`)
		.join('')}</pre>`;
}

export function renderOutbox(outbox) {
	const emails = [...outbox.emails]
		.reverse()
		.map(
			(e, i) =>
				`<div class="card"><b>${esc(e.subject)}</b> <span class="muted">to ${esc(e.to)} · ${esc(e.at)}</span>
<details ${i === 0 ? 'open' : ''}><summary>HTML</summary><iframe style="width:100%;height:520px;border:1px solid #d0d7de" srcdoc="${esc(e.html)}"></iframe></details>
<details><summary>Text</summary><pre>${esc(e.text)}</pre></details></div>`
		)
		.join('');
	const hooks = [...outbox.ofdWebhooks].reverse().map((w) => `<tr><td>${esc(w.at)}</td><td>${esc(w.event)}</td><td><pre>${esc(JSON.stringify(w.body, null, 1))}</pre></td></tr>`).join('');
	const gh = [...outbox.ghWebhooks].reverse().map((w) => `<tr><td>${esc(w.at)}</td><td>${esc(w.event)}.${esc(w.action)} #${w.pr}</td><td>${esc(w.status)}</td><td class="muted">${esc(w.response)}</td></tr>`).join('');
	return page(
		'Outbox',
		`<div class="row"><button onclick="ctl('/outbox/clear',{})">Clear outbox</button></div>
<h2>Emails (${outbox.emails.length})</h2>${emails || '<div class="muted card">None</div>'}
<div class="card"><h2>OFD outgoing webhooks (${outbox.ofdWebhooks.length})</h2><table>${hooks}</table></div>
<div class="card"><h2>GitHub webhooks delivered to the app (${outbox.ghWebhooks.length})</h2><table>${gh}</table></div>
<div class="card"><h2>Log</h2><pre style="max-height:400px">${esc([...outbox.log].reverse().join('\n'))}</pre></div>`
	);
}

export function renderPicker(provider, url, users, approvePath) {
	const qs = url.searchParams;
	const links = users
		.map((u) => {
			const to = new URLSearchParams(qs);
			to.set('as', u.key);
			return `<p><a href="${approvePath}?${esc(to.toString())}"><button class="primary">Sign in as ${esc(u.label)}</button></a></p>`;
		})
		.join('');
	return page(`${provider} sign-in`, `<div class="card"><h1>Fake ${esc(provider)} — authorize the OFD web editor</h1><div class="muted">client_id=${esc(qs.get('client_id'))} · redirect_uri=${esc(qs.get('redirect_uri'))}</div>${links}</div>`);
}
