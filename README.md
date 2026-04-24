# WealthTax 📊

Calculadora web de ganancias y pérdidas patrimoniales para declarar el **IRPF** a partir de los datos de [Wealthfolio](https://wealthfolio.app). Implementa el método **FIFO** (First-In-First-Out).

---

## Características

- **Cálculo FIFO completo** — Procesa compras, ventas, splits/contrasplits y dividendos en scrip (TRANSFER_IN).
- **Splits y contrasplits** — Ajusta retroactivamente los lotes anteriores al split; muestra siempre el precio y cantidad originales pre-split.
- **Equivalentes en euros** — Cada valor en moneda extranjera muestra su equivalente en euros al tipo de cambio del día de la operación.
- **Login protegido** — Pantalla de acceso con usuario y contraseña configurables por variables de entorno.
- **Filtros** — Por año fiscal, cuenta y activo.
- **Solo lectura** — Abre `wealthfolio.db` en modo `readonly`, sin riesgo de corrupción.
- **100 % local** — Tus datos financieros nunca salen de tu máquina.

---

## Despliegue con Docker Compose

### Requisitos

- Docker (o OrbStack) instalado.
- La imagen `wealthfolio-taxes:latest` construida localmente (ver [Construir la imagen](#construir-la-imagen)).

### Configuración del `docker-compose.yml`

```yaml
services:
  wealthfolio-taxes:
    container_name: wealthfolio-taxes
    image: wealthfolio-taxes:latest
    ports:
      - "3001:3000"        # La app queda en http://your_server_ip:3001
    user: "1000:10"
    volumes:
      # Monta el directorio de Wealthfolio (necesita R/W por los ficheros WAL de SQLite)
      - "${HOME}/Library/Application Support/wealthfolio:/app/db"
    environment:
      - WF_DB_PATH=/app/db/wealthfolio.db   # Ruta interna a la base de datos
      - APP_USERNAME=admin                   # Usuario del login
      - APP_PASSWORD=taxfolio               # Contraseña del login
      - AUTH_SECRET=cambia-este-secreto     # Secreto para firmar la cookie de sesión
    restart: unless-stopped
```

> **Importante:** Cambia `APP_PASSWORD` y `AUTH_SECRET` antes de exponer la aplicación en red.

### Arrancar

```bash
docker compose up -d
```

Accede a [http://your_server_ip:3001](http://your_server_ip:3001). Se mostrará la pantalla de login.

### Parar

```bash
docker compose down
```

---

## Construir la imagen

La imagen se construye para **linux/amd64** (Intel). Compatible con Mac Apple Silicon mediante emulación.

```bash
docker build --platform linux/amd64 -t wealthfolio-taxes:latest .
```

### Exportar / importar la imagen

```bash
# Exportar a fichero comprimido
docker save wealthfolio-taxes:latest | gzip > wealthfolio-taxes-intel.tar.gz

# Importar en otra máquina
docker load < wealthfolio-taxes-intel.tar.gz
```

---

## Autenticación

La app incluye una pantalla de login. Las credenciales se configuran mediante variables de entorno:

| Variable       | Por defecto | Descripción                                      |
|----------------|-------------|--------------------------------------------------|
| `APP_USERNAME` | `admin`     | Nombre de usuario                                |
| `APP_PASSWORD` | `taxfolio`  | Contraseña                                       |
| `AUTH_SECRET`  | (= password)| Secreto para la cookie de sesión (cámbialo)      |

La sesión dura **7 días**. El botón "Cerrar sesión" está en la parte inferior del menú lateral.

---

## Base de datos

La aplicación lee directamente la base de datos SQLite de Wealthfolio:

| Sistema  | Ruta por defecto                                          |
|----------|-----------------------------------------------------------|
| macOS    | `~/Library/Application Support/wealthfolio/wealthfolio.db` |
| Linux    | `~/.local/share/wealthfolio/wealthfolio.db`               |
| Docker.  | `la ruta definida en el container de Wealthfolio`.        | 

Para usar una ruta diferente, configura la variable `WF_DB_PATH`:

```bash
# Desarrollo local
WF_DB_PATH="/ruta/a/wealthfolio.db" npm run dev

# Docker sin compose
docker run -e WF_DB_PATH=/app/db/wealthfolio.db \
           -v "/ruta/a/dir:/app/db" \
           -p 3001:3000 \
           wealthfolio-taxes:latest
```

---

## Cálculo FIFO

### Método

Cada venta consume lotes de compra en orden cronológico (el primero comprado es el primero vendido). La ganancia o pérdida se calcula en euros:

```
Ganancia = Ingresos por venta (€) − Base de coste FIFO (€)

Ingresos  = Cantidad × Precio_venta × FX_venta  − Comisiones_venta × FX_venta
Coste     = Σ (Cantidad_lote × Precio_compra × FX_compra + Comisiones_compra × FX_compra)
```

Cada operación se convierte a euros **al tipo de cambio del día en que ocurrió**, siguiendo el criterio del IRPF español.

### Splits y contrasplits

Wealthfolio registra los splits como actividades de tipo `SPLIT` con el ratio en el campo `amount` (p.ej. `4` para un split 4:1).

La aplicación ajusta **retroactivamente** todos los lotes anteriores al split:

```
cantidad_ajustada = cantidad_original × ratio
precio_ajustado   = precio_original   / ratio
```

En pantalla siempre se muestra el precio y la cantidad en términos **originales pre-split** para facilitar la verificación:

```
Ejemplo: compra de 10 acciones a $248,91 → split 4:1 → venta de 10 acciones post-split

Lote consumido: 10 post-split = 2,5 acciones originales
Coste mostrado: 2,5 × $248,91 = $622,28
```

### Dividendos en scrip (TRANSFER_IN)

Las operaciones `TRANSFER_IN` se tratan como **ampliaciones de capital sin coste** (scrip dividend / acciones liberadas). El coste total existente se redistribuye proporcionalmente entre todos los lotes:

```
ratio_expansión = (cantidad_existente + acciones_nuevas) / cantidad_existente

Para cada lote:
  nueva_cantidad    = cantidad_antigua × ratio_expansión
  nuevo_precio_unit = precio_unit_antiguo / ratio_expansión   (coste total conservado)
```

### Tipos de cambio BCE

Para cada operación en moneda extranjera se obtiene el tipo oficial del BCE del día exacto vía [frankfurter.app](https://www.frankfurter.app). Si la consulta falla (sin conexión, festivo, etc.) se usa el tipo almacenado en Wealthfolio como respaldo.

---

## Tabla de resultados

Cada venta aparece como una fila azul expandible. Al hacer clic se muestran los lotes de compra consumidos.

| Columna              | Descripción                                                   |
|----------------------|---------------------------------------------------------------|
| Fecha                | Fecha de la venta                                             |
| Activo               | Símbolo del instrumento                                       |
| Cant.                | Número de acciones vendidas (post-split)                      |
| Precio               | Precio unitario de venta en moneda original + equivalente €   |
| Tasa FX              | Tipo de cambio del día (moneda → €)                          |
| Total                | Precio × Cantidad + equivalente €                             |
| Comisiones           | Comisión de venta en moneda original + equivalente €          |
| Total − com.         | Ingresos netos en moneda original + equivalente €             |
| Coste orig. (c/com.) | Coste de compra en moneda original incluidas comisiones        |
| Benef./Pérd. (€)     | Ganancia o pérdida en euros según método FIFO                 |

En las filas de lote (compra) se muestran los mismos campos referidos a la fecha de compra.

---

## Desarrollo local

```bash
# Instalar dependencias
npm install

# Arrancar con la base de datos por defecto
npm run dev

# O apuntando a una base de datos específica
WF_DB_PATH="/ruta/a/wealthfolio.db" npm run dev
```

La app queda disponible en [http://localhost:3000](http://localhost:3000).  
En desarrollo no se requiere login (no hay proxy activo en `next dev`).

---

## Estructura del proyecto

```
src/
├── proxy.ts                      # Protección de rutas (Next.js 16)
├── app/
│   ├── layout.tsx                # Layout raíz, fuentes, metadatos
│   ├── page.tsx                  # Dashboard principal
│   ├── login/
│   │   └── page.tsx              # Pantalla de login
│   └── api/
│       ├── auth/route.ts         # POST /api/auth  (login)
│       │                         # DELETE /api/auth (logout)
│       ├── taxes/route.ts        # GET /api/taxes  (cálculo FIFO)
│       ├── accounts/route.ts     # GET /api/accounts
│       ├── assets/route.ts       # GET /api/assets
│       └── debug/route.ts        # GET /api/debug?symbol=AAPL (diagnóstico)
└── lib/
    ├── fifo.ts                   # Motor FIFO: splits, scrip, lotes
    ├── fxRates.ts                # Tipos de cambio BCE (frankfurter.app)
    └── db.ts                     # Conexión SQLite (better-sqlite3, read-only)
```




*Desarrollado para complementar el ecosistema de Wealthfolio · Solo lectura · Datos 100 % locales*
