use crate::{error::AppError, state::AppState};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use std::{
    io::Write,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};
use url::Url;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VoiceRequest {
    engine: String,
    language: String,
    local_command: String,
    local_endpoint: String,
    #[serde(default)]
    audio_base64: Option<String>,
}
pub enum VoicePlan {
    Command { program: String, args: Vec<String> },
    Endpoint(Url),
}
fn absent() -> AppError {
    AppError::new(
        "ENGINE_ABSENT",
        "Transcription is not configured. Set a local command or a local endpoint. Nothing was transcribed.",
    )
}
fn failed() -> AppError {
    AppError::new(
        "TRANSCRIPTION_FAILED",
        "Transcription failed. Nothing was transcribed.",
    )
}
fn token(value: &str) -> bool {
    (1..=256).contains(&value.len()) && value.bytes().all(|byte| {
        matches!(
            byte,
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'_' | b'.' | b'/' | b':' | b'=' | b'+' | b'-'
        )
    })
}
fn local_host(url: &Url) -> bool {
    matches!(
        url.host_str(),
        Some("localhost" | "127.0.0.1" | "::1" | "[::1]")
    )
}
pub fn voice_plan(engine: &str, command: &str, endpoint: &str) -> Result<VoicePlan, AppError> {
    match engine {
        "unconfigured" => Err(absent()),
        "local-command" => {
            let mut parts = command.split_whitespace();
            let program = parts.next().ok_or_else(absent)?;
            if !program.starts_with('/') || program.contains("..") || !token(program) {
                return Err(failed());
            }
            let args = parts.map(str::to_string).collect::<Vec<_>>();
            if args.iter().any(|arg| !token(arg)) {
                return Err(failed());
            }
            Ok(VoicePlan::Command {
                program: program.to_string(),
                args,
            })
        }
        "local-endpoint" => {
            let url = Url::parse(endpoint).map_err(|_| failed())?;
            if !matches!(url.scheme(), "http" | "https")
                || !local_host(&url)
                || !url.username().is_empty()
                || url.password().is_some()
                || url.query().is_some()
                || url.fragment().is_some()
            {
                return Err(AppError::new(
                    "ENDPOINT_REJECTED",
                    "Transcription only uses an explicit local endpoint without credentials. Nothing was transcribed.",
                ));
            }
            Ok(VoicePlan::Endpoint(url))
        }
        _ => Err(absent()),
    }
}
fn audio(value: &Option<String>) -> Result<Option<Vec<u8>>, AppError> {
    let Some(encoded) = value.as_ref().filter(|item| !item.is_empty()) else {
        return Ok(None);
    };
    if encoded.len() > 8_000_000 {
        return Err(failed());
    }
    STANDARD.decode(encoded).map(Some).map_err(|_| failed())
}
fn command_output(
    program: &str,
    args: &[String],
    language: &str,
    audio: Option<Vec<u8>>,
) -> Result<String, AppError> {
    let mut child = Command::new(program)
        .args(args)
        .env("AXIODEN_VOICE_LANGUAGE", language)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| failed())?;
    if let Some(mut stdin) = child.stdin.take() {
        if let Some(bytes) = &audio {
            let _ = stdin.write_all(bytes);
        }
    }
    let stdout = child.stdout.take();
    let reader = thread::spawn(move || {
        use std::io::Read;
        let mut output = Vec::new();
        if let Some(stdout) = stdout {
            let _ = stdout.take(16_000).read_to_end(&mut output);
        }
        output
    });
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() > Duration::from_secs(20) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(failed());
            }
            Ok(None) => thread::sleep(Duration::from_millis(20)),
            Err(_) => return Err(failed()),
        }
    };
    let output = reader.join().map_err(|_| failed())?;
    if !status.success() {
        return Err(failed());
    }
    let text = String::from_utf8_lossy(&output).trim().to_string();
    if text.is_empty() || text.chars().count() > 16_000 {
        return Err(failed());
    }
    Ok(text)
}
async fn endpoint_output(
    client: &reqwest::Client,
    url: Url,
    language: &str,
    audio: Option<Vec<u8>>,
) -> Result<String, AppError> {
    let response = client
        .post(url)
        .timeout(Duration::from_secs(8))
        .json(&serde_json::json!({
            "language": language,
            "audioBase64": audio.map(|bytes| STANDARD.encode(bytes)),
        }))
        .send()
        .await
        .map_err(|_| failed())?;
    if !response.status().is_success() {
        return Err(failed());
    }
    let body = response
        .json::<serde_json::Value>()
        .await
        .map_err(|_| failed())?;
    let text = body
        .get("text")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if text.is_empty() || text.chars().count() > 16_000 {
        return Err(failed());
    }
    Ok(text)
}
#[tauri::command]
pub async fn transcribe_voice(
    request: VoiceRequest,
    state: tauri::State<'_, AppState>,
) -> Result<String, AppError> {
    if !request
        .language
        .bytes()
        .enumerate()
        .all(|(index, byte)| match index {
            0..=1 => byte.is_ascii_lowercase(),
            2 => byte == b'-',
            3..=4 => byte.is_ascii_uppercase(),
            _ => false,
        })
        || !matches!(request.language.len(), 2 | 5)
    {
        return Err(failed());
    }
    let audio = audio(&request.audio_base64)?;
    match voice_plan(
        &request.engine,
        &request.local_command,
        &request.local_endpoint,
    )? {
        VoicePlan::Command { program, args } => {
            let language = request.language.clone();
            tauri::async_runtime::spawn_blocking(move || {
                command_output(&program, &args, &language, audio)
            })
            .await
            .map_err(|_| failed())?
        }
        VoicePlan::Endpoint(url) => {
            endpoint_output(&state.client, url, &request.language, audio).await
        }
    }
}
#[cfg(test)]
#[path = "voice_tests.rs"]
mod voice_tests;
