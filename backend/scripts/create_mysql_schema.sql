-- Finecta MySQL schema (compatible with MySQL 8+)
-- Clientes = tabla `clients` (persona jurídica cliente).
-- Beneficiarios finales (UBO) = `beneficial_owners`; relación N:M con clientes vía `client_beneficial_owners`.
-- KYC (estado, notas, screening, aprobación) vive en `beneficial_owners`, no en `clients`.

CREATE DATABASE IF NOT EXISTS finecta
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE finecta;

CREATE TABLE IF NOT EXISTS clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  legal_name VARCHAR(512) NOT NULL,
  trade_name VARCHAR(512) NULL,
  tax_id VARCHAR(64) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  phone VARCHAR(64) NULL,
  contact_full_name VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_clients_tax_id (tax_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS beneficial_owners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(512) NOT NULL,
  national_id VARCHAR(64) NULL COMMENT 'Cédula, pasaporte u otro ID de persona física',
  kyc_status ENUM('draft', 'submitted', 'in_review', 'approved', 'rejected') NOT NULL DEFAULT 'draft',
  kyc_notes TEXT NULL,
  kyc_screening JSON NULL,
  approved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_beneficial_owners_national_id (national_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS client_beneficial_owners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  beneficial_owner_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_client_beneficial_owner (client_id, beneficial_owner_id),
  INDEX ix_cbo_client (client_id),
  INDEX ix_cbo_bo (beneficial_owner_id),
  CONSTRAINT fk_cbo_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_cbo_bo FOREIGN KEY (beneficial_owner_id) REFERENCES beneficial_owners(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  hashed_password VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role ENUM('admin', 'analyst', 'client', 'fiduciary', 'payer') NOT NULL DEFAULT 'client',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  client_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  INDEX ix_users_email (email),
  CONSTRAINT fk_users_client_id FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS client_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  file_path VARCHAR(1024) NOT NULL,
  original_name VARCHAR(512) NOT NULL,
  document_type VARCHAR(64) NOT NULL,
  party_name VARCHAR(255) NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_client_documents_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS beneficial_owner_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  beneficial_owner_id INT NOT NULL,
  file_path VARCHAR(1024) NOT NULL,
  original_name VARCHAR(512) NOT NULL,
  document_type VARCHAR(64) NOT NULL DEFAULT 'identity',
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_bod_bo (beneficial_owner_id),
  CONSTRAINT fk_bod_bo FOREIGN KEY (beneficial_owner_id) REFERENCES beneficial_owners(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS client_timeline_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  message VARCHAR(1024) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_client_timeline_client (client_id),
  CONSTRAINT fk_client_timeline_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  invoice_number VARCHAR(128) NOT NULL,
  issuer VARCHAR(512) NOT NULL,
  payer VARCHAR(512) NOT NULL,
  payer_tax_id VARCHAR(64) NULL,
  amount NUMERIC(18,2) NOT NULL,
  due_date DATE NULL,
  status ENUM('draft', 'uploaded', 'in_quotation', 'in_operation', 'in_collection', 'paid', 'closed', 'rejected') NOT NULL DEFAULT 'draft',
  pdf_path VARCHAR(1024) NULL,
  extraction JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  INDEX ix_invoices_invoice_number (invoice_number),
  INDEX ix_invoices_payer_tax_id (payer_tax_id),
  INDEX ix_invoices_client_payer (client_id, payer),
  CONSTRAINT fk_invoices_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quotations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  invoice_id INT NULL,
  amount_base NUMERIC(18,2) NOT NULL,
  commission NUMERIC(18,2) NOT NULL,
  operational_cost NUMERIC(18,2) NOT NULL,
  status ENUM('draft', 'pending', 'accepted', 'rejected', 'expired') NOT NULL DEFAULT 'pending',
  client_comment TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at DATETIME NULL,
  CONSTRAINT fk_quotations_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_quotations_invoice_id FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contracts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  contract_type ENUM('marco', 'cession', 'confirmation') NOT NULL,
  file_path VARCHAR(1024) NULL,
  title VARCHAR(255) NOT NULL,
  signature_status ENUM('pending', 'sent', 'signed', 'void') NOT NULL DEFAULT 'pending',
  viafirma_id VARCHAR(256) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_contracts_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS factoring_operations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL,
  client_id INT NOT NULL,
  status ENUM('draft', 'active', 'disbursed', 'in_collection', 'closed', 'cancelled') NOT NULL DEFAULT 'draft',
  total_invoiced NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_disbursed NUMERIC(18,2) NULL,
  quotation_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME NULL,
  UNIQUE KEY uq_factoring_operations_code (code),
  INDEX ix_factoring_operations_code (code),
  CONSTRAINT fk_factoring_operations_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_factoring_operations_quotation_id FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS operation_invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  operation_id INT NOT NULL,
  invoice_id INT NOT NULL,
  amount_assigned NUMERIC(18,2) NOT NULL,
  CONSTRAINT fk_operation_invoices_operation_id FOREIGN KEY (operation_id) REFERENCES factoring_operations(id) ON DELETE CASCADE,
  CONSTRAINT fk_operation_invoices_invoice_id FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS operation_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  operation_id INT NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  message VARCHAR(1024) NOT NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_operation_events_operation_id FOREIGN KEY (operation_id) REFERENCES factoring_operations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS disbursements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  operation_id INT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  reference VARCHAR(128) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  CONSTRAINT fk_disbursements_operation_id FOREIGN KEY (operation_id) REFERENCES factoring_operations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  operation_id INT NOT NULL,
  payer VARCHAR(512) NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  status ENUM('expected', 'partial', 'received', 'settled') NOT NULL DEFAULT 'expected',
  received_at DATETIME NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_operation_id FOREIGN KEY (operation_id) REFERENCES factoring_operations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS validation_batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  uploaded_by_id INT NOT NULL,
  file_path VARCHAR(1024) NOT NULL,
  original_name VARCHAR(512) NOT NULL,
  status ENUM('processing', 'completed', 'failed') NOT NULL DEFAULT 'processing',
  results JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_validation_batches_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_validation_batches_uploaded_by_id FOREIGN KEY (uploaded_by_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source VARCHAR(64) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  payload JSON NULL,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(32) NOT NULL DEFAULT 'received'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
