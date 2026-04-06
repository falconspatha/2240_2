import { listProducts } from "../services/api/products.js";
import { receiveLot } from "../services/api/lots.js";
import { formDataToObject, parseNumber, required, validateLotDates } from "../ui/forms.js";
import { showToast } from "../ui/components.js";

const SELF_DONOR_KEY = "fdms_self_donor_id";

export async function render(container) {
  let products = [];
  try {
    const res = await listProducts({ page: 1, size: 300 });
    products = res.rows || [];
  } catch (error) {
    showToast(error.message, "error");
  }

  const donorId = localStorage.getItem(SELF_DONOR_KEY);

  container.innerHTML = `
    <section class="card">
      <div class="toolbar">
        <h3>Make Donation</h3>
      </div>
      <p class="muted">Create a new donation lot entry (donorLot) for your donor account.</p>
      ${
        donorId
          ? `<p class="badge ok" style="margin-top:.8rem">Using Donor ID: ${donorId}</p>`
          : `<p class="badge warn" style="margin-top:.8rem">Please complete Donor Register before making donations.</p>`
      }
      <form id="donorDonationForm" class="form-grid" style="margin-top:1rem">
        <label>Donor ID<input name="DonorID" value="${donorId || ""}" ${donorId ? "readonly" : "required"}></label>
        <label>Product
          <select name="ProductID" required>
            <option value="" selected disabled hidden>-- Select --</option>
            ${products.map((product) => `<option value="${product.ProductID}">${product.ProductName}</option>`).join("")}
          </select>
        </label>
        <label>Quantity Units<input name="QuantityUnits" type="number" min="1" step="1" required></label>
        <label>Unit Weight kg<input name="UnitWeightKg" type="number" min="0.01" step="0.01" required></label>
        <label>Received Date<input name="ReceivedDate" type="date" required></label>
        <label>Expiry Date<input name="ExpiryDate" type="date" required></label>
        <label>Temp Requirement<input name="TempRequirement" placeholder="Ambient / Chilled / Frozen"></label>
        <label>Status<input name="Status" value="Received"></label>
        <label style="grid-column:1/-1">Notes<input name="Notes"></label>
        <div style="grid-column:1/-1;display:flex;justify-content:flex-end">
          <button class="btn btn-primary">Submit Donation Lot</button>
        </div>
      </form>
    </section>
  `;

  container.querySelector("#donorDonationForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = formDataToObject(event.currentTarget);
    if (!required(payload.DonorID) || !required(payload.ProductID)) {
      showToast("Donor ID and Product are required.", "error");
      return;
    }
    if (!validateLotDates(payload.ReceivedDate, payload.ExpiryDate)) {
      showToast("Expiry date must be after received date.", "error");
      return;
    }

    try {
      await receiveLot({
        ...payload,
        DonorID: parseNumber(payload.DonorID),
        ProductID: parseNumber(payload.ProductID),
        QuantityUnits: parseNumber(payload.QuantityUnits),
        UnitWeightKg: parseNumber(payload.UnitWeightKg),
      });
      showToast("Donation lot saved.");
      event.currentTarget.reset();
      if (donorId) {
        container.querySelector("[name='DonorID']").value = donorId;
      }
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}

export function destroy() {}
