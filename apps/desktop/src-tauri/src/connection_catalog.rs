use crate::connections::Record;
use serde_json::{json, Value};
fn describe(id: &str) -> (&'static str, &'static str, &'static str) {
    match id {
        "chatgpt" => ("ChatGPT plan", "openai", "subscription"),
        "openai" => ("OpenAI API", "openai", "api-key"),
        "claude-client" => ("Claude plan", "anthropic", "official-client"),
        "anthropic" => ("Anthropic API", "anthropic", "api-key"),
        "google" => ("Google Gemini", "google", "api-key"),
        "xai" => ("xAI Grok", "xai", "api-key"),
        "openrouter" => ("OpenRouter", "openrouter", "api-key"),
        "ollama" => ("Ollama", "ollama", "endpoint"),
        "lmstudio" => ("LM Studio", "lmstudio", "endpoint"),
        "custom" => ("Custom endpoint", "custom", "endpoint"),
        _ => ("", "", ""),
    }
}
pub(crate) fn summary(id: &str, record: Option<&Record>, transient: bool) -> Value {
    let configured = record.is_some();
    let (label, provider, method) = describe(id);
    let mut value = json!({
        "id": id,
        "label": label,
        "provider": provider,
        "method": method,
        "configured": configured,
        "status": if configured { "checking" } else { "disconnected" },
        "storage": if !configured {
            "none"
        } else if id == "claude-client" {
            "client"
        } else if transient {
            "session"
        } else {
            "secure"
        },
        "account": record.and_then(|item| item.account.clone()),
        "executable": record.and_then(|item| item.executable.clone()),
    });
    if let Some(url) = record.and_then(|item| item.base_url.clone()) {
        value["baseURL"] = json!(url);
    }
    value
}
