use crate::{error::AppError, state::AppState};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;
use tauri::{LogicalPosition, LogicalSize, Manager, WebviewWindow};
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WindowGeometry {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub maximized: bool,
}
#[derive(Clone, Copy, Debug)]
pub struct MonitorFrame {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
fn invalid() -> AppError {
    AppError::new("INVALID_REQUEST", "The window bounds are invalid.")
}
fn finite(value: f64, min: f64, max: f64) -> bool {
    value.is_finite() && (min..=max).contains(&value)
}
pub fn validate_geometry(geometry: &WindowGeometry) -> Result<(), AppError> {
    if finite(geometry.x, -16384.0, 16384.0)
        && finite(geometry.y, -16384.0, 16384.0)
        && finite(geometry.width, 320.0, 8192.0)
        && finite(geometry.height, 240.0, 8192.0)
    {
        Ok(())
    } else {
        Err(invalid())
    }
}
fn fit(value: f64, min: f64, max: f64) -> f64 {
    let upper = max.max(1.0);
    let lower = min.min(upper);
    value.clamp(lower, upper)
}
pub fn clamp_window(geometry: WindowGeometry, monitor: MonitorFrame) -> WindowGeometry {
    let width = fit(geometry.width, 320.0, monitor.width.min(8192.0));
    let height = fit(geometry.height, 240.0, monitor.height.min(8192.0));
    let max_x = monitor.x + monitor.width - width;
    let max_y = monitor.y + monitor.height - height;
    WindowGeometry {
        x: geometry.x.clamp(monitor.x.min(max_x), max_x.max(monitor.x)),
        y: geometry.y.clamp(monitor.y.min(max_y), max_y.max(monitor.y)),
        width,
        height,
        maximized: geometry.maximized,
    }
}
fn frame(window: &WebviewWindow) -> Result<MonitorFrame, AppError> {
    let monitor = window
        .current_monitor()
        .map_err(|_| AppError::internal())?
        .or(window.primary_monitor().map_err(|_| AppError::internal())?)
        .ok_or_else(AppError::internal)?;
    let scale = monitor.scale_factor().max(1.0);
    let area = monitor.work_area();
    Ok(MonitorFrame {
        x: area.position.x as f64 / scale,
        y: area.position.y as f64 / scale,
        width: area.size.width as f64 / scale,
        height: area.size.height as f64 / scale,
    })
}
fn logical(value: f64, scale: f64) -> f64 {
    value / scale.max(1.0)
}
pub fn apply_geometry(
    window: &WebviewWindow,
    geometry: WindowGeometry,
) -> Result<WindowGeometry, AppError> {
    validate_geometry(&geometry)?;
    let clamped = clamp_window(geometry, frame(window)?);
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|_| AppError::internal())?;
    }
    window
        .set_position(LogicalPosition::new(clamped.x, clamped.y))
        .map_err(|_| AppError::internal())?;
    window
        .set_size(LogicalSize::new(clamped.width, clamped.height))
        .map_err(|_| AppError::internal())?;
    if clamped.maximized {
        window.maximize().map_err(|_| AppError::internal())?;
    }
    Ok(clamped)
}
pub fn capture(window: &WebviewWindow) -> Result<WindowGeometry, AppError> {
    let scale = window
        .scale_factor()
        .map_err(|_| AppError::internal())?
        .max(1.0);
    let position = window.outer_position().map_err(|_| AppError::internal())?;
    let size = window.outer_size().map_err(|_| AppError::internal())?;
    let geometry = WindowGeometry {
        x: logical(position.x as f64, scale),
        y: logical(position.y as f64, scale),
        width: logical(size.width as f64, scale),
        height: logical(size.height as f64, scale),
        maximized: window.is_maximized().unwrap_or(false),
    };
    validate_geometry(&geometry)?;
    Ok(geometry)
}
pub fn restore_saved(app: &tauri::AppHandle) -> Result<(), AppError> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(AppError::internal)?;
    let state = app.state::<AppState>();
    let settings = state.runtime()?.call(
        "storage",
        serde_json::json!({"action":"settings.get"}),
        Duration::from_secs(3),
    )?;
    if let Some(geometry) = saved_window(&settings) {
        apply_geometry(&window, geometry)?;
    }
    Ok(())
}
fn saved_window(settings: &Value) -> Option<WindowGeometry> {
    let window = settings.get("window")?;
    if window.is_null() {
        return None;
    }
    let geometry = serde_json::from_value::<WindowGeometry>(window.clone()).ok()?;
    validate_geometry(&geometry).ok()?;
    Some(geometry)
}
#[tauri::command]
pub fn restore_window(
    window: WebviewWindow,
    geometry: WindowGeometry,
) -> Result<WindowGeometry, AppError> {
    apply_geometry(&window, geometry)
}
#[tauri::command]
pub fn capture_window(window: WebviewWindow) -> Result<WindowGeometry, AppError> {
    capture(&window)
}
#[cfg(test)]
#[path = "window_tests.rs"]
mod window_tests;
