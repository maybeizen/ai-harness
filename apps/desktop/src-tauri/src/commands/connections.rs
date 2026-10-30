use crate::{
    connections::{Connections, Record},
    error::AppError,
    state::{call, AppState},
};
use serde_json::{json, Value};
#[tauri::command]
pub fn list_connections(state: tauri::State<'_, AppState>) -> Result<Value, AppError> {
    state.connections.summaries()
}
async fn discovery(state: &AppState, id: &str, auth: Value) -> Result<Value, AppError> {
    let models = call(state.runtime()?, "models", auth, 30).await?;
    if !models.as_array().is_some_and(|items| !items.is_empty()) {
        return Err(AppError::new("NO_MODELS","This account returned no supported text-chat models. Check provider access and refresh."));
    }
    Ok(json!({"connectionId":id,"models":models}))
}
#[tauri::command]
pub async fn connect_api(
    connection_id: String,
    api_key: String,
    session_only: bool,
    state: tauri::State<'_, AppState>,
) -> Result<Value, AppError> {
    Connections::validate(&connection_id)?;
    if ["chatgpt", "claude-client"].contains(&connection_id.as_str())
        || api_key.trim().is_empty()
        || api_key.len() > 16384
    {
        return Err(AppError::new(
            "INVALID_REQUEST",
            "Enter a valid API key for an API connection.",
        ));
    }
    let _guard = state.connections.update.lock().await;
    let key = api_key.trim().to_string();
    let models = discovery(
        &state,
        &connection_id,
        json!({"connectionId":connection_id,"credential":key}),
    )
    .await?;
    state
        .connections
        .save(&connection_id, Record::default(), key, session_only)
        .await?;
    Ok(models)
}
#[tauri::command]
pub async fn connect_claude(
    executable: String,
    state: tauri::State<'_, AppState>,
) -> Result<Value, AppError> {
    if executable.is_empty() || executable.len() > 4096 {
        return Err(AppError::new(
            "CLIENT_REQUIRED",
            "Enter the absolute path to your official Claude client.",
        ));
    }
    let _guard = state.connections.update.lock().await;
    let models = discovery(
        &state,
        "claude-client",
        json!({"connectionId":"claude-client","executable":executable}),
    )
    .await?;
    state
        .connections
        .save(
            "claude-client",
            Record {
                account: None,
                executable: Some(executable),
            },
            String::new(),
            false,
        )
        .await?;
    Ok(models)
}
#[tauri::command]
pub async fn refresh_connection(
    connection_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Value, AppError> {
    let _guard = state.connections.update.lock().await;
    let auth = state
        .connections
        .auth(&connection_id, &state.client)
        .await?;
    discovery(&state, &connection_id, auth).await
}
#[tauri::command]
pub async fn disconnect_connection(
    connection_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let _guard = state.connections.update.lock().await;
    state.connections.disconnect(&connection_id).await
}
