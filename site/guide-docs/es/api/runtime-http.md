# API HTTP del runtime

Ironloom sirve setup, health y readiness en el puerto HTTP existente del runtime.

## `GET /healthz`

Devuelve `200 ok` cuando el servidor HTTP está vivo.

## `GET /readyz`

Devuelve `200 ok` solo cuando la configuración de runtime requerida se resuelve desde valores de entorno o configuración local cifrada. Devuelve `503 setup required` mientras la configuración siga incompleta.

## `GET /`

Devuelve la página de configuración.

## `GET /setup`

Devuelve la página de configuración.

Si `IRONLOOM_CONFIG_KEY` falta o no es válido, la página muestra instrucciones de clave y ningún campo de entrada de configuración.

Si `IRONLOOM_INSTALLER_TOKEN` falta, la página muestra instrucciones para el token de instalación.

Cuando los prerrequisitos de configuración están presentes, la página renderiza el formulario de configuración. Los campos respaldados por entorno quedan bloqueados y los valores secretos no se muestran.

## `POST /setup`

Acepta valores del formulario de configuración después de que el token de instalación enviado coincida con `IRONLOOM_INSTALLER_TOKEN`.

Los envíos exitosos escriben configuración cifrada bajo `IRONLOOM_STATE_ROOT` y devuelven `200 setup saved`.

Los tokens de instalación inválidos devuelven `403 setup rejected`.

## `POST /setup/openai/oauth/start`

Devuelve las instrucciones de setup OAuth de OpenAI usadas por la página de configuración. La referencia de sesión OAuth resultante puede guardarse mediante el formulario o enlazarse mediante `IRONLOOM_OPENAI_OAUTH_SESSION`.

## `POST /setup/discord/oauth/start`

Devuelve una página de autorización de Discord para el ID de aplicación configurado. La URL generada usa los scopes `bot` y `applications.commands` para que un administrador del servidor pueda instalar Ironloom en el servidor objetivo.

## `POST /discord/interactions`

Acepta webhooks de interacciones de Discord firmados con `X-Signature-Ed25519` y `X-Signature-Timestamp`.

Las interacciones ping devuelven el payload pong de Discord. Las interacciones de comandos de aplicación resuelven el canal de Discord como hilo del operador, requieren exactamente un vínculo persistido a un work item, despachan el worker de control seleccionado mediante el supervisor, escriben un artefacto y devuelven una respuesta de mensaje de canal. Las firmas inválidas devuelven `401` antes de ejecutar trabajo.
