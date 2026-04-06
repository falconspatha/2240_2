import { showToast, confirmModal } from "../ui/components.js";
import { supabase } from "../services/supabaseClient.js";
import { store } from "../store.js";

// ── SQL history (localStorage) ──────────────────────────────────────────────
const SQL_HISTORY_KEY = "fdms_sql_history";
const MAX_HISTORY = 5;

function loadSqlHistory() {
  try { return JSON.parse(localStorage.getItem(SQL_HISTORY_KEY) || "[]"); }
  catch { return []; }
}

function saveSqlHistory(history) {
  localStorage.setItem(SQL_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

function pushSqlHistory(sql) {
  const history = loadSqlHistory().filter((h) => h.sql !== sql);
  history.unshift({ sql, ts: new Date().toISOString() });
  saveSqlHistory(history);
}

// ── DDL guard ────────────────────────────────────────────────────────────────
const DDL_RULES = [
  /^ALTER\s+TABLE\s+[A-Za-z_][A-Za-z0-9_]*\s+/i,
  /^CREATE\s+TABLE\s+[A-Za-z_][A-Za-z0-9_]*\s+/i,
  /^DROP\s+TABLE\s+[A-Za-z_][A-Za-z0-9_]*\s*;?$/i,
];

function isAllowedDDL(sql) {
  return DDL_RULES.some((r) => r.test(sql));
}

// ── Module card definitions ──────────────────────────────────────────────────
const MODULES = [
  { title: "Donor Management",  desc: "Register and maintain donor profiles.",                  route: "donors",         icon: "🤝", countKey: "donors" },
  { title: "Product Catalog",   desc: "Maintain product definitions and handling requirements.", route: "products",       icon: "📦", countKey: "products" },
  { title: "Donation Lots",     desc: "Receive lots and place them into storage zones.",         route: "lots",           icon: "🚚", countKey: "lots" },
  { title: "Storage Zones",     desc: "Update zone capacities and temperature bands.",         route: "storage",        icon: "🏭", countKey: "zones" },
  { title: "Inventory",         desc: "Run stock adjustments and inspect availability.",         route: "storage",        icon: "📋", countKey: null },
  { title: "Beneficiaries",     desc: "Maintain beneficiary records and contacts.",              route: "beneficiaries",  icon: "👥", countKey: "beneficiaries" },
  { title: "Orders",            desc: "Create demand orders and line items.",                    route: "orders-picking", icon: "🛒", countKey: "orders" },
  { title: "Picking",           desc: "Allocate and track fulfillment picks.",                   route: "orders-picking", icon: "✅", countKey: null },
  { title: "Reports",           desc: "Review KPI reports and export operational snapshots.",    route: "reports",        icon: "📊", countKey: null },
];

// ── Fetch all summary data in one pass ───────────────────────────────────────
async function fetchSummary() {
  const [donorsR, productsR, lotsR, zonesR, invR, beneR, ordersR] = await Promise.all([
    supabase.from("tblDonor").select("DonorID", { count: "exact", head: true }),
    supabase.from("tblProduct").select("ProductID", { count: "exact", head: true }),
    supabase.from("tblDonationLot").select("LotID, ExpiryDate, Status"),
    supabase.from("tblStorageZone").select("ZoneID, ZoneName, CapacityKg"),
    supabase.from("tblInventory").select("ZoneID, OnHandKg"),
    supabase.from("tblBeneficiary").select("BeneficiaryID", { count: "exact", head: true }),
    supabase.from("tblOrders").select("OrderID, Status"),
  ]);

  const lots = lotsR.data || [];
  const inv  = invR.data  || [];
  const zones = zonesR.data || [];
  const orders = ordersR.data || [];

  const today = new Date().toISOString().slice(0, 10);
  const in7   = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const nearExpiry = lots.filter((l) => l.ExpiryDate >= today && l.ExpiryDate <= in7 && ["Received","Stored"].includes(l.Status)).length;
  const openOrders = orders.filter((o) => o.Status === "Pending").length;

  const overCapZones = zones.filter((z) => {
    const used = inv.filter((i) => String(i.ZoneID) === String(z.ZoneID)).reduce((s, i) => s + Number(i.OnHandKg || 0), 0);
    return z.CapacityKg && (used / z.CapacityKg) >= 0.9;
  });

  return {
    counts: {
      donors:        donorsR.count  || 0,
      products:      productsR.count || 0,
      lots:          lots.filter((l) => l.Status !== "Completed").length,
      zones:         zones.length,
      beneficiaries: beneR.count || 0,
      orders:        orders.length,
    },
    alerts: { nearExpiry, openOrders, overCapZones },
  };
}

// ── Render alerts bar ────────────────────────────────────────────────────────
function renderAlerts({ nearExpiry, openOrders, overCapZones }) {
  const items = [];

  // always shown, clickable
  const lotClass = nearExpiry > 0 ? "warn" : "ok";
  items.push(`<button class="badge ${lotClass}" id="alertLots" style="cursor:pointer;border:none;font:inherit">⚠️ ${nearExpiry} lot${nearExpiry !== 1 ? "s" : ""} expiring within 7 days</button>`);

  const orderClass = openOrders > 0 ? "warn" : "ok";
  items.push(`<button class="badge ${orderClass}" id="alertOrders" style="cursor:pointer;border:none;font:inherit">📋 ${openOrders} order${openOrders !== 1 ? "s" : ""} pending</button>`);

  if (overCapZones.length > 0)
    items.push(`<span class="badge warn">🏭 ${overCapZones.map((z) => z.ZoneName).join(", ")} at ≥90% capacity</span>`);

  if (nearExpiry === 0 && openOrders === 0 && overCapZones.length === 0)
    items.push(`<span class="badge ok">✅ All systems normal</span>`);

  return `<div style="display:flex;flex-wrap:wrap;gap:.5rem;align-items:center">${items.join("")}</div>`;
}

// ── Render module cards ──────────────────────────────────────────────────────
function renderModuleCards(counts) {
  return MODULES.map((mod) => {
    const count = mod.countKey != null ? counts[mod.countKey] : null;
    const countBadge = count != null
      ? `<span class="badge" style="margin-left:auto">${count}</span>`
      : "";
    return `
      <article class="card" style="padding:1rem;display:flex;flex-direction:column;gap:.5rem">
        <div style="display:flex;align-items:center;gap:.5rem">
          <span style="font-size:1.3rem">${mod.icon}</span>
          <strong>${mod.title}</strong>
          ${countBadge}
        </div>
        <p class="muted" style="font-size:.85rem;flex:1">${mod.desc}</p>
        <div>
          <button class="btn btn-ghost" data-route="${mod.route}">Open →</button>
        </div>
      </article>`;
  }).join("");
}

// ── Render SQL history list ──────────────────────────────────────────────────
function renderHistory(container) {
  const history = loadSqlHistory();
  const list = container.querySelector("#sqlHistory");
  if (!list) return;
  if (!history.length) {
    list.innerHTML = `<p class="muted" style="font-size:.82rem">No history yet.</p>`;
    return;
  }
  list.innerHTML = history.map((h, i) => `
    <div style="display:flex;align-items:flex-start;gap:.5rem;padding:.4rem 0;border-bottom:1px solid var(--border)">
      <code style="flex:1;font-size:.78rem;white-space:pre-wrap;word-break:break-all">${h.sql}</code>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.25rem;flex-shrink:0">
        <small class="muted">${new Date(h.ts).toLocaleTimeString()}</small>
        <button class="btn btn-ghost" style="font-size:.75rem;padding:.2rem .5rem" data-recall="${i}">Use</button>
      </div>
    </div>`).join("");

  list.querySelectorAll("[data-recall]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sql = history[Number(btn.dataset.recall)]?.sql;
      if (sql) container.querySelector("#ddlInput").value = sql;
    });
  });
}

