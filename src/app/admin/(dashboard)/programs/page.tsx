import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentSuperAdmin } from "@/lib/session";
import { createProgram } from "./actions";
import { IconArrowRight, IconLayers, IconPlus, IconUsers } from "@/components/student/Icons";

const ERROR_MESSAGES: Record<string, string> = {
  name: "Please enter a program name.",
  taken: "A program with that name already exists.",
};

export default async function ProgramsPage({
  searchParams,
}: PageProps<"/admin/programs">) {
  // Not just hidden from nav - a regular admin hitting this URL directly gets a 404.
  const superAdmin = await getCurrentSuperAdmin();
  if (!superAdmin) notFound();

  const search = await searchParams;
  const error = typeof search?.error === "string" ? ERROR_MESSAGES[search.error] ?? null : null;
  const justCreated = search?.created === "1";

  const programs = await prisma.program.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { subjects: true, users: true } } },
  });

  const totalSubjects = programs.reduce((sum, p) => sum + p._count.subjects, 0);
  const totalMembers = programs.reduce((sum, p) => sum + p._count.users, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* ---------------- Hero ---------------- */}
      <section className="sa-pg-hero">
        <div className="relative z-[1] min-w-0">
          <span className="sa-pg-eyebrow">Programs</span>
          <h1 className="sa-pg-title">Programs</h1>
          <p className="sa-pg-lead">
            Every student and Admin belongs to exactly one program. Programs are never deleted once created.
          </p>
        </div>
        <div className="sa-pg-art" aria-hidden>
          <span className="sa-pg-art-glass">
            <IconLayers className="h-24 w-24" />
          </span>
        </div>
      </section>

      {justCreated && <p className="text-sm font-medium text-green-400">Program created.</p>}

      {/* ---------------- Program cards ---------------- */}
      <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {programs.map((program, index) => {
          const tone = PROGRAM_TONES[index % PROGRAM_TONES.length];
          return (
            <li key={program.id}>
              <Link href={`/admin/programs/${program.id}`} className="sa-pg-card">
                <svg className={`sa-pg-card-swoosh is-${tone.name}`} viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden>
                  <path d="M0 58 C 70 58, 90 20, 200 2" fill="none" strokeWidth="2" />
                </svg>
                <span className={`sa-pg-card-icon is-${tone.name}`}>{tone.icon}</span>
                <div className="relative min-w-0 flex-1">
                  <p className="sa-pg-card-name">{program.name}</p>
                  <p className="sa-pg-card-meta">
                    <span>
                      <IconUsers className="h-4 w-4" />
                      {program.groupCount} group{program.groupCount === 1 ? "" : "s"} per subject
                    </span>
                    <span>
                      <IconLayers className="h-4 w-4" />
                      {program._count.subjects} subject{program._count.subjects === 1 ? "" : "s"}
                    </span>
                    <span>
                      <IconUsers className="h-4 w-4" />
                      {program._count.users} member{program._count.users === 1 ? "" : "s"}
                    </span>
                  </p>
                </div>
                <span className="sa-pg-card-go" aria-hidden>
                  <IconArrowRight className="h-5 w-5" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* ---------------- Totals ---------------- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sa-pg-stat">
          <span className="sa-pg-stat-icon is-violet">
            <IconUsers className="h-7 w-7" />
          </span>
          <div>
            <p className="sa-pg-stat-label">Total programs</p>
            <p className="sa-pg-stat-value">{programs.length.toLocaleString()}</p>
          </div>
        </div>
        <div className="sa-pg-stat">
          <span className="sa-pg-stat-icon is-green">
            <IconLayers className="h-7 w-7" />
          </span>
          <div>
            <p className="sa-pg-stat-label">Total subjects</p>
            <p className="sa-pg-stat-value">{totalSubjects.toLocaleString()}</p>
          </div>
        </div>
        <div className="sa-pg-stat">
          <span className="sa-pg-stat-icon is-blue">
            <IconUsers className="h-7 w-7" />
          </span>
          <div>
            <p className="sa-pg-stat-label">Total members</p>
            <p className="sa-pg-stat-value">{totalMembers.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* ---------------- Create ---------------- */}
      <section className="sa-pg-create">
        <h2 className="sa-pg-create-title">
          <span className="sa-pg-create-plus" aria-hidden>
            <IconPlus className="h-5 w-5" />
          </span>
          Create a program
        </h2>
        <form action={createProgram} className="sa-pg-create-form">
          <label className="sa-pg-field sa-pg-field-name">
            Program name
            <input name="name" required maxLength={80} placeholder="e.g. Cybersecurity" className="sa-pg-input" />
          </label>
          <label className="sa-pg-field sa-pg-field-groups">
            Groups per subject
            <input type="number" name="groupCount" required min={1} max={10} defaultValue={3} className="sa-pg-input" />
          </label>
          <button type="submit" className="sa-pg-submit">
            <IconPlus className="h-5 w-5" />
            Create program
          </button>
        </form>
        <p className="sa-pg-note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden className="mt-px h-5 w-5 flex-none text-rahoot-red">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 11v5M12 8h.01" />
          </svg>
          <span>
            Every subject added to this program will get this many fixed groups (I, II, III, ...). This can&apos;t be
            changed later - there is no group add/remove workflow, per the existing design.
          </span>
        </p>
        {error && <p className="mt-3 text-sm font-medium text-rahoot-red">{error}</p>}
      </section>
    </div>
  );
}

/** Purely decorative: each program card gets a rotating icon/colour so the cards are easy to tell apart. */
const PROGRAM_TONES = [
  {
    name: "violet",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
        <path d="m8.5 7.5-4.5 4.5 4.5 4.5M15.5 7.5l4.5 4.5-4.5 4.5M13.5 5l-3 14" />
      </svg>
    ),
  },
  {
    name: "blue",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
        <circle cx="12" cy="6" r="2.5" />
        <circle cx="5.5" cy="17.5" r="2.5" />
        <circle cx="18.5" cy="17.5" r="2.5" />
        <path d="M12 8.5v3.5M12 12l-4.6 3.7M12 12l4.6 3.7" />
      </svg>
    ),
  },
  { name: "green", icon: <IconLayers className="h-8 w-8" /> },
] as const;
