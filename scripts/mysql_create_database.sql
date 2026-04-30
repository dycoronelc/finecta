-- Finecta — creación de la base de datos en MySQL
-- Úsalo si MySQL ya está instalado y quieres crear solo el esquema "finecta"
-- (las tablas las crea la aplicación al arrancar vía SQLAlchemy: create_all).
--
-- Ajusta usuario y contraseña a su entorno; el ejemplo coincide con docker-compose.yml

CREATE DATABASE IF NOT EXISTS finecta
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Opcional: usuario dedicado (ejecútalo con un usuario con privilegios de administración)
-- CREATE USER IF NOT EXISTS 'finecta'@'%' IDENTIFIED BY 'finecta';
-- GRANT ALL PRIVILEGES ON finecta.* TO 'finecta'@'%';
-- FLUSH PRIVILEGES;
