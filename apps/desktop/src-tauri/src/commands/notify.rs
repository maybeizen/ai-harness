use crate::error::AppError;
use serde::Deserialize;
use tauri_plugin_notification::NotificationExt;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Notice {
    kind: String,
    title: String,
    body: String,
    do_not_disturb: bool,
    enabled: bool,
}
pub fn authorize_notice(kind: &str, do_not_disturb: bool, enabled: bool) -> Result<(), AppError> {
    if !matches!(kind, "taskCompletion" | "approvalRequests" | "errors") {
        return Err(AppError::new(
            "INVALID_REQUEST",
            "This notification is not a supported event.",
        ));
    }
    if do_not_disturb || !enabled {
        return Err(AppError::new(
            "SUPPRESSED",
            "Notifications are suppressed. Nothing was shown.",
        ));
    }
    Ok(())
}
fn bounded(value: &str, max: usize) -> bool {
    let count = value.chars().count();
    (1..=max).contains(&count)
}
#[tauri::command]
pub fn show_notification(app: tauri::AppHandle, notice: Notice) -> Result<(), AppError> {
    authorize_notice(&notice.kind, notice.do_not_disturb, notice.enabled)?;
    if !bounded(&notice.title, 120) || !bounded(&notice.body, 400) {
        return Err(AppError::new(
            "INVALID_REQUEST",
            "The notification text is empty or too long. Nothing was shown.",
        ));
    }
    let state = app
        .notification()
        .permission_state()
        .map_err(|_| AppError::internal())?;
    let granted = match state {
        tauri_plugin_notification::PermissionState::Granted => true,
        tauri_plugin_notification::PermissionState::Denied => false,
        _ => {
            app.notification().request_permission().ok()
                == Some(tauri_plugin_notification::PermissionState::Granted)
        }
    };
    if !granted {
        return Err(AppError::new(
            "PERMISSION_DENIED",
            "Notification permission is denied. Nothing was shown.",
        ));
    }
    app.notification()
        .builder()
        .title(notice.title)
        .body(notice.body)
        .show()
        .map_err(|_| {
            AppError::new(
                "UNAVAILABLE",
                "The notification could not be shown. Nothing was delivered.",
            )
        })
}
#[cfg(test)]
#[path = "notify_tests.rs"]
mod notify_tests;
