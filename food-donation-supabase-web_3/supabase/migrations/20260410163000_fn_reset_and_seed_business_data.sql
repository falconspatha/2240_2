-- Reset and seed helpers for local/dev admin maintenance.
-- WARNING: fn_reset_all_business_data permanently removes all business rows.

CREATE OR REPLACE FUNCTION public.fn_reset_all_business_data()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  TRUNCATE TABLE
    public."tblPickAllocation",
    public."tblOrderLine",
    public."tblInventory",
    public."tblDonationLot",
    public."tblOrders",
    public."tblZoneCapacityLog",
    public."tblBeneficiary",
    public."tblDonor",
    public."tblProduct",
    public."tblStorageZone"
  RESTART IDENTITY;

  RETURN 'Reset completed';
END;
$$;

REVOKE ALL ON FUNCTION public.fn_reset_all_business_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reset_all_business_data() TO service_role;

CREATE OR REPLACE FUNCTION public.fn_seed_business_data()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_zone_chilled bigint;
  v_zone_ambient bigint;
  v_product_milk bigint;
  v_product_rice bigint;
  v_donor_freshmart bigint;
  v_donor_citykitchen bigint;
  v_beneficiary_cca bigint;
  v_beneficiary_ehb bigint;
  v_lot_milk bigint;
  v_lot_rice bigint;
  v_inventory_milk bigint;
  v_inventory_rice bigint;
  v_order_cca bigint;
  v_order_ehb bigint;
  v_orderline_cca_milk bigint;
  v_orderline_ehb_rice bigint;
