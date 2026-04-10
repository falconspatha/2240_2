import { supabase } from "../services/supabaseClient.js";
import { bindPagination, debounce, exportCSV, renderPagination, showToast } from "../ui/components.js";

const REPORT_STATE_KEY = "fdms_report_panel_state";

function asDate(d) {
  return d.toISOString().slice(0, 10);
}

function buildOrderSummaries(lines) {
  const m = new Map();
  for (const l of lines) {
    const oid = l.OrderID;
    if (!m.has(oid)) {
      m.set(oid, {
        OrderID: oid,
        OrderStatus: l.OrderStatus || "",
        RequestedUnits: 0,
        AllocatedUnits: 0,
        LineCount: 0,
      });
    }
    const g = m.get(oid);
    g.RequestedUnits += l.RequestedUnits;
    g.AllocatedUnits += l.AllocatedUnits;
    g.LineCount += 1;
  }
  return [...m.values()]
    .map((g) => ({
      ...g,
      CompletionPct: g.RequestedUnits ? Number(((g.AllocatedUnits / g.RequestedUnits) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => a.CompletionPct - b.CompletionPct || Number(a.OrderID) - Number(b.OrderID));
}

function filterFulfillmentSummaries(summaries, q) {
  if (!q?.trim()) return summaries;
  const s = q.trim().toLowerCase();
  return summaries.filter((r) => String(r.OrderID).includes(s) || (r.OrderStatus || "").toLowerCase().includes(s));
}

function filterFulfillmentLines(lines, q) {
  if (!q?.trim()) return lines;
  const s = q.trim().toLowerCase();
  return lines.filter(
    (l) =>
      String(l.OrderID).includes(s) ||
      String(l.OrderLineID).includes(s) ||
      String(l.ProductID).includes(s) ||
      (l.ProductName || "").toLowerCase().includes(s),
  );
}

function loadPanelState() {
  try {
    const raw = localStorage.getItem(REPORT_STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePanelState(state) {
  localStorage.setItem(REPORT_STATE_KEY, JSON.stringify(state));
}

function setPanelCollapsed(container, id, collapsed, state) {
  const panel = container.querySelector(`[data-report-panel="${id}"]`);
  if (!panel) return;
  panel.classList.toggle("collapsed", collapsed);
  panel.querySelector("[data-panel-toggle]")?.setAttribute("aria-expanded", String(!collapsed));
  state[id] = collapsed;
  savePanelState(state);
}

export async function render(container) {
  const panelState = loadPanelState();

  container.innerHTML = `
    <div class="page-grid">
      <section class="card">
        <div class="toolbar">
          <h3>Reports</h3>
          <div style="display:flex;gap:.4rem">
            <button class="btn btn-ghost" id="expandAll">Expand all</button>
            <button class="btn btn-ghost" id="collapseAll">Collapse all</button>
          </div>
        </div>
      </section>
      <section class="card report-panel" data-report-panel="r1">
        <div class="toolbar"><h3>1) Near-Expiry Lots (7 days)</h3><div style="display:flex;gap:.4rem"><button class="btn btn-ghost" data-panel-toggle data-panel="r1">Minimize</button><button class="btn btn-ghost" id="csv1">CSV</button></div></div>
        <div class="report-panel-content" id="r1"></div>
      </section>
      <section class="card report-panel" data-report-panel="r2">
        <div class="toolbar"><h3>2) Zone Utilization</h3><div style="display:flex;gap:.4rem"><button class="btn btn-ghost" data-panel-toggle data-panel="r2">Minimize</button><button class="btn btn-ghost" id="csv2">CSV</button></div></div>
        <div class="report-panel-content" id="r2"></div>
      </section>
      <section class="card report-panel" data-report-panel="r3">
        <div class="toolbar">
          <h3>3) Open Order Fulfillment</h3>
          <div style="display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">
            <button class="btn btn-ghost" data-panel-toggle data-panel="r3">Minimize</button>
            <button class="btn btn-ghost" id="csv3">CSV (all lines)</button>
          </div>
        </div>
        <div class="report-panel-content" id="r3"></div>
      </section>
      <section class="card report-panel" data-report-panel="r4">
        <div class="toolbar">
          <h3>4) Donor Contribution Summary</h3>
          <div style="display:flex;gap:.4rem;align-items:center">
            <input type="date" id="fromDate"><input type="date" id="toDate">
            <button class="btn btn-ghost" id="applyDate">Apply</button>
            <button class="btn btn-ghost" data-panel-toggle data-panel="r4">Minimize</button>
            <button class="btn btn-ghost" id="csv4">CSV</button>
          </div>
        </div>
        <div class="report-panel-content" id="r4"></div>
      </section>
      <section class="card report-panel" data-report-panel="r5">
        <div class="toolbar"><h3>5) Expired Food Lots</h3><div style="display:flex;gap:.4rem"><button class="btn btn-ghost" data-panel-toggle data-panel="r5">Minimize</button><button class="btn btn-ghost" id="csv5">CSV</button></div></div>
        <div class="report-panel-content" id="r5"></div>
      </section>
    </div>
  `;

  let data1 = [];
  let data2 = [];
  let data3 = [];
  let data4 = [];
  let data5 = [];

  const fulfillmentUi = { view: "summary", page: 1, pageSize: 25, filter: "" };
  const debouncedFulfillmentFilter = debounce(() => {
    const input = container.querySelector("#r3-filter");
    fulfillmentUi.filter = input?.value?.trim() ?? "";
    fulfillmentUi.page = 1;
    renderFulfillmentPanel();
  }, 320);

  function renderFulfillmentPanel() {
    const host = container.querySelector("#r3");
    if (!host) return;

    const summaries = buildOrderSummaries(data3);
    const q = fulfillmentUi.filter;
    const filteredSummary = filterFulfillmentSummaries(summaries, q);
    const filteredLines = filterFulfillmentLines(data3, q);

    const isSummary = fulfillmentUi.view === "summary";
    const total = isSummary ? filteredSummary.length : filteredLines.length;
    const size = fulfillmentUi.pageSize;
    const pages = Math.max(1, Math.ceil(total / size || 1));
    if (fulfillmentUi.page > pages) fulfillmentUi.page = pages;
    const page = Math.max(1, fulfillmentUi.page);
    const from = (page - 1) * size;
    const slice = isSummary ? filteredSummary.slice(from, from + size) : filteredLines.slice(from, from + size);

    const start = total ? from + 1 : 0;
    const end = total ? from + slice.length : 0;

    host.innerHTML = `
      <p class="muted" style="margin-bottom:.75rem">
        Open orders only (excludes Completed/Cancelled). <strong>${summaries.length}</strong> orders, <strong>${data3.length}</strong> lines.
        Default view is one row per order; switch to line detail or export CSV for all lines.
      </p>
      <div style="display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-bottom:.75rem">
        <label class="muted" style="display:flex;align-items:center;gap:.35rem">View
          <select id="r3-view">
            <option value="summary" ${isSummary ? "selected" : ""}>By order (summary)</option>
            <option value="lines" ${!isSummary ? "selected" : ""}>Order lines (detail)</option>
          </select>
        </label>
        <label class="muted" style="display:flex;align-items:center;gap:.35rem">Search
          <input type="search" id="r3-filter" placeholder="Order ID, line, product…" autocomplete="off" style="min-width:12rem">
        </label>
        <label class="muted" style="display:flex;align-items:center;gap:.35rem">Per page
          <select id="r3-page-size">
            ${[15, 25, 50, 100]
              .map((n) => `<option value="${n}" ${size === n ? "selected" : ""}>${n}</option>`)
              .join("")}
          </select>
        </label>
        <span class="muted" id="r3-range">${total ? `Rows ${start}–${end} of ${total}` : "No rows"}</span>
      </div>
      <div style="max-height:min(420px,55vh);overflow:auto;border:1px solid var(--border);border-radius:8px">
        <div id="r3-table-inner"></div>
      </div>
      <div id="r3-pager-host" style="margin-top:.75rem"></div>
    `;

    const filterInput = host.querySelector("#r3-filter");
    if (filterInput) filterInput.value = fulfillmentUi.filter;

    const inner = host.querySelector("#r3-table-inner");
    if (isSummary) {
      inner.innerHTML = `<table><thead><tr><th>Order</th><th>Status</th><th>Lines</th><th>Requested</th><th>Allocated</th><th>Complete</th></tr></thead><tbody>${
        slice
          .map(
            (r) =>
              `<tr><td>${r.OrderID}</td><td>${r.OrderStatus || ""}</td><td>${r.LineCount}</td><td>${r.RequestedUnits}</td><td>${r.AllocatedUnits}</td><td><div class="progress"><span style="width:${Math.min(
                100,
                r.CompletionPct,
              )}%"></span></div><small>${r.CompletionPct}%</small></td></tr>`,
          )
          .join("") || "<tr><td colspan='6' class='muted'>No matching rows</td></tr>"
      }</tbody></table>`;
    } else {
      inner.innerHTML = `<table><thead><tr><th>OrderLine</th><th>Order</th><th>Product</th><th>Requested</th><th>Allocated</th><th>Completion</th></tr></thead><tbody>${
        slice
          .map(
            (r) =>
              `<tr><td>${r.OrderLineID}</td><td>${r.OrderID}</td><td>${r.ProductName || r.ProductID}</td><td>${r.RequestedUnits}</td><td>${r.AllocatedUnits}</td><td><div class="progress"><span style="width:${Math.min(
                100,
                r.CompletionPct,
              )}%"></span></div><small>${r.CompletionPct}%</small></td></tr>`,
          )
          .join("") || "<tr><td colspan='6' class='muted'>No matching rows</td></tr>"
      }</tbody></table>`;
    }

    const pagerHost = host.querySelector("#r3-pager-host");
    if (total > size) {
      pagerHost.innerHTML = renderPagination({ page, size, total });
      bindPagination(pagerHost, (newPage) => {
        fulfillmentUi.page = newPage;
        renderFulfillmentPanel();
      });
    } else {
      pagerHost.innerHTML = "";
    }

    host.querySelector("#r3-view")?.addEventListener("change", (e) => {
      fulfillmentUi.view = e.target.value;
      fulfillmentUi.page = 1;
      renderFulfillmentPanel();
    });
    host.querySelector("#r3-page-size")?.addEventListener("change", (e) => {
      fulfillmentUi.pageSize = Number(e.target.value);
      fulfillmentUi.page = 1;
      renderFulfillmentPanel();
    });
    filterInput?.addEventListener("input", () => debouncedFulfillmentFilter());
  }

  async function loadNearExpiry() {
    const from = asDate(new Date());
    const to = asDate(new Date(Date.now() + 7 * 86400000));
    const { data, error } = await supabase
      .from("tblDonationLot")
      .select("LotID, ExpiryDate, Status, QuantityUnits, tblProduct:ProductID(ProductName), tblDonor:DonorID(DonorName)")
      .gte("ExpiryDate", from)
      .lte("ExpiryDate", to)
      .order("ExpiryDate", { ascending: true });
    if (error) throw error;
    data1 = data || [];
    container.querySelector("#r1").innerHTML = `<table><thead><tr><th>LotID</th><th>Product</th><th>Donor</th><th>Expiry</th><th>Units</th></tr></thead><tbody>${
      data1
        .map((r) => `<tr><td>${r.LotID}</td><td>${r.tblProduct?.ProductName || ""}</td><td>${r.tblDonor?.DonorName || ""}</td><td>${r.ExpiryDate}</td><td>${r.QuantityUnits}</td></tr>`)
        .join("") || "<tr><td colspan='5' class='muted'>No rows</td></tr>"
    }</tbody></table>`;
  }

  async function loadUtilization() {
    const [{ data: zones, error: zErr }, { data: inv, error: iErr }] = await Promise.all([
      supabase.from("tblStorageZone").select("ZoneID, ZoneName, CapacityKg"),
      supabase.from("tblInventory").select("ZoneID, OnHandKg"),
    ]);
    if (zErr || iErr) throw zErr || iErr;
    data2 = (zones || []).map((z) => {
      const used = (inv || []).filter((i) => String(i.ZoneID) === String(z.ZoneID)).reduce((s, i) => s + Number(i.OnHandKg || 0), 0);
      return {
        ZoneID: z.ZoneID,
        ZoneName: z.ZoneName,
        CapacityKg: z.CapacityKg,
        UsedKg: Number(used.toFixed(2)),
        UtilizationPct: z.CapacityKg ? Number(((used / z.CapacityKg) * 100).toFixed(2)) : 0,
      };
    });
    container.querySelector("#r2").innerHTML = `<table><thead><tr><th>Zone</th><th>Used</th><th>Capacity</th><th>Utilization</th></tr></thead><tbody>${data2
      .map(
        (r) => `<tr><td>${r.ZoneName}</td><td>${r.UsedKg}</td><td>${r.CapacityKg}</td><td><div class="progress"><span style="width:${Math.min(
          100,
          r.UtilizationPct,
        )}%"></span></div><small>${r.UtilizationPct}% ${r.UtilizationPct > 100 ? "OVER" : ""}</small></td></tr>`,
      )
      .join("")}</tbody></table>`;
  }

  async function loadFulfillment() {
    const [{ data: openOrders, error: oErr }, { data: lines, error: lErr }, { data: allocations, error: aErr }, { data: products, error: pErr }] =
      await Promise.all([
        supabase.from("tblOrders").select("OrderID, Status").filter("Status", "not.in", '("Completed","Cancelled")'),
        supabase.from("tblOrderLine").select("OrderLineID, OrderID, ProductID, QtyUnits"),
        supabase.from("tblPickAllocation").select("OrderLineID, AllocUnits"),
        supabase.from("tblProduct").select("ProductID, ProductName"),
      ]);
    if (oErr || lErr || aErr || pErr) throw oErr || lErr || aErr || pErr;

    const productName = new Map((products || []).map((p) => [p.ProductID, p.ProductName]));
    const allocByLine = new Map();
    (allocations || []).forEach((a) => {
      const k = String(a.OrderLineID);
      allocByLine.set(k, (allocByLine.get(k) || 0) + Number(a.AllocUnits || 0));
    });
    const openIds = new Set((openOrders || []).map((o) => o.OrderID));
    const statusByOrder = new Map((openOrders || []).map((o) => [o.OrderID, o.Status]));

    data3 = (lines || [])
      .filter((l) => openIds.has(l.OrderID))
      .map((l) => {
        const req = Number(l.QtyUnits || 0);
        const alloc = allocByLine.get(String(l.OrderLineID)) || 0;
        return {
          OrderLineID: l.OrderLineID,
          OrderID: l.OrderID,
          ProductID: l.ProductID,
          ProductName: productName.get(l.ProductID) || "",
          OrderStatus: statusByOrder.get(l.OrderID) ?? "",
          RequestedUnits: req,
          AllocatedUnits: alloc,
          CompletionPct: req ? Number(((alloc / req) * 100).toFixed(2)) : 0,
        };
      });

    fulfillmentUi.page = 1;
    renderFulfillmentPanel();
  }

  async function loadDonorContribution(from, to) {
    let query = supabase.from("tblDonationLot").select("DonorID, QuantityUnits, UnitWeightKg, ReceivedDate");
    if (from) query = query.gte("ReceivedDate", from);
    if (to) query = query.lte("ReceivedDate", to);
    const [{ data: lots, error: lotErr }, { data: donors, error: donorErr }] = await Promise.all([
      query,
      supabase.from("tblDonor").select("DonorID, DonorName"),
    ]);
    if (lotErr || donorErr) throw lotErr || donorErr;

    const byDonor = new Map();
    (lots || []).forEach((l) => {
      const curr = byDonor.get(l.DonorID) || { DonorID: l.DonorID, Total_Units: 0, Total_kg: 0 };
      curr.Total_Units += Number(l.QuantityUnits || 0);
      curr.Total_kg += Number(l.QuantityUnits || 0) * Number(l.UnitWeightKg || 0);
      byDonor.set(l.DonorID, curr);
    });
    const names = new Map((donors || []).map((d) => [d.DonorID, d.DonorName]));
    data4 = [...byDonor.values()].map((r) => ({
      DonorID: r.DonorID,
      Donor_Name: names.get(r.DonorID) || r.DonorID,
      Total_Units: r.Total_Units,
      Total_kg: Number(r.Total_kg.toFixed(2)),
    }));
    container.querySelector("#r4").innerHTML = `<table><thead><tr><th>Donor</th><th>Total Units</th><th>Total kg</th></tr></thead><tbody>${
      data4.map((r) => `<tr><td>${r.Donor_Name}</td><td>${r.Total_Units}</td><td>${r.Total_kg}</td></tr>`).join("") ||
      "<tr><td colspan='3' class='muted'>No rows</td></tr>"
    }</tbody></table>`;
  }

  async function loadExpiredLots() {
    const today = asDate(new Date());
    const [{ data: lots, error: lotErr }, { data: inventory, error: invErr }] = await Promise.all([
      supabase
        .from("tblDonationLot")
        .select("LotID, LotCode, ProductID, ExpiryDate, QuantityUnits, TotalWeightKg, Status, tblProduct:ProductID(ProductName)")
        .lt("ExpiryDate", today)
        .order("ExpiryDate", { ascending: true }),
      supabase.from("tblInventory").select("LotID, ZoneID, tblStorageZone:ZoneID(ZoneName)"),
    ]);
    if (lotErr || invErr) throw lotErr || invErr;

    const zoneByLot = new Map();
    (inventory || []).forEach((row) => {
      const key = String(row.LotID);
      const current = zoneByLot.get(key) || new Set();
      current.add(row.tblStorageZone?.ZoneName || String(row.ZoneID));
      zoneByLot.set(key, current);
    });

    data5 = (lots || []).map((lot) => ({
      LotID: lot.LotID,
      LotCode: lot.LotCode,
      ProductName: lot.tblProduct?.ProductName || "",
      ExpiryDate: lot.ExpiryDate,
      DaysExpired: Math.max(0, Math.floor((Date.now() - new Date(lot.ExpiryDate).getTime()) / 86400000)),
      QuantityUnits: lot.QuantityUnits,
      TotalWeightKg: lot.TotalWeightKg,
      Status: lot.Status,
      ZoneName: [...(zoneByLot.get(String(lot.LotID)) || [])].join(", "),
    }));

    container.querySelector("#r5").innerHTML = `<table><thead><tr><th>LotID</th><th>LotCode</th><th>Product</th><th>Expiry Date</th><th>Days Expired</th><th>Units</th><th>Total kg</th><th>Status</th><th>Zone</th></tr></thead><tbody>${
      data5
        .map(
          (r) =>
            `<tr><td>${r.LotID}</td><td>${r.LotCode || ""}</td><td>${r.ProductName}</td><td>${r.ExpiryDate}</td><td>${r.DaysExpired}</td><td>${r.QuantityUnits}</td><td>${r.TotalWeightKg}</td><td>${r.Status || ""}</td><td>${r.ZoneName || ""}</td></tr>`,
        )
        .join("") || "<tr><td colspan='9' class='muted'>No rows</td></tr>"
    }</tbody></table>`;
  }

  try {
    await Promise.all([loadNearExpiry(), loadUtilization(), loadFulfillment()]);
    await Promise.all([loadDonorContribution(), loadExpiredLots()]);
  } catch (error) {
    showToast(error.message, "error");
  }

  container.querySelector("#applyDate").addEventListener("click", async () => {
    await loadDonorContribution(container.querySelector("#fromDate").value, container.querySelector("#toDate").value);
  });

  container.querySelectorAll("[data-panel-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const panelId = btn.dataset.panel;
      const currentlyCollapsed = !!panelState[panelId];
      setPanelCollapsed(container, panelId, !currentlyCollapsed, panelState);
      btn.textContent = currentlyCollapsed ? "Minimize" : "Restore";
    });
  });

  container.querySelector("#collapseAll").addEventListener("click", () => {
    ["r1", "r2", "r3", "r4", "r5"].forEach((id) => setPanelCollapsed(container, id, true, panelState));
    container.querySelectorAll("[data-panel-toggle]").forEach((btn) => {
      btn.textContent = "Restore";
    });
  });

  container.querySelector("#expandAll").addEventListener("click", () => {
    ["r1", "r2", "r3", "r4", "r5"].forEach((id) => setPanelCollapsed(container, id, false, panelState));
    container.querySelectorAll("[data-panel-toggle]").forEach((btn) => {
      btn.textContent = "Minimize";
    });
  });

  ["r1", "r2", "r3", "r4", "r5"].forEach((id) => {
    const collapsed = !!panelState[id];
    setPanelCollapsed(container, id, collapsed, panelState);
    const toggle = container.querySelector(`[data-panel="${id}"]`);
    if (toggle) toggle.textContent = collapsed ? "Restore" : "Minimize";
  });

  container.querySelector("#csv1").addEventListener("click", () => exportCSV("near_expiry_lots.csv", data1));
  container.querySelector("#csv2").addEventListener("click", () => exportCSV("zone_utilization.csv", data2));
  container.querySelector("#csv3").addEventListener("click", () => exportCSV("order_fulfillment.csv", data3));
  container.querySelector("#csv4").addEventListener("click", () => exportCSV("donor_contribution.csv", data4));
  container.querySelector("#csv5").addEventListener("click", () => exportCSV("expired_food_lots.csv", data5));
}

export function destroy() {}
