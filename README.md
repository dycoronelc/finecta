# Finecta — Plataforma de factoring (prototipo)

Aplicación web completa: **React + Vite + Tailwind** (frontend) y **FastAPI + SQLAlchemy** (backend), con autenticación JWT y roles. Este documento explica cómo levantar el sistema en su máquina.

## Requisitos previos

- **Node.js** 20+ (incluye `npm`)
- **Python** 3.11+ (3.13 compatible)
- *(Opcional)* **Docker Desktop** — solo si usas **MySQL** con el `docker-compose` de este repo

## 1. Backend (API)

1. Abra una terminal en la carpeta del backend:

   ```text
   cd backend
   ```

2. **Entorno virtual** (recomendado):

   ```text
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```

   En PowerShell, si hace falta: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` para permitir el script de activación.

3. **Variables de entorno** (opcional):

   - Copie `backend\.env.example` a `backend\.env` y edítelo.
   - Por **defecto** la app usa **SQLite** (`finecta_dev.db` en la carpeta `backend/`), sin instalar MySQL.
   - Para **MySQL**, ajuste `DATABASE_URL` en `backend\.env` según el ejemplo. Puede levantar MySQL con el archivo `docker-compose.yml` en la **raíz** del repositorio:

   ```text
   docker compose up -d
   ```

   Con Docker, la base de datos lógica `finecta` se crea sola (`MYSQL_DATABASE`). Si MySQL lo instala usted, puede crear el esquema ejecutando el script **`scripts/mysql_create_database.sql`**. **Las tablas (usuarios, facturas, operaciones, etc.) no vienen de un .sql de migraciones clásico:** al arrancar el backend, SQLAlchemy genera el esquema con `Base.metadata.create_all()`.

4. **Arrancar el servidor** (desde `backend` con el venv activado):

   ```text
   set PYTHONPATH=.
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```

   En **PowerShell**, antes de `uvicorn`:

   ```powershell
   $env:PYTHONPATH = (Get-Location).Path
   ```

   Al levantar la API, se crean las tablas, la carpeta de `uploads/` y, si la base está vacía, el **seed** con las cuentas de demostración (puede omitirse si prefiere inicializar a mano con `python -m app.db.init_db` desde `backend` con el mismo `PYTHONPATH`).

- **Documentación OpenAPI (Swagger):** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc:** [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)
- **Comprobación rápida:** [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

La primera vez que inicia, las tablas se crean y se cargan **usuarios de demostración** (ver sección Cuentas de prueba). Los archivos subidos (PDFs, Excel, etc.) se guardan en `backend/uploads/`.

## 2. Frontend (aplicación web)

1. Otra terminal, en la carpeta del frontend:

   ```text
   cd frontend
   npm install
   npm run dev
   ```

2. Abra el navegador en la URL que muestra Vite (normalmente **http://127.0.0.1:5173**).

3. **Proxy al API:** en desarrollo, Vite reenvía las peticiones bajo `/api` al backend en el puerto **8000**. No hace falta configurar CORS manual para usar el front contra la API en local; el cliente usa por defecto la ruta base `/api/v1`.

4. **Logo (opcional):** si dispone de `docs/logo.png`, copie o enlácelo como `frontend/public/logo.png` para el branding en el panel.

5. **Build de producción (opcional):**

   ```text
   npm run build
   npm run preview
   ```

   Los estáticos generados quedan en `frontend/dist/` (sirve con Nginx, Static Web Apps, etc.); el backend debe seguir en otro servicio o detrás de un reverse proxy bajo otra ruta, según su despliegue.

## 3. Cuentas de prueba (datos iniciales)

Solo se crean al iniciar con base de datos vacía (p. ej. primera ejecución con SQLite o BD nueva en MySQL):

| Usuario | Contraseña | Rol |
|---------|------------|-----|
| `admin@finecta.com` | `Admin123!` | Admin |
| `analista@finecta.com` | `Analista123!` | Analista |
| `cliente@demo.com` | `Cliente123!` | Cliente (empresa demo) |
| `fiduciario@finecta.com` | `Fiduciario123!` | Fiduciario |
| `pagador@empresa.com` | `Pagador123!` | Pagador |

Cambie estas claves en entornos reales.

## 4. Resumen de puertos

| Servicio | Puerto |
|----------|--------|
| API (FastAPI) | 8000 |
| Front (Vite dev) | 5173 |
| MySQL (si usa Docker) | 3306 |

## 5. Estructura del repositorio

- `backend/` — API, modelos, servicios, carga a `uploads/`
- `frontend/` — SPA con Vite
- `docker-compose.yml` — servicio MySQL 8.0
- `docs/` — notas o referencias (p. ej. enlace a Figma)

### Carga de facturas de ejemplo (Ritmo / Excel)

Si en `docs/` existe el archivo `facturas_ritmo_2026-04-22.xlsx`, puede importar esas filas a la base de datos (crea la empresa **Ritmo** si no existe, RNC de uso interno `00000000013`):

```text
cd backend
set PYTHONPATH=.
python scripts\load_ritmo_invoices.py
```

No duplica filas: omite facturas cuyo número ya exista para esa empresa. Los metadatos (RNC del proveedor, moneda, pendiente, estado, etc.) se guardan en el campo `extraction` de la factura.

**Acceso (tras importar):** se crea el usuario de cliente `cliente@ritmo.com` con contraseña `Ritmo2026!` (cámbiela en entornos reales). Con ese usuario ve las 422 facturas. Los **admin** / **analista** las ven en *Facturas* (todas) o filtrando por compañía si añade un filtro en la API o interfaz.

Si algo falla, revise que el backend esté en marcha antes de usar el panel y que el puerto 8000 no esté ocupado por otra aplicación.
