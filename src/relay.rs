//! The one interface to the relay. Everything the app knows about the relay's way of admitting people,
//! of addressing a broadcast, of being asked whether it is up and of what its player is lives behind
//! [`Relay`]. [`MoqRelay`] is the implementation for `moq-relay` (docs/moq.md says which release and what
//! its documentation was read for); [`FakeRelay`] answers for tests and records what it was asked.

use async_trait::async_trait;
use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use chrono::{DateTime, Utc};
use ferrum_kernel::{Error, Kernel, Result};
use hmac::{Hmac, Mac};
use serde_json::{Value, json};
use sha2::Sha256;
use std::sync::Mutex;
use std::time::Duration;

/// What a token lets its bearer do on one broadcast's path, and nothing more.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Access {
    Publish,
    Watch,
}

/// A signing key as the relay's own tooling writes it. The secret stays inside: the type prints without it.
#[derive(Clone)]
pub struct RelayKey {
    pub kid: String,
    secret: Vec<u8>,
}

impl RelayKey {
    /// Whether `other` holds the same secret (in constant time).
    pub fn same_secret(&self, other: &RelayKey) -> bool {
        self.secret.len() == other.secret.len() && self.secret.iter().zip(&other.secret).fold(0u8, |d, (a, b)| d | (a ^ b)) == 0
    }
}

impl std::fmt::Debug for RelayKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "RelayKey({})", self.kid)
    }
}

/// A pass: one subject (a person, a link or a browser's seat), one broadcast's path, one right, a few minutes to connect.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pass {
    pub root: String,
    pub access: Access,
    pub subject: String,
    pub expires: DateTime<Utc>,
}

/// Why the relay asks: a session opening, the relay asking again while it lasts, or its end.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Event {
    Connect,
    Revalidate,
    End,
}

/// What the relay asks about: the pass a client presented and the path it dialed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Asked {
    pub event: Event,
    pub token: String,
    pub path: String,
}

/// What the page needs to put a player or a capture element on screen.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Element {
    pub tag: &'static str,
    /// The attribute holding the relay address with the token.
    pub url_attr: &'static str,
    /// The attribute holding the stream's name under that address.
    pub name_attr: &'static str,
    /// The element the player draws into (`canvas`), or captures into (`video`), made inside it; none for "".
    pub child: &'static str,
    /// Attributes it always has.
    pub attrs: &'static [(&'static str, &'static str)],
}

#[async_trait]
pub trait Relay: Send + Sync {
    /// A key as pasted by an administrator, checked: the key's id and its secret, or why it cannot be used.
    fn parse_key(&self, material: &str) -> Result<RelayKey>;
    /// The pass as a token the relay's clients present, signed with `key`.
    fn token(&self, key: &RelayKey, pass: &Pass) -> Result<String>;
    /// The pass a token is, when `key` signed it; its expiry is not checked here (the caller knows when it matters).
    fn read(&self, key: &RelayKey, token: &str) -> Result<Pass>;
    /// The address a client dials: the relay's address, the path and the token.
    fn connect_url(&self, relay: &str, path: &str, token: &str) -> String;
    /// The element that plays (or captures) the stream.
    fn element(&self, access: Access) -> Element;
    /// Whether the relay answers, as the server reaches it (`url` is the health address).
    async fn health(&self, k: &Kernel, url: &str) -> Result<()>;

    /// The relay's question to its auth server (`--auth-url`, docs/moq.md "How it admits people"): `event`, `path` as
    /// dialed, and the token, given as `token` or as `?jwt=` in `query`.
    fn asked(&self, body: &Value) -> Result<Asked> {
        let event = match body["event"].as_str() {
            Some("connect") => Event::Connect,
            Some("revalidate") => Event::Revalidate,
            Some("end") => Event::End,
            _ => return Err(Error::invalid("event: connect, revalidate or end")),
        };
        let from_query = match &body["query"] {
            Value::String(q) => q.trim_start_matches('?').split('&').find_map(|kv| kv.strip_prefix("jwt=")).map(str::to_string),
            q => q["jwt"].as_str().map(str::to_string),
        };
        let token = body["token"].as_str().map(str::to_string).or(from_query).filter(|t| !t.is_empty() && t.len() <= 4096);
        let path = body["path"].as_str().unwrap_or_default().trim_matches('/').to_string();
        match (event, token) {
            (Event::End, t) => Ok(Asked { event, token: t.unwrap_or_default(), path }),
            (_, Some(token)) => Ok(Asked { event, token, path }),
            _ => Err(Error::Forbidden("no pass".into())),
        }
    }

