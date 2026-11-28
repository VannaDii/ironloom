# API HTTP del servicio

El servicio autenticado utiliza Tokio/Axum y la ruta base configurada. `ironloom serve` abre la instalación PostgreSQL existente. `ironloom initialize` crea explícitamente un esquema nuevo y el estado del token inicial; rechaza un esquema existente. Los errores y reinicios nunca crean datos de reemplazo.

El acceso al servicio es independiente de las credenciales del proveedor. El inicio de sesión devuelve `AuthenticatedSession`, establece la cookie HttpOnly `ironloom_session` y entrega la prueba CSRF en `ironloom_csrf` y la cabecera `x-ironloom-csrf`. Las mutaciones requieren esa cabecera. Las cookies respetan la ruta base, SameSite=Lax y Secure con HTTPS. Se rechazan solicitudes de otros orígenes. OIDC requiere además una cookie de flujo de un solo uso vinculada al navegador.

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

Configuración obligatoria: `IRONLOOM_DATABASE_URL`, `IRONLOOM_OPENFGA_URL`, `IRONLOOM_CONFIG_KEY` (base64, 32 bytes), `IRONLOOM_PUBLIC_URL` y ambos límites de descarga. Solo la inicialización explícita lee `IRONLOOM_INSTALLER_TOKEN`. Son opcionales `IRONLOOM_OPENFGA_TOKEN` e `IRONLOOM_OIDC_CONNECTIONS`, un arreglo JSON con `{id, issuer, client_id, client_secret, redirects}` y URL de retorno exactas permitidas. El correo electrónico no determina la identidad.

La ejecución de roles, los adaptadores y los recursos del operador siguen en implementación. Estas rutas de autenticación están implementadas; no constituyen una fábrica completa.


La paginación del historial requiere una dirección explícita, permite filtrar por turno y conserva el orden cronológico dentro de cada página en la secuencia de eventos solicitada. La búsqueda de conversaciones requiere `order=created_at` para clientes nativos u `order=human_interaction` para el panel. Las ubicaciones locales vacías, desactivadas o sin intersección impiden la ejecución. Las rutas HTTP de configuración, instrucciones e historial usan el servicio autenticado compartido; la composición completa sigue en desarrollo.


El servicio monta configuración, instrucciones, conversaciones y SSE bajo la ruta pública. SSE requiere `Last-Event-ID`; el desbordamiento emite `ironloom.error` y exige resincronización. Desconectar el transporte no cancela la ejecución. Configure `IRONLOOM_NODE_ID` estable y las rutas absolutas separadas `IRONLOOM_PROJECTS_ROOT` / `IRONLOOM_MODELS_ROOT`; Helm proporciona almacenamiento persistente separado. El registro de adaptadores, el aislamiento y la ejecución completa siguen en desarrollo.


El aislamiento de comandos Linux usa un proceso auxiliar, espacios de nombres de bubblewrap, rutas de escritura explícitas y seccomp. Los fallos de aislamiento impiden ejecutar el comando. Las pruebas nativas cubren aislamiento, enlaces simbólicos y limpieza de descendientes. El contenedor incluye bubblewrap/Git con UID/GID 1000. El flujo completo, la validación de ejecución Alpine y el trabajo Mac/GPU siguen pendientes.


Las reservas de ejecución vinculan el nodo, la instancia exacta del servicio y un contador de propiedad monotónico. Una reserva caducada no se renueva ni se reintenta automáticamente; los procesos o cambios externos sin resolver impiden la recuperación explícita. El proceso auxiliar protege la terminación del padre desde el inicio. Las pruebas nativas pasan; la política Docker de este host impide crear espacios de nombres, por lo que los trabajadores del contenedor no se ejecutan. El flujo completo sigue en desarrollo.


Las lecturas y los comandos HTTP para editar, cambiar ámbito o eliminar lecciones verifican permisos actuales de gestión y uso compartido sin exigir acceso al origen. La eliminación borra el contenido y conserva solo identidad sin contenido para reintentos autorizados. La recuperación usa el estado actual, sin restaurar visibilidad anterior. La ejecución de flujos sigue en desarrollo.

`GET /api/v1/projects?limit=100` devuelve metadatos con autorización vigente, ordenados por interacción humana y con cursor opaco `after`. Los montajes no disponibles y los nodos propietarios remotos permanecen visibles con `storage: unavailable`; leer el catálogo nunca crea directorios sustitutos. Se comprueba Git sin ejecutar hooks ni inferencia. La creación de proyectos y el aprovisionamiento de fuentes siguen en desarrollo.
