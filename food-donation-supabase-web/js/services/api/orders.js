import { supabase } from "../supabaseClient.js";
import { parseNumber } from "../../ui/forms.js";
import { withMultiSearch, withFilters, withSort } from "../queries.js";
import { logComputedZoneUsage } from "./capacity.js";

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

export async function listBeneficiaryDeliveryStatus(beneficiaryId) {
  const id = parseNumber(beneficiaryId);
  if (!id) return [];

  const { data: orders, error: orderError } = await supabase
    .from("tblOrders")
    .select("OrderID, BeneficiaryID, OrderDate, RequiredDeliveryDate, Status, Priority, Notes")
    .eq("BeneficiaryID", id)
    .order("OrderDate", { ascending: false });
  if (orderError) throw orderError;
  if (!orders?.length) return [];

  const orderIds = orders.map((order) => order.OrderID);
  const { data: lines, error: lineError } = await supabase
    .from("tblOrderLine")
    .select("OrderLineID, OrderID, ProductID, QtyUnits, Notes, tblProduct:ProductID(ProductName)")
    .in("OrderID", orderIds)
    .order("OrderLineID", { ascending: true });
  if (lineError) throw lineError;

  const linesByOrder = new Map();
  (lines || []).forEach((line) => {
    const key = String(line.OrderID);
    const arr = linesByOrder.get(key) || [];
    arr.push(line);
    linesByOrder.set(key, arr);
  });

  return orders.map((order) => {
    const orderLines = linesByOrder.get(String(order.OrderID)) || [];
    return {
      ...order,
      lineCount: orderLines.length,
      totalQtyUnits: orderLines.reduce((sum, line) => sum + (parseNumber(line.QtyUnits) || 0), 0),
      lines: orderLines,
    };
  });
}

export async function createOrder(header) {
  const payload = {
    BeneficiaryID: parseNumber(header?.BeneficiaryID),
    OrderDate: header?.OrderDate || new Date().toISOString().slice(0, 10),
    RequiredDeliveryDate: header?.RequiredDeliveryDate || null,
    Status: header?.Status || "Pending",
    Priority: parseNumber(header?.Priority) || 1,
    Notes: header?.Notes || null,
  };
  const { data, error } = await supabase.from("tblOrders").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateOrder(id, patch) {
  const payload = {};
  if ("RequiredDeliveryDate" in patch) payload.RequiredDeliveryDate = patch.RequiredDeliveryDate || null;
  if ("Status" in patch) payload.Status = patch.Status || "Pending";
  if ("Priority" in patch) payload.Priority = parseNumber(patch.Priority) || 1;
  if ("Notes" in patch) payload.Notes = patch.Notes || null;
  const { data, error } = await supabase.from("tblOrders").update(payload).eq("OrderID", id).select().single();
  if (error) throw error;
  return data;
}

export async function cancelOrder(id) {
  return updateOrder(parseNumber(id), { Status: "Cancelled" });
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
  const payload = {
    OrderID: parseNumber(orderId),
    ProductID: parseNumber(line?.ProductID),
    QtyUnits: parseNumber(line?.QtyUnits),
    Notes: line?.Notes || null,
  };
  const { data, error } = await supabase
    .from("tblOrderLine")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  await allocateOrderLineFEFO(data.OrderLineID);
  return data;
}

export async function updateOrderLine(id, patch) {
  const payload = {};
  if ("QtyUnits" in patch) payload.QtyUnits = parseNumber(patch.QtyUnits);
  if ("Notes" in patch) payload.Notes = patch.Notes || null;
  const { data, error } = await supabase.from("tblOrderLine").update(payload).eq("OrderLineID", id).select().single();
  if (error) throw error;
  return data;
}

export async function allocateOrderLineFEFO(orderLineId) {
  const targetOrderLineId = parseNumber(orderLineId);
  if (!targetOrderLineId) {
    throw new Error("Invalid OrderLineID for FEFO allocation.");
  }

  const { data: orderLine, error: lineError } = await supabase
    .from("tblOrderLine")
    .select("OrderLineID, ProductID, QtyUnits")
    .eq("OrderLineID", targetOrderLineId)
    .single();
  if (lineError) throw lineError;

  const { data: existingAllocs, error: allocError } = await supabase
    .from("tblPickAllocation")
    .select("AllocationID")
    .eq("OrderLineID", targetOrderLineId)
    .limit(1);
  if (allocError) throw allocError;
  if (existingAllocs?.length) return { skipped: true, reason: "already_allocated" };

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

  const lotIds = lots.map((lot) => lot.LotID);

  const { data: inventoryRows, error: inventoryError } = await supabase
    .from("tblInventory")
    .select("InventoryID, LotID, ZoneID, OnHandUnits, OnHandKg")
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
      await logComputedZoneUsage(inv.ZoneID);

      remainingUnits -= takeUnits;
    }
  }

  return { remainingUnits };
}
