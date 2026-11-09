# IMP-INFRA-016 — entrega y validación

## Estado actualizado tras recibir las credenciales — 2026-11-09

Se configuró la URI Atlas SRV proporcionada por el usuario en `.env`, con
`MONGODB_DB_NAME=storify_catalina_dev`. Better Auth, URL local e INSTALL_TOKEN
se conservaron. `.env` sigue ignorado por Git; no se documentan credenciales.
Las referencias posteriores a una URI vacía describen el estado anterior.

El diagnóstico de configuración pasa. La lectura desde el sandbox agotó el
tiempo; fuera del sandbox Atlas respondió con fallo de autenticación. Se amplió
el diagnóstico para identificar ese error sin mostrar el mensaje sensible del
driver. Falta verificar/corregir el usuario o la contraseña de base de datos en
Atlas y actualizar únicamente la URI local. No se logró una lectura autenticada.

Se comprobó que 3000 estaba libre y se inició una única instancia Next.js DEV
con el comando Node equivalente al script `pnpm dev` (pnpm no está en el PATH
de esta sesión). Next informó `Ready` en `http://localhost:3000` cargando `.env`.
No se solicitaron páginas ni se ejecutaron fixtures. El arranque del servidor
no significa que la conexión de la aplicación a Atlas esté validada.

Las siete pruebas de configuración, ESLint del diagnóstico y `git diff --check`
pasaron. No hubo escrituras en MongoDB, restauración de QA, commits ni push.

---

## Seguimiento del bloqueo de inicio — 2026-11-09

Se revisaron configuraciones y respaldos del workspace, incluidos archivos
ignorados por Git. No se encontró una URI DEV recuperable: `.env` tiene
`MONGODB_URI` vacía y `.env.qa.backup` contiene un host de ejemplo. No se
modificó `.env` en este seguimiento ni los valores de Better Auth.

Intervención manual pendiente: abrir `Storify-main-app-v3.0/.env`, línea 48,
y completar el valor después de `MONGODB_URI=` con la URI real de Atlas.
Conservar `MONGODB_DB_NAME=storify_catalina_dev`. No compartir la URI en chat
ni versionarla. Después ejecutar `pnpm db:check` y, si pasa, `pnpm dev`.

Se corrigió el validador para analizar la sintaxis con el driver MongoDB sin
conectar y detectar ejemplos en el host, sin rechazar contraseñas legítimas
por contener palabras como `placeholder`. La misma corrección se aplicó a la
guarda de Mongoose. Las siete pruebas del diagnóstico pasan, incluida la
ejecución de `check-mongodb.mjs --config-only` con formato Atlas SRV y caracteres
codificados (datos sintéticos, sin conexión). Esto valida reconocimiento de
formato, no credenciales ni disponibilidad de Atlas.

El diagnóstico real sigue fallando correctamente por la variable vacía.
`netstat` no encontró procesos escuchando en 3000 durante la revisión; no se
inició otra instancia. No hubo operaciones ni cambios de datos en MongoDB,
restauración de QA, commits ni push.

---

Fecha: 2026-11-09. Repositorio: `Storify-main-app-v3.0`.
Rama: `feat/IMP-FE-015-dgii-free`. Ya existían cambios locales de IMP-FE-015;
se conservaron sus reglas, pruebas y documentación. Sin commits, push o deploy.

## Causa y configuración final

`.env` tenía definiciones duplicadas de MongoDB: las últimas seleccionaban QA
y un host placeholder. `.env.qa` también contenía un host de ejemplo, aunque
su URI tenía formato sintáctico válido. Su lectura falló por DNS; fuera del
sandbox se confirmó `ENOTFOUND`. No se encontró una URI utilizable.

Se eliminaron las definiciones duplicadas y la URI de ejemplo activa.
**Falta completar `MONGODB_URI` en `.env` con la URI real del Atlas existente.**
Está vacía deliberadamente; no se inventaron credenciales. No enviarla por chat.
La ruta de esa URI debe seleccionar `/storify_catalina_dev`.

- `MONGODB_DB_NAME=storify_catalina_dev`.
- `BETTER_AUTH_URL` y `NEXT_PUBLIC_APP_URL`: `http://localhost:3000`.
- `BETTER_AUTH_SECRET` e `INSTALL_TOKEN`: valores locales conservados.
- `FISCAL_PROVIDER_MODE=dgii-free`, `FISCAL_MEDASOFT_NETWORK=false`.
- Mongoose y Better Auth siguen compartiendo la conexión existente.

## Cambios

- `.env` local, `.env.example`, `.gitignore`, `package.json`, `pnpm-lock.yaml`:
  DEV único, comandos de diagnóstico/reporte y retirada de `mongodb-memory-server`.
- `lib/db.ts`: rechazo de placeholders y errores de conexión sin detalles sensibles.
- `scripts/check-mongodb.mjs`, `scripts/lib/dev-env.mjs`,
  `scripts/lib/load-dev-env.mjs`: carga compatible con Next DEV y lectura sin escrituras.
