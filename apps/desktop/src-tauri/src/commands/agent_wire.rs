use crate::{
    endpoint::{requires_api_key, validate_endpoint, OPENROUTER},
    error::AppError,
};
use serde::Deserialize;
use serde_json::{json, Value};
const TOOLS: &[&str] = &[
    "openai",
    "anthropic",
    "google",
    "xai",
    "openrouter",
    "ollama",
    "lmstudio",
    "custom",
];
fn invalid() -> AppError {
    AppError::new("INVALID_REQUEST", "Invalid agent operation.")
}
fn uuid(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 36
        && [8, 13, 18, 23]
            .into_iter()
            .all(|index| bytes[index] == b'-')
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| matches!(index, 8 | 13 | 18 | 23) || byte.is_ascii_hexdigit())
}
fn path_ok(path: &str) -> bool {
    !path.is_empty() && path.len() <= 4096 && !path.contains('\0') && !path.contains("..")
}
fn hash_ok(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Decision {
    id: String,
    request_hash: String,
    decision: String,
}
#[derive(Deserialize)]
#[serde(tag = "action", deny_unknown_fields)]
enum AgentCall {
    #[serde(rename = "poll")]
    Poll {
        id: String,
        #[serde(default)]
        after: u64,
    },
    #[serde(rename = "list")]
    List,
    #[serde(rename = "cancel")]
    Cancel { id: String },
    #[serde(rename = "approve")]
    Approve { decision: Decision },
    #[serde(rename = "patch.list")]
    PatchList {
        #[serde(rename = "workspaceId")]
        workspace_id: String,
    },
    #[serde(rename = "patch.read")]
    PatchRead {
        #[serde(rename = "workspaceId")]
        workspace_id: String,
        path: String,
    },
    #[serde(rename = "patch.accept")]
    PatchAccept {
        #[serde(rename = "workspaceId")]
        workspace_id: String,
        path: String,
    },
    #[serde(rename = "patch.rollback")]
    PatchRollback {
        #[serde(rename = "workspaceId")]
        workspace_id: String,
        path: String,
        confirmed: bool,
    },
}
pub fn start_payload(
    action: &str,
    id: &str,
    connection_id: &str,
    model_id: &str,
    credential: &str,
    base_url: Option<&str>,
) -> Result<Value, AppError> {
    if !matches!(action, "start" | "resume")
        || !uuid(id)
        || !TOOLS.contains(&connection_id)
        || model_id.is_empty()
        || model_id.len() > 256
        || credential.len() > 16384
    {
        return Err(AppError::new(
            "UNSUPPORTED_MODEL",
            "Select an API connection with tool-calling support for this workflow.",
        ));
    }
    if credential.is_empty() && requires_api_key(connection_id) {
        return Err(AppError::auth());
    }
    let mut body = json!({
        "action": action,
        "id": id,
        "connectionId": connection_id,
        "modelId": model_id,
        "credential": credential,
    });
    if matches!(
        connection_id,
        "openrouter" | "ollama" | "lmstudio" | "custom"
    ) {
        if let Some(url) = base_url.map(str::trim).filter(|value| !value.is_empty()) {
            let valid = validate_endpoint(url)?;
            if connection_id == "openrouter" && valid != OPENROUTER {
                return Err(AppError::new(
                    "INVALID_REQUEST",
                    "OpenRouter uses its official endpoint.",
                ));
            }
            body["baseURL"] = json!(valid);
        } else if connection_id == "custom" {
            return Err(AppError::new(
                "INVALID_REQUEST",
                "Enter an HTTP or HTTPS endpoint without credentials.",
            ));
        }
    }
    Ok(body)
}
pub fn validate_agent_operation(operation: &Value) -> Result<(), AppError> {
    let request = serde_json::from_value::<AgentCall>(operation.clone()).map_err(|_| invalid())?;
    let valid = match request {
        AgentCall::Poll { id, after } => uuid(&id) && after <= u64::from(u32::MAX),
        AgentCall::List => true,
        AgentCall::Cancel { id } => uuid(&id),
        AgentCall::Approve { decision } => {
            uuid(&decision.id)
                && hash_ok(&decision.request_hash)
                && matches!(decision.decision.as_str(), "allow" | "deny")
        }
        AgentCall::PatchList { workspace_id } => uuid(&workspace_id),
        AgentCall::PatchRead { workspace_id, path }
        | AgentCall::PatchAccept { workspace_id, path } => uuid(&workspace_id) && path_ok(&path),
        AgentCall::PatchRollback {
            workspace_id,
            path,
            confirmed,
        } => confirmed && uuid(&workspace_id) && path_ok(&path),
    };
    if valid {
        Ok(())
    } else {
        Err(invalid())
    }
}
#[cfg(test)]
#[path = "agent_wire_tests.rs"]
mod agent_wire_tests;
