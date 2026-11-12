//! The watch page and the presenter's page: one small document each, served by the app at
//! `/api/site/{workspace}/live/watch/{id}` and `…/present/{id}` (and under `/api/app/live/` for signed-in
//! people). The page holds no wording of its own: what it shows is what the server answers. It loads one
//! script, the player or the capture element, from the address Live Settings names, and talks to the relay
//! straight from the browser. A link's secret rides in the address's fragment, which a browser never sends on.

use ferrum_kernel::SiteResponse;

/// `scheme://host[:port]` of an address, for a content-security policy.
pub fn origin(url: &str) -> Option<String> {
    let (scheme, rest) = url.trim().split_once("://")?;
    let host = rest.split(['/', '?', '#']).next().filter(|h| !h.is_empty() && !h.contains('@'))?;
    matches!(scheme, "https" | "http").then(|| format!("{scheme}://{host}"))
}

/// Whether an address may be the script a page loads: it goes into the page as a string, so only a plain https address
/// (or localhost, to try it) is let through.
pub fn module_ok(url: &str) -> bool {
    let plain = url.bytes().all(|c| c.is_ascii_graphic() && !b"\"'\\<>`".contains(&c));
    plain && origin(url).is_some_and(|o| o.starts_with("https://") || o.starts_with("http://localhost"))
}

pub fn render(present: bool, module: &str, relay: Option<&str>, frames: &[String]) -> SiteResponse {
    let nonce = {
        use base64::Engine as _;
        base64::engine::general_purpose::STANDARD.encode(rand::random::<[u8; 16]>())
    };
    let module = if module_ok(module) { module } else { "" };
    let module_origin = origin(module).unwrap_or_default();
    // The relay: WebTransport and fetches on its https origin, the WebSocket fallback on the same host.
    let relay_origin = relay.and_then(origin).unwrap_or_default();
    let websocket = relay_origin.replacen("https://", "wss://", 1).replacen("http://", "ws://", 1);
    let ancestors = if frames.is_empty() { "'none'".to_string() } else { frames.join(" ") };
    let script = if present { "present" } else { "watch" };
    let html = PAGE.replace("__NONCE__", &nonce).replace("__MODULE__", module).replace("__KIND__", script);
    let mut res = SiteResponse::text(200, "text/html; charset=utf-8", html);
    let csp = format!(
        "default-src 'none'; script-src 'nonce-{nonce}' 'wasm-unsafe-eval' {module_origin}; style-src 'unsafe-inline'; connect-src 'self' {relay_origin} {websocket} {module_origin}; \
         img-src data: blob:; media-src blob:; worker-src blob: {module_origin}; base-uri 'none'; form-action 'none'; frame-ancestors {ancestors}"
    );
    for (k, v) in [
        ("content-security-policy", csp.as_str()),
        ("cache-control", "no-store"),
        ("referrer-policy", "no-referrer"),
        ("x-content-type-options", "nosniff"),
        ("x-robots-tag", "noindex"),
        // The same origins, for the platform's own framing rule (BD-24).
        ("x-ferrum-frame-ancestors", &frames.join(" ")),
    ] {
        res.headers.push((k.into(), v.into()));
    }
    res
}

const PAGE: &str = r#"<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title></title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#1f2328;--muted:#57606a}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#8d96a0}}
html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px;box-sizing:border-box}
#stage{width:100%;max-width:1280px}#stage canvas,#stage video{width:100%;height:auto;background:#000;display:block;aspect-ratio:16/9}
#words{text-align:center;max-width:40em;overflow-wrap:anywhere}#words a{color:inherit}
</style></head>
<body><main><div id="stage" hidden></div><div id="words" role="status" aria-live="polite"></div></main>
<script nonce="__NONCE__">
(() => {
  const kind = "__KIND__";
  const parts = location.pathname.split('/').filter(Boolean);
  const id = parts.pop(); parts.pop();
  const base = '/' + parts.join('/');
  const link = new URLSearchParams(location.hash.slice(1)).get('k');
  let seat = null;
  try { seat = sessionStorage.getItem('live-seat'); if (!seat) { seat = crypto.randomUUID().replace(/-/g, ''); sessionStorage.setItem('live-seat', seat); } } catch (e) { seat = crypto.randomUUID().replace(/-/g, ''); }
  const words = document.getElementById('words'), stage = document.getElementById('stage');
  const say = (text, replay, replayText) => {
    words.textContent = text || '';
    if (replay) { const a = document.createElement('a'); a.href = replay; a.rel = 'noopener'; a.textContent = replayText || replay; words.append(document.createElement('br'), a); }
  };
  const call = async (path) => {
    const res = await fetch(base + '/broadcasts/' + id + '/' + path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ link, seat }) });
    let body = {}; try { body = await res.json(); } catch (e) {}
    return { ok: res.ok, status: res.status, body };
  };
  const first = kind === 'present' ? 'publish' : 'watch';
  const again = kind === 'present' ? 'publish/refresh' : 'watch/refresh';
  let el = null, timer = null, defined = null;
  const define = () => defined || (defined = import("__MODULE__"));
  const show = async (o) => {
    await define();
    const e = o.element;
    if (!el) {
      el = document.createElement(e.tag);
      for (const [k, v] of e.attrs) el.setAttribute(k, v);
      if (e.child) { const c = document.createElement(e.child.split(' ')[0]); if (e.child.startsWith('video')) { c.muted = true; c.autoplay = true; } el.append(c); }
      el.setAttribute(e.name_attr, o.name);
      stage.append(el); stage.hidden = false;
    }
    el.setAttribute(e.url_attr, o.url);
    say('');
  };
  const loop = async (path) => {
    clearTimeout(timer);
    let r;
    try { r = await call(path); } catch (e) { timer = setTimeout(() => loop(path), 5000); return; }
    const b = r.body;
    if (r.ok && b.token) { await show(b); timer = setTimeout(() => loop(again), Math.max(5, b.refresh_in) * 1000); return; }
    if (r.ok && b.status) {
      document.title = b.title || '';
      say(b.text, b.replay_url, b.replay_text);
      if (b.status === 'Scheduled') timer = setTimeout(() => loop(first), 10000);
      if (el && b.status !== 'Live') { el.remove(); el = null; stage.hidden = true; }
      return;
    }
    say(b.message || '');
    if (path === again) { el && el.remove(); el = null; stage.hidden = true; if (r.status === 404 || r.status === 409) return; }
    if (r.status === 503 || r.status === 429) timer = setTimeout(() => loop(first), 15000);
  };
  window.addEventListener('pagehide', () => { if (kind === 'watch') navigator.sendBeacon(base + '/broadcasts/' + id + '/watch/leave', new Blob([JSON.stringify({ link, seat })], { type: 'application/json' })); });
  loop(first);
})();
</script></body></html>
"#;