// ── Main render ──────────────────────────────────────────────────────────────
export async function render(container) {
  container.innerHTML = `
    <div class="page-grid">

      <!-- Alerts -->
      <section class="card" id="alertsCard">
        <div class="toolbar" style="margin-bottom:.5rem">
          <h3>System Status</h3>
          <button class="btn btn-ghost" id="refreshAlerts" style="font-size:.82rem">↻ Refresh</button>
        </div>
        <div id="alertsBar"><span class="muted">Loading...</span></div>
      </section>

      <!-- Quick Actions -->
      <section class="card">
        <div class="toolbar"><h3>Quick Actions</h3></div>
        <div style="display:flex;flex-wrap:wrap;gap:.5rem">
          <button class="btn btn-primary" data-route="donors"   data-create="donor">+ New Donor</button>
          <button class="btn btn-primary" data-route="orders"   data-create="order">+ New Order</button>
          <button class="btn btn-primary" data-route="lots"     data-create="lot">+ Receive Lot</button>
          <button class="btn btn-ghost"   data-route="reports">View Reports</button>
          <button class="btn btn-ghost"   data-route="orders-picking">Go to Picking</button>
        </div>
      </section>

      <!-- Module Cards -->
      <section class="card">
        <div class="toolbar"><h3>Modules</h3></div>
        <div class="form-grid" id="moduleCards">
          <div class="muted">Loading...</div>
        </div>
      </section>

      <!-- SQL Console -->
      <section class="card">
        <div class="toolbar">
          <h3>SQL Console <small class="muted" style="font-weight:400;font-size:.8rem">(DDL only)</small></h3>
        </div>
        <p class="muted" style="font-size:.85rem;margin-bottom:.75rem">
          Accepts <code>CREATE / ALTER / DROP TABLE</code> only. Requires <code>fn_admin_run_sql</code> RPC on Supabase.
        </p>
        <div style="display:grid;grid-template-columns:1fr 220px;gap:1rem;align-items:start">
          <div style="display:grid;gap:.5rem">
            <textarea id="ddlInput" rows="5" placeholder="ALTER TABLE tblDonor ADD COLUMN Email TEXT;" style="width:100%;font-family:monospace;font-size:.85rem"></textarea>
            <div style="display:flex;justify-content:flex-end;gap:.5rem">
              <button class="btn btn-ghost" id="clearSql">Clear</button>
              <button class="btn btn-primary" id="runSql">Run SQL</button>
            </div>
            <div id="sqlResult" style="display:none;padding:.6rem;border-radius:8px;font-size:.83rem;font-family:monospace"></div>
          </div>
          <div>
            <p style="font-size:.8rem;font-weight:600;margin-bottom:.4rem">Recent History</p>
            <div id="sqlHistory"></div>
          </div>
        </div>
      </section>

    </div>
  `;

  // ── Load data ──────────────────────────────────────────────────────────────
  async function loadData() {
    try {
      const { counts, alerts } = await fetchSummary();
      container.querySelector("#alertsBar").innerHTML = renderAlerts(alerts);
      bindAlertButtons();
      container.querySelector("#moduleCards").innerHTML = renderModuleCards(counts);
      bindModuleRoutes();
    } catch (err) {
      container.querySelector("#alertsBar").innerHTML = `<span class="badge warn">Failed to load status: ${err.message}</span>`;
      container.querySelector("#moduleCards").innerHTML = renderModuleCards({});
      bindModuleRoutes();
    }
  }

  function bindAlertButtons() {
    container.querySelector("#alertLots")?.addEventListener("click", () => {
      store.contextLotsFilter = { expiryFilter: "active", sort: "ExpiryDate", sortDir: "asc" };
      location.hash = "#/lots";
    });
    container.querySelector("#alertOrders")?.addEventListener("click", () => {
      store.contextOrdersFilter = { status: "Pending" };
      location.hash = "#/orders-picking";
    });
  }

  function bindModuleRoutes() {
    container.querySelectorAll("[data-route]").forEach((btn) => {
      btn.addEventListener("click", () => {
        location.hash = `#/${btn.dataset.route}`;
        if (btn.dataset.create) {
          requestAnimationFrame(() =>
            window.dispatchEvent(new CustomEvent("quick-create", { detail: btn.dataset.create }))
          );
        }
      });
    });
  }

  await loadData();

  container.querySelector("#refreshAlerts").addEventListener("click", loadData);

  // ── SQL console ────────────────────────────────────────────────────────────
  renderHistory(container);

  const resultEl = container.querySelector("#sqlResult");

  function showSqlResult(msg, ok) {
    resultEl.style.display = "block";
    resultEl.style.background = ok
      ? "color-mix(in oklab, var(--primary), transparent 88%)"
      : "color-mix(in oklab, var(--danger), transparent 88%)";
    resultEl.textContent = msg;
  }

  container.querySelector("#clearSql").addEventListener("click", () => {
    container.querySelector("#ddlInput").value = "";
    resultEl.style.display = "none";
  });

  container.querySelector("#runSql").addEventListener("click", () => {
    const sql = container.querySelector("#ddlInput").value.trim();
    if (!sql) return showToast("SQL is required.", "error");
    if (!isAllowedDDL(sql)) {
      showSqlResult("Only CREATE / ALTER / DROP TABLE statements are allowed.", false);
      return;
    }
    confirmModal({
      title: "Execute DDL Statement",
      message: `This will modify the database schema. Are you sure?<br><br><code style="font-size:.82rem">${sql}</code>`,
      onConfirm: async () => {
        try {
          const { error } = await supabase.rpc("fn_admin_run_sql", { p_sql: sql });
          if (error) throw error;
          pushSqlHistory(sql);
          renderHistory(container);
          showSqlResult("✓ Statement executed successfully.", true);
          showToast("Schema statement executed.");
          container.querySelector("#ddlInput").value = "";
        } catch (err) {
          showSqlResult(`✗ ${err.message}`, false);
          showToast(`SQL failed: ${err.message}`, "error");
        }
      },
    });
  });
}

export function destroy() {}
