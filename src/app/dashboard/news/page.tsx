import Link from "next/link";
import { NEWS } from "@/lib/news";
import { IconArrowRight } from "@/components/student/Icons";

export const metadata = { title: "News - SkillArena" };

export default function NewsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-rahoot-muted hover:text-rahoot-ink">
          <IconArrowRight className="h-4 w-4 rotate-180" /> Back to Dashboard
        </Link>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Cool News!!</h1>
        <p className="mt-1 text-sm text-rahoot-muted">Events, partnerships and announcements from your college.</p>
      </div>

      {NEWS.length === 0 ? (
        <p className="sa-panel p-8 text-center text-sm text-rahoot-muted">No news yet.</p>
      ) : (
        <ul className="sa-news-list">
          {NEWS.map((n) => (
            <li key={n.id} className="sa-panel overflow-hidden">
              <a href={n.image} target="_blank" rel="noopener noreferrer" className={`sa-news-thumb is-${n.fit}`}>
                {n.fit === "contain" && (
                  // eslint-disable-next-line @next/next/no-img-element -- static public asset
                  <img src={n.image} alt="" className="sa-news-backdrop" aria-hidden />
                )}
                {/* eslint-disable-next-line @next/next/no-img-element -- static public asset */}
                <img src={n.image} alt={n.alt} className="sa-news-img" loading="lazy" />
              </a>
              <div className="p-4">
                <p className="text-xs font-semibold text-rahoot-muted">
                  {new Date(`${n.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </p>
                <p className="mt-1 font-bold leading-snug">{n.title}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
