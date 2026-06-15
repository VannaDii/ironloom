# Primeros pasos

Esta guía inicia el runtime de Ironloom localmente, verifica el puerto HTTP existente y muestra el control de configuración inicial.

## Requisitos

- Toolchain de Rust desde `rust-toolchain.toml`
- Cargo
- Docker
- `just`
- Un shell con acceso a `openssl`

## Ejecutar la prueba con Docker

```sh
just proof
```

La receta construye la imagen del runtime, inicia Ironloom en `http://127.0.0.1:8080`, envía valores de configuración local al endpoint de setup y escribe una aplicación estática completa en `.ironloom/local-dev/worktrees/ironloom-proof-app`.

Usa `just setup-url` para imprimir la URL de setup local y el token de instalación cuando quieras completar la configuración manualmente desde el navegador. Usa `just docker-stop` para detener el contenedor local del runtime.

## Iniciar el runtime

```sh
IRONLOOM_BIND_ADDR=127.0.0.1:8080 \
IRONLOOM_PUBLIC_URL=https://ironloom.dev \
IRONLOOM_STATE_ROOT=/tmp/ironloom/.ironloom \
IRONLOOM_CONFIG_KEY="$(openssl rand -base64 32)" \
IRONLOOM_INSTALLER_TOKEN="$(openssl rand -base64 32)" \
IRONLOOM_DISCORD_APPLICATION_ID=123456789012345678 \
IRONLOOM_DISCORD_TOKEN=local-discord-token \
IRONLOOM_DISCORD_PUBLIC_KEY=local-discord-public-key \
IRONLOOM_GITHUB_TOKEN=local-github-token \
IRONLOOM_SONARCLOUD_TOKEN=local-sonar-token \
IRONLOOM_SONARCLOUD_ORGANIZATION=local-sonar-org \
IRONLOOM_SONARCLOUD_PROJECT_KEY=local-sonar-project \
IRONLOOM_OPENAI_API_KEY=local-openai-key \
cargo run -p ironloom-runtime --bin ironloom -- serve
```

## Comprobar health y readiness

```sh
curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8080/readyz
```

`/healthz` reporta si el servidor HTTP está vivo. `/readyz` devuelve `503` hasta que la configuración de runtime requerida se resuelve desde variables de entorno o configuración local cifrada.

## Abrir configuración

Visita `http://127.0.0.1:8080/setup`.

Si `IRONLOOM_CONFIG_KEY` falta o no es válido, la página solo muestra instrucciones para añadirlo. Cuando la clave de configuración y el token de instalación están disponibles, la página acepta entradas de runtime faltantes y las guarda cifradas bajo `IRONLOOM_STATE_ROOT`.
