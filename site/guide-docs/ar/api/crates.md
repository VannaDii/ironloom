# API الحزم

يحافظ Ironloom على مسؤوليات الحزم صارمة حتى تبقى تنسيقات وقت التشغيل منفصلة عن منطق المجال.

| الحزمة | المسؤولية |
| --- | --- |
| `ironloom-core` | معرفات typed، وبدائيات المستودع والفرع، والأخطاء المشتركة. |
| `ironloom-config` | حل تهيئة وقت التشغيل، وبوابات الإعداد، وأولوية البيئة. |
| `ironloom-artifacts` | أغلفة القطع الأثرية غير القابلة للتغيير وعقود المخطط. |
| `ironloom-storage` | حالة نظام ملفات `.ironloom/`، والفهارس، وتهيئة الإعداد المشفرة. |
| `ironloom-policy` | قرارات سياسة تفشل بشكل مغلق. |
| `ironloom-process-graph` | تحقق وتوجيه مخطط العملية typed. |
| `ironloom-queue` | عقود دورة حياة عناصر العمل المتينة. |
| `ironloom-observability` | سجلات التدقيق والقياس. |
| `ironloom-worktrees` | أمان git worktree المحلي. |
| `ironloom-gates` | عقود تنفيذ البوابات. |
| `ironloom-workers` | أغلفة طلبات واستجابات العمال. |
| `ironloom-supervisor` | اختيار مسار مخطط العملية وتوزيع العمال. |
| `ironloom-discord` | محول مشغل واع بالخيوط. |
| `ironloom-github` | إسقاطات GitHub كمصدر للحقيقة. |
| `ironloom-sonarcloud` | تطبيع الجودة والامتثال في SonarCloud. |
| `ironloom-runtime` | تركيب الخدمة، والصحة، والجاهزية، وسطح HTTP لإعداد التشغيل الأول. |
