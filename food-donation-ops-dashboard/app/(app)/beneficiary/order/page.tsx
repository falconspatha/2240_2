import PageHeader from "../../../../components/PageHeader";
import { createBeneficiaryOrder } from "./actions";

export default function BeneficiaryOrderPage({
  searchParams,
}: {
  searchParams?: { beneficiaryId?: string };
}) {
  const beneficiaryId = searchParams?.beneficiaryId || "";
  const canSubmit = Boolean(beneficiaryId);
  const orderDate = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader title="Beneficiary Order" />
      <div className="card p-6">
        <p className="mb-4 text-sm text-slate-600">Place a food request using your auto-generated beneficiary ID.</p>
        {canSubmit ? (
          <p className="mb-4 text-xs text-slate-500">Using Beneficiary ID: {beneficiaryId}</p>
        ) : (
          <p className="mb-4 text-xs text-amber-700">Register first to auto-generate your Beneficiary ID.</p>
        )}
        <form className="grid gap-3 md:grid-cols-2" action={createBeneficiaryOrder}>
          <input type="hidden" name="beneficiaryId" value={beneficiaryId} />
          <input type="hidden" name="orderDate" value={orderDate} />
          <input type="hidden" name="status" value="Pending" />
          <select name="priority" className="input" defaultValue="2">
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
          <input name="requiredDeliveryDate" type="date" className="input" />
          <input name="notes" className="input md:col-span-2" placeholder="Items needed / delivery notes" />
          <button className="btn btn-primary md:col-span-2" disabled={!canSubmit}>
            Create Order
          </button>
        </form>
      </div>
    </div>
  );
}
