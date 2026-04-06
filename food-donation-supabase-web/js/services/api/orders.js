import { supabase } from "../supabaseClient.js";
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
  return data;
}

export async function updateOrderLine(id, patch) {
  const { data, error } = await supabase.from("tblOrderLine").update(patch).eq("OrderLineID", id).select().single();
  if (error) throw error;
  return data;
}
