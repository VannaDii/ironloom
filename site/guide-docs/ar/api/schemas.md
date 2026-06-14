# API المخططات

تعيش مخططات JSON الملتزم بها تحت أدلة `schemas/` المحلية للحزم.

## انجراف المخطط

تحقق من المخططات باستخدام:

```sh
cargo run -p ironloom-schemas -- --check
```

أعد توليد ملفات المخطط بعد تغييرات العقود العامة باستخدام:

```sh
cargo run -p ironloom-schemas
```

## مخططات تهيئة وقت التشغيل

- `crates/ironloom-config/schemas/runtime-config.schema.json`
- `crates/ironloom-config/schemas/stored-setup-config.schema.json`

تصف هذه الملفات تهيئة وقت التشغيل المحلولة وشكل حمولة الإعداد المشفرة.
