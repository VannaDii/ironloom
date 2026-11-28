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

`POST /api/v1/commands` admite cambios persistentes de presupuesto además de gestionar lecciones. Los límites se pueden editar o desactivar independientemente de la aprobación del plan. Los contadores contables y el uso desconocido son de solo lectura; no se permite cambiar moneda con exposición pendiente. El cambio aceptado guarda atómicamente el evento y recibo del actor; repetirlo no crea otro evento. Los demás comandos de ejecución siguen en desarrollo.

La entrada humana, la orientación del turno y los controles de asignación usan la ruta persistente de comandos. Una entrada nueva guarda atómicamente su historial original, turno, asignación, instrucciones copiadas y cola del nodo propietario. La repetición conserva el resultado original antes de comprobar el turno mutable. La coordinación usa el rol de orquestación habilitado o el gestor de producto estándar, sin otra opción de entrada ni requisito global de preparación.

Las instantáneas exponen `pause_requested` anulable: ausente sin asignación activa, falso sin pausa pendiente y verdadero mientras se espera un límite seguro. Confirmar pausa o terminación exige registros persistentes de solicitudes, procesos, mutaciones y rutas sin actividad pendiente. El vencimiento del arrendamiento, el fin del flujo y aceptar cancelación no prueban terminación. Las confirmaciones en segundo plano conservan el orden de interacción humana.

`GET /api/v1/assignments/{id}/instructions` devuelve copias autorizadas y revisiones aplicadas/confirmadas aunque el espacio de trabajo no esté disponible. Editar plantillas conserva la elección explícita sobre copias activas. La inferencia de roles, preguntas/aprobaciones, herramientas, árboles de trabajo e integración final siguen en desarrollo.

La configuración añade `endpoints` (proveedor, base API, dialecto y facturación explícitos, soporte de streaming, herramientas, uso y niveles de razonamiento) y `source_accounts` (host y elección explícita entre acceso anónimo o referencia de credencial). Ambos usan `/api/v1/configuration`, heredan por ámbito y sustituyen solo la lista enviada; una lista vacía la borra. Las URL rechazan credenciales incrustadas, consultas, fragmentos y HTTP remoto sin cifrar. Un endpoint ausente, facturación incompatible o esfuerzo no admitido bloquea la disponibilidad del perfil remoto sin probar inferencia. Las descargas conservan su selección de cuenta en privado; la integración de callbacks sigue en curso.
