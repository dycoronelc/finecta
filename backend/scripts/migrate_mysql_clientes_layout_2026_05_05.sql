-- Migracion incremental MySQL 8+ para cambios de clientes/KYC.
-- Uso:
--   mysql -u <user> -p < C:/react/finecta/backend/scripts/migrate_mysql_clientes_layout_2026_05_05.sql
--
-- Nota: Este script NO recrea tablas; solo agrega lo faltante en una BD existente.

CREATE DATABASE IF NOT EXISTS finecta
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE finecta;

SET @db := DATABASE();

-- ---------------------------------------------------------------------------
-- 1) companies: contacto principal + screening KYC
-- ---------------------------------------------------------------------------
SET @sql := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db
        AND TABLE_NAME = 'companies'
        AND COLUMN_NAME = 'contact_full_name'
    ),
    'SELECT ''companies.contact_full_name ya existe''',
    'ALTER TABLE companies ADD COLUMN contact_full_name VARCHAR(255) NOT NULL DEFAULT '''''''
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Asegura dato por defecto para registros historicos.
UPDATE companies
SET contact_full_name = ''
WHERE contact_full_name IS NULL;

SET @sql := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db
        AND TABLE_NAME = 'companies'
        AND COLUMN_NAME = 'kyc_screening'
    ),
    'SELECT ''companies.kyc_screening ya existe''',
    'ALTER TABLE companies ADD COLUMN kyc_screening JSON NULL'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 2) company_documents: nombre del beneficiario final (UBO)
-- ---------------------------------------------------------------------------
SET @sql := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db
        AND TABLE_NAME = 'company_documents'
        AND COLUMN_NAME = 'party_name'
    ),
    'SELECT ''company_documents.party_name ya existe''',
    'ALTER TABLE company_documents ADD COLUMN party_name VARCHAR(255) NULL'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 3) company_timeline_events: linea de tiempo del cliente
-- ---------------------------------------------------------------------------
SET @sql := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = @db
        AND TABLE_NAME = 'company_timeline_events'
    ),
    'SELECT ''company_timeline_events ya existe''',
    'CREATE TABLE company_timeline_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      event_type VARCHAR(64) NOT NULL,
      message VARCHAR(1024) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX ix_company_timeline_company_id (company_id),
      CONSTRAINT fk_company_timeline_company_id FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 4) invoices: identificador fiscal del pagador + indices
-- ---------------------------------------------------------------------------
SET @sql := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db
        AND TABLE_NAME = 'invoices'
        AND COLUMN_NAME = 'payer_tax_id'
    ),
    'SELECT ''invoices.payer_tax_id ya existe''',
    'ALTER TABLE invoices ADD COLUMN payer_tax_id VARCHAR(64) NULL'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @db
        AND TABLE_NAME = 'invoices'
        AND INDEX_NAME = 'ix_invoices_payer_tax_id'
    ),
    'SELECT ''ix_invoices_payer_tax_id ya existe''',
    'CREATE INDEX ix_invoices_payer_tax_id ON invoices (payer_tax_id)'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @db
        AND TABLE_NAME = 'invoices'
        AND INDEX_NAME = 'ix_invoices_company_payer'
    ),
    'SELECT ''ix_invoices_company_payer ya existe''',
    'CREATE INDEX ix_invoices_company_payer ON invoices (company_id, payer)'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'Migracion clientes/KYC completada.' AS status;
