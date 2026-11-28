# واجهة HTTP للخدمة

تستخدم الخدمة المصادقة Tokio/Axum ومسار النشر المحدد. يفتح `ironloom serve` تثبيت PostgreSQL الحالي. ينشئ `ironloom initialize` مخططًا جديدًا وحالة رمز التهيئة لمرة واحدة فقط، ويرفض المخطط الموجود. لا تنشئ الأعطال وإعادة التشغيل بيانات بديلة.

تسجيل دخول الخدمة منفصل عن بيانات اعتماد مزود الاستدلال. يعيد الدخول `AuthenticatedSession` ويضبط ملف HttpOnly باسم `ironloom_session`، مع إثبات CSRF في `ironloom_csrf` وترويسة `x-ironloom-csrf`. تتطلب عمليات التعديل الترويسة. تستخدم الملفات مسار النشر وSameSite=Lax وSecure مع HTTPS. تُرفض الطلبات من أصل مختلف. تتطلب استجابة OIDC أيضًا ملف تدفق مرتبطًا بالمتصفح وصالحًا لمرة واحدة.

| Method | Path | Contract / transport |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | `LoginRequest`; initial `x-ironloom-setup-token`, later current administrator + CSRF |
| POST | `/api/v1/auth/local` | `LoginRequest` → `AuthenticatedSession` + cookies |
| GET | `/api/v1/auth/session` | Current `AuthenticatedSession`; no-store |
| POST | `/api/v1/auth/oidc/start` | `OidcStart` → authorization URL JSON + HttpOnly flow cookie |
| POST | `/api/v1/auth/oidc/callback` | `OidcCallback` → `AuthenticatedSession` + cookies |
| POST | `/api/v1/auth/bootstrap` | `BootstrapRedeem` → fixed `BootstrapState`; CSRF |
| POST | `/api/v1/auth/logout` | Revoke current session and clear cookies; CSRF |
| GET | `/healthz` | Process liveness, root path |
| GET | `/readyz` | Selected PostgreSQL and OpenFGA binding reachable; separate from execution setup, root path |

الإعدادات المطلوبة: `IRONLOOM_DATABASE_URL` و`IRONLOOM_OPENFGA_URL` و`IRONLOOM_CONFIG_KEY` (base64، 32 بايت) و`IRONLOOM_PUBLIC_URL` وحدا التنزيل. تقرأ التهيئة الصريحة فقط `IRONLOOM_INSTALLER_TOKEN`. الإعدادان `IRONLOOM_OPENFGA_TOKEN` و`IRONLOOM_OIDC_CONNECTIONS` اختياريان؛ الثاني مصفوفة JSON بعناصر `{id, issuer, client_id, client_secret, redirects}` وعناوين عودة مسموحة مطابقة تمامًا. البريد الإلكتروني ليس سلطة هوية.

تنفيذ الأدوار وربط المحولات وموارد واجهة المشغل ما زال قيد التنفيذ. مسارات المصادقة هذه منفذة؛ المصنع الكامل لم يكتمل بعد.


تتطلب صفحات السجل اتجاهًا صريحًا، وتدعم تصفية الدورة مع ترتيب زمني تصاعدي داخل الصفحة عند تسلسل الحدث المطلوب. تستخدم التطبيقات الأصلية `order=created_at` ولوحة التحكم `order=human_interaction`. تمنع تعيينات الأجهزة المحلية الفارغة أو المعطلة أو غير المتقاطعة جاهزية التنفيذ. تستخدم مسارات الإعداد والتعليمات والمحادثات خلفية المصادقة المشتركة؛ ولا يزال تركيب بيئة التشغيل الكاملة قيد التطوير.


يوفر المسار العام الآن الإعداد والتعليمات وحالة المحادثات وسجلها وSSE القابل للإعادة. يلزم `Last-Event-ID`؛ ويرسل تجاوز المخزن `ironloom.error` لإعادة المزامنة. لا يؤدي قطع النقل إلى إلغاء التنفيذ. اضبط هوية `IRONLOOM_NODE_ID` الثابتة وجذري `IRONLOOM_PROJECTS_ROOT` و`IRONLOOM_MODELS_ROOT` المطلقين والمنفصلين؛ يوفر Helm وحدات تخزين دائمة منفصلة. لا تزال المحولات والعزل والتبعيات المدارة والتنفيذ الكامل قيد التطوير.


يستخدم عزل أوامر Linux عملية مساعدة ومساحات أسماء bubblewrap ومسارات كتابة صريحة وseccomp. لا تنفذ الأوامر عند فشل العزل. تغطي الاختبارات الأصلية العزل ورفض الروابط الرمزية وتنظيف العمليات التابعة. تتضمن الحاوية bubblewrap/Git بمعرف UID/GID 1000. لا يزال سير العمل الكامل والتحقق من تنفيذ Alpine وعمل Mac/GPU غير مكتمل.
