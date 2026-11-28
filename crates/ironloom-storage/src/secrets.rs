//! Current-format authenticated secret envelopes. Decryption failures never reset identity or data.
use crate::postgres::DatabaseError;
use aes_gcm::{
    Aes256Gcm, Nonce,
    aead::{Aead, KeyInit, OsRng, Payload, rand_core::RngCore},
};

const NONCE_BYTES: usize = 12;
const TAG_BYTES: usize = 16;
/// Trusted storage encryption boundary. No key, nonce or secret is exposed through Debug.
#[derive(Clone)]
pub struct SecretCipher {
    cipher: Aes256Gcm,
}
impl SecretCipher {
    /// Builds the current cipher from the infrastructure-provided 256-bit installation key.
    pub fn new(key: &[u8; 32]) -> Self {
        Self {
            cipher: Aes256Gcm::new(key.into()),
        }
    }
    /// Protects a secret and binds it to its purpose, resource identity and owner context.
    pub fn seal(&self, context: &str, secret: &[u8]) -> Result<Vec<u8>, DatabaseError> {
        let mut nonce = [0; NONCE_BYTES];
        OsRng.fill_bytes(&mut nonce);
        let ciphertext = self
            .cipher
            .encrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: secret,
                    aad: context.as_bytes(),
                },
            )
            .map_err(|_| DatabaseError::Corrupt)?;
        let mut envelope = nonce.to_vec();
        envelope.extend(ciphertext);
        Ok(envelope)
    }
    /// Opens only a matching current secret envelope. Wrong keys/context/tampering fail closed.
    pub fn open(&self, context: &str, envelope: &[u8]) -> Result<Vec<u8>, DatabaseError> {
        if envelope.len() < NONCE_BYTES + TAG_BYTES {
            return Err(DatabaseError::Corrupt);
        }
        self.cipher
            .decrypt(
                Nonce::from_slice(&envelope[..NONCE_BYTES]),
                Payload {
                    msg: &envelope[NONCE_BYTES..],
                    aad: context.as_bytes(),
                },
            )
            .map_err(|_| DatabaseError::Corrupt)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn private_secrets_are_bound_to_owner_resource_and_key() {
        let cipher = SecretCipher::new(&[1; 32]);
        let context = "credential:owner-a:credential-a";
        let envelope = cipher.seal(context, b"private-fixture-token").unwrap();
        assert_eq!(
            cipher.open(context, &envelope).unwrap(),
            b"private-fixture-token"
        );
        assert!(
            cipher
                .open("credential:owner-b:credential-a", &envelope)
                .is_err()
        );
        assert!(
            SecretCipher::new(&[2; 32])
                .open(context, &envelope)
                .is_err()
        );
        let mut tampered = envelope.clone();
        *tampered.last_mut().unwrap() ^= 1;
        assert!(cipher.open(context, &tampered).is_err());
        assert!(cipher.open(context, b"truncated").is_err());
    }
}
