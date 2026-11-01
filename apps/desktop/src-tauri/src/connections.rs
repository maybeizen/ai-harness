use crate::{
    connection_catalog::summary,
    credentials::SecureStore,
    endpoint::{discovery_auth, requires_api_key, validate_endpoint},
    error::AppError,
    oauth::tokens::Tokens,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    fs,
    os::unix::fs::OpenOptionsExt,
    path::PathBuf,
    sync::{Arc, Mutex},
};
pub const IDS: [&str; 10] = [
    "chatgpt",
    "openai",
    "claude-client",
    "anthropic",
    "google",
    "xai",
    "openrouter",
    "ollama",
    "lmstudio",
    "custom",
];
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Record {
    pub account: Option<String>,
    pub executable: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(default = "keyed_by_default")]
    pub has_secret: bool,
}
fn keyed_by_default() -> bool {
    true
}
#[derive(Serialize, Deserialize)]
struct Metadata {
    host_id: String,
    records: BTreeMap<String, Record>,
}
pub struct Connections {
    pub store: Arc<dyn SecureStore>,
    file: PathBuf,
    metadata: Mutex<Metadata>,
    session: Mutex<BTreeMap<String, (Record, String)>>,
    pub update: tokio::sync::Mutex<()>,
}
impl Connections {
    pub fn new(directory: PathBuf, store: Arc<dyn SecureStore>) -> Result<Self, AppError> {
        fs::create_dir_all(&directory).map_err(|_| AppError::internal())?;
        let file = directory.join("connections.json");
        let metadata = if file.exists() {
            serde_json::from_slice(&fs::read(&file).map_err(|_| AppError::internal())?)
                .map_err(|_| AppError::internal())?
        } else {
            Metadata {
                host_id: format!("urn:uuid:{}", uuid::Uuid::new_v4()),
                records: BTreeMap::new(),
            }
        };
        let result = Self {
            store,
            file,
            metadata: Mutex::new(metadata),
            session: Mutex::new(BTreeMap::new()),
            update: tokio::sync::Mutex::new(()),
        };
        result.persist()?;
        Ok(result)
    }
    fn persist(&self) -> Result<(), AppError> {
        use std::io::Write;
        let metadata = self.metadata.lock().map_err(|_| AppError::internal())?;
        let temporary = self.file.with_extension("json.tmp");
        let mut file = fs::OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .mode(0o600)
            .open(&temporary)
            .map_err(|_| AppError::internal())?;
        file.write_all(&serde_json::to_vec(&*metadata).map_err(|_| AppError::internal())?)
            .map_err(|_| AppError::internal())?;
        file.sync_all().map_err(|_| AppError::internal())?;
        fs::rename(temporary, &self.file).map_err(|_| AppError::internal())
    }
    pub fn host_id(&self) -> Result<String, AppError> {
        Ok(self
            .metadata
            .lock()
            .map_err(|_| AppError::internal())?
            .host_id
            .clone())
    }
    pub fn validate(id: &str) -> Result<(), AppError> {
        if !IDS.contains(&id) {
            return Err(AppError::new("INVALID_REQUEST", "Unknown connection."));
        }
        Ok(())
    }
    pub fn summaries(&self) -> Result<Value, AppError> {
        let metadata = self.metadata.lock().map_err(|_| AppError::internal())?;
        let session = self.session.lock().map_err(|_| AppError::internal())?;
        Ok(Value::Array(
            IDS.iter()
                .map(|id| {
                    let transient = session.get(*id);
                    let record = transient
                        .map(|value| &value.0)
                        .or_else(|| metadata.records.get(*id));
                    summary(id, record, transient.is_some())
                })
                .collect(),
        ))
    }
    pub async fn save(
        &self,
        id: &str,
        record: Record,
        secret: String,
        session_only: bool,
    ) -> Result<(), AppError> {
        Self::validate(id)?;
        if secret.is_empty() && requires_api_key(id) {
            return Err(AppError::new(
                "INVALID_REQUEST",
                "Enter a valid API key for an API connection.",
            ));
        }
        let mut stored = record;
        if id == "custom" && stored.base_url.as_deref().unwrap_or("").trim().is_empty() {
            return Err(AppError::new(
                "INVALID_REQUEST",
                "Enter an HTTP or HTTPS endpoint without credentials.",
            ));
        }
        if let Some(url) = stored.base_url.clone() {
            stored.base_url = Some(validate_endpoint(&url)?);
        }
        stored.has_secret = !secret.is_empty();
        if session_only {
            self.session
                .lock()
                .map_err(|_| AppError::internal())?
                .insert(id.into(), (stored, secret));
        } else {
            if stored.has_secret {
                tokio::time::timeout(
                    std::time::Duration::from_secs(10),
                    self.store.put(id, &secret),
                )
                .await
                .map_err(|_| AppError::storage())??;
            }
            self.metadata
                .lock()
                .map_err(|_| AppError::internal())?
                .records
                .insert(id.into(), stored);
            self.persist()?;
            self.session
                .lock()
                .map_err(|_| AppError::internal())?
                .remove(id);
        }
        Ok(())
    }
    pub async fn secret(&self, id: &str) -> Result<String, AppError> {
        Self::validate(id)?;
        if let Some((_, secret)) = self
            .session
            .lock()
            .map_err(|_| AppError::internal())?
            .get(id)
        {
            return Ok(secret.clone());
        }
        tokio::time::timeout(std::time::Duration::from_secs(5), self.store.get(id))
            .await
            .map_err(|_| AppError::storage())?
    }
    pub async fn auth(&self, id: &str, client: &reqwest::Client) -> Result<Value, AppError> {
        Self::validate(id)?;
        if id == "claude-client" {
            let transient = {
                self.session
                    .lock()
                    .map_err(|_| AppError::internal())?
                    .get(id)
                    .and_then(|(record, _)| record.executable.clone())
            };
            let executable = transient
                .or_else(|| {
                    self.metadata
                        .lock()
                        .ok()?
                        .records
                        .get(id)?
                        .executable
                        .clone()
                })
                .ok_or_else(AppError::auth)?;
            return Ok(json!({"connectionId":id,"executable":executable}));
        }
        let record = self.stored(id)?;
        let in_session = self
            .session
            .lock()
            .map_err(|_| AppError::internal())?
            .contains_key(id);
        let secret = if in_session || record.has_secret {
            self.secret(id).await?
        } else {
            String::new()
        };
        let credential = if id == "chatgpt" {
            let mut tokens: Tokens = serde_json::from_str(&secret).map_err(|_| AppError::auth())?;
            if tokens.expires_at <= crate::oauth::tokens::now() + 60 {
                tokens.refresh(client).await?;
                let session_only = self
                    .session
                    .lock()
                    .map_err(|_| AppError::internal())?
                    .contains_key(id);
                self.save(
                    id,
                    Record {
                        account: tokens.email.clone(),
                        ..Default::default()
                    },
                    serde_json::to_string(&tokens).map_err(|_| AppError::internal())?,
                    session_only,
                )
                .await?;
            }
            tokens.access_token
        } else {
            secret
        };
        let record = self.stored(id)?;
        if credential.is_empty() && requires_api_key(id) {
            return Err(AppError::auth());
        }
        let base = match record.base_url.as_deref() {
            Some(url) => Some(validate_endpoint(url)?),
            None => None,
        };
        Ok(discovery_auth(id, &credential, base.as_deref()))
    }
    fn stored(&self, id: &str) -> Result<Record, AppError> {
        if let Some((record, _)) = self
            .session
            .lock()
            .map_err(|_| AppError::internal())?
            .get(id)
        {
            return Ok(record.clone());
        }
        self.metadata
            .lock()
            .map_err(|_| AppError::internal())?
            .records
            .get(id)
            .cloned()
            .ok_or_else(AppError::auth)
    }
    pub async fn disconnect(&self, id: &str) -> Result<(), AppError> {
        Self::validate(id)?;
        let persistent = self
            .metadata
            .lock()
            .map_err(|_| AppError::internal())?
            .records
            .get(id)
            .is_some_and(|record| id != "claude-client" && record.has_secret);
        if persistent {
            self.store.delete(id).await?;
        }
        self.session
            .lock()
            .map_err(|_| AppError::internal())?
            .remove(id);
        self.metadata
            .lock()
            .map_err(|_| AppError::internal())?
            .records
            .remove(id);
        self.persist()
    }
}
