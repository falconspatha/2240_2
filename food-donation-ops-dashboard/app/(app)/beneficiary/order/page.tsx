import PageHeader from "../../../../components/PageHeader";
import { createBeneficiaryOrder } from "./actions";

export default function BeneficiaryOrderPage({
  searchParams,
}: {
  searchParams?: { beneficiaryId?: string };
}) {
  const beneficiaryId = searchParams?.beneficiaryId || "";
  const canSubmit = Boolean(beneficiaryId);

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
          <select name="priority" className="input">
            <option value="Low">Low</option>
            <option value="Normal">Normal</option>
            <option value="High">High</option>
          </select>
          <input name="notes" className="input md:col-span-2" placeholder="Items needed / delivery notes" />
          <button className="btn btn-primary md:col-span-2" disabled={!canSubmit}>
            Create Order
          </button>
        </form>
      </div>
    </div>
  );
}
