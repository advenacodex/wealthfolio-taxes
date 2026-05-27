# Changelog

## [Unreleased]

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

