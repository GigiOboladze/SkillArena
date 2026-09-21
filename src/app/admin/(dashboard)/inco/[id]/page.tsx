import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentSuperAdmin } from "@/lib/session";
import { INCO_CATEGORY_LABELS, INCO_STATUS_LABELS } from "@/lib/inco-constants";
import { updateIncoStatus, respondToInco } from "../actions";

const STATUS_FLOW: Array<"NEW" | "IN_PROGRESS" | "RESOLVED"> = ["NEW", "IN_PROGRESS", "RESOLVED"];

export default async function IncoDetailPage({
  params,
  searchParams,
}: PageProps<"/admin/inco/[id]">) {
  const superAdmin = await getCurrentSuperAdmin();
  if (!superAdmin) notFound();

  const { id } = await params;
  const search = await searchParams;
  const justResponded = search?.responded === "1";
  const responseError = search?.error === "empty";

  const submission = await prisma.incoSubmission.findUnique({ where: { id } });
  if (!submission) notFound();

  const respond = respondToInco.bind(null, submission.id);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/inco" className="text-sm text-rahoot-red hover:underline">
        &larr; INCO-ში დაბრუნება
      </Link>

      <div className="card mt-4 p-6">
        <div className="flex items-center gap-2">
          <span className="badge bg-rahoot-red-light text-rahoot-red">{INCO_CATEGORY_LABELS[submission.category]}</span>
          <span className="text-xs text-rahoot-muted">{submission.createdAt.toLocaleString()}</span>
        </div>
        <p className="mt-4 whitespace-pre-wrap text-lg">{submission.message}</p>
      </div>

      <section className="card mt-4 p-6">
        <h2 className="font-bold">სტატუსი</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {STATUS_FLOW.map((s) => {
            const active = submission.status === s;
            const action = updateIncoStatus.bind(null, submission.id, s);
            return (
              <form action={action} key={s}>
                <button type="submit" disabled={active} className={active ? "btn btn-primary" : "btn btn-outline"}>
                  {INCO_STATUS_LABELS[s]}
                </button>
              </form>
            );
          })}
        </div>
      </section>

      <section className="card mt-4 p-6">
        <h2 className="font-bold">პასუხი</h2>
        {submission.response && (
          <div className="mt-3 rounded-lg border border-rahoot-border p-4">
            <p className="text-xs uppercase tracking-wide text-rahoot-muted">
              გაგზავნილი პასუხი {submission.respondedAt?.toLocaleString()}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{submission.response}</p>
          </div>
        )}
        {justResponded && <p className="mt-3 text-sm font-medium text-green-400">პასუხი გაგზავნილია.</p>}

        <form action={respond} className="mt-4 flex flex-col gap-3">
          <label className="text-sm font-semibold">
            {submission.response ? "პასუხის განახლება" : "დაწერე პასუხი"}
            <textarea
              name="response"
              required
              maxLength={3000}
              rows={5}
              defaultValue={submission.response ?? ""}
              className="input mt-1"
            />
          </label>
          {responseError && <p className="text-sm font-medium text-rahoot-red">პასუხი არ შეიძლება იყოს ცარიელი.</p>}
          <button type="submit" className="btn btn-primary self-start">
            პასუხის გაგზავნა
          </button>
        </form>
      </section>
    </div>
  );
}