BEGIN
  INSERT INTO public."tblStorageZone" ("ZoneName", "TempBand", "CapacityKg", "Notes")
  VALUES ('Chilled-A', 'Chilled', 500, 'Primary chilled zone')
  RETURNING "ZoneID" INTO v_zone_chilled;

  INSERT INTO public."tblStorageZone" ("ZoneName", "TempBand", "CapacityKg", "Notes")
  VALUES ('Ambient-A', 'Ambient', 1000, 'Primary ambient zone')
  RETURNING "ZoneID" INTO v_zone_ambient;

  INSERT INTO public."tblProduct" ("ProductName", "Category", "UnitWeightKg", "TempRequirement", "ShelfLifeDays", "Barcode")
  VALUES ('Milk', 'Dairy', 1.0, 'Chilled', 14, 'MILK-0001')
  RETURNING "ProductID" INTO v_product_milk;

  INSERT INTO public."tblProduct" ("ProductName", "Category", "UnitWeightKg", "TempRequirement", "ShelfLifeDays", "Barcode")
  VALUES ('Rice', 'Grain', 5.0, 'Ambient', 365, 'RICE-0001')
  RETURNING "ProductID" INTO v_product_rice;

  INSERT INTO public."tblDonor" ("DonorName", "DonorType", "Phone", "Email", "Address", "District", "CreatedAt")
  VALUES ('FreshMart', 'Supermarket', '2111 1111', 'ops@freshmart.hk', '1 Market Road', 'Hong Kong Island', CURRENT_DATE)
  RETURNING "DonorID" INTO v_donor_freshmart;

  INSERT INTO public."tblDonor" ("DonorName", "DonorType", "Phone", "Email", "Address", "District", "CreatedAt")
  VALUES ('City Kitchen', 'Restaurant', '2333 3333', 'hello@citykitchen.hk', '8 Kitchen Street', 'Kowloon', CURRENT_DATE)
  RETURNING "DonorID" INTO v_donor_citykitchen;

  INSERT INTO public."tblBeneficiary" ("BeneficiaryName", "ContactName", "Phone", "Address", "District", "Latitude", "Longitude", "HasColdStorage", "CreatedAt")
  VALUES ('Community Centre A', 'Ms Chan', '2555 5555', '10 Community Lane', 'Hong Kong Island', NULL, NULL, TRUE, CURRENT_DATE)
  RETURNING "BeneficiaryID" INTO v_beneficiary_cca;

  INSERT INTO public."tblBeneficiary" ("BeneficiaryName", "ContactName", "Phone", "Address", "District", "Latitude", "Longitude", "HasColdStorage", "CreatedAt")
  VALUES ('Elderly Home B', 'Mr Lee', '2666 6666', '22 Care Street', 'Kowloon', NULL, NULL, FALSE, CURRENT_DATE)
  RETURNING "BeneficiaryID" INTO v_beneficiary_ehb;

  INSERT INTO public."tblDonationLot" (
    "DonorID", "ProductID", "LotCode", "QuantityUnits", "UnitWeightKg", "TotalWeightKg",
    "ExpiryDate", "ReceivedDate", "TempRequirement", "SuggestedZoneID", "StoredZoneID", "Status", "Notes"
  )
  VALUES (
    v_donor_freshmart, v_product_milk, 'LOT-MILK-001', 120, 1.0, 120.0,
    CURRENT_DATE + 14, CURRENT_DATE, 'Chilled', NULL, v_zone_chilled, 'Stored', 'Seed milk lot'
  )
  RETURNING "LotID" INTO v_lot_milk;

  INSERT INTO public."tblDonationLot" (
    "DonorID", "ProductID", "LotCode", "QuantityUnits", "UnitWeightKg", "TotalWeightKg",
    "ExpiryDate", "ReceivedDate", "TempRequirement", "SuggestedZoneID", "StoredZoneID", "Status", "Notes"
  )
  VALUES (
    v_donor_citykitchen, v_product_rice, 'LOT-RICE-001', 200, 5.0, 1000.0,
    CURRENT_DATE + 180, CURRENT_DATE, 'Ambient', NULL, v_zone_ambient, 'Stored', 'Seed rice lot'
  )
  RETURNING "LotID" INTO v_lot_rice;

  INSERT INTO public."tblInventory" ("LotID", "ZoneID", "OnHandUnits", "OnHandKg", "LastUpdated")
  VALUES (v_lot_milk, v_zone_chilled, '100', '100.0', CURRENT_DATE)
  RETURNING "InventoryID" INTO v_inventory_milk;

  INSERT INTO public."tblInventory" ("LotID", "ZoneID", "OnHandUnits", "OnHandKg", "LastUpdated")
  VALUES (v_lot_rice, v_zone_ambient, '170', '850.0', CURRENT_DATE)
  RETURNING "InventoryID" INTO v_inventory_rice;

  INSERT INTO public."tblOrders" ("BeneficiaryID", "OrderDate", "RequiredDeliveryDate", "Status", "Priority", "Notes")
  VALUES (v_beneficiary_cca, CURRENT_DATE, CURRENT_DATE + 2, 'Pending', 2, 'Weekly replenishment')
  RETURNING "OrderID" INTO v_order_cca;

  INSERT INTO public."tblOrders" ("BeneficiaryID", "OrderDate", "RequiredDeliveryDate", "Status", "Priority", "Notes")
  VALUES (v_beneficiary_ehb, CURRENT_DATE, CURRENT_DATE + 3, 'Pending', 1, 'Standard delivery')
  RETURNING "OrderID" INTO v_order_ehb;

  INSERT INTO public."tblOrderLine" ("OrderID", "ProductID", "QtyUnits", "Notes")
  VALUES (v_order_cca, v_product_milk, 50, 'Milk packs')
  RETURNING "OrderLineID" INTO v_orderline_cca_milk;

  INSERT INTO public."tblOrderLine" ("OrderID", "ProductID", "QtyUnits", "Notes")
  VALUES (v_order_ehb, v_product_rice, 80, 'Rice bags')
  RETURNING "OrderLineID" INTO v_orderline_ehb_rice;

  INSERT INTO public."tblPickAllocation" ("OrderLineID", "InventoryID", "AllocUnits", "AllocKg", "PickedAt", "FEFOSeq")
  VALUES (v_orderline_cca_milk, v_inventory_milk, 20, 20.0, CURRENT_DATE, 1);

  INSERT INTO public."tblPickAllocation" ("OrderLineID", "InventoryID", "AllocUnits", "AllocKg", "PickedAt", "FEFOSeq")
  VALUES (v_orderline_ehb_rice, v_inventory_rice, 30, 150.0, CURRENT_DATE, 1);

  INSERT INTO public."tblZoneCapacityLog" ("ZoneID", "LogDate", "UsedKg")
  VALUES (v_zone_chilled, CURRENT_DATE, 100.0);

  INSERT INTO public."tblZoneCapacityLog" ("ZoneID", "LogDate", "UsedKg")
  VALUES (v_zone_ambient, CURRENT_DATE, 850.0);

  RETURN 'Seed completed';
END;
$$;

REVOKE ALL ON FUNCTION public.fn_seed_business_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_seed_business_data() TO service_role;

CREATE OR REPLACE FUNCTION public.fn_reset_and_seed_business_data()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_reset_all_business_data();
  PERFORM public.fn_seed_business_data();
  RETURN 'Reset + seed completed';
END;
$$;

REVOKE ALL ON FUNCTION public.fn_reset_and_seed_business_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reset_and_seed_business_data() TO service_role;

NOTIFY pgrst, 'reload schema';
