# PedidoClaro

Sistema de gestión de pedidos para distribuidoras y comercializadoras en México.

Stack: Cloudflare Workers + D1 + Pages, Twilio WhatsApp API, GitHub Actions.

## Estructura del repositorio

```
proyectos/pedidoclaro/
├── migrations/
│   └── 0001_init.sql          # esquema D1 (clientes, vendedores, pedidos, notificaciones_log)
├── src/
│   ├── index.ts                # router del Worker (fetch + scheduled/cron)
│   ├── types.ts                # tipo Env (bindings y secrets)
│   ├── lib/
│   │   ├── cors.ts             # CORS + helper de respuestas JSON
│   │   ├── db.ts                # helpers de acceso a D1
│   │   └── twilio.ts            # envío de WhatsApp vía Twilio
│   └── workers/
│       ├── worker1_registrar.ts        # POST /pedido
│       ├── worker2_pedidos.ts          # GET /pedidos (tablero)
│       ├── worker3_whatsapp_cliente.ts # confirmación al cliente (interno)
│       ├── worker4_whatsapp_almacen.ts # alerta al almacén (interno)
│       ├── worker5_estatus.ts          # PATCH /pedido/:id/estatus
│       ├── worker6_reporte.ts          # reporte matutino (cron 8am MX)
│       └── worker7_sync_pos.ts         # POST /sync/pos + cron cada 5 min
├── public/                      # Cloudflare Pages (frontend)
│   ├── form/                    # /form — formulario del vendedor
│   └── tablero/                 # /tablero — tablero del dueño
├── wrangler.toml
├── package.json
└── tsconfig.json

.github/workflows/deploy-pedidoclaro.yml   # deploy automático (Worker + Pages)
```

Nota: los 7 "Workers" del brief están implementados como módulos de **un solo
Worker de Cloudflare** (`src/index.ts` enruta las peticiones HTTP y despacha
los dos cron triggers). Worker 3 y Worker 4 son funciones internas — nunca se
exponen como endpoint HTTP — tal como pide el brief.

## Primer deploy — comandos exactos

Desde `proyectos/pedidoclaro/`:

```bash
npm install

# Autenticarse con Cloudflare (una sola vez)
npx wrangler login

# Crear la base D1 y copiar el database_id que devuelve
npx wrangler d1 create pedidoclaro-db
# -> pega ese id en wrangler.toml, campo database_id

# Aplicar el esquema
npx wrangler d1 execute pedidoclaro-db --remote --file=migrations/0001_init.sql

# Insertar al menos un vendedor (necesario para poder registrar pedidos)
npx wrangler d1 execute pedidoclaro-db --remote --command \
  "INSERT INTO vendedores (id, nombre, telefono, activo) VALUES ('11111111-1111-1111-1111-111111111111', 'Juan Pérez', '+525500000000', 1);"

# Configurar los secrets (ver checklist abajo)
npx wrangler secret put TWILIO_ACCOUNT_SID
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put TWILIO_WHATSAPP_FROM
npx wrangler secret put ALMACEN_TELEFONO
npx wrangler secret put DUENO_TELEFONO

# Deploy del Worker
npx wrangler deploy

# Deploy del frontend (Pages)
npx wrangler pages deploy public --project-name=pedidoclaro-frontend
```

Después del primer `wrangler deploy`, copia la URL del Worker
(`https://pedidoclaro.<tu-subdominio>.workers.dev`) y pégala como `API_BASE`
en `public/form/config.js` y `public/tablero/config.js`, junto con el/los
vendedor(es) creados arriba (`VENDEDORES`). Vuelve a correr
`wrangler pages deploy` para publicar el cambio.

### Deploy automático (GitHub Actions)

`.github/workflows/deploy-pedidoclaro.yml` corre en cada push a `main` que
toque `proyectos/pedidoclaro/**`. Requiere estos secrets en el repositorio de
GitHub (Settings → Secrets and variables → Actions):

