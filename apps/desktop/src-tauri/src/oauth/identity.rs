use crate::error::AppError;
use jsonwebtoken::{decode, decode_header, jwk::JwkSet, Algorithm, DecodingKey, Validation};
use serde::Deserialize;
#[derive(Clone, Deserialize)]
pub struct Identity {
    pub sub: String,
    pub email: Option<String>,
    pub nonce: Option<String>,
}
pub async fn validate(
    client: &reqwest::Client,
    token: &str,
    client_id: &str,
    nonce: Option<&str>,
    subject: Option<&str>,
) -> Result<Identity, AppError> {
    let header = decode_header(token).map_err(|_| AppError::auth())?;
    if header.alg != Algorithm::RS256 {
        return Err(AppError::auth());
    }
    let keys: JwkSet = client
        .get("https://auth.openai.com/.well-known/jwks.json")
        .send()
        .await
        .map_err(|_| AppError::auth())?
        .error_for_status()
        .map_err(|_| AppError::auth())?
        .json()
        .await
        .map_err(|_| AppError::auth())?;
    let kid = header.kid.ok_or_else(AppError::auth)?;
    let jwk = keys.find(&kid).ok_or_else(AppError::auth)?;
    let key = DecodingKey::from_jwk(jwk).map_err(|_| AppError::auth())?;
    validate_with_key(token, client_id, nonce, subject, &key)
}
pub fn validate_with_key(
    token: &str,
    client_id: &str,
    nonce: Option<&str>,
    subject: Option<&str>,
    key: &DecodingKey,
) -> Result<Identity, AppError> {
    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_issuer(&["https://auth.openai.com"]);
    validation.set_audience(&[client_id]);
    validation.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
    let identity = decode::<Identity>(token, key, &validation)
        .map_err(|_| AppError::auth())?
        .claims;
    if identity.sub.is_empty()
        || nonce.is_some_and(|expected| identity.nonce.as_deref() != Some(expected))
        || subject.is_some_and(|expected| identity.sub != expected)
    {
        return Err(AppError::auth());
    }
    Ok(identity)
}
