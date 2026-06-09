# Changelog

## [Unreleased]

## 2026-06-09

### Added
- **Número de versión `20260609`**: visible bajo el título "WealthTax" en el sidebar como texto pequeño. Definido como constante `VERSION` en `src/app/page.tsx`. La imagen Docker lleva `LABEL version="20260609"` en el `Dockerfile` y el tag en `docker-compose.yml` pasa de `latest` a `20260609`.

- **Ordenación por Fecha y Activo en ambas tablas**: las cabeceras "Fecha" y "Activo" en la tabla de posiciones cerradas y "Fecha / Activo" en la de abiertas son ahora clickables. Primer clic ordena ASC, segundo DESC, tercer clic elimina la ordenación. El icono muestra el estado actual (↕ neutro, ↑ ASC, ↓ DESC).
  - `src/app/page.tsx`: añadido componente `SortArrow` y tipos `SortCol`/`SortDir`. `ClosedPositionsTable` ordena por `sellDate` o símbolo del activo. `OpenPositionsTable` ordena por símbolo (Activo) o por la fecha del primer lote de la posición (Fecha). Nuevos iconos `ChevronUp`, `ChevronDown`, `ChevronsUpDown` importados de lucide-react.

- **Columna "Cuenta" en el desglose de lotes**: en ambas vistas (posiciones cerradas y abiertas), las filas de lote de compra muestran ahora la cuenta de origen en una nueva columna "Cuenta" situada después de "Activo".
  - `src/lib/fifo.ts`: añadido `accountId` (account_id real de la actividad) a las interfaces `Lot`, `RealizedGain.matchedLots` y `OpenPositionLot`. El campo se rellena al crear cada lote en BUY/RECEIVE/TRANSFER_IN y se propaga a `matchedLots` al consumirse en una venta.
  - `src/app/page.tsx`: `ClosedPositionsTable` y `OpenPositionsTable` reciben ahora la prop `accounts`; ambas tablas incluyen la cabecera "Cuenta" y cada fila de lote muestra el nombre de la cuenta resolviendo `accountId` contra el array de cuentas.

## 2026-06-05

### Added
- **Filtro por Account Group**: nuevo selector "Grupo" en la barra lateral que aparece solo cuando existen grupos definidos en la base de datos. Al seleccionar un grupo se muestran las operaciones de todas las cuentas del grupo; es mutuamente exclusivo con el filtro de Cuenta (seleccionar uno limpia el otro).
  - `src/app/api/account-groups/route.ts`: nuevo endpoint GET que devuelve los nombres de grupo distintos y no nulos de las cuentas activas.
  - `src/app/api/taxes/route.ts` y `src/app/api/open-positions/route.ts`: aceptan el parámetro `group`; cuando se recibe, filtran las actividades a las cuentas de ese grupo y omiten el post-filtro por cuenta individual.
  - `src/app/page.tsx`: carga los grupos al inicio, añade el estado `selectedGroup`, renderiza el selector condicionalmente y lo conecta a los endpoints.

## 2026-06-05

### Changed
- **FIFO por Account Group**: el cálculo FIFO ahora agrupa los lotes por el campo `group` de la tabla `accounts` en lugar de por cuenta individual. Si varias cuentas comparten el mismo grupo, sus lotes se combinan en un único pool de FIFO por activo. Cuentas sin grupo se tratan como pool individual (comportamiento anterior).
  - `src/lib/db.ts`: añadido `group?: string | null` a `Account` y `account_group?: string | null` a `Activity`.
  - `src/lib/fifo.ts`: `_runFIFO` cambia la clave del map de `assetId|||accountId` a `assetId|||groupKey` donde `groupKey = account_group ?? account_id`. Añadida deduplicación de eventos SPLIT por `(assetId, date)` para evitar doble aplicación cuando múltiples cuentas del mismo grupo registran el mismo split.
  - `src/app/api/taxes/route.ts`: la consulta SQL hace LEFT JOIN con `accounts` para obtener el grupo; cuando se filtra por `accountId`, se amplía automáticamente a todas las cuentas del mismo grupo; tras el FIFO, los resultados se filtran para mostrar solo las ventas de la cuenta seleccionada.
  - `src/app/api/open-positions/route.ts`: misma expansión de grupo; las posiciones abiertas se muestran a nivel de grupo.

## 2026-05-27

### Added
- **Vista "Posiciones Abiertas"**: toggle de dos botones en la cabecera (Posiciones cerradas / Posiciones abiertas) afectadas por los mismos filtros de sidebar.
  - `src/lib/fifo.ts`: refactorizado con función interna `_runFIFO` que devuelve tanto ganancias realizadas como lotes abiertos; nueva función exportada `calculateOpenPositions` con tipos `OpenPosition` y `OpenPositionLot`.
  - `src/app/api/open-positions/route.ts`: nuevo endpoint GET; aplica filtros de cuenta/activo en SQL; el filtro de año filtra los lotes por fecha de compra (post-FIFO) y recalcula los agregados.
  - `src/app/page.tsx`: extraídos componentes `ClosedPositionsTable` y `OpenPositionsTable`; las filas de posiciones abiertas son expandibles (igual que las cerradas); badges de color indican splits (verde) y contrasplits (amarillo); tarjetas de resumen adaptadas a cada vista.

### Fixed
- Filtros de Cuenta y Activo no tenían efecto en la API (`src/app/api/taxes/route.ts`). La query SQL `WHERE status = 'POSTED' OR activity_type = 'SPLIT'` carecía de paréntesis, por lo que al añadir `AND account_id = ?` o `AND asset_id = ?` la precedencia de operadores SQL hacía que el `AND` se ligara solo a la cláusula `SPLIT`, dejando pasar todas las actividades `POSTED` sin filtrar por cuenta ni activo. Solución: envolver la condición base en paréntesis → `WHERE (status = 'POSTED' OR activity_type = 'SPLIT') AND ...`.

### Changed
- Título de la pestaña del navegador renombrado de "Create Next App" a "Wealthtaxes" (`src/app/layout.tsx`)
- Listas de filtros (Cuenta y Activo) ordenadas alfabéticamente al cargar (`src/app/page.tsx`)
- Cabecera de la tabla con fondo negro y texto blanco (`src/app/page.tsx`)
- Lotes de compra colapsables por defecto; clic en la fila de venta (o en el chevron) los expande/colapsa individualmente (`src/app/page.tsx`)
- Columnas de la tabla reestructuradas: Fecha, Activo, Cant., Precio venta, Total venta, Comisiones, Total−com., Coste orig. (c/com.), Benef./Pérd. (€) — misma estructura para filas de lotes de compra

