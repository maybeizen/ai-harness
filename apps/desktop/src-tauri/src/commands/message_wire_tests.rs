use super::{validate_generation, validate_message, GenerationInput, TextMessage};

fn message(name: &str) -> TextMessage {
    serde_json::from_str(name).unwrap()
}

#[test]
fn accepts_shared_message_and_generation_fixtures() {
    assert!(validate_message(&message(include_str!(
        "../../../../../packages/contracts/fixtures/chat-message.json"
    )))
    .is_ok());
    assert!(validate_message(&message(include_str!(
        "../../../../../packages/contracts/fixtures/chat-message.legacy.json"
    )))
    .is_ok());
    for fixture in [
        include_str!("../../../../../packages/contracts/fixtures/generation-input.json"),
        include_str!("../../../../../packages/contracts/fixtures/generation-input.legacy.json"),
    ] {
        let input: GenerationInput = serde_json::from_str(fixture).unwrap();
        assert!(validate_generation(&input).is_ok());
    }
}

#[test]
fn rejects_shared_invalid_message_and_generation_fixtures() {
    assert!(serde_json::from_str::<TextMessage>(include_str!(
        "../../../../../packages/contracts/fixtures/chat-message.invalid.json"
    ))
    .is_err());
    assert!(validate_message(&message(include_str!(
        "../../../../../packages/contracts/fixtures/chat-message.bad-status.json"
    )))
    .is_err());
    let input: GenerationInput = serde_json::from_str(include_str!(
        "../../../../../packages/contracts/fixtures/generation-input.invalid.json"
    ))
    .unwrap();
    assert!(validate_generation(&input).is_err());
    assert!(serde_json::from_str::<GenerationInput>(include_str!(
        "../../../../../packages/contracts/fixtures/generation-input.secret.json"
    ))
    .is_err());
}
