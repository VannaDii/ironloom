# रनटाइम HTTP API

प्रमाणित सेवा Tokio/Axum और निर्धारित परिनियोजन आधार पथ का उपयोग करती है। `ironloom serve` चयनित मौजूदा PostgreSQL स्थापना खोलता है। `ironloom initialize` स्पष्ट रूप से नया स्कीमा और एकबारगी प्रारंभिक टोकन स्थिति बनाता है; मौजूदा स्कीमा अस्वीकार होता है। त्रुटि या पुनः आरंभ पर प्रतिस्थापन डेटा नहीं बनता।

सेवा लॉगिन प्रदाता की पहचान संबंधी गोपनीय जानकारी से अलग है। लॉगिन `AuthenticatedSession` लौटाता है, HttpOnly `ironloom_session` कुकी सेट करता है और CSRF प्रमाण `ironloom_csrf` तथा `x-ironloom-csrf` प्रतिक्रिया हेडर में देता है। बदलाव वाले अनुरोध में यह हेडर अनिवार्य है। कुकी में आधार पथ, SameSite=Lax और HTTPS पर Secure लागू होते हैं। अन्य मूल से अनुरोध अस्वीकार होते हैं। OIDC कॉलबैक के लिए ब्राउज़र से जुड़ी एकबारगी प्रवाह कुकी भी अनिवार्य है।

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

अनिवार्य सेटिंग: `IRONLOOM_DATABASE_URL`, `IRONLOOM_OPENFGA_URL`, `IRONLOOM_CONFIG_KEY` (base64, 32 बाइट), `IRONLOOM_PUBLIC_URL` और दोनों डाउनलोड सीमाएँ। केवल स्पष्ट आरंभीकरण `IRONLOOM_INSTALLER_TOKEN` पढ़ता है। `IRONLOOM_OPENFGA_TOKEN` तथा `IRONLOOM_OIDC_CONNECTIONS` वैकल्पिक हैं; दूसरा `{id, issuer, client_id, client_secret, redirects}` वाली JSON सरणी है, जिसके कॉलबैक URL अनुमति सूची से ठीक मिलते हैं। ईमेल पहचान का अधिकार नहीं देता।

भूमिका निष्पादन, मॉडल और स्रोत संयोजन तथा ऑपरेटर संसाधनों पर काम जारी है। ये प्रमाणीकरण मार्ग लागू हैं; पूरी फ़ैक्टरी अभी पूर्ण नहीं है।


इतिहास पृष्ठों में आगे या पीछे की दिशा स्पष्ट देना आवश्यक है। वैकल्पिक टर्न फ़िल्टर के साथ हर पृष्ठ अनुरोधित घटना क्रम तक पुराने से नए क्रम में रहता है। नेटिव सूची में `order=created_at` और डैशबोर्ड में `order=human_interaction` आवश्यक है। खाली, अक्षम या असंगत स्थानीय डिवाइस चयन निष्पादन की तैयारी रोकते हैं। कॉन्फ़िगरेशन, निर्देश और वार्तालाप HTTP मार्ग साझा प्रमाणित सेवा का उपयोग करते हैं; पूर्ण रनटाइम संयोजन अभी जारी है।


सेवा अब सार्वजनिक पथ पर कॉन्फ़िगरेशन, निर्देश, वार्तालाप इतिहास और पुनः चल सकने वाला SSE प्रदान करती है। SSE के लिए `Last-Event-ID` आवश्यक है; बफ़र भरने पर `ironloom.error` पुनः समन्वयन बताता है। कनेक्शन बंद होना निष्पादन रद्द नहीं करता। स्थिर `IRONLOOM_NODE_ID` और अलग पूर्ण पथ `IRONLOOM_PROJECTS_ROOT` / `IRONLOOM_MODELS_ROOT` दें; Helm अलग स्थायी वॉल्यूम देता है। अडैप्टर, सैंडबॉक्स, प्रबंधित निर्भरताएँ और पूर्ण निष्पादन अभी जारी हैं।


Linux कमांड अलगाव अब अलग सहायक प्रक्रिया, bubblewrap नेमस्पेस, स्पष्ट लेखन पथ और seccomp का उपयोग करता है। अलगाव विफल होने पर कमांड नहीं चलता। नेटिव परीक्षण अलगाव, सिमलिंक अस्वीकृति और चाइल्ड प्रक्रिया सफ़ाई जाँचते हैं। कंटेनर में bubblewrap/Git और UID/GID 1000 हैं। पूर्ण वर्कफ़्लो, Alpine निष्पादन सत्यापन और Mac/GPU कार्य अभी अधूरे हैं।


डिस्पैच लीज़ में स्वामी नोड, सटीक सेवा इंस्टेंस और बढ़ता स्वामित्व फ़ेंस शामिल हैं। समाप्त लीज़ अपने आप नवीनीकृत या पुनः निष्पादित नहीं होती; अनसुलझी प्रक्रियाएँ या बाहरी बदलाव स्पष्ट रिकवरी रोकते हैं। सहायक प्रक्रिया शुरुआत से पैरेंट समाप्ति की जाँच करती है। नेटिव परीक्षण पास हैं, लेकिन इस होस्ट की डिफ़ॉल्ट Docker नीति नेमस्पेस बनाना रोकती है; कंटेनर वर्कर सुरक्षित रूप से निष्पादन रोकते हैं। पूर्ण वर्कफ़्लो अभी जारी है।


सीख के HTTP पठन और संपादन, स्कोप तथा हटाने के कमांड वर्तमान प्रबंधन और शेयर अनुमतियाँ जाँचते हैं; निजी स्रोत एक्सेस आवश्यक नहीं है। हटाने पर सामग्री मिटती है और अधिकृत पुनः प्रयास के लिए केवल सामग्री रहित पहचान रहती है। बैकग्राउंड रिकवरी वर्तमान स्थिति उपयोग करती है, पुरानी साझेदारी बहाल नहीं करती। वर्कफ़्लो कमांड निष्पादन अभी जारी है।

`GET /api/v1/projects?limit=100` वर्तमान अनुमति वाले परियोजना मेटाडेटा को मानव गतिविधि के क्रम में, अपारदर्शी `after` कर्सर के साथ लौटाता है। अनुपलब्ध माउंट और दूरस्थ स्वामी नोड `storage: unavailable` के साथ दिखाई देते रहते हैं; कैटलॉग पढ़ना वैकल्पिक निर्देशिकाएँ नहीं बनाता। Git उपलब्धता हुक या इन्फ़रेंस चलाए बिना जाँची जाती है। परियोजना निर्माण और स्रोत प्रावधान अभी लागू किए जा रहे हैं।
