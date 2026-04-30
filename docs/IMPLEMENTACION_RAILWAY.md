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
3. Configure:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

### 5.2 Variables de entorno backend

En `finecta-backend`, configure estas variables:

- `SECRET_KEY`: una clave larga aleatoria (obligatorio en produccion)
- `ACCESS_TOKEN_EXPIRE_MINUTES`: por ejemplo `1440`
- `DATABASE_URL`: cadena MySQL de GoDaddy usando `mysql+pymysql`
- `CORS_ORIGINS`: lista JSON con el dominio del frontend

Ejemplo de `DATABASE_URL` (adaptar con datos reales de GoDaddy):

```text
mysql+pymysql://USUARIO:PASSWORD@HOST:PUERTO/NOMBRE_DB?charset=utf8mb4
```

Ejemplo practico:

```text
mysql+pymysql://finecta_user:MiPasswordSegura@mi-host-godaddy.com:3306/finecta?charset=utf8mb4
```

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
3. Configure:
   - **Root Directory**: `frontend`
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npx serve -s dist -l $PORT`

### 6.2 Dependencia para servir build estatico

Como `serve` no esta en `package.json`, tiene dos opciones:

- Opcion A (recomendada): agregar `serve` como dependencia de produccion:
  - `npm install serve --save`
  - subir cambio al repo
- Opcion B: cambiar Start Command a:
  - `npm install -g serve && serve -s dist -l $PORT`

La opcion A genera despliegues mas limpios y reproducibles.

### 6.3 Variables de entorno frontend

Defina en Railway:

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
  Verifique `DATABASE_URL` con driver `mysql+pymysql`, credenciales correctas, acceso remoto habilitado en GoDaddy y reglas de firewall.

- **Timeout al conectar a MySQL externa**  
  Suele ser red/firewall: confirme que el host de GoDaddy responde desde fuera y que el puerto `3306` esta abierto para conexiones remotas.

- **CORS bloqueando requests**  
  `CORS_ORIGINS` debe incluir el dominio exacto del frontend (https, sin slash final).

- **Frontend no encuentra API**  
  Confirmar `VITE_API_BASE` y hacer redeploy del frontend tras cualquier cambio.

- **Error al iniciar frontend por comando `serve`**  
  Instalar `serve` (preferible en `package.json`) o ajustar Start Command como se indica arriba.

---

Con esta configuracion queda el proyecto completo desplegado en Railway con backend y frontend, usando MySQL externa en GoDaddy.
