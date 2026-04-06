import { supabase } from "../supabaseClient.js";
import { paginationRange, withMultiSearch, withFilters, withSort } from "../queries.js";

const SEARCH_COLUMNS = ["ProductName", "Category", "TempRequirement"];

export async function listProducts({ search = "", page = 1, size = 10, sort = "ProductID", sortDir = "desc", filters = {} } = {}) {
  const { from, to } = paginationRange(page, size);
  let query = supabase
    .from("tblProduct")
    .select("ProductID, ProductName, Category, UnitWeightKg, TempRequirement", { count: "exact" })
    .range(from, to);
  query = withMultiSearch(query, SEARCH_COLUMNS, search);
  query = withFilters(query, filters);
  query = withSort(query, sort, sortDir);
  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data || [], total: count ?? 0 };
}

export async function createProduct(payload) {
  const { data, error } = await supabase.from("tblProduct").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateProduct(id, patch) {
  const { data, error } = await supabase
    .from("tblProduct")
    .update(patch)
    .eq("ProductID", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProduct(id) {
  const { error } = await supabase.from("tblProduct").delete().eq("ProductID", id);
  if (error) throw error;
}
