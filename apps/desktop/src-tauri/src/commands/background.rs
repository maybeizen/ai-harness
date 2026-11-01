use crate::error::AppError;
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{io::Cursor, path::PathBuf};
use tauri::Manager;
const MAX_BYTES: usize = 8 * 1024 * 1024;
fn validate(bytes: &[u8]) -> Result<&'static str, AppError> {
    if bytes.is_empty() || bytes.len() > MAX_BYTES {
        return Err(AppError::new(
            "INVALID_REQUEST",
            "Choose an image smaller than 8 MiB.",
        ));
    }
    let reader = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| AppError::new("INVALID_REQUEST", "The image could not be read."))?;
    let mime = match reader.format() {
        Some(image::ImageFormat::Png) => "image/png",
        Some(image::ImageFormat::Jpeg) => "image/jpeg",
        Some(image::ImageFormat::WebP) => "image/webp",
        _ => {
            return Err(AppError::new(
                "INVALID_REQUEST",
                "Use a PNG, JPEG or WebP image.",
            ))
        }
    };
    let (width, height) = reader
        .into_dimensions()
        .map_err(|_| AppError::new("INVALID_REQUEST", "The image is invalid."))?;
    if width > 8192 || height > 8192 || u64::from(width) * u64::from(height) > 32_000_000 {
        return Err(AppError::new(
            "INVALID_REQUEST",
            "Choose an image under 8192 pixels per side and 32 megapixels.",
        ));
    }
    Ok(mime)
}
fn directory(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|_| AppError::internal())?
        .join("backgrounds");
    std::fs::create_dir_all(&path).map_err(|_| {
        AppError::new(
            "STORAGE_ERROR",
            "The background folder could not be created.",
        )
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700))
            .map_err(|_| AppError::internal())?;
    }
    Ok(path)
}
fn target(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, AppError> {
    let id = uuid::Uuid::parse_str(id)
        .map_err(|_| AppError::new("INVALID_REQUEST", "Invalid background identifier."))?;
    Ok(directory(app)?.join(id.to_string()))
}
#[tauri::command]
pub async fn import_background(app: tauri::AppHandle, bytes: Vec<u8>) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        validate(&bytes)?;
        let id = uuid::Uuid::new_v4().to_string();
        let path = target(&app, &id)?;
        use std::io::Write;
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&path)
            .map_err(|_| AppError::new("STORAGE_ERROR", "The background could not be saved."))?;
        file.write_all(&bytes)
            .and_then(|_| file.sync_all())
            .map_err(|_| AppError::new("STORAGE_ERROR", "The background could not be saved."))?;
        Ok(id)
    })
    .await
    .map_err(|_| AppError::internal())?
}
#[tauri::command]
pub async fn read_background(app: tauri::AppHandle, id: String) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = target(&app, &id)?;
        let root = directory(&app)?
            .canonicalize()
            .map_err(|_| AppError::internal())?;
        let canonical = path.canonicalize().map_err(|_| {
            AppError::new(
                "NOT_FOUND",
                "The saved background is missing. Select it again.",
            )
        })?;
        if !canonical.starts_with(root) {
            return Err(AppError::new(
                "INVALID_REQUEST",
                "The background path is invalid.",
            ));
        }
        let metadata = std::fs::metadata(&canonical).map_err(|_| AppError::internal())?;
        if metadata.len() > MAX_BYTES as u64 {
            return Err(AppError::new(
                "INVALID_REQUEST",
                "The background is too large.",
            ));
        }
        let bytes = std::fs::read(canonical)
            .map_err(|_| AppError::new("STORAGE_ERROR", "The background could not be loaded."))?;
        let mime = validate(&bytes)?;
        Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
    })
    .await
    .map_err(|_| AppError::internal())?
}
#[tauri::command]
pub async fn remove_background(app: tauri::AppHandle, id: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || match std::fs::remove_file(target(&app, &id)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(AppError::new(
            "STORAGE_ERROR",
            "The unused background could not be removed.",
        )),
    })
    .await
    .map_err(|_| AppError::internal())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_untrusted_or_oversized_images() {
        assert!(validate(b"<svg onload='alert(1)'/>").is_err());
        assert!(validate(&vec![0; MAX_BYTES + 1]).is_err());
        assert!(validate(include_bytes!("../../icons/icon.png")).is_ok());
    }
}
