use crate::{
    connections::Record,
    error::AppError,
    oauth::{signin, tokens::Tokens},
    state::{call, AppState},
};
use serde_json::{json, Value};
#[tauri::command]
pub async fn connect_chatgpt(
    session_only: bool,
    state: tauri::State<'_, AppState>,
) -> Result<Value, AppError> {
    let _flow = state
        .oauth_gate
        .try_lock()
        .map_err(|_| AppError::new("BUSY", "Finish or cancel the current sign-in first."))?;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    *state
        .oauth_cancel
        .lock()
        .map_err(|_| AppError::internal())? = Some(sender);
    let previous = state
        .connections
        .secret("chatgpt")
        .await
        .ok()
        .and_then(|secret| serde_json::from_str::<Tokens>(&secret).ok());
    let host = state.connections.host_id()?;
    let pending = if session_only {
        state
            .pending_oauth
            .lock()
            .map_err(|_| AppError::internal())?
            .take()
    } else {
        None
    };
    let result = if let Some(tokens) = pending {
        Ok(tokens)
    } else {
        signin::sign_in(&state.client, &host, previous, receiver).await
    };
    state
        .oauth_cancel
        .lock()
        .map_err(|_| AppError::internal())?
        .take();
    let tokens = result?;
    let _guard = state.connections.update.lock().await;
    let models = call(
        state.runtime()?,
        "models",
        json!({"connectionId":"chatgpt","credential":tokens.access_token}),
        30,
    )
    .await?;
    if !models.as_array().is_some_and(|items| !items.is_empty()) {
        return Err(AppError::new("NO_MODELS","ChatGPT returned no available models for this account. Check your plan usage permissions."));
    }
    let saved = state
        .connections
        .save(
            "chatgpt",
            Record {
                account: tokens.email.clone(),
                executable: None,
            },
            serde_json::to_string(&tokens).map_err(|_| AppError::internal())?,
            session_only,
        )
        .await;
    if let Err(error) = saved {
        if error.code == "SECURE_STORAGE_UNAVAILABLE" {
            *state
                .pending_oauth
                .lock()
                .map_err(|_| AppError::internal())? = Some(tokens);
        }
        return Err(error);
    }
    state
        .pending_oauth
        .lock()
        .map_err(|_| AppError::internal())?
        .take();
    Ok(json!({"connectionId":"chatgpt","models":models}))
}
#[tauri::command]
pub fn cancel_sign_in(state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    if let Some(sender) = state
        .oauth_cancel
        .lock()
        .map_err(|_| AppError::internal())?
        .take()
    {
        let _ = sender.send(());
    }
    Ok(())
}
