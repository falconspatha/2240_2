import PageHeader from "../../../../components/PageHeader";
import { createBeneficiaryOrder } from "./actions";

export default function BeneficiaryOrderPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Beneficiary Order" />
      <div className="card p-6">
        <p className="mb-4 text-sm text-slate-600">
          Place a food request by submitting your beneficiary ID and demand details.
        </p>
        <form className="grid gap-3 md:grid-cols-2" action={createBeneficiaryOrder}>
          <input name="beneficiaryId" type="number" className="input" placeholder="Beneficiary ID" min={1} required />
          <select name="priority" className="input">
            <option value="Low">Low</option>
            <option value="Normal">Normal</option>
            <option value="High">High</option>
          </select>
          <input name="notes" className="input md:col-span-2" placeholder="Items needed / delivery notes" />
          <button className="btn btn-primary md:col-span-2">Create Order</button>
        </form>
      </div>
    </div>
  );
}
