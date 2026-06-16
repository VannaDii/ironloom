# سير عمل المشغل

يجب أن ترتبط إجراءات Discord التي تغير دورة الحياة بعنصر عمل وخيط محفوظين بالضبط. يفشل سياق الخيط المفقود أو الغامض بشكل مغلق قبل تشغيل أي عامل.

## تسلسل الأوامر

```mermaid
sequenceDiagram
  participant Operator as المشغل
  participant Discord as Discord
  participant Runtime as Runtime
  participant Supervisor as المشرف
  participant GitHub as GitHub
  participant Worker as العامل
  participant Storage as التخزين
  Operator->>Discord: يرسل slash command داخل خيط
  Discord->>Runtime: POST لتفاعل موقع
  Runtime->>Runtime: يتحقق من التوقيع ويحل ربط الخيط
  alt الربط مفقود أو غامض
    Runtime-->>Discord: يرجع استجابة قناة fail-closed
    Discord-->>Operator: يشرح فشل الربط داخل الخيط
  else الربط صالح
    Runtime->>Supervisor: يوجه أمرا مرتبطا بالخيط
    Supervisor->>GitHub: يحدث حالة مصدر الحقيقة
    Supervisor->>Worker: يوزع العامل عبر المخطط والسجل
    Worker->>Storage: يكتب قطعة أثرية غير قابلة للتغيير
    Worker-->>Supervisor: يرجع نتيجة منظمة
    Supervisor-->>Runtime: ينشر النتيجة
    Runtime-->>Discord: يرجع استجابة رسالة قناة
    Discord-->>Operator: يرد على الخيط الأصلي
  end
```

## ربط الخيط

يعامل Ironloom خيط Discord كسياق المشغل. يجب أن يحل الأمر إلى عنصر عمل واحد قبل تشغيل السياسة أو توزيع العمال.

## حالة GitHub

يجب تحديث حالة GitHub قبل قرارات طلبات السحب أو الفروع أو الفحوصات أو المراجعات أو الدمج. يمكن للحالة المخزنة مؤقتا دعم العرض والفهرسة، لكنها ليست مصدر الحقيقة.

## القطع الأثرية

يخزن المشرف القطع الأثرية غير القابلة للتغيير تحت `.ironloom` ويفهرسها حسب الخيط وعنصر العمل. يجب أن تشير الردود الموجهة للمشغل إلى الخيط الأصلي.
