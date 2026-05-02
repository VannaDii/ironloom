/**
 * DER SubjectPublicKeyInfo prefix for Discord Ed25519 public keys.
 */
export const DISCORD_ED25519_SPKI_PREFIX_HEX = '302a300506032b6570032100';

/**
 * Pattern for Discord signature and public-key fields encoded as hexadecimal.
 */
export const DISCORD_HEX_SIGNATURE_FIELD_PATTERN = /^[0-9a-f]+$/iu;
