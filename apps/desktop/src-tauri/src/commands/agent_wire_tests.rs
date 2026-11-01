use super::{start_payload, validate_agent_operation};
use serde_json::json;
const ID: &str = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
#[test]
fn passes_saved_base_urls_without_changing_official_connections() {
    let official = start_payload(
        "start",
        ID,
        "openai",
        "gpt-fixture",
        "secret",
        Some("https://evil.invalid/v1"),
    )
    .expect("official");
    assert!(official.get("baseURL").is_none());
    assert_eq!(official["credential"], "secret");
    let custom = start_payload(
        "start",
        ID,
        "custom",
        "local",
        "",
        Some("http://127.0.0.1:9/v1"),
    )
    .expect("custom");
    assert_eq!(custom["baseURL"], "http://127.0.0.1:9/v1");
    assert_eq!(custom["credential"], "");
    assert!(start_payload("start", ID, "custom", "local", "", None).is_err());
    assert!(start_payload(
        "start",
        ID,
        "openrouter",
        "router",
        "secret",
        Some("https://evil.invalid/v1"),
    )
    .is_err());
    let router = start_payload(
        "resume",
        ID,
        "openrouter",
        "router",
        "secret",
        Some("https://openrouter.ai/api/v1"),
    )
    .expect("router");
    assert_eq!(router["action"], "resume");
    assert_eq!(router["baseURL"], "https://openrouter.ai/api/v1");
}
#[test]
fn rejects_unconfirmed_rollback_and_renderer_credentials() {
    assert!(validate_agent_operation(&json!({
        "action": "patch.rollback",
        "workspaceId": ID,
        "path": "src/a.ts",
        "confirmed": false
    }))
    .is_err());
    assert!(validate_agent_operation(&json!({
        "action": "patch.rollback",
        "workspaceId": ID,
        "path": "../a.ts",
        "confirmed": true
    }))
    .is_err());
    assert!(validate_agent_operation(&json!({
        "action": "poll",
        "id": ID,
        "credential": "secret"
    }))
    .is_err());
    assert!(validate_agent_operation(&json!({
        "action": "patch.rollback",
        "workspaceId": ID,
        "path": "src/a.ts",
        "confirmed": true
    }))
    .is_ok());
    assert!(validate_agent_operation(&json!({ "action": "list" })).is_ok());
}
