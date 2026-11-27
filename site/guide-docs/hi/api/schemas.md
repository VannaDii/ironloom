# Schema API

Committed JSON schemas crate-local `schemas/` directories में रहते हैं।

## Schema Drift

Schemas verify करें:

```sh
cargo run -p ironloom-schemas -- --check
```

Public contract changes के बाद schema files regenerate करें:

```sh
cargo run -p ironloom-schemas
```

## Runtime Config Schemas

- `crates/ironloom-config/schemas/runtime-config.schema.json`
- `crates/ironloom-config/schemas/stored-setup-config.schema.json`

ये resolved runtime configuration और encrypted setup payload shape का वर्णन करते हैं।

## फ़ैक्टरी अनुबंध का प्रस्तावित संस्करण

नए फ़ैक्टरी अनुबंध हर crate के `src/factory.rs` मॉड्यूल में हैं। `Validated<T>` निर्माण और डिकोडिंग में नेस्टेड फ़ील्ड तथा फ़ील्ड के बीच संबंधों की समान जाँच करता है; संरचित त्रुटियाँ गोपनीय जानकारी नहीं दिखातीं। ब्राउज़र में सटीकता बनाए रखने के लिए काउंटर और संशोधन मानक दशमलव स्ट्रिंग हैं। Rust और Dart में `fixtures/contracts/decode.json` साझा है। नए `FactoryArtifact` रिकॉर्ड को Discord थ्रेड की आवश्यकता नहीं है; ऐतिहासिक संस्करण एक के रिकॉर्ड पढ़े जा सकते हैं। ये अनुबंध और अडैप्टर इंटरफ़ेस अभी फ़ैक्टरी, लॉगिन, मूल रिले या इन्फ़रेंस लागू नहीं करते। [साझा अनुबंध विनिर्देश](https://github.com/VannaDii/ironloom/blob/feat/shared-factory-contracts/docs/specs/ironloom-shared-contracts.md) में फ़ाइल स्वामित्व, API पथ, माइग्रेशन की सीमाएँ और सत्यापन की सीमाएँ दी गई हैं।
