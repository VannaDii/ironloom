# Notas de migración

El estado de runtime se mueve de `.devplat` a `.ironloom`. Los registros existentes de `.devplat` deben archivarse o importarse solo después de una decisión explícita del operador.

El runtime legado OpenClaw no forma parte de Ironloom. Las referencias históricas de migración pueden permanecer en el plan de migración, pero los runbooks y flujos activos apuntan al runtime supervisor en Rust.

La superficie pública de documentación ahora vive en VitePress bajo `site/guide-docs` y se publica en `https://ironloom.dev`.
