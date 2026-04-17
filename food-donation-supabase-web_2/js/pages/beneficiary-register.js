import { createBeneficiary } from "../services/api/beneficiaries.js";
import { formDataToObject, required } from "../ui/forms.js";
import { showToast } from "../ui/components.js";

const DISTRICTS = ["Hong Kong Island", "Kowloon", "New Territories"];

const SELF_BENEFICIARY_KEY = "fdms_self_beneficiary_id";

export async function render(container) {
  const beneficiaryId = localStorage.getItem(SELF_BENEFICIARY_KEY);

  container.innerHTML = `
    <section class="card">
      <div class="toolbar">
        <h3>Beneficiary Register</h3>
      </div>
      <p class="muted">Register your own organization profile. You can only submit your own details.</p>
      ${beneficiaryId ? `<p class="badge ok" style="margin-top:.8rem">Linked Beneficiary ID: ${beneficiaryId}</p>` : ""}
      <form id="beneficiarySelfForm" class="form-grid" style="margin-top:1rem;grid-template-columns:1fr 1fr">
        <label>Beneficiary Name<input name="BeneficiaryName" required></label>
        <label>Contact Name<input name="ContactName"></label>
        <label>Phone<input name="Phone"></label>
        <label>District
          <select name="District" required>
            <option value="" selected disabled hidden>-- Select --</option>
            ${DISTRICTS.map((district) => `<option value="${district}">${district}</option>`).join("")}
          </select>
        </label>
        <label style="grid-column:1/-1">Address<input name="Address"></label>
        <label>Latitude<input name="Latitude"></label>
        <label>Longitude<input name="Longitude"></label>
        <label>Has Cold Storage
          <select name="HasColdStorage" required>
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </label>
        <div style="grid-column:1/-1;display:flex;justify-content:flex-end">
          <button class="btn btn-primary">Submit Registration</button>
        </div>
      </form>
    </section>
  `;

  container.querySelector("#beneficiarySelfForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = formDataToObject(event.currentTarget);
    if (!required(payload.BeneficiaryName)) return showToast("Beneficiary name is required.", "error");
    payload.HasColdStorage = payload.HasColdStorage === "true";

    try {
      const row = await createBeneficiary(payload);
      localStorage.setItem(SELF_BENEFICIARY_KEY, String(row.BeneficiaryID));
      showToast(`Registration submitted. Your Beneficiary ID is ${row.BeneficiaryID}.`);
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}

export function destroy() {}
