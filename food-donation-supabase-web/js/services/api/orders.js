import { supabase } from "../supabaseClient.js";
import { parseNumber } from "../../ui/forms.js";
import { withMultiSearch, withFilters, withSort } from "../queries.js";

const SEARCH_COLUMNS = ["Status", "Priority"];

export async function listOrders({ search = "", filters = {}, sort = "OrderDate", sortDir = "desc" } = {}) {
  let query = supabase
    .from("tblOrders")
    .select("OrderID, BeneficiaryID, OrderDate, Status, Priority, Notes, tblBeneficiary:BeneficiaryID(BeneficiaryName)");
  query = withMultiSearch(query, SEARCH_COLUMNS, search);
  query = withFilters(query, filters);
  query = withSort(query, sort, sortDir);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function listOpenOrders() {
  const { data, error } = await supabase
    .from("tblOrders")
    .select("OrderID, BeneficiaryID, OrderDate, Status, Priority, Notes")
    .filter("Status", "not.in", '("Completed","Cancelled")')
    .order("OrderDate", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createOrder(header) {
  const { data, error } = await supabase.from("tblOrders").insert(header).select().single();
  if (error) throw error;
  return data;
}

export async function updateOrder(id, patch) {
  const { data, error } = await supabase.from("tblOrders").update(patch).eq("OrderID", id).select().single();
  if (error) throw error;
  return data;
}

export async function listOrderLines(orderId) {
  const { data, error } = await supabase
    .from("tblOrderLine")
    .select("OrderLineID, OrderID, ProductID, QtyUnits, Notes, tblProduct:ProductID(ProductName)")
    .eq("OrderID", orderId)
    .order("OrderLineID");
  if (error) throw error;
  return data || [];
}

export async function addOrderLine(orderId, line) {
  const { data, error } = await supabase
    .from("tblOrderLine")
    .insert({ ...line, OrderID: orderId })
    .select()
    .single();
  if (error) throw error;
  await autoAllocateOrderLine(data);
  return data;
}

export async function updateOrderLine(id, patch) {
  const { data, error } = await supabase.from("tblOrderLine").update(patch).eq("OrderLineID", id).select().single();
  if (error) throw error;
  return data;
}

async function autoAllocateOrderLine(orderLine) {
  const productId = parseNumber(orderLine?.ProductID);
  let remainingUnits = parseNumber(orderLine?.QtyUnits);
  if (!productId || !remainingUnits) return;

  const { data: lots, error: lotsError } = await supabase
    .from("tblDonationLot")
    .select("LotID, ProductID, ExpiryDate, UnitWeightKg")
    .eq("ProductID", productId)
    .order("ExpiryDate", { ascending: true })
    .order("LotID", { ascending: true });
  if (lotsError) throw lotsError;
  if (!lots?.length) return;

  const lotMeta = new Map(lots.map((lot) => [String(lot.LotID), lot]));
  const lotIds = lots.map((lot) => lot.LotID);

  const { data: inventoryRows, error: inventoryError } = await supabase
    .from("tblInventory")
    .select("InventoryID, LotID, OnHandUnits, OnHandKg")
    .in("LotID", lotIds);
  if (inventoryError) throw inventoryError;
  if (!inventoryRows?.length) return;

  const inventoryByLot = new Map();
  (inventoryRows || []).forEach((inv) => {
    const key = String(inv.LotID);
    const arr = inventoryByLot.get(key) || [];
    arr.push(inv);
    inventoryByLot.set(key, arr);
  });

  const pickedAt = new Date().toISOString().slice(0, 10);
  let seq = 1;

  for (const lot of lots) {
    if (remainingUnits <= 0) break;
    const invRows = inventoryByLot.get(String(lot.LotID)) || [];
    for (const inv of invRows) {
      if (remainingUnits <= 0) break;
      const onHandUnits = parseNumber(inv.OnHandUnits);
      const onHandKg = Number(inv.OnHandKg || 0);
      if (onHandUnits <= 0) continue;

      const takeUnits = Math.min(remainingUnits, onHandUnits);
      const unitWeight = Number(lot.UnitWeightKg || 0);
      const allocKg = Number((takeUnits * unitWeight).toFixed(2));
      const nextOnHandUnits = onHandUnits - takeUnits;
      const nextOnHandKg = Number(Math.max(0, onHandKg - allocKg).toFixed(2));

      const { error: allocError } = await supabase.from("tblPickAllocation").insert({
        OrderLineID: orderLine.OrderLineID,
        InventoryID: inv.InventoryID,
        AllocUnits: takeUnits,
        AllocKg: allocKg,
        PickedAt: pickedAt,
        FEFOSeq: seq++,
      });
      if (allocError) throw allocError;

      const { error: invUpdateError } = await supabase
        .from("tblInventory")
        .update({ OnHandUnits: String(nextOnHandUnits), OnHandKg: String(nextOnHandKg), LastUpdated: pickedAt })
        .eq("InventoryID", inv.InventoryID);
      if (invUpdateError) throw invUpdateError;

      remainingUnits -= takeUnits;
    }
  }
}
