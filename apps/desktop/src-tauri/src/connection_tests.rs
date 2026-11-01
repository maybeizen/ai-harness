use crate::{
    connections::{Connections, Record},
    credentials::SecureStore,
    error::AppError,
};
use async_trait::async_trait;
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
#[derive(Default)]
struct FakeStore {
    values: Mutex<BTreeMap<String, String>>,
    failed: AtomicBool,
}
#[async_trait]
impl SecureStore for FakeStore {
    async fn get(&self, id: &str) -> Result<String, AppError> {
        if self.failed.load(Ordering::Relaxed) {
            return Err(AppError::storage());
        }
        self.values
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or_else(AppError::auth)
    }
    async fn put(&self, id: &str, value: &str) -> Result<(), AppError> {
        if self.failed.load(Ordering::Relaxed) {
            return Err(AppError::storage());
        }
        self.values.lock().unwrap().insert(id.into(), value.into());
        Ok(())
    }
    async fn delete(&self, id: &str) -> Result<(), AppError> {
        self.values.lock().unwrap().remove(id);
        Ok(())
    }
}
fn directory() -> std::path::PathBuf {
    std::env::temp_dir().join(format!("harness-credentials-{}", uuid::Uuid::new_v4()))
}
#[tokio::test]
async fn saves_only_metadata_to_disk_and_disconnects_secure_credentials() {
    let path = directory();
    let store = Arc::new(FakeStore::default());
    let connections = Connections::new(path.clone(), store.clone()).unwrap();
    let host = connections.host_id().unwrap();
    connections
        .save(
            "openai",
            Record::default(),
            "fixture-secret-key".into(),
            false,
        )
        .await
        .unwrap();
    assert!(!std::fs::read_to_string(path.join("connections.json"))
        .unwrap()
        .contains("fixture-secret-key"));
    assert!(!connections
        .summaries()
        .unwrap()
        .to_string()
        .contains("fixture-secret-key"));
    let reopened = Connections::new(path.clone(), store.clone()).unwrap();
    assert_eq!(reopened.host_id().unwrap(), host);
    assert_eq!(
        reopened.secret("openai").await.unwrap(),
        "fixture-secret-key"
    );
    reopened.disconnect("openai").await.unwrap();
    assert!(store.get("openai").await.is_err());
    std::fs::remove_dir_all(path).unwrap();
}
#[tokio::test]
async fn failed_secure_storage_does_not_silently_fall_back() {
    let path = directory();
    let store = Arc::new(FakeStore::default());
    store.failed.store(true, Ordering::Relaxed);
    let connections = Connections::new(path.clone(), store).unwrap();
    assert_eq!(
        connections
            .save("openai", Record::default(), "fixture-key".into(), false)
            .await
            .unwrap_err()
            .code,
        "SECURE_STORAGE_UNAVAILABLE"
    );
    assert!(connections
        .summaries()
        .unwrap()
        .as_array()
        .unwrap()
        .iter()
        .all(|row| row["configured"] == false));
    connections
        .save("openai", Record::default(), "fixture-key".into(), true)
        .await
        .unwrap();
    assert_eq!(connections.secret("openai").await.unwrap(), "fixture-key");
    assert!(!std::fs::read_to_string(path.join("connections.json"))
        .unwrap()
        .contains("openai"));
    std::fs::remove_dir_all(path).unwrap();
}
#[tokio::test]
async fn keeps_legacy_provider_records_and_rejects_credential_urls() {
    let path = directory();
    std::fs::create_dir_all(&path).unwrap();
    std::fs::write(
        path.join("connections.json"),
        r#"{"host_id":"urn:uuid:fixture","records":{"openai":{"account":"account-fixture","executable":null}}}"#,
    )
    .unwrap();
    let store = Arc::new(FakeStore::default());
    store.put("openai", "fixture-secret-key").await.unwrap();
    let connections = Connections::new(path.clone(), store).unwrap();
    let client = reqwest::Client::new();
    let auth = connections.auth("openai", &client).await.unwrap();
    assert_eq!(auth["credential"], "fixture-secret-key");
    assert!(auth.get("baseURL").is_none());
    assert!(!std::fs::read_to_string(path.join("connections.json"))
        .unwrap()
        .contains("fixture-secret-key"));
    connections
        .save(
            "ollama",
            Record {
                base_url: Some("http://127.0.0.1:11434/v1".into()),
                ..Default::default()
            },
            String::new(),
            false,
        )
        .await
        .unwrap();
    let local = connections.auth("ollama", &client).await.unwrap();
    assert!(local.get("credential").is_none());
    assert_eq!(local["baseURL"], "http://127.0.0.1:11434/v1");
    assert_eq!(
        connections
            .save(
                "custom",
                Record {
                    base_url: Some("http://user:secret@127.0.0.1/v1".into()),
                    ..Default::default()
                },
                String::new(),
                false,
            )
            .await
            .unwrap_err()
            .code,
        "INVALID_REQUEST"
    );
    assert!(crate::endpoint::validate_endpoint("http://127.0.0.1:9/v1?api_key=secret").is_err());
    assert_eq!(
        crate::endpoint::prepare_base_url("openai", Some("https://evil.invalid"))
            .unwrap_err()
            .code,
        "INVALID_REQUEST"
    );
    let rows = connections.summaries().unwrap();
    let list = rows.as_array().unwrap();
    assert!(list
        .iter()
        .any(|row| row["id"] == "openai" && row["configured"] == true));
    assert!(list
        .iter()
        .any(|row| row["id"] == "ollama" && row["method"] == "endpoint"));
    std::fs::remove_dir_all(path).unwrap();
}
