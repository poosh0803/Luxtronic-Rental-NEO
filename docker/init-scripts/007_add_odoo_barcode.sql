-- Odoo product barcode for each unit, so the Odoo integration can look up
-- the matching Odoo product when posting a sales order for a rental.
ALTER TABLE units ADD COLUMN IF NOT EXISTS odoo_barcode VARCHAR(100);
