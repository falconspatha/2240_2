import * as zonesPage from "./zones.js";
import * as inventoryPage from "./inventory.js";

let childDestroy = null;

function parseTab(hash) {
  const q = hash.split("?")[1] || "";
  const params = new URLSearchParams(q);
  return params.get("tab") === "inventory" ? "inventory" : "zones";
}

function setHashTab(currentHash, tab) {
  const raw = currentHash.replace(/^#\/?/, "");
  const [pathOnly, qs = ""] = raw.split("?");
  const params = new URLSearchParams(qs);
  params.set("tab", tab);
  const path = pathOnly.split("?")[0] || "zones-inventory";
  return `#/${path}?${params}`;
}

export async function render(container, ctx = {}) {
  const hash = ctx.hash || location.hash;
  const tab = parseTab(hash);

  container.innerHTML = `
    <div class="toolbar" style="flex-wrap:wrap;margin-bottom:.35rem">
      <div role="tablist" aria-label="Zones and inventory" style="display:flex;gap:.35rem;flex-wrap:wrap">
        <button type="button" role="tab" aria-selected="${tab === "zones"}" class="btn ${tab === "zones" ? "btn-primary" : "btn-ghost"}" data-tab="zones">Zones</button>
        <button type="button" role="tab" aria-selected="${tab === "inventory"}" class="btn ${tab === "inventory" ? "btn-primary" : "btn-ghost"}" data-tab="inventory">Inventory</button>
      </div>
    </div>
    <div id="zonesInventoryMount"></div>
  `;

  const mount = container.querySelector("#zonesInventoryMount");

  container.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.tab === tab) return;
      location.hash = setHashTab(location.hash, btn.dataset.tab);
    });
  });

  if (childDestroy) childDestroy();
  childDestroy = null;

  const childCtx = { ...ctx, hash };

  if (tab === "zones") {
    await zonesPage.render(mount, childCtx);
    childDestroy = zonesPage.destroy;
  } else {
    await inventoryPage.render(mount, childCtx);
    childDestroy = inventoryPage.destroy;
  }
}

export function destroy() {
  if (childDestroy) childDestroy();
  childDestroy = null;
}
