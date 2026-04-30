# Implementacion paso a paso en Railway (Finecta)

Este documento describe como desplegar el proyecto completo en Railway:

- `backend/` (FastAPI + SQLAlchemy)
- `frontend/` (React + Vite)
- Base de datos MySQL externa (servidor GoDaddy)

## 1) Prerrequisitos

- Cuenta en Railway: [https://railway.app](https://railway.app)
- Repositorio subido a GitHub (recomendado para despliegue continuo)
- Proyecto funcionando en local (opcional pero recomendado para validar variables)

## 2) Arquitectura recomendada en Railway

Crear **un solo proyecto Railway** con 2 servicios:

1. **finecta-backend** (servicio web Python/FastAPI)
2. **finecta-frontend** (servicio web Node/React build estatico servido por Railway)

> Nota: este backend soporta SQLite por defecto en local, pero en Railway debe usar MySQL para persistencia real.

## 3) Crear proyecto y conectar repositorio

1. Inicie sesion en Railway.
2. Haga clic en **New Project**.
3. Seleccione **Deploy from GitHub repo** y conecte este repositorio.
4. Railway detectara el repo, pero como es monorepo, luego configuraremos cada servicio con su **Root Directory**.

## 3.1) Build y Deploy en Railway (donde va cada cosa)

En Railway, cada servicio tiene fases distintas. En la practica suele verse asi:

| Fase en Railway | Donde la configura | Que hace |
|-----------------|--------------------|----------|
| **Build** | Servicio -> **Settings** -> **Build** (o pestana **Build** segun la UI) | Se ejecuta al recibir un push o al redeployar: instala dependencias y prepara el artefacto (por ejemplo `node_modules` o el entorno Python). |
| **Deploy** (arranque) | Servicio -> **Settings** -> **Deploy** (campo **Custom Start Command** o **Start Command**) | Comando que corre el contenedor cuando ya esta construido: aqui va el servidor web (uvicorn, serve, etc.). |

**Monorepo:** en ambos servicios defina **Root Directory** (`backend` o `frontend`) para que Build y Start se ejecuten desde esa carpeta. Si no, Railway intentara construir desde la raiz del repo y fallara.

**Variables y Build del frontend:** Vite inyecta `VITE_*` en tiempo de **build**. Defina `VITE_API_BASE` en las variables del servicio **antes** del build; si la cambia despues, haga un **Redeploy** para que se vuelva a ejecutar el Build.

**Dependencias de desarrollo en el Build:** `vite` y `typescript` estan en `devDependencies`. Si Railway/Nixpacks activa instalacion solo de produccion, el build puede fallar al no encontrar `vite`. En variables del frontend defina `NPM_CONFIG_PRODUCTION=false` (o no defina `NODE_ENV=production` durante el build) para que `npm ci` instale tambien `devDependencies`.

### Valores recomendados (copiar en Railway)

**Servicio `finecta-backend`**

| Campo | Valor |
|-------|--------|
| **Root Directory** | `backend` |
| **Build Command** (Build) | `pip install -r requirements.txt` |
| **Start Command** (Deploy) | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |

Opcional en **Build** -> **Watch Paths** (si su UI lo ofrece): `backend/**` para que solo redeploye el backend cuando cambien archivos bajo `backend/`.

**Servicio `finecta-frontend`**

| Campo | Valor |
|-------|--------|
| **Root Directory** | `frontend` |
| **Build Command** (Build) | `npm install --no-audit --no-fund && npm run build` |
| **Start Command** (Deploy) | `npx serve -s dist -l $PORT` |

Opcional en **Build** -> **Watch Paths**: `frontend/**`.

> Si `serve` no esta en `package.json`, use la seccion 6.2 o el Start Command alternativo alli indicado.

## 4) Preparar MySQL externa en GoDaddy

Antes de desplegar backend en Railway, confirme estos puntos en su servidor MySQL de GoDaddy:

1. **Host/puerto accesibles** desde Internet (normalmente puerto `3306`).
2. **Base de datos creada**, por ejemplo `finecta`.
3. **Usuario exclusivo para la app** con permisos sobre esa base.
4. **Conexion remota habilitada** para el usuario (si GoDaddy lo requiere).
5. **Firewall/allowlist**: permitir salida/entrada desde Railway hacia MySQL.

> Recomendado en seguridad: si GoDaddy permite restricciones por IP, limite por IPs de Railway o use tunel privado/VPN. Si no es viable, use credenciales fuertes y rotacion periodica.

## 5) Desplegar backend (`backend/`)

### 5.1 Crear servicio backend

1. En el proyecto Railway, cree un nuevo servicio desde el mismo repo.
2. Nombre sugerido: `finecta-backend`.
3. Abra **Settings** del servicio y complete:
   - **Root Directory**: `backend`
   - En **Build** -> **Build Command**: `pip install -r requirements.txt`
   - En **Deploy** -> **Custom Start Command** (o **Start Command**): `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

Railway inyecta `$PORT`; no use un puerto fijo como `8000` en produccion.

### 5.2 Variables de entorno backend

En `finecta-backend`, configure estas variables:

- `SECRET_KEY`: una clave larga aleatoria (obligatorio en produccion)
- `ACCESS_TOKEN_EXPIRE_MINUTES`: por ejemplo `1440`
- `DB_DIALECT`: `mysql+pymysql`
- `DB_HOST`: host de MySQL en GoDaddy
- `DB_PORT`: `3306`
- `DB_NAME`: nombre de la base (ejemplo: `finecta`)
- `DB_USER`: usuario MySQL
- `DB_PASSWORD`: clave MySQL (puede incluir `/` y otros simbolos)
- `DB_CHARSET`: `utf8mb4`
- `CORS_ORIGINS`: lista JSON con el dominio del frontend

> Recomendado: usar variables separadas y dejar `DATABASE_URL` vacia.

Ejemplo completo de variables separadas:

```text
DB_DIALECT=mysql+pymysql
DB_HOST=mi-host-godaddy.com
DB_PORT=3306
DB_NAME=finecta
DB_USER=finecta_user
DB_PASSWORD=Mi/Password/Segura
DB_CHARSET=utf8mb4
```

Opcional (solo si quiere usar URL completa en una sola variable):

```text
mysql+pymysql://finecta_user:MiPasswordSegura@mi-host-godaddy.com:3306/finecta?charset=utf8mb4
```

Si usa esta opcion y su clave tiene caracteres especiales (`/`, `@`, `:`, etc.), debe codificarlos en URL.

Ejemplo inicial de `CORS_ORIGINS`:

```text
["https://finecta-frontend.up.railway.app"]
```

> Importante: `CORS_ORIGINS` debe ser JSON valido (con corchetes y comillas dobles).

> Importante de red: si el backend no logra conectarse a GoDaddy, revise primero permisos de acceso remoto MySQL y firewall.

### 5.3 Dominio publico backend

1. En el servicio `finecta-backend`, abra **Settings** -> **Networking**.
2. Genere un dominio publico Railway.
3. Guarde la URL, por ejemplo:
   - `https://finecta-backend-production.up.railway.app`

### 5.4 Verificacion backend

Pruebe:

- `https://<dominio-backend>/health`
- `https://<dominio-backend>/docs`

Si responde, el backend esta operativo.

## 6) Desplegar frontend (`frontend/`)

El frontend usa `VITE_API_BASE` y, si no existe, cae a `/api/v1`.  
En Railway conviene fijar `VITE_API_BASE` con la URL publica del backend.

### 6.1 Crear servicio frontend

1. Cree otro servicio desde el mismo repo.
2. Nombre sugerido: `finecta-frontend`.
3. Defina primero las variables (al menos `VITE_API_BASE`) en **Variables** del servicio.
4. Abra **Settings** y complete:
   - **Root Directory**: `frontend`
   - En **Build** -> **Build Command**: `npm install --no-audit --no-fund && npm run build`
   - En **Deploy** -> **Custom Start Command**: `npx serve -s dist -l $PORT`

El **Build** genera `frontend/dist/`. El **Deploy** solo sirve esos archivos estaticos; no vuelve a compilar salvo que redeploye.

**Por que no `rm -rf node_modules` ni solo `npm ci`:** en algunos entornos de Railway la caché de build monta o bloquea `node_modules/.vite`; borrar todo `node_modules` o el borrado interno de `npm ci` puede fallar con `EBUSY` / `Device or resource busy`. `npm install` actualiza dependencias **sin** exigir borrar el arbol completo y suele evitar ese fallo.

En el repo, `vite.config.ts` define `cacheDir: ".vite-cache"` para que la caché de dependencias de Vite **no** viva bajo `node_modules/.vite` (menos conflictos con la caché del builder).

Opcional (mas estricto con el lockfile), si ya limpio caché en Railway y el build pasa estable: `npm ci && npm run build`.

### 6.2 Dependencia para servir build estatico

El proyecto incluye `serve` en `dependencies` (ver `frontend/package.json`). Si en algun fork no existiera, agreguelo con `npm install serve --save` y suba el cambio al repo.

Alternativa sin dependencia local: Start Command `npm install -g serve && serve -s dist -l $PORT` (menos reproducible que tener `serve` en el repo).

### 6.3 Variables de entorno frontend

Defina en Railway:

- `NPM_CONFIG_PRODUCTION` = `false` (recomendado: asi `npm install` / `npm ci` instalan `devDependencies` necesarias para `vite build`)
- `VITE_API_BASE` = `https://<dominio-backend>/api/v1`

Ejemplo:

```text
VITE_API_BASE=https://finecta-backend-production.up.railway.app/api/v1
```

### 6.4 Dominio publico frontend

1. En `finecta-frontend`, abra **Settings** -> **Networking**.
2. Genere dominio publico.
3. Abra la URL para validar que carga la app.

## 7) Ajuste final de CORS

Una vez tenga el dominio real del frontend:

1. Vaya a variables del backend.
2. Actualice `CORS_ORIGINS` con el dominio final:

```text
["https://<dominio-frontend-real>"]
```

3. Redeploy del backend.

## 8) Orden recomendado de despliegue

1. Preparar MySQL externa (GoDaddy)
2. Desplegar backend y validar `/health`
3. Desplegar frontend con `VITE_API_BASE` apuntando al backend
4. Ajustar `CORS_ORIGINS` definitivo
5. Validar login y flujo principal

## 9) Checklist post-deploy

- Backend responde en `/health`
- Swagger abre en `/docs`
- Frontend carga sin pantalla en blanco
- Login funciona con usuarios seed (si base vacia)
- Peticiones del frontend no fallan por CORS
- Carga de archivos funciona (considerar almacenamiento persistente)

## 10) Consideraciones importantes de produccion

1. **Persistencia de archivos (`uploads/`)**  
   Railway puede reiniciar contenedores; el filesystem local no es ideal para archivos criticos.  
   Recomendado: migrar a almacenamiento externo (S3, R2, etc.) para documentos.

2. **Seed automatico en base vacia**  
   El backend crea tablas y ejecuta `seed_if_empty()` al iniciar.  
   Cambie contrasenas iniciales en cuanto termine el despliegue.

3. **SECRET_KEY segura**  
   No usar la de ejemplo. Genere una clave robusta y privada.

4. **Observabilidad**  
   Revise logs de ambos servicios en Railway ante errores 4xx/5xx.

## 11) Solucion de problemas comunes

- **Error de conexion a BD**  
  Verifique `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, acceso remoto habilitado en GoDaddy y reglas de firewall.

- **Timeout al conectar a MySQL externa**  
  Suele ser red/firewall: confirme que el host de GoDaddy responde desde fuera y que el puerto `3306` esta abierto para conexiones remotas.

- **CORS bloqueando requests**  
  `CORS_ORIGINS` debe incluir el dominio exacto del frontend (https, sin slash final).

- **Frontend no encuentra API**  
  Confirmar `VITE_API_BASE` y hacer redeploy del frontend tras cualquier cambio.

- **Error al iniciar frontend por comando `serve`**  
  Instalar `serve` (preferible en `package.json`) o ajustar Start Command como se indica arriba.

- **Build frontend: `EBUSY` / `Device or resource busy` en `node_modules` o `.vite`**  
  Use el Build Command `npm install --no-audit --no-fund && npm run build`, confirme que el repo incluye `cacheDir: ".vite-cache"` en `vite.config.ts`, y en Railway use **Clear build cache** (o redeploy sin cache) una vez. No use `rm -rf node_modules` si el error es al borrar esa carpeta.

- **Build frontend: no encuentra `vite` o falla `tsc`**  
  Defina `NPM_CONFIG_PRODUCTION=false` en variables del servicio frontend y redeploy.

## 12) Crear estructura MySQL y migrar datos desde SQLite

Si ya tiene datos en `backend/finecta_dev.db` (SQLite), use estos archivos:

- `backend/scripts/create_mysql_schema.sql`
- `backend/scripts/migrate_sqlite_to_mysql.py`

### 12.1 Crear estructura completa en MySQL

Ejecute el SQL en su servidor MySQL (GoDaddy), por ejemplo con cliente `mysql`:

```bash
mysql -h HOST -P 3306 -u USUARIO -p < backend/scripts/create_mysql_schema.sql
```

### 12.2 Migrar toda la data desde SQLite a MySQL

Desde `backend/` con entorno virtual activo:

```bash
python scripts/migrate_sqlite_to_mysql.py \
  --sqlite-url "sqlite:///./finecta_dev.db" \
  --mysql-url "mysql+pymysql://USUARIO:PASSWORD@HOST:3306/finecta?charset=utf8mb4" \
  --truncate-first
```

Notas:

- `--truncate-first` limpia tablas destino antes de copiar (util para primera migracion).
- El script preserva IDs y relaciones foraneas.
- Si su SQLite esta en otra ruta, cambie `--sqlite-url`.
- Si su clave tiene caracteres especiales, puede usar variables separadas en Railway para la app, pero en este comando puntual debe codificar la clave en formato URL.

### 12.3 Validar migracion

Puede validar con conteos basicos:

```sql
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM companies;
SELECT COUNT(*) FROM invoices;
SELECT COUNT(*) FROM factoring_operations;
```

---

Con esta configuracion queda el proyecto completo desplegado en Railway con backend y frontend, usando MySQL externa en GoDaddy.