    /// The answer that admits a session for `pass` until `until`, to be asked again in `every` seconds.
    fn grant(&self, pass: &Pass, until: DateTime<Utc>, every: i64) -> Value {
        let grant = if pass.access == Access::Publish { "publish" } else { "subscribe" };
        json!({"root": pass.root, grant: ["**"], "expires": until.timestamp(), "revalidate": every})
    }
}

// ───────────────────────────── moq-relay ─────────────────────────────

/// `moq-relay` 0.17.x with its reference auth server (`moq auth serve --key-dir`): a client dials
/// `{relay}/{root}?jwt={token}`. The token is an HS256 JWT whose header names the key (`kid`, the file
/// `{kid}.jwk` in the auth server's key directory) and whose payload holds `root`, `publish` or
/// `subscribe` (`["**"]`: everything under the root) and `exp`: nothing else, since the relay refuses a claim it
/// does not know.
pub struct MoqRelay;

fn b64(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

impl MoqRelay {
    /// A kid is a file name in the key directory: letters, digits, dash and underscore.
    fn kid_ok(kid: &str) -> bool {
        !kid.is_empty() && kid.len() <= 128 && kid.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    }

    /// Whether `token` was signed by `key` and is still good at `now`: its claims, for tests and for anyone
    /// checking what this app signs.
    pub fn verify(key: &RelayKey, token: &str, now: DateTime<Utc>) -> Result<Value> {
        let body = Self::signed(key, token)?;
        // moq's own tokens may carry no expiry (the relay then keeps the session until the connection ends); Live's always do.
        if body.get("exp").is_some_and(|e| e.as_i64().is_none_or(|e| e <= now.timestamp())) {
            return Err(Error::invalid("expired"));
        }
        Ok(body)
    }

    /// The claims of a token `key` signed, whatever its expiry.
    fn signed(key: &RelayKey, token: &str) -> Result<Value> {
        let parts: Vec<&str> = token.split('.').collect();
        let [header, claims, signature] = parts[..] else { return Err(Error::invalid("not a token")) };
        let mut mac = Hmac::<Sha256>::new_from_slice(&key.secret).map_err(|_| Error::invalid("bad key"))?;
        mac.update(format!("{header}.{claims}").as_bytes());
        let sig = URL_SAFE_NO_PAD.decode(signature).map_err(|_| Error::invalid("not a token"))?;
        mac.verify_slice(&sig).map_err(|_| Error::invalid("signature does not match"))?;
        let head: Value =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(header).map_err(|_| Error::invalid("not a token"))?).map_err(|_| Error::invalid("not a token"))?;
        if head["alg"] != "HS256" || head["kid"] != key.kid.as_str() {
            return Err(Error::invalid("another key"));
        }
        let body: Value =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(claims).map_err(|_| Error::invalid("not a token"))?).map_err(|_| Error::invalid("not a token"))?;
        Ok(body)
    }
}

