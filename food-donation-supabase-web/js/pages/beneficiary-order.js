import { createOrder } from "../services/api/orders.js";
import { showToast } from "../ui/components.js";
import { formDataToObject, parseNumber } from "../ui/forms.js";

const SELF_BENEFICIARY_KEY = "fdms_self_beneficiary_id";

export async function render(container) {
  const beneficiaryId = localStorage.getItem(SELF_BENEFICIARY_KEY);

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
        <label>Beneficiary ID<input name="BeneficiaryID" value="${beneficiaryId || ""}" ${beneficiaryId ? "readonly" : "required"}></label>
        <label>Priority
          <select name="Priority">
            <option value="Low">Low</option>
            <option value="Normal" selected>Normal</option>
            <option value="High">High</option>
          </select>
        </label>
        <label>Status<input name="Status" value="Pending"></label>
        <label style="grid-column:1/-1">Notes<input name="Notes" placeholder="Preferred delivery window or constraints"></label>
        <div style="grid-column:1/-1;display:flex;justify-content:flex-end">
          <button class="btn btn-primary">Create Order</button>
        </div>
      </form>
    </section>
  `;

  container.querySelector("#beneficiaryOrderForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = formDataToObject(event.currentTarget);
    const beneficiaryIdValue = parseNumber(payload.BeneficiaryID);
    if (!beneficiaryIdValue) {
      showToast("Beneficiary ID is required.", "error");
      return;
    }

    try {
      const created = await createOrder({
        BeneficiaryID: beneficiaryIdValue,
        Priority: payload.Priority || "Normal",
        Status: payload.Status || "Pending",
        Notes: payload.Notes || null,
      });
      showToast(`Order #${created.OrderID} created.`);
      event.currentTarget.reset();
      if (beneficiaryId) {
        container.querySelector("[name='BeneficiaryID']").value = beneficiaryId;
      }
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}

export function destroy() {}
