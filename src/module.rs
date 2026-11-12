//! The two moq components for the public pages, served from the app's own origin: the files the interface build puts in
//! `ui/dist/assets` for them (`moq-watch-{version}.js`, `moq-publish-{version}.js`, what they import, and the Opus
//! WebAssembly the polyfill loads by a name it works out at run time). Nothing else of `ui/dist` is exposed: the answer
//! to any other name is "not found". A page with no module address of its own in Live Settings loads these.

use std::collections::HashSet;
use std::sync::OnceLock;

fn asset(name: &str) -> Option<&'static [u8]> {
    crate::UI.iter().find(|(p, _)| p.strip_prefix("assets/") == Some(name)).map(|(_, b)| *b)
}

/// The file name of the bundled component for `kind` (`watch` or `publish`), if the release has it.
pub fn entry(kind: &str) -> Option<&'static str> {
    let prefix = format!("assets/moq-{kind}-");
    crate::UI.iter().map(|(p, _)| *p).find(|p| p.starts_with(&prefix) && p.ends_with(".js")).and_then(|p| p.strip_prefix("assets/"))
}

/// Names a script mentions as `./name.ext` (static and dynamic imports, minified or not).
fn mentions(text: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut rest = text;
    while let Some(i) = rest.find("./") {
        let tail = &rest[i + 2..];
        let end = tail.find(|c: char| !(c.is_ascii_alphanumeric() || "._-".contains(c))).unwrap_or(tail.len());
        let name = &tail[..end];
        if name.ends_with(".js") || name.ends_with(".mjs") || name.ends_with(".wasm") {
            out.push(name);
        }
        rest = &tail[end..];
    }
    out
}

/// Every file the two components can load: what they import, transitively, and the Opus fallback's WebAssembly.
fn closure() -> &'static HashSet<&'static str> {
    static SET: OnceLock<HashSet<&'static str>> = OnceLock::new();
    SET.get_or_init(|| {
        let mut seen: HashSet<&'static str> = HashSet::new();
        let mut todo: Vec<&'static str> = ["watch", "publish"].iter().filter_map(|k| entry(k)).collect();
        while let Some(name) = todo.pop() {
            if !seen.insert(name) {
                continue;
            }
            if let Some(Ok(text)) = asset(name).map(std::str::from_utf8) {
                for dep in mentions(text) {
                    if let Some((p, _)) = crate::UI.iter().find(|(p, _)| p.strip_prefix("assets/") == Some(dep)) {
                        todo.push(p.strip_prefix("assets/").unwrap_or(p));
                    }
                }
            }
        }
        // Loaded by a path the polyfill builds beside its own chunk.
        for (p, _) in crate::UI {
            if let Some(n) =
                p.strip_prefix("assets/").filter(|n| n.starts_with("libav-") && (n.ends_with("-opus-af.wasm.mjs") || n.ends_with("-opus-af.wasm.wasm")))
            {
                seen.insert(n);
            }
        }
        seen
    })
}

/// A file of the closure: its content type and bytes.
pub fn file(name: &str) -> Option<(&'static str, &'static [u8])> {
    let name = closure().get(name).copied()?;
    let ct = if name.ends_with(".wasm") { "application/wasm" } else { "text/javascript; charset=utf-8" };
    asset(name).map(|b| (ct, b))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_imports_in_minified_code() {
        assert_eq!(mentions(r#"import("./pool-ab1.js");import{a}from"./x_y.mjs";let u="./a/b.js";k("./n.wasm")"#), vec!["pool-ab1.js", "x_y.mjs", "n.wasm"]);
    }

    #[test]
    fn refuses_what_is_not_a_component_file() {
        assert!(file("main-abc.js").is_none() && file("../index.html").is_none() && file("words.json").is_none());
    }
}
