import { supabase } from "../services/supabaseClient.js";
import { showToast } from "../ui/components.js";

function countUp(el, to) {
  const start = 0;
  const duration = 450;
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / duration);
    el.textContent = Math.floor(start + (to - start) * p).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export async function render(container) {
  container.innerHTML = `
    <div class="page-grid">
      <section class="kpi-grid" id="kpi"></section>
      <section class="split">
        <article class="card"><h3>Near-expiry lots (7 days)</h3><div id="expiryChart" class="muted">Loading...</div></article>
        <article class="card"><h3>Zone utilization</h3><div id="zoneChart" class="muted">Loading...</div></article>
      </section>
    </div>
  `;

  try {
    const [donorsRes, lotsRes, invRes, ordersRes, picksRes, zonesRes] = await Promise.all([
      supabase.from("tblDonor").select("DonorID", { count: "exact", head: true }),
      supabase.from("tblDonationLot").select("LotID, ExpiryDate, Status"),
      supabase.from("tblInventory").select("ZoneID, OnHandKg"),
      supabase.from("tblOrders").select("OrderID, Status"),
      supabase.from("tblPickAllocation").select("AllocationID, Picked"),
      supabase.from("tblStorageZone").select("ZoneID, ZoneName, CapacityKg"),
    ]);

    const kpis = [
      ["Total donors", donorsRes.count || 0],
      ["Active lots", (lotsRes.data || []).filter((l) => l.Status !== "Completed").length],
      ["On-hand kg", Math.round((invRes.data || []).reduce((s, i) => s + Number(i.OnHandKg || 0), 0))],
      ["Open orders", (ordersRes.data || []).filter((o) => !["Completed", "Cancelled"].includes(o.Status)).length],
      ["Pending picks", (picksRes.data || []).filter((p) => !p.Picked).length],
    ];
    document.getElementById("kpi").innerHTML = kpis
      .map(([label]) => `<article class="card card-animate"><p class="muted">${label}</p><h2 data-kpi>0</h2></article>`)
      .join("");
    [...document.querySelectorAll("[data-kpi]")].forEach((el, idx) => countUp(el, kpis[idx][1]));

    const expiryBuckets = new Map();
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
      expiryBuckets.set(day, 0);
    }
    (lotsRes.data || []).forEach((lot) => {
      if (expiryBuckets.has(lot.ExpiryDate)) expiryBuckets.set(lot.ExpiryDate, expiryBuckets.get(lot.ExpiryDate) + 1);
    });
    document.getElementById("expiryChart").innerHTML = [...expiryBuckets.entries()]
      .map(([d, c]) => `<div style="display:flex;gap:.4rem;align-items:center;margin:.25rem 0"><small>${d.slice(5)}</small><div class="progress" style="flex:1"><span style="width:${Math.min(100, c * 20)}%"></span></div><small>${c}</small></div>`)
      .join("");

    const zoneUsage = (zonesRes.data || []).map((z) => ({
      ...z,
      used: (invRes.data || [])
        .filter((i) => i.ZoneID === z.ZoneID)
        .reduce((s, i) => s + Number(i.OnHandKg || 0), 0),
    }));
    document.getElementById("zoneChart").innerHTML = zoneUsage
      .map((z) => {
        const pct = z.CapacityKg ? (z.used / z.CapacityKg) * 100 : 0;
        return `<div style="margin:.35rem 0"><small>${z.ZoneName}</small><div class="progress"><span style="width:${Math.min(100, pct)}%"></span></div><small>${pct.toFixed(1)}%</small></div>`;
      })
      .join("");
  } catch (error) {
    showToast(error.message, "error");
  }
}

export function destroy() {}
