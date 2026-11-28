# Ironloom operator

Flutter web client using the shared `ironloom_client` package. API addresses retain
the serving deployment prefix. The browser stores only its account/server-scoped
pending command journal; provider credentials are never journaled. Service login,
authorization and durable execution remain backend responsibilities.

```sh
flutter pub get
flutter analyze
flutter test
flutter build web --no-web-resources-cdn --base-href /your/deployment/path/
```

Serve the output together with the matching Ironloom API under that deployment
path. The setup landing route does not restrict access to other authorized pages.
No desktop/mobile packaging, inference or hardware qualification is performed here.
