import { addOrderLine, createOrder } from "../services/api/orders.js";
import { listProducts } from "../services/api/products.js";
import { showToast } from "../ui/components.js";
import { formDataToObject, parseNumber } from "../ui/forms.js";

const SELF_BENEFICIARY_KEY = "fdms_self_beneficiary_id";
const today = () => new Date().toISOString().slice(0, 10);

export async function render(container) {
  const beneficiaryId = localStorage.getItem(SELF_BENEFICIARY_KEY);
  let products = [];
  try {
    const res = await listProducts({ page: 1, size: 300, sort: "ProductName", sortDir: "asc" });
    products = res.rows || [];
  } catch (error) {
    showToast(error.message, "error");
  }

  container.innerHTML = `
    <section class="card">
      <div class="toolbar">
        <h3>Beneficiary Order</h3>
      </div>
      <p class="muted">Create a food request order for your own beneficiary account only.</p>
      ${
        beneficiaryId
          ? `<p class="badge ok" style="margin-top:.8rem">Using Beneficiary ID: ${beneficiaryId}</p>`
          : `<p class="badge warn" style="margin-top:.8rem">Please complete Beneficiary Register before placing orders.</p>`
      }
      <form id="beneficiaryOrderForm" class="form-grid" style="margin-top:1rem">
        <input type="hidden" name="BeneficiaryID" value="${beneficiaryId || ""}">
        <input type="hidden" name="OrderDate" value="${today()}">
        <input type="hidden" name="Status" value="Pending">
        <input type="hidden" name="Priority" value="1">
        <label>Required Delivery Date<input name="RequiredDeliveryDate" type="date"></label>
        <label>Food Product
          <select name="ProductID" required>
            <option value="" selected disabled hidden>-- Select Food --</option>
            ${products.map((p) => `<option value="${p.ProductID}">${p.ProductName}</option>`).join("")}
          </select>
        </label>
        <label>Qty Units<input name="QtyUnits" type="number" min="1" step="1" required></label>
        <label style="grid-column:1/-1">Order Line Notes<input name="LineNotes" placeholder="Optional notes for selected food"></label>
        <label style="grid-column:1/-1">Notes<input name="Notes" placeholder="Preferred delivery window or constraints"></label>
        <div style="grid-column:1/-1;display:flex;justify-content:flex-end">
          <button class="btn btn-primary">Create Order</button>
        </div>
      </form>
    </section>
  `;

  container.querySelector("#beneficiaryOrderForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!beneficiaryId) {
      showToast("Beneficiary ID is auto-generated after registration. Please register first.", "error");
      return;
    }
    const payload = formDataToObject(form);
    const beneficiaryIdValue = parseNumber(payload.BeneficiaryID);
    const productId = parseNumber(payload.ProductID);
    const qtyUnits = parseNumber(payload.QtyUnits);
    if (!beneficiaryIdValue) {
      showToast("Beneficiary ID is required.", "error");
      return;
    }
    if (!productId || !qtyUnits) {
      showToast("Product and quantity are required.", "error");
      return;
    }

    try {
      const created = await createOrder({
        BeneficiaryID: beneficiaryIdValue,
        OrderDate: payload.OrderDate || today(),
        RequiredDeliveryDate: payload.RequiredDeliveryDate || null,
        Status: payload.Status || "Pending",
        Priority: 1,
        Notes: payload.Notes || null,
      });
      await addOrderLine(created.OrderID, {
        ProductID: productId,
        QtyUnits: qtyUnits,
        Notes: payload.LineNotes || null,
      });
      showToast(`Order #${created.OrderID} created.`);
      form.reset();
      container.querySelector("[name='BeneficiaryID']").value = beneficiaryId;
      container.querySelector("[name='OrderDate']").value = today();
      container.querySelector("[name='Status']").value = "Pending";
      container.querySelector("[name='Priority']").value = "1";
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}

export function destroy() {}
