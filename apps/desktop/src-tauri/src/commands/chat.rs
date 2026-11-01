use super::message_wire::{validate_generation, GenerationInput};
use crate::{
    bridge::Sink,
    error::AppError,
    protocol::{self, StreamEvent},
    state::{call, AppState},
};
use serde_json::json;
#[tauri::command]
pub async fn start_chat(
    input: GenerationInput,
    channel: tauri::ipc::Channel<StreamEvent>,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    validate_generation(&input)?;
    if serde_json::to_vec(&input)
        .map_err(|_| AppError::internal())?
        .len() as u64
        > protocol::MAX_BYTES - 16384
    {
        return Err(AppError::new(
            "INVALID_REQUEST",
            "This conversation is too large. Start a new chat.",
        ));
    }
    let auth = {
        let _guard = state.connections.update.lock().await;
        state
            .connections
            .auth(&input.connection_id, &state.client)
            .await?
    };
    let runtime = state.runtime()?;
    runtime.subscribe(
        input.generation_id.clone(),
        Sink {
            conversation: input.conversation_id.clone(),
            sequence: 0,
            channel,
        },
    )?;
    let mut params = auth;
    params
        .as_object_mut()
        .ok_or_else(AppError::internal)?
        .remove("connectionId");
    params["input"] = json!(input);
    let result = call(runtime.clone(), "generate", params, 15).await;
    if result.is_err() {
        runtime.unsubscribe(&input.generation_id);
    }
    result.map(|_| ())
}
#[tauri::command]
pub async fn cancel_chat(
    generation_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    call(
        state.runtime()?,
        "cancel",
        json!({"generationId":generation_id}),
        15,
    )
    .await
    .map(|_| ())
}
#[tauri::command]
pub fn open_external(url: String) -> Result<(), AppError> {
    let parsed =
        url::Url::parse(&url).map_err(|_| AppError::new("INVALID_REQUEST", "Invalid link."))?;
    if !["https", "http"].contains(&parsed.scheme())
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err(AppError::new(
            "INVALID_REQUEST",
            "Only HTTP and HTTPS links can be opened.",
        ));
    }
    open::that_detached(parsed.as_str())
        .map_err(|_| AppError::new("UNAVAILABLE", "The default browser could not open."))
}

#[tauri::command]
pub fn copy_text(app: tauri::AppHandle, text: String) -> Result<(), AppError> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    if text.len() > 1048576 {
        return Err(AppError::new(
            "INVALID_REQUEST",
            "This text is too large to copy.",
        ));
    }
    app.clipboard()
        .write_text(text)
        .map_err(|_| AppError::new("UNAVAILABLE", "The clipboard could not be updated."))
}
