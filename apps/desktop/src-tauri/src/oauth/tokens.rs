use super::identity;
use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
pub const RESOURCE: &str = "https://api.openai.com/v1";
#[derive(Clone, Serialize, Deserialize)]
pub struct Tokens {
    pub client_id: String,
    pub subject: String,
    pub email: Option<String>,
    pub access_token: String,
    pub refresh_token: String,
    pub id_token: String,
    pub scopes: String,
    pub expires_at: u64,
}
#[derive(Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub id_token: Option<String>,
    pub expires_in: u64,
    pub scope: Option<String>,
    pub token_type: String,
}
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
pub fn check_scope(scope: &str) -> Result<(), AppError> {
    if !scope
        .split_whitespace()
        .any(|s| s == "chatgpt.tokens.use.direct")
    {
        return Err(AppError::new("PLAN_PERMISSION_REQUIRED","ChatGPT sign-in succeeded, but plan usage was not enabled. Reconnect and grant ChatGPT plan usage."));
    }
    Ok(())
}
pub async fn exchange(
    client: &reqwest::Client,
    params: &[(&str, &str)],
) -> Result<TokenResponse, AppError> {
    let response = client
        .post("https://auth.openai.com/api/accounts/oauth/token")
        .form(params)
        .send()
        .await
        .map_err(|_| {
            AppError::new(
                "NETWORK",
                "ChatGPT authorization could not reach OpenAI. Try signing in again.",
            )
        })?;
    if !response.status().is_success() {
        return Err(AppError::auth());
    }
    let bytes = response.bytes().await.map_err(|_| AppError::auth())?;
    if bytes.len() > 65536 {
        return Err(AppError::auth());
    }
    let tokens: TokenResponse = serde_json::from_slice(&bytes).map_err(|_| AppError::auth())?;
    if !tokens.token_type.eq_ignore_ascii_case("bearer")
        || tokens.access_token.is_empty()
        || tokens.expires_in == 0
    {
        return Err(AppError::auth());
    }
    Ok(tokens)
}
impl Tokens {
    pub async fn refresh(&mut self, client: &reqwest::Client) -> Result<(), AppError> {
        let response = exchange(
            client,
            &[
                ("grant_type", "refresh_token"),
                ("client_id", &self.client_id),
                ("refresh_token", &self.refresh_token),
                ("resource", RESOURCE),
            ],
        )
        .await?;
        let scopes = response
            .scope
            .clone()
            .unwrap_or_else(|| self.scopes.clone());
        check_scope(&scopes)?;
        if let Some(id_token) = response.id_token.clone() {
            let info = identity::validate(
                client,
                &id_token,
                &self.client_id,
                None,
                Some(&self.subject),
            )
            .await?;
            self.email = info.email;
            self.id_token = id_token;
        }
        self.commit_refresh(response)
    }
    pub fn commit_refresh(&mut self, response: TokenResponse) -> Result<(), AppError> {
        let scopes = response
            .scope
            .clone()
            .unwrap_or_else(|| self.scopes.clone());
        check_scope(&scopes)?;
        self.access_token = response.access_token;
        if let Some(refresh) = response.refresh_token {
            self.refresh_token = refresh;
        }
        self.scopes = scopes;
        self.expires_at = now() + response.expires_in;
        Ok(())
    }
}
