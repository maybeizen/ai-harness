use super::agent_wire::{start_payload, validate_agent_operation};
use crate::{
    error::AppError,
    protocol,
    state::{call, AppState},
};
use serde_json::{json, Value};
fn saved_base(auth: &Value) -> Option<String> {
    auth.get("baseURL")
        .and_then(Value::as_str)
        .map(str::to_string)
}
async fn authorized(
    action: &str,
    id: &str,
    connection_id: &str,
    model_id: &str,
    state: &tauri::State<'_, AppState>,
) -> Result<Value, AppError> {
    let auth = {
        let _guard = state.connections.update.lock().await;
        state.connections.auth(connection_id, &state.client).await?
    };
    let credential = auth.get("credential").and_then(Value::as_str).unwrap_or("");
    start_payload(
        action,
        id,
        connection_id,
        model_id,
        credential,
        saved_base(&auth).as_deref(),
    )
}
#[tauri::command]
pub async fn start_agent(
    request: Value,
    connection_id: String,
    model_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Value, AppError> {
    let runtime = state.runtime()?;
    let reserved = call(
        runtime.clone(),
        "agent",
        json!({"action":"reserve","request":request}),
        15,
    )
    .await?;
    let id = request
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(AppError::internal)?
        .to_string();
    let result = async {
        let payload = authorized("start", &id, &connection_id, &model_id, &state).await?;
        call(runtime.clone(), "agent", payload, 15).await
    }
    .await;
    if result.is_err() {
        let _ = call(runtime, "agent", json!({"action":"cancel","id":id}), 15).await;
    }
    let _ = reserved;
    result
}
#[tauri::command]
pub async fn resume_agent(
    id: String,
    connection_id: String,
    model_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Value, AppError> {
    let payload = authorized("resume", &id, &connection_id, &model_id, &state).await?;
    call(state.runtime()?, "agent", payload, 15).await
}
#[tauri::command]
pub async fn agent_operation(
    operation: Value,
    state: tauri::State<'_, AppState>,
) -> Result<Value, AppError> {
    if serde_json::to_vec(&operation)
        .map_err(|_| AppError::internal())?
        .len() as u64
        > protocol::MAX_BYTES - 16384
    {
        return Err(AppError::new("INVALID_REQUEST", "Invalid agent operation."));
    }
    validate_agent_operation(&operation)?;
    call(state.runtime()?, "agent", operation, 20).await
}
