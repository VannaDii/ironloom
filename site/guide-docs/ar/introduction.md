# مقدمة

Ironloom هو وقت تشغيل مشرف بلغة Rust من Veritas Labs للعمليات الهندسية القابلة للتدقيق.

ينسق إجراءات المشغل في Discord، وحالة GitHub كمصدر للحقيقة، وبوابات جودة SonarCloud، وتنفيذ العمال، والقطع الأثرية غير القابلة للتغيير، ونشر k3s من خلال وقت تشغيل Rust مباشر.

## تدفق النظام

```mermaid
flowchart LR
  operator["مشغل Discord"] --> discord["ironloom-discord"]
  discord --> runtime["ironloom-runtime"]
  runtime --> supervisor["ironloom-supervisor"]
  supervisor --> policy["ironloom-policy"]
  supervisor --> graph["ironloom-process-graph"]
  graph --> workers["ironloom-workers"]
  workers --> github["GitHub كمصدر للحقيقة"]
  workers --> sonar["بوابات SonarCloud"]
  workers --> storage["ironloom-storage"]
  storage --> artifacts[("قطع .ironloom الأثرية")]
  supervisor --> discord
  runtime --> k3s["نشر k3s"]
```

## شكل المنصة

- Discord هو واجهة المشغل الأساسية.
- يبقى GitHub مصدر الحقيقة لحالة المستودعات وطلبات السحب والفحوصات والدمج.
- يبقى SonarCloud بوابة الجودة والامتثال.
- يستهدف تسليم Kubernetes بيئة k3s من خلال Helm chart الخاص بـ Ironloom.
- تخزن حالة وقت التشغيل تحت `.ironloom` مع قطع أثرية وفهارس قابلة للتدقيق.

## خريطة الوثائق

- تغطي [الأدلة](/ar/guides/getting-started) الإعداد والنشر وسير عمل المشغل.
- تشرح [وثائق المطورين](/ar/developers/architecture) حدود الحزم وبوابات التحقق.
- تشير [وثائق API](/ar/api/) إلى التهيئة ومسارات HTTP والتخزين والمخططات والحزم.
- يعرض [خرج LLM](/llms.txt) محتوى الموقع بصيغة قابلة للقراءة بواسطة النماذج.

تبقى عناصر تحكم المشغل في Discord وGitHub ومستوى تحكم وقت التشغيل. لا يحتفظ هذا الموقع الثابت ببيانات اعتماد وقت التشغيل ولا ينفذ إجراءات دورة الحياة.