- `playwright.config.ts`, `e2e/dev/*`: tres comprobaciones de acceso/sesión en DEV.
- `playwright.fiscal.config.ts`, `e2e/fiscal/{access,manual}.spec.ts`,
  `e2e/fiscal/{fixtures,setup}.ts`, `scripts/fiscal-dev-fixtures.ts`:
  nueve E2E fiscales conservados, IDs aleatorios, cuentas/pedidos sintéticos y
  limpieza por manifiesto. Se requiere instalación, índices y almacenamiento
  privado existentes; no se reemplazan settings ni se crean buckets.
- `scripts/test-fiscal.mjs`, `scripts/lib/fiscal-dev-isolation.mjs`,
  `scripts/cleanup-fiscal-integration.mjs`,
  `tests/fiscal/{mongo,manual}.integration.test.ts`: misma base DEV con
  colecciones por ejecución, transacciones reales y limpieza limitada al prefijo
  reservado. Sin bases nuevas ni servidor MongoDB adicional.
- `scripts/fiscal-dev-server.mjs`, `scripts/fiscal-qa-server.mjs`: DEV en 3000;
  el nombre anterior queda como alias sin fixtures ni infraestructura propia.
- `tests/dev-env.test.mjs`, `tests/fiscal-dev-isolation.test.ts`: guardas de
  configuración y aislamiento verificables sin conectar a servicios.
- `README.md`, `docs/fiscal/qa.md`, `docs/fiscal/pr-to-qa.md`: operación y limpieza.

No se borraron archivos fuente previos ni pruebas. `.env.qa` se archivó como
`.env.qa.backup`, ignorado por Git y no cargado. El launcher fiscal anterior,
que tenía cambios locales, se respaldó en
`.fiscal-test-runs/IMP-INFRA-016-original-fiscal-qa-server.mjs.bak` antes de
sustituirlo. El simulador de almacenamiento anterior se conserva sin uso.

## Comandos cotidianos

| Acción | Comando |
| --- | --- |
| Diagnóstico | `pnpm check:env` |
| Lectura MongoDB | `pnpm db:check` |
| DEV | `pnpm dev` |
| TypeScript | `pnpm typecheck` |
| E2E de acceso | `pnpm test:e2e` |
| Unitarias fiscales | `pnpm test:fiscal` |
| Integraciones fiscales | `pnpm test:fiscal:integration` |
| E2E fiscales completos | `pnpm test:e2e:fiscal` |
| Reporte HTML | `pnpm test:report` |

`pnpm` no estaba disponible en el PATH de esta sesión. Se usaron Node y los CLI
ya instalados; las alternativas están en `docs/fiscal/qa.md`. No se instalaron herramientas.

## Validación

| Comprobación | Resultado |
| --- | --- |
| Unitarias fiscales | 26/26 aprobadas |
| Diagnóstico y rechazo de placeholders | 5/5 aprobadas |
| Aislamiento de modelos antes de conectar | 1/1 aprobada |
| TypeScript | Aprobado con `--noEmit --incremental false` |
| ESLint de archivos intervenidos | Aprobado |
| Playwright discovery | 3 casos DEV y 9 fiscales conservados |
| Lockfile | YAML válido; importadores directos completos |
| Git diff | Revisado; sin errores de whitespace ni secretos añadidos |
| Conexión MongoDB | No aprobada: host de ejemplo no resolvía; URI retirada |
| Diagnóstico final | Rechaza únicamente la falta de `MONGODB_URI` |
| Integraciones y E2E fiscales | Bloqueados por preflight, antes de sembrar fixtures |
| E2E DEV inicial | No ejecutado: puerto 3000 ocupado/servidor no disponible para Playwright |
| Build completo y regresión admin/auth autenticada | Pendientes de configuración válida; no se declaran aprobados |

Los reportes HTML de los intentos Playwright quedan en `playwright-report/`,
ignorado por Git. La suite fiscal conserva reportes pero desactiva trazas para
no guardar URLs firmadas ni datos ajenos del DEV compartido.

## Pendientes y límites

Completar la URI real, comprobar `pnpm db:check`, reiniciar DEV en 3000 y repetir
integraciones/E2E/build. No se comprobó aún la disponibilidad de índices únicos
ni del bucket privado de DEV. El setup fiscal los exige antes de insertar datos.
La limpieza nueva tiene comprobaciones de pertenencia y tipado, pero su
ejecución completa contra Atlas queda pendiente de esa conexión válida.

Los prefijos de integración y los IDs/marcadores de E2E aíslan datos sintéticos.
La limpieza nunca elimina una base ni colecciones compartidas completas.
Un corte abrupto puede dejar fixtures: conservar el manifiesto y usar la
recuperación documentada. Las cargas sin metadatos confirmados requieren revisión
del prefijo sintético; no se borran objetos de procedencia desconocida.

No se modificaron datos comerciales ni fiscales reales, ni se crearon fixtures
en Atlas durante esta sesión. No hubo emisiones fiscales, migraciones, bases,
clusters ni usuarios Atlas nuevos. Las reglas fiscales, snapshots, hash,
auditoría, separación comercial/fiscal y bloqueo de emisión permanecen intactos.
CA-01, CA-02, CA-06 y la validación completa de CA-05/CA-09 quedan pendientes;
no se presenta el ticket como cerrado mientras falte la conexión real.
