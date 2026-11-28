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
| GET | `/readyz` | Selected database reachable; separate from execution setup, root path |

अनिवार्य सेटिंग: `IRONLOOM_DATABASE_URL`, `IRONLOOM_OPENFGA_URL`, `IRONLOOM_CONFIG_KEY` (base64, 32 बाइट), `IRONLOOM_PUBLIC_URL` और दोनों डाउनलोड सीमाएँ। केवल स्पष्ट आरंभीकरण `IRONLOOM_INSTALLER_TOKEN` पढ़ता है। `IRONLOOM_OPENFGA_TOKEN` तथा `IRONLOOM_OIDC_CONNECTIONS` वैकल्पिक हैं; दूसरा `{id, issuer, client_id, client_secret, redirects}` वाली JSON सरणी है, जिसके कॉलबैक URL अनुमति सूची से ठीक मिलते हैं। ईमेल पहचान का अधिकार नहीं देता।

भूमिका निष्पादन, मॉडल और स्रोत संयोजन तथा ऑपरेटर संसाधनों पर काम जारी है। ये प्रमाणीकरण मार्ग लागू हैं; पूरी फ़ैक्टरी अभी पूर्ण नहीं है।
