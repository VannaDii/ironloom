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
- `ironloom-supervisor` يملك قرارات توجيه العملية وتوزيع العمال عبر السجل.
- `ironloom-discord` هو محول مستوى تحكم المشغل ويتحقق من تفاعلات Discord HTTP الموقعة قبل التعامل معها.
- `ironloom-github` يقرأ حالة GitHub كمصدر للحقيقة عبر طلبات API قابلة للتدقيق قبل قرارات المشرف.
- `ironloom-sonarcloud` يملك تحقق تهيئة SonarCloud واستطلاع بوابة الجودة وتطبيع المشكلات.
- `ironloom-storage` يملك الوصول المباشر إلى نظام ملفات `.ironloom/`.

## أول شريحة عمودية

1. يقبل منفذ HTTP لوقت التشغيل تفاعل أمر Discord موقعا.
2. يحل وقت التشغيل خيط Discord إلى عنصر عمل محفوظ واحد بالضبط ويفشل بشكل مغلق عند غياب الربط أو غموضه.
3. يختار المشرف عامل البوابة عبر مخطط العملية ويرسله عبر سجل العمال.
4. تسمح السياسة فقط بإجراء بوابة غير هدمي مرتبط بخيط.
5. ينفذ عامل البوابة أمرا مسموحا به ببيئة مضبوطة ومهلة وتدفقات ملتقطة، ثم يرجع نتيجة منظمة.
6. يكتب التخزين قطعة أثرية غير قابلة للتغيير تحت `.ironloom` ويفهرسها حسب الخيط وعنصر العمل.
7. يرجع وقت التشغيل استجابة رسالة قناة Discord إلى التفاعل الأصلي.
