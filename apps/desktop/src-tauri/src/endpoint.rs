use crate::error::AppError;
use serde_json::{json, Map, Value};
use url::Url;
pub const OPENROUTER: &str = "https://openrouter.ai/api/v1";
fn invalid(message: &str) -> AppError {
    AppError::new("INVALID_REQUEST", message)
}
pub fn requires_api_key(id: &str) -> bool {
    matches!(id, "openai" | "anthropic" | "google" | "xai" | "openrouter")
}
pub fn accepts_api_key(id: &str) -> bool {
    !matches!(id, "chatgpt" | "claude-client")
}
pub fn validate_endpoint(value: &str) -> Result<String, AppError> {
    let trimmed = value.trim().trim_end_matches('/');
    let url = Url::parse(trimmed).map_err(|_| invalid("Enter an HTTP or HTTPS endpoint."))?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some_and(|fragment| !fragment.is_empty())
    {
        return Err(invalid(
            "Enter an HTTP or HTTPS endpoint without credentials.",
        ));
    }
    let secret = url.query_pairs().any(|(name, _)| {
        matches!(
            name.to_ascii_lowercase().as_str(),
            "key"
                | "api_key"
                | "apikey"
                | "token"
                | "access_token"
                | "bearer"
                | "secret"
                | "credential"
                | "password"
        )
    });
    if secret {
        return Err(invalid(
            "Enter an HTTP or HTTPS endpoint without credentials.",
        ));
    }
    let mut clean = url;
    clean.set_fragment(None);
    let mut text = clean.to_string();
    if text.ends_with('/') {
        text.pop();
    }
    Ok(text)
}
pub fn prepare_base_url(id: &str, base_url: Option<&str>) -> Result<Option<String>, AppError> {
    let trimmed = base_url.map(str::trim).filter(|value| !value.is_empty());
    match id {
        "custom" => {
            let value = trimmed.unwrap_or("");
            if value.is_empty() {
                return Err(invalid(
                    "Enter an HTTP or HTTPS endpoint without credentials.",
                ));
            }
            Ok(Some(validate_endpoint(value)?))
        }
        "ollama" | "lmstudio" => match trimmed {
            Some(value) => Ok(Some(validate_endpoint(value)?)),
            None => Ok(None),
        },
        "openrouter" => {
            if let Some(value) = trimmed {
                if validate_endpoint(value)? != OPENROUTER {
                    return Err(invalid("OpenRouter uses its official endpoint."));
                }
            }
            Ok(None)
        }
        _ => {
            if trimmed.is_some() {
                return Err(invalid("This connection does not accept a base URL."));
            }
            Ok(None)
        }
    }
}
pub fn discovery_auth(id: &str, credential: &str, base_url: Option<&str>) -> Value {
    let mut body = Map::new();
    body.insert("connectionId".into(), json!(id));
    if !credential.is_empty() {
        body.insert("credential".into(), json!(credential));
    }
    if let Some(url) = base_url {
        body.insert("baseURL".into(), json!(url));
    }
    Value::Object(body)
}
