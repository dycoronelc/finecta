const map: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  active: "bg-sky-50 text-sky-800 ring-sky-200",
  completed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  signed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  paid: "bg-emerald-50 text-emerald-800 ring-emerald-800/20",
  received: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  closed: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  draft: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  pending: "bg-amber-50 text-amber-900 ring-amber-200",
  in_review: "bg-amber-50 text-amber-900 ring-amber-200",
  submitted: "bg-sky-50 text-sky-800 ring-sky-200",
  rejected: "bg-red-50 text-red-800 ring-red-200",
  in_collection: "bg-violet-50 text-violet-800 ring-violet-200",
  disbursed: "bg-cyan-50 text-cyan-800 ring-cyan-200",
  in_operation: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  in_quotation: "bg-orange-50 text-orange-900 ring-orange-200",
  uploaded: "bg-sky-50 text-sky-800 ring-sky-200",
  processing: "bg-amber-50 text-amber-900 ring-amber-200",
  failed: "bg-red-50 text-red-800 ring-red-200",
};

export function StatusBadge({ status }: { status: string }) {
  const c = map[status] ?? "bg-zinc-100 text-zinc-700 ring-zinc-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${c}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
