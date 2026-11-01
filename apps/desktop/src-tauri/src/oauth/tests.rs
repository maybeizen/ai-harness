use super::{
    identity,
    signin::{self, Attempt},
    tokens::{self, TokenResponse, Tokens},
};
use serde_json::json;
fn attempt() -> Attempt {
    Attempt {
        state: "state-value".into(),
        nonce: "nonce-value".into(),
        verifier: "abcdefghijklmnopqrstuvwxyz0123456789-verifier".into(),
        redirect: "http://127.0.0.1:54321/auth/callback".into(),
        previous: None,
    }
}
#[test]
fn pkce_registration_and_callback_are_bound_to_one_attempt() {
    let attempt = attempt();
    let url = signin::authorization(&attempt, "urn:uuid:fixture").unwrap();
    let params: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
    assert_eq!(params.get("client_id").unwrap(), "dynamic_agent_client");
    assert_eq!(params.get("code_challenge_method").unwrap(), "S256");
    assert_ne!(params.get("code_challenge").unwrap(), &attempt.verifier);
    assert!(signin::callback(
        "/auth/callback?code=c&state=wrong&client_id=oaiapp_test",
        &attempt
    )
    .is_err());
    assert!(signin::callback(
        "/wrong?code=c&state=state-value&client_id=oaiapp_test",
        &attempt
    )
    .is_err());
    assert!(signin::callback(
        "/auth/callback?code=c&state=state-value&state=state-value&client_id=oaiapp_test",
        &attempt
    )
    .is_err());
    assert!(signin::callback(
        "/auth/callback?code=c&state=state-value&client_id=dynamic_agent_client",
        &attempt
    )
    .is_err());
    assert_eq!(
        signin::callback(
            "/auth/callback?code=c&state=state-value&client_id=oaiapp_test",
            &attempt
        )
        .unwrap()
        .client_id,
        "oaiapp_test"
    );
    assert_eq!(
        signin::callback(
            "/auth/callback?error=access_denied&state=state-value",
            &attempt
        )
        .err()
        .unwrap()
        .code,
        "AUTH_DENIED"
    );
}
#[test]
fn jwt_requires_valid_signature_issuer_audience_nonce_and_subject() {
    let private = jsonwebtoken::EncodingKey::from_rsa_pem(include_bytes!(
        "../../tests/fixtures/jwt-test-only.pem"
    ))
    .unwrap();
    let public = jsonwebtoken::DecodingKey::from_rsa_pem(include_bytes!(
        "../../tests/fixtures/jwt-test-only.pub.pem"
    ))
    .unwrap();
    let claims = json!({"exp":tokens::now()+3600,"iss":"https://auth.openai.com","aud":"oaiapp_test","sub":"user-fixture","nonce":"nonce-value"});
    let encode = |value: &serde_json::Value| {
        jsonwebtoken::encode(
            &jsonwebtoken::Header::new(jsonwebtoken::Algorithm::RS256),
            value,
            &private,
        )
        .unwrap()
    };
    let token = encode(&claims);
    assert!(identity::validate_with_key(
        &token,
        "oaiapp_test",
        Some("nonce-value"),
        Some("user-fixture"),
        &public
    )
    .is_ok());
    assert!(
        identity::validate_with_key(&token, "wrong", Some("nonce-value"), None, &public).is_err()
    );
    assert!(
        identity::validate_with_key(&token, "oaiapp_test", Some("wrong"), None, &public).is_err()
    );
    assert!(
        identity::validate_with_key(&token, "oaiapp_test", None, Some("other-user"), &public)
            .is_err()
    );
    for (field, value) in [
        ("iss", json!("https://attacker.invalid")),
        ("exp", json!(1)),
    ] {
        let mut altered = claims.clone();
        altered[field] = value;
        assert!(
            identity::validate_with_key(&encode(&altered), "oaiapp_test", None, None, &public)
                .is_err()
        );
    }
    assert!(identity::validate_with_key("malformed", "oaiapp_test", None, None, &public).is_err());
}
fn saved() -> Tokens {
    Tokens {
        client_id: "oaiapp_test".into(),
        subject: "user-fixture".into(),
        email: None,
        access_token: "old-access".into(),
        refresh_token: "old-refresh".into(),
        id_token: "old-id".into(),
        scopes: "chatgpt.tokens.use.direct".into(),
        expires_at: 1,
    }
}
#[test]
fn refresh_rotates_credentials_and_preserves_missing_optional_fields() {
    let mut tokens = saved();
    tokens
        .commit_refresh(TokenResponse {
            access_token: "new-access".into(),
            refresh_token: Some("new-refresh".into()),
            id_token: None,
            expires_in: 3600,
            scope: None,
            token_type: "Bearer".into(),
        })
        .unwrap();
    assert_eq!(tokens.access_token, "new-access");
    assert_eq!(tokens.refresh_token, "new-refresh");
    assert_eq!(tokens.id_token, "old-id");
    assert!(tokens.expires_at > tokens::now());
    assert!(tokens
        .commit_refresh(TokenResponse {
            access_token: "rejected".into(),
            refresh_token: None,
            id_token: None,
            expires_in: 3600,
            scope: Some("openid".into()),
            token_type: "Bearer".into()
        })
        .is_err());
    assert_eq!(tokens.access_token, "new-access");
}
