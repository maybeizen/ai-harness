use crate::error::AppError;
use tauri::Manager;
#[tauri::command]
pub fn complete_close(app: tauri::AppHandle) -> Result<(), AppError> {
    app.get_webview_window("main")
        .ok_or_else(AppError::internal)?
        .destroy()
        .map_err(|_| AppError::new("UNAVAILABLE", "The window could not close."))
}
#[tauri::command]
pub fn request_close(app: tauri::AppHandle) -> Result<(), AppError> {
    app.get_webview_window("main")
        .ok_or_else(AppError::internal)?
        .close()
        .map_err(|_| AppError::new("UNAVAILABLE", "The close request failed."))
}
#[tauri::command]
pub fn qualification_stage() -> Option<String> {
    std::env::var_os("HARNESS_SMOKE_DATA")?;
    std::env::var("HARNESS_RESTART_STAGE")
        .ok()
        .filter(|s| ["save", "verify", "crash", "verify-crash", "live"].contains(&s.as_str()))
}
#[tauri::command]
pub fn qualification_result(app: tauri::AppHandle, passed: bool) {
    if std::env::var_os("HARNESS_SMOKE_DATA").is_some()
        && std::env::var_os("HARNESS_RESTART_STAGE").is_some()
    {
        eprintln!(
            "HARNESS_RESTART_RESULT:{}",
            if passed { "PASS" } else { "FAIL" }
        );
        if !passed {
            app.exit(1);
        }
    }
}

#[tauri::command]
pub fn qualification_error(message: String) {
    if std::env::var_os("HARNESS_SMOKE_DATA").is_some()
        && std::env::var_os("HARNESS_RESTART_STAGE").is_some()
    {
        eprintln!(
            "HARNESS_RESTART_ERROR:{}",
            message.chars().take(1200).collect::<String>()
        );
    }
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LiveResult {
    connection_id: String,
    model_id: String,
    status: String,
    code: String,
}
#[tauri::command]
pub fn qualification_live_report(results: Vec<LiveResult>) {
    if std::env::var("HARNESS_RESTART_STAGE").ok().as_deref() == Some("live")
        && std::env::var_os("HARNESS_SMOKE_DATA").is_some()
    {
        let valid = results.len() <= crate::connections::IDS.len()
            && results.iter().all(|r| {
                crate::connections::IDS.contains(&r.connection_id.as_str())
                    && r.model_id.len() <= 256
                    && ["verified", "unverified"].contains(&r.status.as_str())
                    && r.code.len() <= 64
            });
        if valid {
            if let Ok(report) = serde_json::to_string(&results) {
                eprintln!("HARNESS_LIVE_REPORT:{report}");
            }
        }
    }
}
