# WealthTax

Calculadora web de ganancias y pérdidas patrimoniales para la declaración del **IRPF**, construida sobre los datos de [Wealthfolio](https://wealthfolio.app). Implementa el método **FIFO** (First-In-First-Out) conforme al criterio de la Agencia Tributaria española.

> **100 % local** — Tus datos financieros nunca salen de tu máquina.

---

## Características

- Cálculo FIFO completo con soporte de compras, ventas, splits/contrasplits y dividendos en scrip (`TRANSFER_IN`).
- Ajuste retroactivo de lotes ante splits, con visualización siempre en términos pre-split.
- Filtros por año fiscal, cuenta y activo.
- Login protegido con credenciales configurables por variables de entorno.
- Acceso a `wealthfolio.db` en modo **solo lectura** — sin riesgo de corrupción.

---

## Despliegue con Docker

### Opción A — Usar la imagen precompilada

Si recibes la imagen como fichero `.tar.gz`:

```bash
# 1. Importar la imagen
docker load < wealthfolio-taxes-intel.tar.gz

# 2. Verificar que se importó correctamente
docker images | grep wealthfolio-taxes
```

Continúa con el paso [Configurar y arrancar](#configurar-y-arrancar).

---

### Opción B — Construir la imagen localmente

La imagen se genera para **linux/amd64** (Intel/AMD). Compatible con Mac Apple Silicon mediante emulación QEMU.

```bash
docker build --platform linux/amd64 -t wealthfolio-taxes:latest .
```

#### Exportar la imagen para compartirla

```bash
docker save wealthfolio-taxes:latest | gzip > wealthfolio-taxes-intel.tar.gz
```

---

### Configurar y arrancar

Crea un fichero `docker-compose.yml` con el siguiente contenido, ajustando las rutas y credenciales:

```yaml
services:
  wealthfolio-taxes:
    container_name: wealthfolio-taxes
    image: wealthfolio-taxes:latest
    ports:
      - "3001:3000"
    user: "1000:10"
    volumes:
      - "${HOME}/Library/Application Support/wealthfolio:/app/db"
    environment:
      - WF_DB_PATH=/app/db/wealthfolio.db
      - APP_USERNAME=admin
      - APP_PASSWORD=cambia-esta-contraseña
      - AUTH_SECRET=cambia-este-secreto
    restart: unless-stopped
```

> **Importante:** Modifica `APP_PASSWORD` y `AUTH_SECRET` antes de exponer la aplicación en red.

```bash
# Arrancar
docker compose up -d

# Ver logs
docker compose logs -f

# Parar
docker compose down
```

La aplicación queda disponible en **http://your_server_ip:3001**.

#### Sin Docker Compose

```bash
docker run -d \
  --name wealthfolio-taxes \
  -p 3001:3000 \
  -v "/ruta/a/dir/wealthfolio:/app/db" \
  -e WF_DB_PATH=/app/db/wealthfolio.db \
  -e APP_USERNAME=admin \
  -e APP_PASSWORD=cambia-esta-contraseña \
  -e AUTH_SECRET=cambia-este-secreto \
  wealthfolio-taxes:latest
```

---

## Autenticación

La sesión dura **7 días**. El botón de cierre de sesión se encuentra en la parte inferior del menú lateral.

| Variable       | Por defecto | Descripción                              |
|----------------|-------------|------------------------------------------|
| `APP_USERNAME` | `admin`     | Nombre de usuario                        |
| `APP_PASSWORD` | `taxfolio`  | Contraseña                               |
| `AUTH_SECRET`  | —           | Secreto para firmar la cookie de sesión  |

---

## Base de datos

La aplicación lee directamente el fichero SQLite de Wealthfolio en modo solo lectura.

| Sistema | Ruta por defecto                                            |
|---------|-------------------------------------------------------------|
| macOS   | `~/Library/Application Support/wealthfolio/wealthfolio.db` |
| Linux   | `~/.local/share/wealthfolio/wealthfolio.db`                 |

Para sobrescribir la ruta, define la variable `WF_DB_PATH`.

---

## Metodología de cálculo

### FIFO

Cada venta consume lotes de compra en orden cronológico. La ganancia o pérdida se calcula siempre en euros:

```
Ganancia = Ingresos netos (€) − Coste FIFO (€)

Ingresos = Cantidad × Precio_venta × FX_venta − Comisiones_venta × FX_venta
Coste    = Σ (Cantidad_lote × Precio_compra × FX_compra + Comisiones_compra × FX_compra)
```

Cada operación se convierte a euros al tipo de cambio oficial BCE del día exacto en que ocurrió.

### Splits y contrasplits

Los splits se registran en Wealthfolio como actividades de tipo `SPLIT`. La aplicación ajusta retroactivamente todos los lotes anteriores:

```
cantidad_ajustada = cantidad_original × ratio
precio_ajustado   = precio_original   / ratio
```

En pantalla se muestran siempre los valores **pre-split** para facilitar la verificación con el broker.

### Dividendos en scrip (`TRANSFER_IN`)

Se tratan como ampliaciones de capital sin coste. El coste total se redistribuye proporcionalmente entre todos los lotes:

```
ratio = (cantidad_existente + acciones_nuevas) / cantidad_existente

nueva_cantidad     = cantidad_antigua × ratio
nuevo_precio_unit  = precio_unit_antiguo / ratio
```

---

## Tabla de resultados

Cada venta aparece como una fila expandible. Al hacer clic se despliegan los lotes de compra consumidos.

| Columna              | Descripción                                                  |
|----------------------|--------------------------------------------------------------|
| Fecha                | Fecha de la venta                                            |
| Activo               | Símbolo del instrumento                                      |
| Cant.                | Acciones vendidas (términos post-split)                      |
| Precio               | Precio unitario en moneda original + equivalente €           |
| Tasa FX              | Tipo de cambio BCE del día (moneda → €)                     |
| Total                | Precio × Cantidad + equivalente €                            |
| Comisiones           | Comisión de venta en moneda original + equivalente €         |
| Total − com.         | Ingresos netos en moneda original + equivalente €            |
| Coste orig. (c/com.) | Coste de compra en moneda original incluidas comisiones      |
| Benef./Pérd. (€)    | Ganancia o pérdida en euros según FIFO                       |

---

## Desarrollo local

```bash
# Instalar dependencias
npm install

# Arrancar (base de datos por defecto según SO)
npm run dev

# Apuntando a una base de datos específica
WF_DB_PATH="/ruta/a/wealthfolio.db" npm run dev
```

La app queda disponible en http://your_server_ip:3000. En entorno de desarrollo no se requiere login.

---

## Estructura del proyecto

```
src/
├── proxy.ts                    # Middleware de autenticación (Next.js)
├── app/
│   ├── layout.tsx              # Layout raíz
│   ├── page.tsx                # Dashboard principal
│   ├── login/page.tsx          # Pantalla de login
│   └── api/
│       ├── auth/route.ts       # POST /api/auth · DELETE /api/auth
│       ├── taxes/route.ts      # GET  /api/taxes   — cálculo FIFO
│       ├── accounts/route.ts   # GET  /api/accounts
│       ├── assets/route.ts     # GET  /api/assets
│       └── debug/route.ts      # GET  /api/debug?symbol=AAPL
└── lib/
    ├── fifo.ts                 # Motor FIFO: splits, scrip, lotes
    ├── fxRates.ts              # Tipos de cambio BCE (frankfurter.app)
    └── db.ts                   # Conexión SQLite — better-sqlite3, read-only
```

---

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/V7V41YCZ2U)


---

## Aviso legal
WealthTax es un proyecto independiente y no está afiliado, asociado, autorizado, respaldado ni vinculado de ningún modo con Wealthfolio ni con sus creadores. El nombre "Wealthfolio" y cualquier logotipo o marca relacionada son propiedad de sus respectivos titulares. Este proyecto simplemente lee el fichero de base de datos generado por Wealthfolio y no forma parte de dicho producto.
Este software se proporciona exclusivamente con fines informativos y de apoyo al usuario en la preparación de su declaración fiscal. Los resultados producidos por esta herramienta no constituyen asesoramiento fiscal, legal ni financiero. El usuario es el único responsable de verificar la exactitud de los cálculos y de cumplir con sus obligaciones tributarias ante la Agencia Tributaria o cualquier otra autoridad competente.
En ningún caso los autores o contribuidores de este proyecto serán responsables de ningún daño directo, indirecto, incidental, especial, ejemplar o consecuente (incluyendo, entre otros, pérdidas económicas, sanciones fiscales, pérdida de datos o interrupción de negocio) derivado del uso o la imposibilidad de uso de este software, incluso si se ha advertido de la posibilidad de dichos daños.
El uso de este software implica la aceptación íntegra de este aviso.

Licencia
Este programa es software libre: puedes redistribuirlo y/o modificarlo bajo los términos de la GNU Affero General Public License publicada por la Free Software Foundation, ya sea la versión 3 de la Licencia o (a tu elección) cualquier versión posterior.
Este programa se distribuye con la esperanza de que sea útil, pero SIN NINGUNA GARANTÍA; sin siquiera la garantía implícita de COMERCIABILIDAD o IDONEIDAD PARA UN PROPÓSITO PARTICULAR. Consulta la GNU Affero General Public License para más detalles.
