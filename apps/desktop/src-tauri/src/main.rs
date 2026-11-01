#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod bridge;
mod commands;
mod connection_catalog;
mod connections;
mod credentials;
mod endpoint;
mod error;
mod oauth;
mod protocol;
mod runtime;
mod state;
use state::AppState;
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{Emitter, Manager};
#[tauri::command]
async fn runtime_health(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<protocol::Response, error::AppError> {
    let runtime = state.runtime()?;
    let response = tauri::async_runtime::spawn_blocking(move || {
        runtime.request("health", Duration::from_secs(5))
    })
    .await
    .map_err(|_| error::AppError::internal())?
    .map_err(|_| error::AppError::internal())?;
    if std::env::var_os("HARNESS_SMOKE_DATA").is_some()
        && std::env::var_os("HARNESS_RESTART_STAGE").is_none()
    {
        eprintln!("HARNESS_SMOKE_RENDERER_READY");
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(1));
            app.exit(0);
        });
    }
    Ok(response)
}
fn main() {
    let application = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let resources = app.path().resource_dir()?;
            let (node, script) = if cfg!(debug_assertions) {
                let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
                (
                    base.join("binaries/harness-node-x86_64-unknown-linux-gnu"),
                    base.join("resources/runtime/bootstrap.cjs"),
                )
            } else {
                (
                    std::env::current_exe()?
                        .parent()
                        .ok_or("Executable path unavailable")?
                        .join("harness-node"),
                    resources.join("runtime/bootstrap.cjs"),
                )
            };
            let data = std::env::var_os("HARNESS_SMOKE_DATA")
                .map(std::path::PathBuf::from)
                .unwrap_or(app.path().app_data_dir()?);
            let runtime = runtime::Runtime::start(&node, &script, &data).map(Arc::new);
            if std::env::var_os("HARNESS_SMOKE_DATA").is_some() {
                match &runtime {
                    Ok(_) => eprintln!("HARNESS_SMOKE_READY"),
                    Err(error) => {
                        eprintln!("HARNESS_SMOKE_FAILED: {error}");
                        return Err(error.clone().into());
                    }
                }
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(
                        if std::env::var("HARNESS_RESTART_STAGE").ok().as_deref() == Some("live") {
                            300
                        } else {
                            30
                        },
                    ));
                    handle.exit(1);
                });
            }
            let connections = Arc::new(connections::Connections::new(
                data,
                Arc::new(credentials::SecretStore),
            )?);
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(30))
                .redirect(reqwest::redirect::Policy::none())
                .build()?;
            app.manage(AppState {
                runtime,
                connections,
                client,
                oauth_cancel: Mutex::new(None),
                pending_oauth: Mutex::new(None),
                oauth_gate: tokio::sync::Mutex::new(()),
            });
            if let Some(window) = app.get_webview_window("main") {
                let _ = commands::window::restore_saved(app.handle());
                let _ = window.show();
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.emit("app-close-requested", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            runtime_health,
            commands::connections::list_connections,
            commands::connections::connect_api,
            commands::connections::connect_claude,
            commands::connections::refresh_connection,
            commands::connections::disconnect_connection,
            commands::auth::connect_chatgpt,
            commands::auth::cancel_sign_in,
            commands::chat::start_chat,
            commands::chat::cancel_chat,
            commands::chat::open_external,
            commands::chat::copy_text,
            commands::storage::storage_operation,
            commands::lifecycle::complete_close,
            commands::lifecycle::request_close,
            commands::lifecycle::qualification_stage,
            commands::lifecycle::qualification_result,
            commands::lifecycle::qualification_error,
            commands::lifecycle::qualification_live_report,
            commands::background::import_background,
            commands::background::read_background,
            commands::background::remove_background,
            commands::workspace::open_workspace,
            commands::workspace::workspace_operation,
            commands::agent::start_agent,
            commands::agent::resume_agent,
            commands::agent::agent_operation,
            commands::terminal::create_terminal,
            commands::terminal::terminal_operation,
            commands::window::restore_window,
            commands::window::capture_window,
            commands::workstation::workstation_operation,
            commands::notify::show_notification,
            commands::voice::transcribe_voice
        ])
        .build(tauri::generate_context!())
        .expect("Application initialization failed");
    application.run(|handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            let state = handle.state::<AppState>();
            if let Ok(mut cancel) = state.oauth_cancel.lock() {
                if let Some(sender) = cancel.take() {
                    let _ = sender.send(());
                }
            }
            if let Ok(runtime) = &state.runtime {
                runtime.stop();
            }
        }
    });
}

#[cfg(test)]
mod connection_tests;