#[async_trait]
impl Relay for MoqRelay {
    fn parse_key(&self, material: &str) -> Result<RelayKey> {
        // `moq auth generate` writes the JWK as base64url of its JSON (and reads either form); so does this.
        let material = material.trim();
        let json = if material.starts_with('{') {
            material.to_string()
        } else {
            URL_SAFE_NO_PAD.decode(material.trim_end_matches('=')).ok().and_then(|b| String::from_utf8(b).ok()).unwrap_or_default()
        };
        let jwk: Value = serde_json::from_str(&json).map_err(|_| Error::field("key", "a JWK, as JSON or as the base64url text moq auth generate writes"))?;
        if jwk["kty"] != "oct" || jwk["alg"] != "HS256" {
            return Err(Error::field("key", "a symmetric key (kty oct, alg HS256): generate it with moq auth generate"));
        }
        if jwk["key_ops"].as_array().is_some_and(|ops| !ops.iter().any(|o| o == "sign")) {
            return Err(Error::field("key", "this key may not sign"));
        }
        let kid = jwk["kid"].as_str().unwrap_or_default();
        if !Self::kid_ok(kid) {
            return Err(Error::field("key", "a key with a kid (letters, digits, dash, underscore): the relay finds its file by it"));
        }
        let secret = URL_SAFE_NO_PAD
            .decode(jwk["k"].as_str().unwrap_or_default().trim_end_matches('='))
            .map_err(|_| Error::field("key", "the key's k is not base64url"))?;
        if secret.len() < 32 {
            return Err(Error::field("key", "the key's secret must be at least 32 bytes"));
        }
        Ok(RelayKey { kid: kid.into(), secret })
    }

    fn token(&self, key: &RelayKey, pass: &Pass) -> Result<String> {
        let header = json!({"alg": "HS256", "typ": "JWT", "kid": key.kid});
        let grant = match pass.access {
            Access::Publish => "publish",
            Access::Watch => "subscribe",
        };
        // `sub` is read and ignored by moq's own auth server; Live's answers by it.
        let claims = json!({"root": pass.root, grant: ["**"], "exp": pass.expires.timestamp(), "sub": pass.subject});
        let unsigned = format!("{}.{}", b64(header.to_string().as_bytes()), b64(claims.to_string().as_bytes()));
        let mut mac = Hmac::<Sha256>::new_from_slice(&key.secret).map_err(|_| Error::internal("bad key"))?;
        mac.update(unsigned.as_bytes());
        Ok(format!("{unsigned}.{}", b64(&mac.finalize().into_bytes())))
    }

    fn read(&self, key: &RelayKey, token: &str) -> Result<Pass> {
        let c = Self::signed(key, token)?;
        let all = json!(["**"]);
        let access = match (c.get("publish"), c.get("subscribe")) {
            (Some(p), None) if *p == all => Access::Publish,
            (None, Some(s)) if *s == all => Access::Watch,
            _ => return Err(Error::invalid("not a pass of this app")),
        };
        let (Some(root), Some(subject), Some(exp)) = (c["root"].as_str(), c["sub"].as_str(), c["exp"].as_i64()) else {
            return Err(Error::invalid("not a pass of this app"));
        };
        let expires = DateTime::from_timestamp(exp, 0).ok_or_else(|| Error::invalid("not a pass of this app"))?;
        Ok(Pass { root: root.into(), access, subject: subject.into(), expires })
    }

    fn connect_url(&self, relay: &str, path: &str, token: &str) -> String {
        format!("{}/{path}?jwt={token}", relay.trim_end_matches('/'))
    }

    fn element(&self, access: Access) -> Element {
        match access {
            Access::Watch => Element { tag: "moq-watch", url_attr: "url", name_attr: "name", child: "canvas", attrs: &[] },
            Access::Publish => Element { tag: "moq-publish", url_attr: "url", name_attr: "name", child: "video", attrs: &[("source", "camera")] },
        }
    }

    /// `GET /health`: `200 ok`, unauthenticated, the relay's own liveness answer.
    async fn health(&self, k: &Kernel, url: &str) -> Result<()> {
        // The operator's own relay, usually beside Ferrum: private addresses allowed.
        let (client, parsed) = k.vetted_client(url, true, Duration::from_secs(5), "Ferrum Live").await?;
        let res = client.get(parsed).send().await.map_err(|e| Error::Unavailable(format!("the relay does not answer: {e}")))?;
        if res.status().is_success() { Ok(()) } else { Err(Error::Unavailable(format!("the relay answered {}", res.status()))) }
    }
}

// ───────────────────────────── the fake ─────────────────────────────

