use crate::{connections::IDS, error::AppError};
use serde::{Deserialize, Serialize};
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenerationInput {
    pub(crate) generation_id: String,
    pub(crate) conversation_id: String,
    pub(crate) connection_id: String,
    pub(crate) model_id: String,
    pub(crate) messages: Vec<TextMessage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) settings: Option<GenerationSettings>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenerationSettings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    reasoning_effort: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    temperature: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<u32>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TextMessage {
    id: String,
    role: String,
    text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    created_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    reasoning: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    model: Option<MessageModel>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    model_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    connection_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    parent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    attachment_ids: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<StoredToolUse>>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MessageModel {
    connection_id: String,
    model_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    name: Option<String>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StoredToolUse {
    call_id: String,
    name: String,
    status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    input: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    ok: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    output: Option<String>,
}
fn invalid() -> AppError {
    AppError::new("INVALID_REQUEST", "Invalid conversation request.")
}
fn bounded(value: &str, max: usize) -> bool {
    !value.is_empty() && value.chars().count() <= max
}
fn sha256_id(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
}
const MAX_SAFE: u64 = 9_007_199_254_740_991;
pub fn validate_generation(input: &GenerationInput) -> Result<(), AppError> {
    if !bounded(&input.generation_id, 128)
        || !bounded(&input.conversation_id, 128)
        || !bounded(&input.model_id, 256)
        || input.messages.is_empty()
        || input.messages.len() > 1000
        || input
            .messages
            .iter()
            .any(|message| validate_message(message).is_err())
        || input
            .settings
            .as_ref()
            .is_some_and(|settings| validate_settings(settings).is_err())
    {
        return Err(invalid());
    }
    Ok(())
}
fn validate_message(message: &TextMessage) -> Result<(), AppError> {
    if !bounded(&message.id, 128)
        || !["user", "assistant"].contains(&message.role.as_str())
        || message.created_at.is_some_and(|created| created > MAX_SAFE)
        || message
            .reasoning
            .as_ref()
            .is_some_and(|reasoning| reasoning.chars().count() > 65536)
        || message.status.as_ref().is_some_and(|status| {
            !["completed", "streaming", "stopped", "error"].contains(&status.as_str())
        })
        || message
            .model_name
            .as_ref()
            .is_some_and(|name| name.chars().count() > 256)
        || message
            .connection_id
            .as_ref()
            .is_some_and(|id| !IDS.contains(&id.as_str()))
        || message
            .parent_id
            .as_ref()
            .is_some_and(|parent| !bounded(parent, 128))
        || message
            .attachment_ids
            .as_ref()
            .is_some_and(|ids| ids.len() > 8 || ids.iter().any(|id| !sha256_id(id)))
        || message
            .model
            .as_ref()
            .is_some_and(|model| validate_model(model).is_err())
        || message.tools.as_ref().is_some_and(|tools| {
            tools.len() > 16 || tools.iter().any(|tool| validate_tool(tool).is_err())
        })
    {
        return Err(invalid());
    }
    Ok(())
}
fn validate_model(model: &MessageModel) -> Result<(), AppError> {
    if !IDS.contains(&model.connection_id.as_str())
        || !bounded(&model.model_id, 256)
        || model
            .name
            .as_ref()
            .is_some_and(|name| name.chars().count() > 256)
    {
        return Err(invalid());
    }
    Ok(())
}
fn validate_tool(tool: &StoredToolUse) -> Result<(), AppError> {
    if !bounded(&tool.call_id, 256)
        || !bounded(&tool.name, 64)
        || !["pending", "running", "completed", "error"].contains(&tool.status.as_str())
        || tool
            .input
            .as_ref()
            .is_some_and(|input| input.chars().count() > 32768)
        || tool
            .output
            .as_ref()
            .is_some_and(|output| output.chars().count() > 65536)
    {
        return Err(invalid());
    }
    Ok(())
}
fn validate_settings(settings: &GenerationSettings) -> Result<(), AppError> {
    if settings
        .reasoning_effort
        .as_ref()
        .is_some_and(|effort| !["minimal", "low", "medium", "high"].contains(&effort.as_str()))
        || settings.temperature.is_some_and(|temperature| {
            !temperature.is_finite() || !(0.0..=2.0).contains(&temperature)
        })
        || settings
            .max_output_tokens
            .is_some_and(|tokens| !(1..=200_000).contains(&tokens))
    {
        return Err(invalid());
    }
    Ok(())
}
#[cfg(test)]
#[path = "message_wire_tests.rs"]
mod message_wire_tests;
