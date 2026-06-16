use ed25519_dalek::{Signer, SigningKey};
use ironloom_discord::{
    DiscordInteractionRequest, handle_discord_interaction, verify_discord_interaction,
};

#[test]
fn verifier_accepts_discord_signed_interaction_request() {
    let signing_key = SigningKey::from_bytes(&[7_u8; 32]);
    let public_key = hex::encode(signing_key.verifying_key().to_bytes());
    let timestamp = "1710000000";
    let body = r#"{"type":1}"#;
    let signature = signature_hex(&signing_key, timestamp, body);

    verify_discord_interaction(&DiscordInteractionRequest {
        public_key,
        signature,
        timestamp: timestamp.to_owned(),
        body: body.to_owned(),
    })
    .expect("valid signature should verify");
}

#[test]
fn verifier_rejects_invalid_discord_signature() {
    let signing_key = SigningKey::from_bytes(&[7_u8; 32]);
    let public_key = hex::encode(signing_key.verifying_key().to_bytes());
    let timestamp = "1710000000";
    let body = r#"{"type":1}"#;

    let error = verify_discord_interaction(&DiscordInteractionRequest {
        public_key,
        signature: "00".repeat(64),
        timestamp: timestamp.to_owned(),
        body: body.to_owned(),
    })
    .expect_err("invalid signature should fail closed");

    assert!(
        error
            .to_string()
            .contains("invalid Discord interaction signature")
    );
}

#[test]
fn signed_ping_interaction_returns_pong_payload() {
    let signing_key = SigningKey::from_bytes(&[7_u8; 32]);
    let public_key = hex::encode(signing_key.verifying_key().to_bytes());
    let timestamp = "1710000000";
    let body = r#"{"type":1}"#;
    let signature = signature_hex(&signing_key, timestamp, body);

    let response = handle_discord_interaction(&DiscordInteractionRequest {
        public_key,
        signature,
        timestamp: timestamp.to_owned(),
        body: body.to_owned(),
    })
    .expect("ping should be accepted");

    assert_eq!(200, response.status);
    assert_eq!(r#"{"type":1}"#, response.body);
}

fn signature_hex(signing_key: &SigningKey, timestamp: &str, body: &str) -> String {
    let message = format!("{timestamp}{body}");
    hex::encode(signing_key.sign(message.as_bytes()).to_bytes())
}
