use crate::{connections::Connections, runtime::Runtime};
use std::sync::{Arc, Mutex};
pub struct AppState {
    pub runtime: Result<Arc<Runtime>, String>,
    pub connections: Arc<Connections>,
    pub client: reqwest::Client,
    pub oauth_cancel: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    pub pending_oauth: Mutex<Option<crate::oauth::tokens::Tokens>>,
    pub oauth_gate: tokio::sync::Mutex<()>,
}
impl AppState {
    pub fn runtime(&self) -> Result<Arc<Runtime>, crate::error::AppError> {
        self.runtime.as_ref().cloned().map_err(|_| {
            crate::error::AppError::new(
                "UNAVAILABLE",
                "The runtime is unavailable. Restart the application.",
            )
        })
    }
}
pub async fn call(
    runtime: Arc<Runtime>,
    method: &'static str,
    params: serde_json::Value,
    seconds: u64,
) -> Result<serde_json::Value, crate::error::AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        runtime.call(method, params, std::time::Duration::from_secs(seconds))
    })
    .await
    .map_err(|_| crate::error::AppError::internal())?
}
