import { createDonor } from "../services/api/donors.js";
import { formDataToObject, required } from "../ui/forms.js";
import { showToast } from "../ui/components.js";

const DONOR_TYPES = ["Individual", "Company", "NGO", "Community Group"];
const DISTRICTS = ["Hong Kong Island", "Kowloon", "New Territories"];
const SELF_DONOR_KEY = "fdms_self_donor_id";

export async function render(container) {
  const donorId = localStorage.getItem(SELF_DONOR_KEY);

  container.innerHTML = `
    <section class="card">
      <div class="toolbar">
        <h3>Donor Register</h3>
      </div>
      <p class="muted">Create your donor profile before submitting donation lots.</p>
      ${donorId ? `<p class="badge ok" style="margin-top:.8rem">Linked Donor ID: ${donorId}</p>` : ""}
      <form id="donorSelfForm" class="form-grid" style="margin-top:1rem;grid-template-columns:1fr 1fr">
        <label>Donor Name<input name="DonorName" required></label>
        <label>Donor Type
          <select name="DonorType" required>
            <option value="" selected disabled hidden>-- Select --</option>
            ${DONOR_TYPES.map((type) => `<option value="${type}">${type}</option>`).join("")}
          </select>
        </label>
        <label>District
          <select name="District" required>
            <option value="" selected disabled hidden>-- Select --</option>
            ${DISTRICTS.map((district) => `<option value="${district}">${district}</option>`).join("")}
          </select>
        </label>
        <label>Phone<input name="Phone"></label>
        <label>Email<input name="Email" type="email"></label>
        <label style="grid-column:1/-1">Address<input name="Address"></label>
        <div style="grid-column:1/-1;display:flex;justify-content:flex-end">
          <button class="btn btn-primary">Submit Registration</button>
        </div>
      </form>
    </section>
  `;

  container.querySelector("#donorSelfForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = formDataToObject(event.currentTarget);
    if (!required(payload.DonorName)) return showToast("Donor name is required.", "error");

    try {
      const row = await createDonor(payload);
      localStorage.setItem(SELF_DONOR_KEY, String(row.DonorID));
      showToast(`Donor registered. Your Donor ID is ${row.DonorID}.`);
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}

export function destroy() {}
