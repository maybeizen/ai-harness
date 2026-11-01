use crate::{
    error::AppError,
    protocol,
    state::{call, AppState},
};
use serde_json::{json, Value};
use tauri_plugin_dialog::DialogExt;
#[tauri::command]
pub async fn open_workspace(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Option<Value>, AppError> {
    let selected = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Open workspace")
            .blocking_pick_folder()
    })
    .await
    .map_err(|_| AppError::internal())?;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|_| AppError::new("INVALID_REQUEST", "Choose a local directory."))?;
    let result = call(
        state.runtime()?,
        "workspace",
        json!({"action":"register","path":path}),
        15,
    )
    .await?;
    Ok(Some(result))
}
#[tauri::command]
pub async fn workspace_operation(
    app: tauri::AppHandle,
    operation: Value,
    state: tauri::State<'_, AppState>,
) -> Result<Value, AppError> {
    if operation.get("action").and_then(Value::as_str) == Some("register") {
        return Err(AppError::new(
            "PERMISSION_DENIED",
            "Choose the directory with Open workspace first.",
        ));
    }
    if operation.get("action").and_then(Value::as_str) == Some("git.sides") {
        let path = operation.get("path").and_then(Value::as_str).unwrap_or("");
        if path.is_empty()
            || path.len() > 4096
            || path.contains('\0')
            || path.contains("..")
            || path.contains(':')
        {
            return Err(AppError::new(
                "INVALID_REQUEST",
                "Choose a file inside the workspace.",
            ));
        }
    }
    if serde_json::to_vec(&operation)
        .map_err(|_| AppError::internal())?
        .len() as u64
        > protocol::MAX_BYTES - 16384
    {
        return Err(AppError::new(
            "INVALID_REQUEST",
            "The workspace request is too large.",
        ));
    }
    if operation.get("action").and_then(Value::as_str) == Some("git.commit") {
        let id = operation
            .get("id")
            .and_then(Value::as_str)
            .ok_or_else(AppError::internal)?;
        let message = operation
            .get("message")
            .and_then(Value::as_str)
            .filter(|v| !v.trim().is_empty() && v.len() <= 4000)
            .ok_or_else(|| {
                AppError::new(
                    "INVALID_REQUEST",
                    "Enter a commit message under 4000 bytes.",
                )
            })?;
        let directories = call(state.runtime()?, "workspace", json!({"action":"list"}), 15).await?;
        let directory = directories
            .as_array()
            .and_then(|rows| {
                rows.iter()
                    .find(|row| row.get("id").and_then(Value::as_str) == Some(id))
            })
            .and_then(|row| row.get("path"))
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::new("NOT_FOUND", "The workspace is unavailable."))?;
        let prompt=format!("Create a local commit in {directory}?\n\n{message}\n\nThis commit will be unsigned. Git hooks will not run. Review staged changes before confirming.");
        let allowed = tauri::async_runtime::spawn_blocking(move || {
            app.dialog()
                .message(prompt)
                .title("Confirm Git commit")
                .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
                .kind(tauri_plugin_dialog::MessageDialogKind::Warning)
                .blocking_show()
        })
        .await
        .map_err(|_| AppError::internal())?;
        if !allowed {
            return Err(AppError::new(
                "PERMISSION_DENIED",
                "The commit was cancelled. No commit was created.",
            ));
        }
    }
    call(state.runtime()?, "workspace", operation, 20).await
}
