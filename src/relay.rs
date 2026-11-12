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

impl std::fmt::Debug for RelayKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "RelayKey({})", self.kid)
    }
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
    /// A token for `path` (the broadcast's, exactly) that lets its holder `access` it until `expires`.
    fn token(&self, key: &RelayKey, path: &str, access: Access, expires: DateTime<Utc>) -> Result<String>;
    /// The address a client dials: the relay's address, the path and the token.
    fn connect_url(&self, relay: &str, path: &str, token: &str) -> String;
    /// The element that plays (or captures) the stream.
    fn element(&self, access: Access) -> Element;
    /// Whether the relay answers, as the server reaches it (`url` is the health address).
    async fn health(&self, k: &Kernel, url: &str) -> Result<()>;
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
        // moq's own tokens may carry no expiry (the relay then keeps the session until the connection ends); Live's always do.
        if body.get("exp").is_some_and(|e| e.as_i64().is_none_or(|e| e <= now.timestamp())) {
            return Err(Error::invalid("expired"));
        }
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

    fn token(&self, key: &RelayKey, path: &str, access: Access, expires: DateTime<Utc>) -> Result<String> {
        let header = json!({"alg": "HS256", "typ": "JWT", "kid": key.kid});
        let grant = match access {
            Access::Publish => "publish",
            Access::Watch => "subscribe",
        };
        let claims = json!({"root": path, grant: ["**"], "exp": expires.timestamp()});
        let unsigned = format!("{}.{}", b64(header.to_string().as_bytes()), b64(claims.to_string().as_bytes()));
        let mut mac = Hmac::<Sha256>::new_from_slice(&key.secret).map_err(|_| Error::internal("bad key"))?;
        mac.update(unsigned.as_bytes());
        Ok(format!("{unsigned}.{}", b64(&mac.finalize().into_bytes())))
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

    fn token(&self, key: &RelayKey, path: &str, access: Access, expires: DateTime<Utc>) -> Result<String> {
        self.minted.lock().map_err(|_| Error::internal("poisoned"))?.push((path.into(), access, expires));
        let word = if access == Access::Publish { "publish" } else { "watch" };
        Ok(format!("fake.{}.{word}.{path}.{}", key.kid, expires.timestamp()))
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
        let ours = MoqRelay.token(&key, "live/t/b", Access::Watch, now + one_hour).unwrap();
        let (head, claims, _) = {
            let p: Vec<&str> = ours.split('.').collect();
            (p[0].to_string(), p[1].to_string(), p[2].to_string())
        };
        assert_eq!(
            serde_json::from_slice::<Value>(&URL_SAFE_NO_PAD.decode(head).unwrap()).unwrap(),
            json!({"alg": "HS256", "typ": "JWT", "kid": "js-test-key"})
        );
        // Nothing but what moq reads: a root, one grant over everything under it, and the expiry.
        assert_eq!(
            serde_json::from_slice::<Value>(&URL_SAFE_NO_PAD.decode(claims).unwrap()).unwrap(),
            json!({"root": "live/t/b", "subscribe": ["**"], "exp": (now + one_hour).timestamp()})
        );
        let published = MoqRelay.token(&key, "live/t/b", Access::Publish, now + one_hour).unwrap();
        let body = MoqRelay::verify(&key, &published, now).unwrap();
        assert!(body.get("publish").is_some() && body.get("subscribe").is_none(), "a presenter's token only publishes");
        assert!(MoqRelay::verify(&key, &ours, now + Duration::hours(2)).is_err(), "expired");
        let other = MoqRelay.parse_key(&JS_KEY.replace("xm6xsSkfFqzPU3KfcbAcF2_h0OkStxQ_nNqVPYl0ync", "Fp8kipWUJeUFqeSqWym_tRC_tyI8z-QpqopIGrbrD68")).unwrap();
        assert!(MoqRelay::verify(&other, &ours, now).is_err(), "another secret");
        assert_eq!(MoqRelay.connect_url("https://relay.example.com/", "live/t/b", "T"), "https://relay.example.com/live/t/b?jwt=T");
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
    }
}
