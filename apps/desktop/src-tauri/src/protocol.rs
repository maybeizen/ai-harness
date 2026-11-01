use crate::error::AppError;
use serde::{Deserialize, Serialize};
use serde_json::Value;
pub const VERSION: u64 = 2;
pub const MAX_BYTES: u64 = 1048576;
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Response {
    pub version: u64,
    pub id: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<AppError>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "lowercase", deny_unknown_fields)]
pub enum StreamEvent {
    Text {
        #[serde(rename = "generationId")]
        generation_id: String,
        #[serde(rename = "conversationId")]
        conversation_id: String,
        sequence: u64,
        text: String,
    },
    Done {
        #[serde(rename = "generationId")]
        generation_id: String,
        #[serde(rename = "conversationId")]
        conversation_id: String,
        sequence: u64,
        status: String,
    },
    Error {
        #[serde(rename = "generationId")]
        generation_id: String,
        #[serde(rename = "conversationId")]
        conversation_id: String,
        sequence: u64,
        error: AppError,
    },
}
impl StreamEvent {
    pub fn identity(&self) -> (&str, &str, u64, bool) {
        match self {
            Self::Text {
                generation_id,
                conversation_id,
                sequence,
                ..
            } => (generation_id, conversation_id, *sequence, false),
            Self::Done {
                generation_id,
                conversation_id,
                sequence,
                ..
            }
            | Self::Error {
                generation_id,
                conversation_id,
                sequence,
                ..
            } => (generation_id, conversation_id, *sequence, true),
        }
    }
}
pub fn validate(line: &str, id: &str) -> Result<Response, String> {
    let response: Response =
        serde_json::from_str(line).map_err(|_| "Malformed runtime response")?;
    if response.version != VERSION || response.id != id {
        return Err("Runtime protocol mismatch".into());
    }
    if !response.ok || response.error.is_some() {
        return Err("Runtime request rejected".into());
    }
    if response.result.as_ref()
        != Some(&serde_json::json!({"status":"ready","protocol":VERSION,"storage":"ready"}))
    {
        return Err("Invalid runtime health payload".into());
    }
    Ok(response)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_correlation_version_and_payload() {
        let line = r#"{"version":2,"id":"a","ok":true,"result":{"status":"ready","protocol":2,"storage":"ready"}}"#;
        assert!(validate(line, "a").is_ok());
        assert!(validate(line, "b").is_err());
        assert!(validate(&line.replace("\"version\":2", "\"version\":1"), "a").is_err());
        assert!(validate("{", "a").is_err());
    }
}
