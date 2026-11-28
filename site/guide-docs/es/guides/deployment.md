# Despliegue

El servicio actual abre la instalación PostgreSQL existente y el endpoint OpenFGA configurados. No crea una base de reemplazo cuando falla. Los servicios incluidos y la gestión nativa siguen en implementación; este cableado no completa el plan de despliegue.

Antes de iniciar el Deployment, prepare la base PostgreSQL nueva seleccionada y OpenFGA; ejecute `ironloom initialize` una vez con `IRONLOOM_DATABASE_URL` e `IRONLOOM_INSTALLER_TOKEN`. Solo crea un esquema Ironloom nuevo y rechaza uno existente. Los reinicios usan `ironloom serve` y la misma instalación. La recuperación de permisos iniciales conserva al mismo administrador; no reemplaza la cuenta ni restaura permisos revocados después de completarse.

```mermaid
flowchart LR
  DB[(Fresh PostgreSQL)] --> Init[ironloom initialize]
  Init --> Service[ironloom serve]
  FGA[Configured OpenFGA] --> Service
  Service --> Account[Register and authenticate]
  Account --> Bootstrap[One-time bootstrap]
  Bootstrap --> Ready[Recover same-user initial grants]
```

El chart lee `IRONLOOM_DATABASE_URL` desde `database.existingSecret` / `database.urlKey` (por defecto `ironloom-database` / `database-url`). Configure `openfga.url` con el endpoint real autorizado; `openfga.existingSecret` / `openfga.tokenKey` proporcionan opcionalmente su token. El endpoint predeterminado es un nombre por configurar, no un despliegue OpenFGA incluido todavía. Mantenga conexiones privadas y proteja el transporte remoto.

Proporcione `IRONLOOM_CONFIG_KEY` mediante el secreto de configuración: base64 de 32 bytes. El token inicial se consume al establecer el administrador autenticado; no es una contraseña reutilizable. El registro de cuentas usa la ruta de autenticación. Configure `runtime.publicUrl` con su ruta base y límites positivos explícitos `download.maxFileBytes` / `download.maxTransferBytes`.

Renderizar el chart no despliega ni valida inferencia. Mantenga separados los directorios persistentes y sus propietarios. No borre PVC ni reinicie datos para eludir fallos de conexión o autenticación.


El servicio monta configuración, instrucciones, conversaciones y SSE bajo la ruta pública. SSE requiere `Last-Event-ID`; el desbordamiento emite `ironloom.error` y exige resincronización. Desconectar el transporte no cancela la ejecución. Configure `IRONLOOM_NODE_ID` estable y las rutas absolutas separadas `IRONLOOM_PROJECTS_ROOT` / `IRONLOOM_MODELS_ROOT`; Helm proporciona almacenamiento persistente separado. El registro de adaptadores, el aislamiento y la ejecución completa siguen en desarrollo.


El aislamiento de comandos Linux usa un proceso auxiliar, espacios de nombres de bubblewrap, rutas de escritura explícitas y seccomp. Los fallos de aislamiento impiden ejecutar el comando. Las pruebas nativas cubren aislamiento, enlaces simbólicos y limpieza de descendientes. El contenedor incluye bubblewrap/Git con UID/GID 1000. El flujo completo, la validación de ejecución Alpine y el trabajo Mac/GPU siguen pendientes.
