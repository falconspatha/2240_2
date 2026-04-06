import { listProducts } from "../services/api/products.js";
import { receiveLot } from "../services/api/lots.js";
import { formDataToObject, parseNumber, required, validateLotDates } from "../ui/forms.js";
import { showToast } from "../ui/components.js";

const SELF_DONOR_KEY = "fdms_self_donor_id";
const today = () => new Date().toISOString().slice(0, 10);
const TEMP_OPTIONS = ["Ambient", "Chilled", "Frozen"];

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
        <input type="hidden" name="DonorID" value="${donorId || ""}">
        <label>Product
          <select name="ProductID" required>
            <option value="" selected disabled hidden>-- Select --</option>
            ${products.map((product) => `<option value="${product.ProductID}">${product.ProductName}</option>`).join("")}
          </select>
        </label>
        <label>Quantity Units<input name="QuantityUnits" type="number" min="1" step="1" required></label>
        <label>Unit Weight kg<input name="UnitWeightKg" type="number" min="0.01" step="0.01" required></label>
        <input type="hidden" name="ReceivedDate" value="${today()}">
        <input type="hidden" name="Status" value="Received">
        <label>Expiry Date<input name="ExpiryDate" type="date" required></label>
        <label>Temp Requirement
          <select name="TempRequirement" required>
            <option value="" selected disabled hidden>-- Select --</option>
            ${TEMP_OPTIONS.map((temp) => `<option value="${temp}">${temp}</option>`).join("")}
          </select>
        </label>
        <label style="grid-column:1/-1">Notes<input name="Notes"></label>
        <div style="grid-column:1/-1;display:flex;justify-content:flex-end">
          <button class="btn btn-primary">Submit Donation Lot</button>
        </div>
      </form>
    </section>
  `;

  container.querySelector("#donorDonationForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!donorId) {
      showToast("Donor ID is auto-generated after registration. Please register first.", "error");
      return;
    }
    const payload = formDataToObject(form);
    if (!required(payload.DonorID) || !required(payload.ProductID)) {
      showToast("Donor ID and Product are required.", "error");
      return;
    }
    if (!validateLotDates(today(), payload.ExpiryDate)) {
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
      form.reset();
      container.querySelector("[name='DonorID']").value = donorId;
      container.querySelector("[name='ReceivedDate']").value = today();
      container.querySelector("[name='Status']").value = "Received";
    } catch (error) {
      showToast(error.message, "error");
    }
  });

  container.querySelector("[name='ProductID']")?.addEventListener("change", (event) => {
    const product = products.find((p) => String(p.ProductID) === event.target.value);
    if (!product?.TempRequirement) return;
    const tempSelect = container.querySelector("[name='TempRequirement']");
    const hasOption = [...tempSelect.options].some((opt) => opt.value === product.TempRequirement);
    if (hasOption) tempSelect.value = product.TempRequirement;
  });
}

export function destroy() {}
