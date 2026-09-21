import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentSuperAdmin } from "@/lib/session";
import { INCO_CATEGORY_LABELS, INCO_STATUS_LABELS } from "@/lib/inco-constants";

const STATUS_CLASS: Record<string, string> = {
  NEW: "badge-danger",
  IN_PROGRESS: "badge-warning",
  RESOLVED: "badge-success",
};

export default async function IncoInboxPage({
  searchParams,
}: PageProps<"/admin/inco">) {
  // Server-side enforcement, not just a hidden nav link - a regular admin
  // hitting this URL directly gets a 404, same as /admin/admins.
  const superAdmin = await getCurrentSuperAdmin();
  if (!superAdmin) notFound();

  const search = await searchParams;
  const statusFilter = typeof search?.status === "string" ? search.status : "";

  const [submissions, counts] = await Promise.all([
    prisma.incoSubmission.findMany({
      where: statusFilter ? { status: statusFilter as "NEW" | "IN_PROGRESS" | "RESOLVED" } : undefined,
      orderBy: { createdAt: "desc" },
    }),
    prisma.incoSubmission.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const countByStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));

  return (
    <div>
      <h1 className="text-2xl font-bold">INCO</h1>
      <p className="mt-1 text-sm text-rahoot-muted">
        ანონიმური შეტყობინებები - ხილვადია მხოლოდ სუპერ ადმინისთვის.
      </p>

      <div className="mt-4 grid grid-cols-3 gap-3 sm:w-fit">
        {(["NEW", "IN_PROGRESS", "RESOLVED"] as const).map((s) => (
          <Link
            key={s}
            href={statusFilter === s ? "/admin/inco" : `/admin/inco?status=${s}`}
            className={`card p-4 text-center hover:border-rahoot-red ${statusFilter === s ? "border-rahoot-red" : ""}`}
          >
            <div className="text-2xl font-black">{countByStatus[s] ?? 0}</div>
            <div className="text-xs uppercase tracking-wide text-rahoot-muted">{INCO_STATUS_LABELS[s]}</div>
          </Link>
        ))}
      </div>

      {submissions.length === 0 ? (
        <p className="mt-8 text-rahoot-muted">შეტყობინებები ჯერ არ არის{statusFilter ? " ამ სტატუსით" : ""}.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {submissions.map((s) => {
            const preview = s.message.length > 100 ? `${s.message.slice(0, 100)}…` : s.message;
            return (
              <li key={s.id}>
                <Link
                  href={`/admin/inco/${s.id}`}
                  className="card flex items-center justify-between gap-3 p-4 hover:border-rahoot-red"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`badge ${STATUS_CLASS[s.status]}`}>{INCO_STATUS_LABELS[s.status]}</span>
                      <span className="badge badge-neutral">{INCO_CATEGORY_LABELS[s.category]}</span>
                    </div>
                    <p className="mt-1 font-semibold">{preview}</p>
                    <p className="mt-1 text-xs text-rahoot-muted">{s.createdAt.toLocaleString()}</p>
                  </div>
                  <span className="btn btn-outline shrink-0 !py-1.5 !px-3 text-sm">ნახვა</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
