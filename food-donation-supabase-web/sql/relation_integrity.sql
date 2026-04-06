-- Relation integrity hardening for food-donation-supabase-web
-- Source schema: ../../SCHEMA_REFERENCE.sql

-- 1) Value-domain checks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_lot_temp_requirement'
  ) THEN
    ALTER TABLE public."tblDonationLot"
      ADD CONSTRAINT chk_lot_temp_requirement
      CHECK ("TempRequirement" IN ('Ambient', 'Chilled', 'Frozen'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_lot_status'
  ) THEN
    ALTER TABLE public."tblDonationLot"
      ADD CONSTRAINT chk_lot_status
      CHECK ("Status" IN ('Received', 'Stored', 'Allocated', 'Completed', 'Cancelled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_order_status'
  ) THEN
    ALTER TABLE public."tblOrders"
      ADD CONSTRAINT chk_order_status
      CHECK ("Status" IN ('Pending', 'Allocated', 'Completed', 'Cancelled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_lotcode_format'
  ) THEN
    ALTER TABLE public."tblDonationLot"
      ADD CONSTRAINT chk_lotcode_format
      CHECK ("LotCode" ~ '^LOT[0-9]{6}-[0-9]{5}$');
  END IF;
END $$;

-- 2) LotCode uniqueness
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tblDonationLot_lotcode_key'
  ) THEN
    ALTER TABLE public."tblDonationLot"
      ADD CONSTRAINT "tblDonationLot_lotcode_key" UNIQUE ("LotCode");
  END IF;
END $$;

-- 3) Keep computed and dependent lot fields consistent
CREATE OR REPLACE FUNCTION public.fn_guard_donation_lot_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_temp_band text;
BEGIN
  IF NEW."ReceivedDate" IS NULL THEN
    NEW."ReceivedDate" := CURRENT_DATE;
  END IF;

  IF NEW."UnitWeightKg" IS NULL OR NEW."QuantityUnits" IS NULL THEN
    RAISE EXCEPTION 'UnitWeightKg and QuantityUnits must be present';
  END IF;

  NEW."TotalWeightKg" := ROUND((NEW."UnitWeightKg" * NEW."QuantityUnits")::numeric, 2);

  SELECT "TempBand" INTO v_temp_band
  FROM public."tblStorageZone"
  WHERE "ZoneID" = NEW."StoredZoneID";

  IF v_temp_band IS NULL THEN
    RAISE EXCEPTION 'StoredZoneID % does not exist', NEW."StoredZoneID";
  END IF;

  IF lower(COALESCE(v_temp_band, '')) <> lower(COALESCE(NEW."TempRequirement", '')) THEN
    RAISE EXCEPTION 'Zone temp band (%) does not match lot temp requirement (%)', v_temp_band, NEW."TempRequirement";
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_donation_lot_integrity ON public."tblDonationLot";
CREATE TRIGGER trg_guard_donation_lot_integrity
BEFORE INSERT OR UPDATE ON public."tblDonationLot"
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_donation_lot_integrity();

-- 4) Inventory non-negative safety
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_inventory_non_negative'
  ) THEN
    ALTER TABLE public."tblInventory"
      ADD CONSTRAINT chk_inventory_non_negative
      CHECK ((("OnHandUnits")::numeric >= 0) AND (("OnHandKg")::numeric >= 0));
  END IF;
END $$;
