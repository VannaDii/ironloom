# Storage API

केवल `ironloom-storage` सीधे `.ironloom/` paths पढ़ या लिख सकता है।

## Artifact Storage

Artifacts runtime state root के अंतर्गत persist होते हैं और Discord thread तथा work item से indexed होते हैं। Writes temporary file का उपयोग करते हैं और फिर atomic rename करते हैं।

## Thread Bindings

Thread bindings `.ironloom` index tree के अंतर्गत persist होते हैं। Runtime command intake policy, process graph routing या worker dispatch चलाने से पहले Discord thread को exactly one work item में resolve करता है। Missing, invalid या ambiguous bindings fail closed करते हैं।

## Encrypted Setup Storage

Local setup configuration यहां stored होती है:

```text
${IRONLOOM_STATE_ROOT}/setup/config.enc.json
```

File में ये चीजें stored रहती हैं:

- encrypted JSON setup payload
- random nonce
- setup storage version

Plaintext setup values disk पर नहीं लिखे जाते। Unix writes owner-only file permissions का उपयोग करते हैं।

## Key Requirement

`IRONLOOM_CONFIG_KEY` base64-encoded 32-byte key material होना चाहिए। Same PVC के साथ recreated pod को saved setup decrypt करने के लिए same key मिलनी चाहिए।
