# API de almacenamiento

Solo `ironloom-storage` lee o escribe directamente rutas `.ironloom/`.

## Almacenamiento de artefactos

Los artefactos se persisten bajo la raíz de estado del runtime y se indexan por hilo de Discord y work item. Las escrituras usan un archivo temporal seguido de un rename atómico.

## Almacenamiento cifrado de configuración

La configuración local se almacena en:

```text
${IRONLOOM_STATE_ROOT}/setup/config.enc.json
```

El archivo almacena:

- payload JSON de configuración cifrado
- nonce aleatorio
- versión de almacenamiento de configuración

Los valores de configuración en texto claro no se escriben en disco. En Unix, las escrituras usan permisos solo para el propietario.

## Requisito de clave

`IRONLOOM_CONFIG_KEY` debe ser material de clave de 32 bytes codificado en Base64. Un pod recreado con el mismo PVC debe recibir la misma clave para descifrar la configuración guardada.
