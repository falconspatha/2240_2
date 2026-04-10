export async function render(container, { hash } = {}) {
  const queryString = (hash || location.hash).split("?")[1] || "";
  const params = new URLSearchParams(queryString);
  const orderId = params.get("orderId");

  container.innerHTML = `
    <section class="card">
      <div class="toolbar">
        <h3>Order Submitted</h3>
      </div>
      <p>Thank you. Your Beneficiary Order submission has been received.</p>
      ${
        orderId
          ? `<p class="badge ok" style="margin-top:.8rem">Reference Order ID: ${orderId}</p>`
          : ""
      }
      <p class="muted" style="margin-top:1rem">
        Our customer services team will contact you by phone and WhatsApp to follow up on your request.
      </p>
      <div style="margin-top:1rem;display:flex;justify-content:flex-end;gap:.5rem;flex-wrap:wrap">
        <button id="createAnotherOrderBtn" class="btn btn-primary" type="button">Create Another Order</button>
      </div>
    </section>
  `;

  container.querySelector("#createAnotherOrderBtn")?.addEventListener("click", () => {
    location.hash = "#/beneficiary-order";
  });
}

export function destroy() {}
