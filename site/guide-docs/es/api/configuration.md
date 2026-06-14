# API de configuración

La configuración de runtime se resuelve dando prioridad a los valores del entorno sobre los valores de configuración cifrados.

## Entorno de configuración

| Variable | Requerida | Descripción |
| --- | --- | --- |
| `IRONLOOM_CONFIG_KEY` | Sí | Material de clave de 32 bytes codificado en Base64. Se requiere antes de mostrar entradas de configuración. |
| `IRONLOOM_INSTALLER_TOKEN` | Sí | Token generado por el operador y requerido para enviar cambios de configuración. |
| `IRONLOOM_STATE_ROOT` | Sí | Raíz de estado para datos `.ironloom` y almacenamiento de configuración cifrada. |

## Entorno de runtime

| Variable | Requerida para readiness | Descripción |
| --- | --- | --- |
| `IRONLOOM_PUBLIC_URL` | Sí | URL pública del runtime. |
| `IRONLOOM_DISCORD_TOKEN` | Sí | Token de Discord o referencia de secreto. |
| `IRONLOOM_DISCORD_PUBLIC_KEY` | Sí | Clave pública de Discord o referencia de secreto. |
| `IRONLOOM_GITHUB_TOKEN` | Sí | Token de GitHub o referencia de secreto. |
| `IRONLOOM_SONARCLOUD_TOKEN` | Sí | Token de SonarCloud o referencia de secreto. |
| `IRONLOOM_SONARCLOUD_ORGANIZATION` | Sí | Organización de SonarCloud. |
| `IRONLOOM_SONARCLOUD_PROJECT_KEY` | Sí | Clave de proyecto de SonarCloud. |
| `IRONLOOM_OPENAI_API_KEY` | Se requiere un método de OpenAI | Clave API de OpenAI. |
| `IRONLOOM_OPENAI_OAUTH_SESSION` | Se requiere un método de OpenAI | Referencia de sesión OAuth de OpenAI. |

## Orden de resolución

1. Variables de entorno.
2. Archivo de configuración cifrado en `${IRONLOOM_STATE_ROOT}/setup/config.enc.json`.
3. Error de campo de runtime faltante.

Los valores requeridos vacíos fallan de forma cerrada.
