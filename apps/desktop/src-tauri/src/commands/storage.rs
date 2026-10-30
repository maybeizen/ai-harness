use crate::{
    error::AppError,
    protocol,
    state::{call, AppState},
};
use serde_json::Value;

// This facade exposes only data operations. The runtime validates every field.
#[tauri::command]
pub async fn storage_operation(
    operation: Value,
    state: tauri::State<'_, AppState>,
) -> Result<Value, AppError> {
    if serde_json::to_vec(&operation)
        .map_err(|_| AppError::internal())?
        .len() as u64
        > protocol::MAX_BYTES - 16384
    {
        return Err(AppError::new(
            "INVALID_REQUEST",
            "The storage request is too large.",
        ));
    }
    call(state.runtime()?, "storage", operation, 15).await
}
