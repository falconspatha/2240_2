-- Enable RLS
ALTER TABLE tblUserPage ENABLE ROW LEVEL SECURITY;
ALTER TABLE tblDonationLot ENABLE ROW LEVEL SECURITY;
ALTER TABLE tblInventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE tblOrders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tblOrderLine ENABLE ROW LEVEL SECURITY;
ALTER TABLE tblPickAllocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE tblBeneficiary ENABLE ROW LEVEL SECURITY;
ALTER TABLE tblStorageZone ENABLE ROW LEVEL SECURITY;
ALTER TABLE tblDonor ENABLE ROW LEVEL SECURITY;
ALTER TABLE tblProduct ENABLE ROW LEVEL SECURITY;
ALTER TABLE tblZoneCapacityLog ENABLE ROW LEVEL SECURITY;
ALTER TABLE tblAdminAuditLog ENABLE ROW LEVEL SECURITY;

-- User pages: owner-only
CREATE POLICY "user can read own pages"
ON tblUserPage FOR SELECT
USING (auth.uid() = UserID);

CREATE POLICY "user can insert own pages"
ON tblUserPage FOR INSERT
WITH CHECK (auth.uid() = UserID);

CREATE POLICY "user can update own pages"
ON tblUserPage FOR UPDATE
USING (auth.uid() = UserID)
WITH CHECK (auth.uid() = UserID);

-- Admin full access
CREATE POLICY "admin full access user pages"
ON tblUserPage FOR ALL
USING (auth.jwt() ->> 'role' = 'admin')
WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Operational tables: authenticated users can read, admin can write
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tblDonationLot','tblInventory','tblOrders','tblOrderLine','tblPickAllocation',
    'tblBeneficiary','tblStorageZone','tblDonor','tblProduct','tblZoneCapacityLog'
  ]
  LOOP
    EXECUTE format('CREATE POLICY "auth read %s" ON %s FOR SELECT USING (auth.role() = ''authenticated'')', t, t);
    EXECUTE format('CREATE POLICY "staff write %s" ON %s FOR INSERT WITH CHECK (auth.jwt()->>''role'' IN (''admin'',''inventory'',''beneficiary'',''donor''))', t, t);
    EXECUTE format('CREATE POLICY "staff update %s" ON %s FOR UPDATE USING (auth.jwt()->>''role'' IN (''admin'',''inventory'',''beneficiary'',''donor'')) WITH CHECK (auth.jwt()->>''role'' IN (''admin'',''inventory'',''beneficiary'',''donor''))', t, t);
    EXECUTE format('CREATE POLICY "admin delete %s" ON %s FOR DELETE USING (auth.jwt()->>''role'' = ''admin'')', t, t);
  END LOOP;
END $$;

-- Admin audit log: admin only
CREATE POLICY "admin read audit log"
ON tblAdminAuditLog FOR SELECT
USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "admin insert audit log"
ON tblAdminAuditLog FOR INSERT
WITH CHECK (auth.jwt() ->> 'role' = 'admin');
