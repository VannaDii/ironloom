# البنية

يوجه Ironloom العمل عبر مخطط عملية typed. يتحقق المشرف من السياسة، ويختار عاملا، ويسجل قطعا أثرية غير قابلة للتغيير تحت `.ironloom`، ويبلغ النتائج إلى سطح التحكم الذي بدأ الإجراء.

تبقى محولات Discord وGitHub وSonarCloud عند الحواف. تعيش قواعد الأعمال في الحزم الأساسية والسياسة ومخطط العملية والعمال والمشرف.

## حدود وقت التشغيل

```mermaid
flowchart TB
  runtime["ironloom-runtime"]
  runtime --> config["ironloom-config"]
  runtime --> supervisor["ironloom-supervisor"]
  runtime --> storage["ironloom-storage"]
  supervisor --> policy["ironloom-policy"]
  supervisor --> graph["ironloom-process-graph"]
  supervisor --> workers["ironloom-workers"]
  workers --> gates["ironloom-gates"]
  workers --> github["ironloom-github"]
  workers --> sonar["ironloom-sonarcloud"]
  storage --> artifacts[("حالة .ironloom")]
  discord["ironloom-discord"] --> runtime
  core["ironloom-core"] --> config
  core --> policy
  core --> graph
  core --> workers
```

## قواعد الحدود

- `ironloom-runtime` هو الخدمة القابلة للنشر وحد التركيب.
- `ironloom-supervisor` يملك قرارات توجيه العملية وتوزيع العمال.
- `ironloom-discord` هو محول مستوى تحكم المشغل.
- `ironloom-github` يقرأ ويكتب حالة GitHub كمصدر للحقيقة عبر طلبات قابلة للتدقيق.
- `ironloom-sonarcloud` يملك تطبيع الجودة والامتثال في SonarCloud.
- `ironloom-storage` يملك الوصول المباشر إلى نظام ملفات `.ironloom/`.

## أول شريحة عمودية

1. يرتبط أمر Discord مزيف بخيط واحد وعنصر عمل واحد بالضبط.
2. يفشل محول Discord بشكل مغلق عند غياب الربط أو غموضه.
3. يختار المشرف عامل البوابة عبر مخطط العملية.
4. تسمح السياسة فقط بإجراء بوابة غير هدمي مرتبط بخيط.
5. يرجع عامل البوابة نتيجة منظمة.
6. يكتب التخزين قطعة أثرية غير قابلة للتغيير تحت `.ironloom` ويفهرسها حسب الخيط وعنصر العمل.
7. يرد نقل Discord المزيف على الخيط الأصلي.