/// A relay for tests: tokens that name what they allow and can be read back, a health answer a test sets.
#[derive(Default)]
pub struct FakeRelay {
    pub minted: Mutex<Vec<(String, Access, DateTime<Utc>)>>,
    pub up: Mutex<bool>,
}

impl FakeRelay {
    pub fn new() -> Self {
        Self { minted: Mutex::new(vec![]), up: Mutex::new(true) }
    }
}

#[async_trait]
impl Relay for FakeRelay {
    fn parse_key(&self, material: &str) -> Result<RelayKey> {
        let kid = material.trim();
        if kid.is_empty() || kid.contains(' ') {
            return Err(Error::field("key", "a key name"));
        }
        Ok(RelayKey { kid: kid.into(), secret: vec![] })
    }

    fn token(&self, key: &RelayKey, pass: &Pass) -> Result<String> {
        self.minted.lock().map_err(|_| Error::internal("poisoned"))?.push((pass.root.clone(), pass.access, pass.expires));
        let word = if pass.access == Access::Publish { "publish" } else { "watch" };
        Ok(format!("fake.{}.{word}.{}.{}.{}", key.kid, pass.root, pass.expires.timestamp(), pass.subject))
    }

    /// `fake.{kid}.{publish|watch}.{root}.{exp}.{subject}`: the fake's "signature" is the key's name.
    fn read(&self, key: &RelayKey, token: &str) -> Result<Pass> {
        let bad = || Error::invalid("not a pass of this app");
        let [fake, kid, word, root, exp, subject] = token.split('.').collect::<Vec<_>>()[..] else { return Err(bad()) };
        if fake != "fake" || kid != key.kid {
            return Err(Error::invalid("signature does not match"));
        }
        let access = match word {
            "publish" => Access::Publish,
            "watch" => Access::Watch,
            _ => return Err(bad()),
        };
        let expires = exp.parse().ok().and_then(|e| DateTime::from_timestamp(e, 0)).ok_or_else(bad)?;
        Ok(Pass { root: root.into(), access, subject: subject.into(), expires })
    }

    fn connect_url(&self, relay: &str, path: &str, token: &str) -> String {
        format!("{}/{path}?t={token}", relay.trim_end_matches('/'))
    }

    fn element(&self, access: Access) -> Element {
        match access {
            Access::Watch => Element { tag: "fake-watch", url_attr: "src", name_attr: "name", child: "", attrs: &[] },
            Access::Publish => Element { tag: "fake-publish", url_attr: "src", name_attr: "name", child: "", attrs: &[("source", "camera")] },
        }
    }

