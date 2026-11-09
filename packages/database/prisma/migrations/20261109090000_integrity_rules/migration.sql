-- ════════════════════════════════════════════════════════════════════
-- Integrity rules that Prisma schema cannot express (ADR D4, D9, R3, R6)
-- ════════════════════════════════════════════════════════════════════

-- R6: fuzzy duplicate detection for outlets (retailers in particular)
CREATE INDEX IF NOT EXISTS outlets_normalized_name_trgm_idx
  ON outlets USING gin (normalized_name gin_trgm_ops);

-- One active PRIMARY wholesaler per retailer
CREATE UNIQUE INDEX IF NOT EXISTS rwr_one_active_primary_uq
  ON retailer_wholesale_relationships (retailer_outlet_id)
  WHERE relation_type = 'PRIMARY' AND effective_to IS NULL;

-- No duplicate active link between the same retailer & wholesaler
CREATE UNIQUE INDEX IF NOT EXISTS rwr_active_pair_uq
  ON retailer_wholesale_relationships (retailer_outlet_id, wholesaler_outlet_id)
  WHERE effective_to IS NULL;

-- One current SPG assignment
CREATE UNIQUE INDEX IF NOT EXISTS spg_assignment_current_uq
  ON spg_assignments (spg_id) WHERE effective_to IS NULL;

-- One current KPI formula / weight
CREATE UNIQUE INDEX IF NOT EXISTS kpi_formula_current_uq
  ON kpi_formulas (kpi_definition_id) WHERE effective_to IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS kpi_weight_current_uq
  ON kpi_weights (kpi_definition_id) WHERE effective_to IS NULL;

-- One current target per KPI/period, one current SPG override per KPI/SPG/period
CREATE UNIQUE INDEX IF NOT EXISTS targets_current_uq
  ON targets (kpi_definition_id, period_month) WHERE is_current;
CREATE UNIQUE INDEX IF NOT EXISTS target_assignments_current_uq
  ON target_assignments (kpi_definition_id, spg_id, period_month) WHERE is_current;

-- Value domain checks
ALTER TABLE retailer_transaction_items
  ADD CONSTRAINT rti_quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT rti_price_non_negative CHECK (unit_price IS NULL OR unit_price >= 0),
  ADD CONSTRAINT rti_product_ref CHECK (
    (product_owner = 'COMPANY'    AND competitor_product_id IS NULL) OR
    (product_owner = 'COMPETITOR' AND product_variant_id   IS NULL));
ALTER TABLE outlet_order_items
  ADD CONSTRAINT ooi_quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT ooi_price_non_negative CHECK (unit_price >= 0);
ALTER TABLE horeca_sales
  ADD CONSTRAINT hs_quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT hs_price_non_negative CHECK (unit_price IS NULL OR unit_price >= 0);
ALTER TABLE visibility_records
  ADD CONSTRAINT vis_facing_non_negative CHECK (company_facing >= 0 AND competitor_facing >= 0 AND total_category_facing >= 0),
  ADD CONSTRAINT vis_facing_le_total CHECK (company_facing + competitor_facing <= total_category_facing);
ALTER TABLE outlets
  ADD CONSTRAINT outlets_lat_range CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT outlets_lng_range CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);
ALTER TABLE kpi_weights
  ADD CONSTRAINT kpi_weight_range CHECK (weight_pct >= 0 AND weight_pct <= 100);
ALTER TABLE visits
  ADD CONSTRAINT visits_checkout_after_checkin CHECK (check_out_at IS NULL OR check_out_at >= check_in_at);

-- D9: append-only tables
CREATE OR REPLACE FUNCTION tt_forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION tt_forbid_change();
CREATE TRIGGER ocr_raw_append_only BEFORE UPDATE OR DELETE ON ocr_raw
  FOR EACH ROW EXECUTE FUNCTION tt_forbid_change();

-- D4: recorded transactions are never deleted (use reversal / correction)
CREATE TRIGGER retailer_transactions_no_delete BEFORE DELETE ON retailer_transactions
  FOR EACH ROW EXECUTE FUNCTION tt_forbid_change();
CREATE TRIGGER retailer_transaction_items_no_delete BEFORE DELETE ON retailer_transaction_items
  FOR EACH ROW EXECUTE FUNCTION tt_forbid_change();
CREATE TRIGGER outlet_orders_no_delete BEFORE DELETE ON outlet_orders
  FOR EACH ROW EXECUTE FUNCTION tt_forbid_change();
CREATE TRIGGER outlet_order_items_no_delete BEFORE DELETE ON outlet_order_items
  FOR EACH ROW EXECUTE FUNCTION tt_forbid_change();
CREATE TRIGGER horeca_sales_no_delete BEFORE DELETE ON horeca_sales
  FOR EACH ROW EXECUTE FUNCTION tt_forbid_change();

-- D4: APPROVED transaction values are frozen; only status may move to SUPERSEDED/REVERSED.
CREATE OR REPLACE FUNCTION tt_freeze_approved_tx() RETURNS trigger AS $$
BEGIN
  IF OLD.validation_status = 'APPROVED' THEN
    IF NEW.total_value IS DISTINCT FROM OLD.total_value
       OR NEW.total_quantity IS DISTINCT FROM OLD.total_quantity
       OR NEW.retailer_outlet_id IS DISTINCT FROM OLD.retailer_outlet_id
       OR NEW.wholesaler_outlet_id IS DISTINCT FROM OLD.wholesaler_outlet_id
       OR NEW.transaction_date IS DISTINCT FROM OLD.transaction_date
       OR NEW.spg_id IS DISTINCT FROM OLD.spg_id
       OR NEW.data_nature IS DISTINCT FROM OLD.data_nature
       OR NEW.validation_status NOT IN ('APPROVED', 'SUPERSEDED', 'REVERSED') THEN
      RAISE EXCEPTION 'Approved transaction % cannot be modified; use correction or reversal', OLD.id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER retailer_transactions_freeze_approved BEFORE UPDATE ON retailer_transactions
  FOR EACH ROW EXECUTE FUNCTION tt_freeze_approved_tx();

-- Items of an approved transaction are frozen as well
CREATE OR REPLACE FUNCTION tt_freeze_approved_items() RETURNS trigger AS $$
DECLARE st text;
BEGIN
  SELECT validation_status INTO st FROM retailer_transactions WHERE id = COALESCE(NEW.transaction_id, OLD.transaction_id);
  IF st IN ('APPROVED','SUPERSEDED','REVERSED') THEN
    RAISE EXCEPTION 'Items of a % transaction cannot be modified', st
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER retailer_transaction_items_freeze BEFORE UPDATE ON retailer_transaction_items
  FOR EACH ROW EXECUTE FUNCTION tt_freeze_approved_items();
