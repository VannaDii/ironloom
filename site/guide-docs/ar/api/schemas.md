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

## عقود المصنع المرشحة

توجد العقود الجديدة في وحدات `src/factory.rs` الخاصة بكل حزمة. يطبق `Validated<T>` فحوص الحقول المتداخلة والعلاقات بينها نفسها عند الإنشاء وفك الترميز، ولا تكشف الأخطاء المنظمة الأسرار. تستخدم العدادات والمراجعات سلاسل عشرية قياسية للحفاظ على دقة المتصفح. يتشارك Rust وDart الملف `fixtures/contracts/decode.json`. لا تتطلب سجلات `FactoryArtifact` الجديدة ربطًا بسلسلة Discord، وتظل سجلات الإصدار الأول التاريخية قابلة للقراءة. هذه العقود وواجهات المحولات لا تنفذ بعد المصنع أو تسجيل الدخول أو النقل الأصلي أو الاستدلال. توضح [المواصفات المشتركة](https://github.com/VannaDii/ironloom/blob/feat/shared-factory-contracts/docs/specs/ironloom-shared-contracts.md) مسؤوليات الملفات ومسارات API وحدود الترحيل والتحقق.
