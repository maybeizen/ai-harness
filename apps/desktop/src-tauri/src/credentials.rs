use crate::error::AppError;
use async_trait::async_trait;
use secret_service::{EncryptionType, SecretService};
use std::collections::HashMap;
#[async_trait]
pub trait SecureStore: Send + Sync {
    async fn get(&self, id: &str) -> Result<String, AppError>;
    async fn put(&self, id: &str, value: &str) -> Result<(), AppError>;
    async fn delete(&self, id: &str) -> Result<(), AppError>;
}
pub struct SecretStore;
fn attributes(id: &str) -> HashMap<&str, &str> {
    HashMap::from([
        ("application", "local.ai-harness.desktop"),
        ("connection", id),
    ])
}
#[async_trait]
impl SecureStore for SecretStore {
    async fn get(&self, id: &str) -> Result<String, AppError> {
        let service = SecretService::connect(EncryptionType::Dh)
            .await
            .map_err(|_| AppError::storage())?;
        let items = service
            .search_items(attributes(id))
            .await
            .map_err(|_| AppError::storage())?;
        let item = items.unlocked.first().ok_or_else(AppError::storage)?;
        let bytes = item.get_secret().await.map_err(|_| AppError::storage())?;
        String::from_utf8(bytes).map_err(|_| AppError::storage())
    }
    async fn put(&self, id: &str, value: &str) -> Result<(), AppError> {
        let service = SecretService::connect(EncryptionType::Dh)
            .await
            .map_err(|_| AppError::storage())?;
        let collection = service
            .get_default_collection()
            .await
            .map_err(|_| AppError::storage())?;
        if collection
            .is_locked()
            .await
            .map_err(|_| AppError::storage())?
        {
            return Err(AppError::storage());
        }
        collection
            .create_item(
                "AI Harness connection",
                attributes(id),
                value.as_bytes(),
                true,
                "application/json",
            )
            .await
            .map_err(|_| AppError::storage())?;
        Ok(())
    }
    async fn delete(&self, id: &str) -> Result<(), AppError> {
        let service = SecretService::connect(EncryptionType::Dh)
            .await
            .map_err(|_| AppError::storage())?;
        let items = service
            .search_items(attributes(id))
            .await
            .map_err(|_| AppError::storage())?;
        if !items.locked.is_empty() {
            return Err(AppError::storage());
        }
        for item in items.unlocked {
            item.delete().await.map_err(|_| AppError::storage())?;
        }
        Ok(())
    }
}
