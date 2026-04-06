import { supabase } from "../services/supabaseClient.js";
import { exportCSV, showToast } from "../ui/components.js";

const REPORT_STATE_KEY = "fdms_report_panel_state";

function asDate(d) {
  return d.toISOString().slice(0, 10);
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
        <div class="toolbar"><h3>3) Open Order Fulfillment</h3><div style="display:flex;gap:.4rem"><button class="btn btn-ghost" data-panel-toggle data-panel="r3">Minimize</button><button class="btn btn-ghost" id="csv3">CSV</button></div></div>
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
    </div>
  `;

  let data1 = [];
  let data2 = [];
  let data3 = [];
  let data4 = [];

  async function loadNearExpiry() {
    const from = asDate(new Date());
    const to = asDate(new Date(Date.now() + 7 * 86400000));
    const { data, error } = await supabase
      .from("tblDonationLot")
      .select("LotID, ExpiryDate, Status, QuantityUnits, tblProduct:ProductID(ProductName), tblDonor:DonorID(DonorName)")
      .gte("ExpiryDate", from)
      .lte("ExpiryDate", to)
      .in("Status", ["Received", "Stored"])
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
    const [{ data: openOrders, error: oErr }, { data: lines, error: lErr }, { data: allocations, error: aErr }] = await Promise.all([
      supabase.from("tblOrders").select("OrderID, Status").filter("Status", "not.in", '("Completed","Cancelled")'),
      supabase.from("tblOrderLine").select("OrderLineID, OrderID, ProductID, QtyUnits"),
      supabase.from("tblPickAllocation").select("OrderLineID, AllocUnits"),
    ]);
    if (oErr || lErr || aErr) throw oErr || lErr || aErr;
    const openIds = new Set((openOrders || []).map((o) => o.OrderID));
    data3 = (lines || [])
      .filter((l) => openIds.has(l.OrderID))
      .map((l) => {
        const alloc = (allocations || [])
          .filter((a) => String(a.OrderLineID) === String(l.OrderLineID))
          .reduce((s, a) => s + Number(a.AllocUnits || 0), 0);
        return {
          OrderLineID: l.OrderLineID,
          OrderID: l.OrderID,
          RequestedUnits: l.QtyUnits,
          AllocatedUnits: alloc,
          CompletionPct: l.QtyUnits ? Number(((alloc / l.QtyUnits) * 100).toFixed(2)) : 0,
        };
      });
    container.querySelector("#r3").innerHTML = `<table><thead><tr><th>OrderLine</th><th>Order</th><th>Requested</th><th>Allocated</th><th>Completion</th></tr></thead><tbody>${data3
      .map(
        (r) => `<tr><td>${r.OrderLineID}</td><td>${r.OrderID}</td><td>${r.RequestedUnits}</td><td>${r.AllocatedUnits}</td><td><div class="progress"><span style="width:${Math.min(
          100,
          r.CompletionPct,
        )}%"></span></div><small>${r.CompletionPct}%</small></td></tr>`,
      )
      .join("")}</tbody></table>`;
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

  try {
    await Promise.all([loadNearExpiry(), loadUtilization(), loadFulfillment()]);
    await loadDonorContribution();
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
    ["r1", "r2", "r3", "r4"].forEach((id) => setPanelCollapsed(container, id, true, panelState));
    container.querySelectorAll("[data-panel-toggle]").forEach((btn) => {
      btn.textContent = "Restore";
    });
  });

  container.querySelector("#expandAll").addEventListener("click", () => {
    ["r1", "r2", "r3", "r4"].forEach((id) => setPanelCollapsed(container, id, false, panelState));
    container.querySelectorAll("[data-panel-toggle]").forEach((btn) => {
      btn.textContent = "Minimize";
    });
  });

  ["r1", "r2", "r3", "r4"].forEach((id) => {
    const collapsed = !!panelState[id];
    setPanelCollapsed(container, id, collapsed, panelState);
    const toggle = container.querySelector(`[data-panel="${id}"]`);
    if (toggle) toggle.textContent = collapsed ? "Restore" : "Minimize";
  });

  container.querySelector("#csv1").addEventListener("click", () => exportCSV("near_expiry_lots.csv", data1));
  container.querySelector("#csv2").addEventListener("click", () => exportCSV("zone_utilization.csv", data2));
  container.querySelector("#csv3").addEventListener("click", () => exportCSV("order_fulfillment.csv", data3));
  container.querySelector("#csv4").addEventListener("click", () => exportCSV("donor_contribution.csv", data4));
}

export function destroy() {}
