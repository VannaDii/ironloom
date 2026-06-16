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
just scripts-test
npm run docs:build
helm lint deploy/helm/ironloom
helm template ironloom deploy/helm/ironloom
```

## Atajos de recetas

- `just proof` construye la imagen del runtime, inicia el contenedor local, envía valores de setup y genera una aplicación de prueba completa.
- `just k3s-acceptance` inicia un contenedor k3s desechable, instala el chart Helm, verifica la entrada firmada de Discord y prueba que el índice de artefactos respaldado por PVC sobreviva al reinicio del pod.
- `just external-probe` usa credenciales reales enlazadas al runtime para leer el estado de repositorio fuente de verdad en GitHub y consultar el estado de calidad e incidencias de SonarCloud.
- `just gates` ejecuta los controles locales comunes de formato, Clippy, pruebas, esquemas, comportamiento del script bootstrap de SonarCloud, docs, Helm, política de dependencias y auditoría de vulnerabilidades.
- `just setup-url` imprime la URL de setup local y el token de instalación para validación manual en el navegador.

## Controles de publicación

- Docker Buildx construye `docker/ironloom-runtime/Dockerfile`.
- Helm publica `deploy/helm/ironloom` como chart OCI.
- GitHub Pages publica el sitio público VitePress.
- SonarCloud recibe cobertura Rust LCOV desde `cargo llvm-cov` y un informe JSON de Clippy generado por el mismo comando de lint que exige CI.
- SonarCloud analiza los archivos del sitio de documentación, pero los excluye del cálculo de cobertura para que Rust LCOV siga siendo la señal del quality gate.
- Después del análisis de SonarCloud, CI espera la tarea del motor de cómputo del scanner e imprime en el log del workflow el estado autenticado del quality gate y cada condición.
- CI verifica el proyecto SonarCloud `vannadii_ironloom` antes del análisis, lo crea cuando SonarCloud devuelve 404 y alinea la rama principal de SonarCloud con la rama predeterminada de GitHub. Si ya existe una rama no principal obsoleta con el nombre de destino, CI la elimina antes de renombrar la rama principal de SonarCloud y verifica el resultado.
- Si SonarCloud devuelve `NONE` porque no hay un quality gate asociado al proyecto, CI exige el gate predeterminado de la organización contra las medidas autenticadas del proyecto y falla de forma cerrada cuando faltan medidas o alguna condición se incumple.
- El secreto `SONAR_TOKEN` debe poder crear/leer el proyecto, gestionar la rama principal, enviar análisis, leer el quality gate, leer los quality gates de la organización y leer las medidas del proyecto; no necesita permiso para modificar quality gates.
