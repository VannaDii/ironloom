# البدء

يشغل هذا الدليل وقت تشغيل Ironloom محليا، ويتحقق من منفذ HTTP الحالي، ويعرض بوابة إعداد التشغيل الأول.

## المتطلبات

- سلسلة أدوات Rust من `rust-toolchain.toml`
- Cargo
- shell لديه وصول إلى `openssl`

## تشغيل وقت التشغيل

```sh
IRONLOOM_BIND_ADDR=127.0.0.1:8080 \
IRONLOOM_PUBLIC_URL=https://ironloom.dev \
IRONLOOM_STATE_ROOT=/tmp/ironloom/.ironloom \
IRONLOOM_CONFIG_KEY="$(openssl rand -base64 32)" \
IRONLOOM_INSTALLER_TOKEN="$(openssl rand -base64 32)" \
IRONLOOM_DISCORD_TOKEN=local-discord-token \
IRONLOOM_DISCORD_PUBLIC_KEY=local-discord-public-key \
IRONLOOM_GITHUB_TOKEN=local-github-token \
IRONLOOM_SONARCLOUD_TOKEN=local-sonar-token \
IRONLOOM_SONARCLOUD_ORGANIZATION=local-sonar-org \
IRONLOOM_SONARCLOUD_PROJECT_KEY=local-sonar-project \
IRONLOOM_OPENAI_API_KEY=local-openai-key \
cargo run -p ironloom-runtime --bin ironloom -- serve
```

## فحص الصحة والجاهزية

```sh
curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8080/readyz
```

يعرض `/healthz` ما إذا كان خادم HTTP حيا. يرجع `/readyz` القيمة `503` حتى يمكن حل تهيئة وقت التشغيل المطلوبة من متغيرات البيئة أو الإعداد المحلي المشفر.

## فتح الإعداد

زر `http://127.0.0.1:8080/setup`.

إذا كان `IRONLOOM_CONFIG_KEY` مفقودا أو غير صالح، تعرض الصفحة فقط تعليمات لإضافته. بعد توفر مفتاح التهيئة ورمز التثبيت، تقبل الصفحة مدخلات وقت التشغيل المفقودة وتحفظها مشفرة تحت `IRONLOOM_STATE_ROOT`.
