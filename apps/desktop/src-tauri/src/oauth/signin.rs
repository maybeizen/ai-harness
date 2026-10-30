use super::{
    identity,
    tokens::{self, Tokens, RESOURCE},
};
use crate::error::AppError;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::{rngs::OsRng, RngCore};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, time::Duration};
use subtle::ConstantTimeEq;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::oneshot,
};
use url::Url;
fn random() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}
pub struct Attempt {
    pub state: String,
    pub nonce: String,
    pub verifier: String,
    pub redirect: String,
    pub previous: Option<Tokens>,
}
pub struct Callback {
    pub code: String,
    pub client_id: String,
}
pub fn authorization(attempt: &Attempt, host: &str) -> Result<Url, AppError> {
    let mut url = Url::parse("https://auth.openai.com/api/accounts/authorize")
        .map_err(|_| AppError::internal())?;
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(attempt.verifier.as_bytes()));
    {
        let mut query = url.query_pairs_mut();
        query.extend_pairs([
            (
                "client_id",
                attempt
                    .previous
                    .as_ref()
                    .map_or("dynamic_agent_client", |t| t.client_id.as_str()),
            ),
            ("ext_agent_host_id", host),
            ("response_type", "code"),
            ("redirect_uri", &attempt.redirect),
            (
                "scope",
                "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
            ),
            ("resource", RESOURCE),
            ("state", &attempt.state),
            ("nonce", &attempt.nonce),
            ("code_challenge_method", "S256"),
            ("code_challenge", &challenge),
        ]);
        if let Some(previous) = &attempt.previous {
            query.append_pair("id_token_hint", &previous.id_token);
            if let Some(email) = &previous.email {
                query.append_pair("login_hint", email);
            }
        } else {
            query.append_pair("agent_name_hint", "AI Harness");
        }
    }
    Ok(url)
}
pub fn callback(target: &str, attempt: &Attempt) -> Result<Callback, AppError> {
    if !target.starts_with('/') || target.len() > 16384 {
        return Err(AppError::auth());
    }
    let url = Url::parse(&format!("http://127.0.0.1{target}")).map_err(|_| AppError::auth())?;
    if url.path() != "/auth/callback" {
        return Err(AppError::auth());
    }
    let mut params = HashMap::new();
    for (key, value) in url.query_pairs() {
        if params.insert(key.to_string(), value.to_string()).is_some() {
            return Err(AppError::auth());
        }
    }
    let state = params.get("state").ok_or_else(AppError::auth)?;
    if !bool::from(state.as_bytes().ct_eq(attempt.state.as_bytes())) {
        return Err(AppError::auth());
    }
    if params.contains_key("error") {
        return Err(AppError::new(
            "AUTH_DENIED",
            "Sign-in was declined. You can reconnect whenever you are ready.",
        ));
    }
    let client_id = params
        .get("client_id")
        .cloned()
        .or_else(|| attempt.previous.as_ref().map(|t| t.client_id.clone()))
        .ok_or_else(AppError::auth)?;
    if !client_id.starts_with("oaiapp_")
        || client_id.len() > 256
        || attempt
            .previous
            .as_ref()
            .is_some_and(|old| old.client_id != client_id)
    {
        return Err(AppError::auth());
    }
    let code = params
        .get("code")
        .filter(|v| !v.is_empty())
        .cloned()
        .ok_or_else(AppError::auth)?;
    Ok(Callback { code, client_id })
}
pub async fn sign_in(
    client: &reqwest::Client,
    host: &str,
    previous: Option<Tokens>,
    mut cancel: oneshot::Receiver<()>,
) -> Result<Tokens, AppError> {
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .await
        .map_err(|_| AppError::new("UNAVAILABLE", "The local sign-in callback could not start."))?;
    let port = listener
        .local_addr()
        .map_err(|_| AppError::internal())?
        .port();
    let attempt = Attempt {
        state: random(),
        nonce: random(),
        verifier: random(),
        redirect: format!("http://127.0.0.1:{port}/auth/callback"),
        previous,
    };
    let url = authorization(&attempt, host)?;
    open::that_detached(url.as_str()).map_err(|_| {
        AppError::new(
            "UNAVAILABLE",
            "The system browser could not open. Check your default browser configuration.",
        )
    })?;
    let receive = async {
        loop {
            let (mut stream, _) = listener.accept().await.map_err(|_| AppError::auth())?;
            let mut bytes = Vec::new();
            let mut chunk = [0; 2048];
            let read = tokio::time::timeout(Duration::from_secs(5), async {
                loop {
                    let count = stream.read(&mut chunk).await?;
                    if count == 0 {
                        break;
                    }
                    bytes.extend_from_slice(&chunk[..count]);
                    if bytes.len() > 16384 || bytes.windows(4).any(|b| b == b"\r\n\r\n") {
                        break;
                    }
                }
                Ok::<(), std::io::Error>(())
            })
            .await;
            if !matches!(read, Ok(Ok(()))) || bytes.len() > 16384 {
                continue;
            }
            let request = String::from_utf8_lossy(&bytes);
            let mut first = request
                .lines()
                .next()
                .unwrap_or_default()
                .split_whitespace();
            let method = first.next();
            let target = first.next().unwrap_or_default();
            let result = if method == Some("GET") {
                callback(target, &attempt)
            } else {
                Err(AppError::auth())
            };
            let accepted =
                result.is_ok() || result.as_ref().is_err_and(|e| e.code == "AUTH_DENIED");
            let status = if accepted {
                "200 OK"
            } else {
                "400 Bad Request"
            };
            let body = "You can return to AI Harness. This window can be closed.";
            let reply=format!("HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}",body.len());
            let _ = stream.write_all(reply.as_bytes()).await;
            if accepted {
                return result;
            }
        }
    };
    let callback = tokio::select! {_= &mut cancel=>return Err(AppError::new("CANCELLED","Sign-in cancelled.")),result=tokio::time::timeout(Duration::from_secs(300),receive)=>result.map_err(|_|AppError::new("AUTH_REQUIRED","Sign-in timed out. Please try again."))??};
    drop(listener);
    let response = tokens::exchange(
        client,
        &[
            ("grant_type", "authorization_code"),
            ("client_id", &callback.client_id),
            ("code", &callback.code),
            ("code_verifier", &attempt.verifier),
            ("redirect_uri", &attempt.redirect),
            ("resource", RESOURCE),
        ],
    )
    .await?;
    let scope = response.scope.unwrap_or_default();
    tokens::check_scope(&scope)?;
    let id_token = response.id_token.ok_or_else(AppError::auth)?;
    let info = identity::validate(
        client,
        &id_token,
        &callback.client_id,
        Some(&attempt.nonce),
        attempt.previous.as_ref().map(|t| t.subject.as_str()),
    )
    .await?;
    Ok(Tokens {
        client_id: callback.client_id,
        subject: info.sub,
        email: info.email,
        access_token: response.access_token,
        refresh_token: response.refresh_token.ok_or_else(AppError::auth)?,
        id_token,
        scopes: scope,
        expires_at: tokens::now() + response.expires_in,
    })
}