    async fn health(&self, _k: &Kernel, _url: &str) -> Result<()> {
        if *self.up.lock().map_err(|_| Error::internal("poisoned"))? { Ok(()) } else { Err(Error::Unavailable("the relay does not answer".into())) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    /// A key and a token `@moq/auth` (JavaScript) made, copied from moq's own tests (`rs/moq-auth/src/key.rs`).
    const JS_KEY: &str = r#"{"kty":"oct","alg":"HS256","k":"xm6xsSkfFqzPU3KfcbAcF2_h0OkStxQ_nNqVPYl0ync","kid":"js-test-key","key_ops":["sign","verify"],"guest":[],"guest_sub":[],"guest_pub":[]}"#;
    const JS_TOKEN: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImpzLXRlc3Qta2V5In0.eyJyb290IjoibGl2ZSIsInB1Ymxpc2giOlsiY2FtZXJhMSJdLCJzdWJzY3JpYmUiOlsiY2FtZXJhMSIsImNhbWVyYTIiXSwiaWF0IjoxNzc1MTc2NzU0fQ.DxrRkpYDd7Cc215qstY4RfnB7hRvc8RG61YWO4UwyWg";

    #[test]
    fn a_token_moq_signed_verifies_here_and_ours_has_the_same_shape() {
        let key = MoqRelay.parse_key(JS_KEY).unwrap();
        assert_eq!(key.kid, "js-test-key");
        // The form `moq auth generate` writes: base64url of the JSON.
        assert_eq!(MoqRelay.parse_key(&format!("{}\n", URL_SAFE_NO_PAD.encode(JS_KEY))).unwrap().kid, "js-test-key");
        let theirs = MoqRelay::verify(&key, JS_TOKEN, Utc::now()).expect("the same signature scheme");
        assert_eq!(theirs["root"], "live");
        let (now, one_hour) = (Utc::now(), Duration::hours(1));
        let pass = |access| Pass { root: "live/t/b".into(), access, subject: "u:someone".into(), expires: now + one_hour };
        let ours = MoqRelay.token(&key, &pass(Access::Watch)).unwrap();
        let (head, claims, _) = {
            let p: Vec<&str> = ours.split('.').collect();
            (p[0].to_string(), p[1].to_string(), p[2].to_string())
        };
        assert_eq!(
            serde_json::from_slice::<Value>(&URL_SAFE_NO_PAD.decode(head).unwrap()).unwrap(),
            json!({"alg": "HS256", "typ": "JWT", "kid": "js-test-key"})
        );
        // Nothing but what moq reads: a root, one grant over everything under it, the expiry, and whose it is (`sub`,
        // which moq reads and ignores; any other claim it refuses).
        assert_eq!(
            serde_json::from_slice::<Value>(&URL_SAFE_NO_PAD.decode(claims).unwrap()).unwrap(),
            json!({"root": "live/t/b", "subscribe": ["**"], "exp": (now + one_hour).timestamp(), "sub": "u:someone"})
        );
        let published = MoqRelay.token(&key, &pass(Access::Publish)).unwrap();
        let body = MoqRelay::verify(&key, &published, now).unwrap();
        assert!(body.get("publish").is_some() && body.get("subscribe").is_none(), "a presenter's token only publishes");
        assert!(MoqRelay::verify(&key, &ours, now + Duration::hours(2)).is_err(), "expired");
        let other = MoqRelay.parse_key(&JS_KEY.replace("xm6xsSkfFqzPU3KfcbAcF2_h0OkStxQ_nNqVPYl0ync", "Fp8kipWUJeUFqeSqWym_tRC_tyI8z-QpqopIGrbrD68")).unwrap();
        assert!(MoqRelay::verify(&other, &ours, now).is_err(), "another secret");
        assert_eq!(MoqRelay.connect_url("https://relay.example.com/", "live/t/b", "T"), "https://relay.example.com/live/t/b?jwt=T");
    }

    #[test]
    fn a_pass_reads_back_as_one_subject_one_path_one_right_and_nothing_else_passes() {
        let key = MoqRelay.parse_key(JS_KEY).unwrap();
        let past = Utc::now() - Duration::minutes(5);
        let pass = Pass { root: "live/t/b".into(), access: Access::Publish, subject: "l:link".into(), expires: past };
        let token = MoqRelay.token(&key, &pass).unwrap();
        // Read whatever its expiry (the relay asks again long after a pass was used to connect)…
        assert_eq!(MoqRelay.read(&key, &token).unwrap(), Pass { expires: DateTime::from_timestamp(past.timestamp(), 0).unwrap(), ..pass });
        // …but never under another secret, nor when a byte changed, nor moq's own token (no subject, its own grants).
        let other = MoqRelay.parse_key(&JS_KEY.replace("xm6xsSkfFqzPU3KfcbAcF2_h0OkStxQ_nNqVPYl0ync", "Fp8kipWUJeUFqeSqWym_tRC_tyI8z-QpqopIGrbrD68")).unwrap();
        assert!(MoqRelay.read(&other, &token).is_err());
        let mut forged = token.clone().into_bytes();
        let i = token.find('.').unwrap() + 3;
        forged[i] = if forged[i] == b'A' { b'B' } else { b'A' };
        assert!(MoqRelay.read(&key, &String::from_utf8(forged).unwrap()).is_err());
        assert!(MoqRelay.read(&key, JS_TOKEN).is_err(), "a token granting both, or naming nobody, is not a pass");
        // A pass with both grants, made by hand and signed with the key, is refused too.
        let both = format!(
            "{}.{}",
            b64(br#"{"alg":"HS256","typ":"JWT","kid":"js-test-key"}"#),
            b64(br#"{"root":"live/t/b","publish":["**"],"subscribe":["**"],"exp":9999999999,"sub":"u:x"}"#)
        );
        let mut mac = Hmac::<Sha256>::new_from_slice(&key.secret).unwrap();
        mac.update(both.as_bytes());
        assert!(MoqRelay.read(&key, &format!("{both}.{}", b64(&mac.finalize().into_bytes()))).is_err());
    }

    #[test]
    fn the_relays_question_and_the_answer_have_moqs_shape() {
        let asked = MoqRelay.asked(&json!({"id": "s1", "event": "connect", "path": "/live/t/b", "query": "jwt=T1&x=y", "transport": "webtransport"})).unwrap();
        assert_eq!(asked, Asked { event: Event::Connect, token: "T1".into(), path: "live/t/b".into() });
        assert_eq!(MoqRelay.asked(&json!({"event": "revalidate", "path": "live/t/b", "token": "T2"})).unwrap().token, "T2");
        assert_eq!(MoqRelay.asked(&json!({"event": "revalidate", "path": "live/t/b", "query": {"jwt": "T3"}})).unwrap().event, Event::Revalidate);
        assert_eq!(MoqRelay.asked(&json!({"event": "end", "path": "live/t/b"})).unwrap().event, Event::End);
        assert!(matches!(MoqRelay.asked(&json!({"event": "connect", "path": "live/t/b"})), Err(Error::Forbidden(_))), "no pass, no session");
        assert!(MoqRelay.asked(&json!({"event": "subscribe"})).is_err());
        let until = Utc::now() + Duration::minutes(10);
        let pass = |access| Pass { root: "live/t/b".into(), access, subject: "b:seat".into(), expires: until };
        assert_eq!(
            MoqRelay.grant(&pass(Access::Watch), until, 30),
            json!({"root": "live/t/b", "subscribe": ["**"], "expires": until.timestamp(), "revalidate": 30})
        );
        assert_eq!(
            MoqRelay.grant(&pass(Access::Publish), until, 30),
            json!({"root": "live/t/b", "publish": ["**"], "expires": until.timestamp(), "revalidate": 30})
        );
    }

    #[test]
    fn keys_the_relay_could_not_use_are_refused_in_words() {
        let bad = |k: &str| MoqRelay.parse_key(k).unwrap_err().to_string();
        assert!(bad("not json").contains("JWK"));
        assert!(bad(&JS_KEY.replace("HS256", "ES256")).contains("symmetric"));
        assert!(bad(&JS_KEY.replace(r#""kid":"js-test-key""#, r#""kid":"../x""#)).contains("kid"));
        assert!(bad(&JS_KEY.replace(r#""kid":"js-test-key","#, "")).contains("kid"));
        assert!(bad(&JS_KEY.replace("xm6xsSkfFqzPU3KfcbAcF2_h0OkStxQ_nNqVPYl0ync", "c2hvcnQ")).contains("32 bytes"));
        assert!(bad(&JS_KEY.replace(r#"["sign","verify"]"#, r#"["verify"]"#)).contains("may not sign"));
        assert!(!format!("{:?}", MoqRelay.parse_key(JS_KEY).unwrap()).contains("xm6x"), "the secret does not print");
        // One name, two secrets: what Set Signing Key refuses, since the relay holds one file a name.
        let same = MoqRelay.parse_key(JS_KEY).unwrap();
        let other = MoqRelay.parse_key(&JS_KEY.replace("xm6xsSkfFqzPU3KfcbAcF2_h0OkStxQ_nNqVPYl0ync", "Fp8kipWUJeUFqeSqWym_tRC_tyI8z-QpqopIGrbrD68")).unwrap();
        assert!(same.same_secret(&MoqRelay.parse_key(JS_KEY).unwrap()) && !same.same_secret(&other) && same.kid == other.kid);
    }
}
