use crate::{
    error::AppError,
    protocol,
    state::{call, AppState},
};
use serde_json::{json, Value};
use tauri_plugin_dialog::DialogExt;
fn valid_shell(shell: &str) -> bool {
    shell.is_empty()
        || (shell.starts_with('/')
            && !shell.contains("..")
            && shell.len() <= 256
            && shell.bytes().all(|byte| {
                matches!(
                    byte,
                    b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'_' | b'.' | b'/' | b'-'
                )
            }))
}
#[tauri::command]
pub async fn create_terminal(
    app: tauri::AppHandle,
    workspace_id: String,
    shell: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Value, AppError> {
    let shell = shell.unwrap_or_default();
    if !valid_shell(&shell) {
        return Err(AppError::new(
            "INVALID_REQUEST",
            "Choose a shell by its absolute path, or leave the field empty for /bin/bash.",
        ));
    }
    uuid::Uuid::parse_str(&workspace_id)
        .map_err(|_| AppError::new("INVALID_REQUEST", "Choose a registered workspace."))?;
    let roots = call(state.runtime()?, "workspace", json!({"action":"list"}), 15).await?;
    let path = roots
        .as_array()
        .and_then(|rows| {
            rows.iter()
                .find(|root| root.get("id").and_then(Value::as_str) == Some(workspace_id.as_str()))
        })
        .and_then(|root| root.get("path"))
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::new("NOT_FOUND", "The workspace is unavailable."))?;
    let message=format!("Open a user terminal in {path}?\n\nCommands you type run with your account's filesystem and network access. This terminal is separate from agent tools and is not a filesystem sandbox. Inherited API credentials and shell startup files are not loaded. Close the terminal to terminate its processes.");
    let allowed = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message(message)
            .title("Open user terminal")
            .kind(tauri_plugin_dialog::MessageDialogKind::Warning)
            .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
            .blocking_show()
    })
    .await
    .map_err(|_| AppError::internal())?;
    if !allowed {
        return Err(AppError::new(
            "PERMISSION_DENIED",
            "The terminal was not opened.",
        ));
    }
    call(
        state.runtime()?,
        "terminal",
        json!({"action":"create","workspaceId":workspace_id,"cols":100,"rows":30,"shell":shell}),
        15,
    )
    .await
}
#[tauri::command]
pub async fn terminal_operation(
    operation: Value,
    state: tauri::State<'_, AppState>,
) -> Result<Value, AppError> {
    if operation.get("action").and_then(Value::as_str) == Some("create")
        || serde_json::to_vec(&operation)
            .map_err(|_| AppError::internal())?
            .len() as u64
            > protocol::MAX_BYTES - 16384
    {
        return Err(AppError::new(
            "INVALID_REQUEST",
            "Open a terminal using the confirmation control.",
        ));
    }
    call(state.runtime()?, "terminal", operation, 15).await
}
