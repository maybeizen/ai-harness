use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AppError {
    pub code: String,
    pub message: String,
}
impl AppError {
    pub fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
    pub fn internal() -> Self {
        Self::new(
            "UNAVAILABLE",
            "The application could not complete this request. Check the runtime and retry.",
        )
    }
    pub fn storage() -> Self {
        Self::new("SECURE_STORAGE_UNAVAILABLE","Secure storage is missing or locked. Unlock your credential service or explicitly choose session-only use.")
    }
    pub fn auth() -> Self {
        Self::new(
            "AUTH_REQUIRED",
            "Sign in again or replace this connection's credential.",
        )
    }
}
impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}
impl std::error::Error for AppError {}
