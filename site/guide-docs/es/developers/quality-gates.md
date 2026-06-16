# Controles de calidad

Ironloom conserva validación estricta mediante formateo de Cargo, Clippy, pruebas, política de dependencias, auditoría de vulnerabilidades, esquemas, build de documentación, build de Docker, render de Helm y análisis de SonarCloud.

## Controles locales

```sh
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
cargo run -p ironloom-schemas -- --check
cargo deny check
cargo audit
npm run docs:build
helm lint deploy/helm/ironloom
helm template ironloom deploy/helm/ironloom
```

## Atajos de recetas

- `just proof` construye la imagen del runtime, inicia el contenedor local, envía valores de setup y genera una aplicación de prueba completa.
- `just k3s-acceptance` inicia un contenedor k3s desechable, instala el chart Helm, verifica la entrada firmada de Discord y prueba que el índice de artefactos respaldado por PVC sobreviva al reinicio del pod.
- `just external-probe` usa credenciales reales enlazadas al runtime para leer el estado de repositorio fuente de verdad en GitHub y consultar el estado de calidad e incidencias de SonarCloud.
- `just gates` ejecuta los controles locales comunes de formato, Clippy, pruebas, esquemas, docs y Helm.
- `just setup-url` imprime la URL de setup local y el token de instalación para validación manual en el navegador.

## Controles de publicación

- Docker Buildx construye `docker/ironloom-runtime/Dockerfile`.
- Helm publica `deploy/helm/ironloom` como chart OCI.
- GitHub Pages publica el sitio público VitePress.
- SonarCloud recibe cobertura Rust LCOV desde `cargo llvm-cov` y un informe JSON de Clippy generado por el mismo comando de lint que exige CI.
- El secreto `SONAR_TOKEN` debe poder enviar análisis y leer el quality gate de `vannadii_ironloom`; un token solo con acceso de análisis puede subir informes, pero no puede satisfacer la espera estricta del gate.
