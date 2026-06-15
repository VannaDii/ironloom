# API التهيئة

تحل تهيئة وقت التشغيل مع إعطاء الأولوية لقيم البيئة قبل قيم الإعداد المشفرة.

## بيئة الإعداد

| المتغير | مطلوب | الوصف |
| --- | --- | --- |
| `IRONLOOM_CONFIG_KEY` | نعم | مادة مفتاح 32 بايت بترميز Base64. مطلوبة قبل عرض مدخلات الإعداد. |
| `IRONLOOM_INSTALLER_TOKEN` | نعم | رمز يولده المشغل ومطلوب لإرسال تغييرات الإعداد. |
| `IRONLOOM_STATE_ROOT` | نعم | جذر الحالة لبيانات `.ironloom` وتخزين الإعداد المشفر. |

## بيئة وقت التشغيل

| المتغير | مطلوب للجاهزية | الوصف |
| --- | --- | --- |
| `IRONLOOM_PUBLIC_URL` | نعم | عنوان URL العام لوقت التشغيل. |
| `IRONLOOM_DISCORD_APPLICATION_ID` | نعم | معرف تطبيق Discord المستخدم لتفويض الخادم. |
| `IRONLOOM_DISCORD_TOKEN` | نعم | رمز Discord أو مرجع سر. |
| `IRONLOOM_DISCORD_PUBLIC_KEY` | نعم | مفتاح Discord العام أو مرجع سر. |
| `IRONLOOM_GITHUB_TOKEN` | نعم | رمز GitHub أو مرجع سر. |
| `IRONLOOM_SONARCLOUD_TOKEN` | نعم | رمز SonarCloud أو مرجع سر. |
| `IRONLOOM_SONARCLOUD_ORGANIZATION` | نعم | مؤسسة SonarCloud. |
| `IRONLOOM_SONARCLOUD_PROJECT_KEY` | نعم | مفتاح مشروع SonarCloud. |
| `IRONLOOM_OPENAI_API_KEY` | مطلوب أحد أساليب OpenAI | مفتاح OpenAI API. |
| `IRONLOOM_OPENAI_OAUTH_SESSION` | مطلوب أحد أساليب OpenAI | مرجع جلسة OpenAI OAuth. |

## ترتيب الحل

1. متغيرات البيئة.
2. ملف الإعداد المشفر في `${IRONLOOM_STATE_ROOT}/setup/config.enc.json`.
3. خطأ حقل وقت تشغيل مفقود.

تفشل القيم المطلوبة الفارغة بشكل مغلق.
