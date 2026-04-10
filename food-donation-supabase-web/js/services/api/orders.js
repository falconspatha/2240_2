import { supabase } from "../supabaseClient.js";

export async function listOrders({ search = "", filters = {}, sort = "OrderDate", sortDir = "desc" } = {}) {
  const { data, error } = await supabase.rpc("fn_list_orders", {
    p_search:   search,
    p_status:   filters.Status || "",
    p_sort:     sort,
    p_sort_dir: sortDir,
  });
  if (error) throw error;
  return (data || []).map((r) => ({
    ...r,
    tblBeneficiary: { BeneficiaryName: r.BeneficiaryName },
  }));
}

export async function listOpenOrders() {
  const { data, error } = await supabase.rpc("fn_list_open_orders");
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
  const { data, error } = await supabase.rpc("fn_create_order", {
    p_beneficiary_id:         Number(header.BeneficiaryID),
    p_order_date:             header.OrderDate || new Date().toISOString().slice(0, 10),
    p_required_delivery_date: header.RequiredDeliveryDate || null,
    p_status:                 header.Status   || "Pending",
    p_priority:               Number(header.Priority) || 1,
    p_notes:                  header.Notes    || null,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function cancelOrder(id) {
  const { data, error } = await supabase.rpc("fn_cancel_order", { p_id: Number(id) });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function listOrderLines(orderId) {
  const { data, error } = await supabase.rpc("fn_list_order_lines", {
    p_order_id: Number(orderId),
  });
  if (error) throw error;
  return (data || []).map((r) => ({
    ...r,
    tblProduct: { ProductName: r.ProductName },
  }));
}

export async function addOrderLine(orderId, line) {
  const { data, error } = await supabase.rpc("fn_add_order_line", {
    p_order_id:   Number(orderId),
    p_product_id: Number(line.ProductID),
    p_qty_units:  Number(line.QtyUnits),
    p_notes:      line.Notes || null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  // trigger FEFO allocation
  await allocateOrderLineFEFO(row.OrderLineID);
  return row;
}

export async function allocateOrderLineFEFO(orderLineId) {
  const { data, error } = await supabase.rpc("fn_allocate_fefo", {
    p_order_line_id: Number(orderLineId),
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
  if (error) throw error;
  return data;
}
