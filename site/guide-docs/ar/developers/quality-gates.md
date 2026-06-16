# بوابات الجودة

يحافظ Ironloom على تحقق صارم من خلال تنسيق Cargo وClippy والاختبارات وسياسة الاعتماد وتدقيق الثغرات والمخططات وبناء الوثائق وبناء Docker وتصوير Helm وتحليل SonarCloud.

## البوابات المحلية

```sh
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
cargo run -p ironloom-schemas -- --check
cargo deny check
cargo audit
just scripts-test
npm run docs:build
helm lint deploy/helm/ironloom
helm template ironloom deploy/helm/ironloom
```

## اختصارات الوصفات

- يبني `just proof` صورة وقت التشغيل، ويشغل الحاوية المحلية، ويرسل قيم setup، وينشئ تطبيق إثبات كامل.
- يشغل `just k3s-acceptance` حاوية k3s مؤقتة، ويثبت Helm chart، ويتحقق من إدخال Discord الموقع، ويثبت أن فهرس القطع الأثرية المدعوم بـ PVC يبقى بعد إعادة تشغيل pod.
- يستخدم `just external-probe` بيانات اعتماد وقت التشغيل الحقيقية المربوطة لقراءة حالة مستودع GitHub كمصدر للحقيقة واستطلاع حالة الجودة والمشكلات في SonarCloud.
- يشغل `just gates` البوابات المحلية الشائعة للتنسيق وClippy والاختبارات والمخططات وسلوك bootstrap في SonarCloud والوثائق وHelm وسياسة الاعتماد وتدقيق الثغرات.
- يطبع `just setup-url` عنوان setup المحلي ورمز التثبيت للتحقق اليدوي في المتصفح.

## بوابات النشر

- يبني Docker Buildx ملف `docker/ironloom-runtime/Dockerfile`.
- ينشر Helm `deploy/helm/ironloom` كـ OCI chart.
- ينشر GitHub Pages موقع VitePress العام.
- يتلقى SonarCloud تغطية Rust LCOV من `cargo llvm-cov` وتقرير Clippy JSON مولدا من أمر lint نفسه الذي يفرضه CI.
- يحلل SonarCloud ملفات موقع الوثائق، لكنه يستبعدها من حساب التغطية حتى تبقى Rust LCOV إشارة quality gate.
- عندما تفشل بوابة SonarCloud، يطبع CI حالة البوابة المصادق عليها وكل شرط في سجل workflow.
- يتحقق CI من مشروع SonarCloud `vannadii_ironloom` قبل الفحص، وينشئه عندما يعيد SonarCloud الحالة 404، ويطابق الفرع الرئيسي في SonarCloud مع الفرع الافتراضي في GitHub. إذا كان فرع غير رئيسي قديم بالاسم الهدف موجودا بالفعل، يحذفه CI قبل إعادة تسمية الفرع الرئيسي في SonarCloud ويتحقق من النتيجة.
- يجب أن يتمكن سر `SONAR_TOKEN` من إنشاء/قراءة المشروع وإرسال التحليل وقراءة quality gate؛ فالرمز الذي يملك صلاحية التحليل فقط يمكنه رفع التقارير لكنه لا يستطيع إكمال bootstrap أو انتظار البوابة الصارم.
