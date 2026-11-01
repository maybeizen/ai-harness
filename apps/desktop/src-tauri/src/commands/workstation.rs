use crate::{
    error::AppError,
    protocol,
    state::{call, AppState},
};
use serde::Deserialize;
use serde_json::Value;
#[derive(Deserialize)]
#[serde(tag = "action", deny_unknown_fields)]
enum WorkstationRequest {
    #[serde(rename = "audit")]
    Audit {
        #[serde(default)]
        limit: Option<u16>,
        #[serde(default)]
        before: Option<u64>,
    },
    #[serde(rename = "context.list")]
    ContextList { kind: String },
    #[serde(rename = "context.save")]
    ContextSave { record: ContextRecord },
    #[serde(rename = "context.remove")]
    ContextRemove { id: String },
    #[serde(rename = "mcp.status")]
    McpStatus,
    #[serde(rename = "mcp.save")]
    McpSave { config: McpConfig },
    #[serde(rename = "mcp.enable")]
    McpEnable { id: String, enabled: bool },
    #[serde(rename = "mcp.connect")]
    McpConnect {
        id: String,
        #[serde(default)]
        approved: Option<bool>,
    },
    #[serde(rename = "mcp.disconnect")]
    McpDisconnect { id: String },
    #[serde(rename = "mcp.discover")]
    McpDiscover { id: String },
    #[serde(rename = "diagnostics")]
    Diagnostics,
    #[serde(rename = "retention.preview")]
    RetentionPreview {
        #[serde(rename = "activeConversationId")]
        active_conversation_id: Option<String>,
    },
    #[serde(rename = "retention.apply")]
    RetentionApply {
        confirmed: bool,
        #[serde(rename = "activeConversationId")]
        active_conversation_id: Option<String>,
    },
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ContextRecord {
    id: String,
    kind: String,
    scope: String,
    workspace_id: Option<String>,
    title: String,
    body: String,
    enabled: bool,
}
#[derive(Deserialize)]
#[serde(tag = "transport", deny_unknown_fields)]
enum McpConfig {
    #[serde(rename = "http")]
    Http {
        id: String,
        name: String,
        enabled: bool,
        #[serde(default, rename = "credentialRef")]
        credential_ref: Option<String>,
        #[serde(default, rename = "timeoutMs")]
        timeout_ms: Option<u64>,
        url: String,
    },
    #[serde(rename = "stdio")]
    Stdio {
        id: String,
        name: String,
        enabled: bool,
        #[serde(default, rename = "credentialRef")]
        credential_ref: Option<String>,
        #[serde(default, rename = "timeoutMs")]
        timeout_ms: Option<u64>,
        command: String,
        #[serde(default)]
        args: Vec<String>,
        #[serde(rename = "workspaceId")]
        workspace_id: String,
    },
}
fn invalid() -> AppError {
    AppError::new("INVALID_REQUEST", "The workstation request is invalid.")
}
fn uuid(value: &str) -> bool {
    uuid::Uuid::parse_str(value).is_ok()
}
fn conversation(value: &Option<String>) -> bool {
    value
        .as_ref()
        .is_none_or(|id| (1..=128).contains(&id.chars().count()))
}
fn valid_record(record: &ContextRecord) -> bool {
    let scope_ok = match record.scope.as_str() {
        "global" => record.workspace_id.is_none(),
        "workspace" => record.workspace_id.as_ref().is_some_and(|id| uuid(id)),
        _ => false,
    };
    let _ = record.enabled;
    uuid(&record.id)
        && matches!(record.kind.as_str(), "rule" | "skill" | "prompt")
        && scope_ok
        && (1..=80).contains(&record.title.trim().chars().count())
        && record.body.chars().count() <= 8000
        && !record.body.contains('\0')
}
fn bounded(value: &str, max: usize) -> bool {
    !value.contains('\0') && value.chars().count() <= max
}
fn mcp_timeout(value: Option<u64>) -> bool {
    value.is_none_or(|timeout| (1000..=60000).contains(&timeout))
}
fn mcp_identity(id: &str, name: &str, credential: &Option<String>, timeout: Option<u64>) -> bool {
    uuid(id)
        && (1..=80).contains(&name.trim().chars().count())
        && credential.as_ref().is_none_or(|item| uuid(item))
        && mcp_timeout(timeout)
}
fn mcp_endpoint(value: &str) -> bool {
    if !bounded(value, 2048) {
        return false;
    }
    let Ok(url) = url::Url::parse(value) else {
        return false;
    };
    let host = url.host_str().unwrap_or("");
    let local = matches!(host, "localhost" | "127.0.0.1" | "::1");
    url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && (url.scheme() == "https" || (url.scheme() == "http" && local))
}
fn valid_mcp(config: &McpConfig) -> bool {
    match config {
        McpConfig::Http {
            id,
            name,
            enabled,
            credential_ref,
            timeout_ms,
            url,
        } => {
            let _ = enabled;
            mcp_identity(id, name, credential_ref, *timeout_ms) && mcp_endpoint(url)
        }
        McpConfig::Stdio {
            id,
            name,
            enabled,
            credential_ref,
            timeout_ms,
            command,
            args,
            workspace_id,
        } => {
            let _ = enabled;
            mcp_identity(id, name, credential_ref, *timeout_ms)
                && uuid(workspace_id)
                && (1..=4096).contains(&command.chars().count())
                && bounded(command, 4096)
                && args.len() <= 32
                && args.iter().all(|arg| bounded(arg, 4096))
        }
    }
}
pub fn validate_workstation(operation: &Value) -> Result<(), AppError> {
    let request =
        serde_json::from_value::<WorkstationRequest>(operation.clone()).map_err(|_| invalid())?;
    let valid = match request {
        WorkstationRequest::Audit { limit, before } => {
            limit.is_none_or(|value| (1..=200).contains(&value))
                && before.is_none_or(|value| value > 0)
        }
        WorkstationRequest::ContextList { kind } => {
            matches!(kind.as_str(), "rule" | "skill" | "prompt")
        }
        WorkstationRequest::ContextSave { record } => valid_record(&record),
        WorkstationRequest::ContextRemove { id } => uuid(&id),
        WorkstationRequest::McpStatus | WorkstationRequest::Diagnostics => true,
        WorkstationRequest::McpSave { config } => valid_mcp(&config),
        WorkstationRequest::McpEnable { id, enabled } => {
            let _ = enabled;
            uuid(&id)
        }
        WorkstationRequest::McpConnect { id, approved } => {
            uuid(&id) && approved.is_none_or(|value| value)
        }
        WorkstationRequest::McpDisconnect { id } | WorkstationRequest::McpDiscover { id } => {
            uuid(&id)
        }
        WorkstationRequest::RetentionPreview {
            active_conversation_id,
        } => conversation(&active_conversation_id),
        WorkstationRequest::RetentionApply {
            confirmed,
            active_conversation_id,
        } => confirmed && conversation(&active_conversation_id),
    };
    if valid {
        Ok(())
    } else {
        Err(invalid())
    }
}
#[tauri::command]
pub async fn workstation_operation(
    operation: Value,
    state: tauri::State<'_, AppState>,
) -> Result<Value, AppError> {
    if serde_json::to_vec(&operation)
        .map_err(|_| AppError::internal())?
        .len() as u64
        > protocol::MAX_BYTES - 16384
    {
        return Err(invalid());
    }
    validate_workstation(&operation)?;
    call(state.runtime()?, "workstation", operation, 15).await
}
#[cfg(test)]
#[path = "workstation_tests.rs"]
mod workstation_tests;
