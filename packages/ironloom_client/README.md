# Ironloom client contracts

Pure Dart wire models shared by the Flutter operator application and future native
clients. This package contains no network client, inference, authentication
implementation or authorization policy.

Decode through `decode(json, Command.fromJson)` (or another model's `fromJson`).
Named constructors and direct `fromJson` calls enforce the same nested and
cross-field checks. Values and their collections are immutable. Validation errors
contain field paths and stable codes; authentication input debug output is redacted.
Counters and revisions use canonical decimal strings and `BigInt`, including on web.
`ReplayCursor` and `RelayCursor` remain distinct; cursor decoding grants no access.

`tool/generate_models.py` reads the shared Rust declarations and checks their fields
against the committed JSON schemas before generating the Dart records. Semantic
checks live in `lib/src/invariants.dart`. After a common-contract change:

```sh
python3 tool/generate_models.py
dart format --output=none --set-exit-if-changed lib test
dart analyze
dart test
CHROME_EXECUTABLE=/usr/bin/chromium dart test --platform chrome test/browser_test.dart
```

The VM tests read `fixtures/contracts/decode.json` from the repository directly,
including its expected structured errors. The browser tests check exact counters,
nested constructors, service failures and SSE cursor encoding without inference.
