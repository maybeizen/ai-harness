use super::{command_output, voice_plan, VoicePlan};
#[test]
fn refuses_unconfigured_and_remote_transcription() {
    assert!(voice_plan("unconfigured", "", "").is_err());
    assert!(voice_plan("local-command", "", "").is_err());
    assert!(voice_plan("local-command", "bash -c id", "").is_err());
    assert!(voice_plan("local-endpoint", "", "https://example.com/transcribe").is_err());
    assert!(voice_plan(
        "local-endpoint",
        "",
        "http://user:pass@127.0.0.1/transcribe"
    )
    .is_err());
    assert!(matches!(
        voice_plan("local-endpoint", "", "http://127.0.0.1:9/transcribe"),
        Ok(VoicePlan::Endpoint(_))
    ));
}
#[test]
fn local_command_returns_stdout_and_failure_returns_no_text() {
    let Ok(VoicePlan::Command { program, args }) =
        voice_plan("local-command", "/bin/echo hello", "")
    else {
        panic!("expected a local command");
    };
    assert_eq!(
        command_output(&program, &args, "en", None).unwrap(),
        "hello"
    );
    assert!(command_output("/bin/false", &[], "en", None).is_err());
}
