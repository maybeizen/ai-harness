#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod bridge;
mod commands;
mod connections;
mod credentials;
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
use tauri::Manager;
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
    if std::env::var_os("HARNESS_SMOKE_DATA").is_some() {
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
                    std::thread::sleep(Duration::from_secs(20));
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
            Ok(())
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
            commands::storage::storage_operation
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