- `CLOUDFLARE_API_TOKEN` — token con permisos de Workers y Pages
- `CLOUDFLARE_ACCOUNT_ID` — ID de tu cuenta de Cloudflare

## Checklist de variables de entorno (secrets en Cloudflare)

Configurar con `wrangler secret put <NOMBRE>`:

| Variable | Requerida | Uso |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | Sí | Autenticación con Twilio |
| `TWILIO_AUTH_TOKEN` | Sí | Autenticación con Twilio |
| `TWILIO_WHATSAPP_FROM` | Sí | Número de Twilio WhatsApp (formato `+1415...`) |
| `ALMACEN_TELEFONO` | Sí | WhatsApp del almacén (formato E.164, ej. `+5215500000000`) |
| `DUENO_TELEFONO` | Sí | WhatsApp del dueño, recibe el reporte matutino |
| `POS_TIPO` | Opcional | `alegra` \| `sheets` \| `csv` — activa Worker 7 |
| `ALEGRA_EMAIL` | Si `POS_TIPO=alegra` | Cuenta de Alegra |
| `ALEGRA_TOKEN` | Si `POS_TIPO=alegra` | Token de API de Alegra |
| `SHEETS_ID` | Si `POS_TIPO=sheets` | ID del spreadsheet |
| `SHEETS_API_KEY` | Si `POS_TIPO=sheets` | API key de Google Sheets (solo lectura; marcar filas como sincronizadas requiere OAuth2/cuenta de servicio) |
| `GMAIL_TOKEN` | Si `POS_TIPO=csv` | Access token OAuth2 de Gmail |
| `DEFAULT_VENDEDOR_ID` | Recomendado si usas Worker 7 | Vendedor por default para pedidos que llegan de un POS externo (no siempre traen vendedor) |

Todos los teléfonos deben ir en formato E.164 (`+52...`), es el formato que
espera la API de WhatsApp de Twilio.

## URLs de prueba

Sustituye `<subdominio>` por el que Cloudflare asigne a tu cuenta y
`<hash>` por el que Pages genere (o usa tu dominio personalizado una vez
configurado):

- Formulario del vendedor: `https://pedidoclaro-frontend.pages.dev/form/`
- Tablero del dueño: `https://pedidoclaro-frontend.pages.dev/tablero/`
- API (Worker): `https://pedidoclaro.<subdominio>.workers.dev`

## Pruebas rápidas por curl

```bash
# Registrar un pedido
curl -X POST https://pedidoclaro.<subdominio>.workers.dev/pedido \
  -H "Content-Type: application/json" \
  -d '{
        "cliente_nombre": "Tienda La Esquina",
        "cliente_telefono": "+5215500000001",
        "productos": "5 cajas de agua, 2 paquetes de café",
        "monto": 1250.50,
        "fecha_entrega": "2026-08-25",
        "vendedor_id": "11111111-1111-1111-1111-111111111111"
      }'

# Ver el tablero de hoy
curl "https://pedidoclaro.<subdominio>.workers.dev/pedidos"

# Cambiar estatus
curl -X PATCH https://pedidoclaro.<subdominio>.workers.dev/pedido/<pedido_id>/estatus \
  -H "Content-Type: application/json" \
  -d '{"estatus": "en_camino"}'

# Sync manual con el POS configurado
curl -X POST https://pedidoclaro.<subdominio>.workers.dev/sync/pos
```

## Notas de implementación

- El acceso a `/form` y `/tablero` es por URL directa, sin login, tal como
  pide el brief. Si necesitas restringirlo, usa Cloudflare Access delante de
  la app de Pages.
- El parser de CSV del Worker 7 es intencionalmente simple (separado por
  comas, sin soporte de comillas/escapes) — si tus exports usan un formato
  más complejo, ajusta `parsearCsv` en `worker7_sync_pos.ts`.
- La escritura a Google Sheets para marcar filas como sincronizadas requiere
  credenciales con permiso de escritura (OAuth2 o cuenta de servicio); una
  API key sola solo permite lectura de hojas públicas.
