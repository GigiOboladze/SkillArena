import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStaffWith } from "@/lib/staff-guard";
import { isFullAdmin } from "@/lib/authz";
import { canAdminManageGame } from "@/lib/hootarena/access";
import { AutoSubmitSelect } from "@/components/admin/AutoSubmitSelect";
import { CopyPinButton } from "@/components/admin/CopyPinButton";
import { deleteHootGame } from "./actions";
import { DeleteHootGameIconButton } from "./DeleteHootGameIconButton";

const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

function IconGamepad({ className }: { className?: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M7 7h10a4.5 4.5 0 0 1 4.4 5.5l-1 4.3a2.4 2.4 0 0 1-4.1 1.1L14 15.5h-4l-2.3 2.4a2.4 2.4 0 0 1-4.1-1.1l-1-4.3A4.5 4.5 0 0 1 7 7Z" />
      <path d="M8 10v3M6.5 11.5h3M15.5 11h.01M17.5 12.5h.01" />
    </svg>
  );
}

/** Hero artwork: glossy gamepad tile with a checkered flag. */
function HootHeroArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 200" className={className} aria-hidden>
      <defs>
        <linearGradient id="ha-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c5cff" />
          <stop offset="1" stopColor="#3b1f9a" />
        </linearGradient>
        <linearGradient id="ha-edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e0d6ff" stopOpacity=".9" />
          <stop offset="1" stopColor="#8b6bff" stopOpacity=".2" />
        </linearGradient>
        <radialGradient id="ha-glow" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#8b6bff" stopOpacity=".55" />
          <stop offset="1" stopColor="#8b6bff" stopOpacity="0" />
        </radialGradient>
        <pattern id="ha-check" width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#efeaff" />
          <rect x="6" y="6" width="6" height="6" fill="#efeaff" />
          <rect x="6" width="6" height="6" fill="#4c35b0" />
          <rect y="6" width="6" height="6" fill="#4c35b0" />
        </pattern>
        <filter id="ha-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#2a1670" floodOpacity=".6" />
        </filter>
      </defs>
      <ellipse cx="150" cy="110" rx="140" ry="80" fill="url(#ha-glow)" />
      <path d="M0 150 C 70 150, 90 60, 170 70 S 280 140, 300 120" fill="none" stroke="#8b6bff" strokeOpacity=".35" strokeWidth="2" />
      {/* flag */}
      <g transform="rotate(14 230 40)">
        <path d="M208 22v92" stroke="#c4b5fd" strokeWidth="4" strokeLinecap="round" />
        <path d="M210 22c18-6 30 6 50 0v36c-20 6-32-6-50 0Z" fill="url(#ha-check)" />
      </g>
      {/* tile */}
      <g filter="url(#ha-shadow)" transform="rotate(-10 140 105)">
        <rect x="78" y="45" width="124" height="120" rx="26" fill="url(#ha-tile)" stroke="url(#ha-edge)" strokeWidth="2.5" />
        <g transform="translate(96 66) scale(3.6)" fill="none" stroke="#efeaff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 7h10a4.5 4.5 0 0 1 4.4 5.5l-1 4.3a2.4 2.4 0 0 1-4.1 1.1L14 15.5h-4l-2.3 2.4a2.4 2.4 0 0 1-4.1-1.1l-1-4.3A4.5 4.5 0 0 1 7 7Z" fill="#c4b5fd" fillOpacity=".95" stroke="none" />
          <path d="M8 10v3M6.5 11.5h3" stroke="#3b1f9a" strokeWidth="1.5" />
          <circle cx="15.6" cy="11" r=".9" fill="#3b1f9a" stroke="none" />
          <circle cx="17.6" cy="12.6" r=".9" fill="#3b1f9a" stroke="none" />
        </g>
      </g>
    </svg>
  );
}

const SORTS = [
  { key: "newest", label: "Newest First" },
  { key: "oldest", label: "Oldest First" },
  { key: "players", label: "Most Players" },
] as const;

function formatCreated(d: Date) {
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tbilisi" }).replace(",", ",");
}

export default async function AdminHootArenaPage({ searchParams }: PageProps<"/admin/hootarena">) {
  const admin = await getStaffWith("hoot.host");
  if (!admin) notFound();

  const search = await searchParams;
  const q = typeof search?.q === "string" ? search.q.trim().toLowerCase().slice(0, 60) : "";
  const status = search?.status === "lobby" || search?.status === "live" ? search.status : "";
  const host = typeof search?.host === "string" ? search.host : "";
  const sort = SORTS.some((s) => s.key === search?.sort) ? (search?.sort as (typeof SORTS)[number]["key"]) : "newest";

  // No program/subject/group concept at all - HootArena is PIN/QR-joinable
  // by anyone, so every admin sees every active game (ownership only gates
  // editing rights, via canAdminManageGame). No history view: a FINISHED
  // game drops off this page the moment it ends.
  const games = await prisma.hootGame.findMany({
    // Super Admin / legacy Admin see every active game (as before); the newer
    // hosting roles see only the games they created themselves.
    where: { status: { not: "FINISHED" }, ...(isFullAdmin(admin) ? {} : { hostId: admin.id }) },
    orderBy: { createdAt: "desc" },
    include: { host: { select: { id: true, username: true } }, _count: { select: { questions: true, players: true } } },
  });

  const totals = games.reduce(
    (acc, g) => ({ players: acc.players + g._count.players, questions: acc.questions + g._count.questions }),
    { players: 0, questions: 0 },
  );
  const hosts = [...new Map(games.map((g) => [g.host.id, g.host.username])).entries()].sort((a, b) => a[1].localeCompare(b[1]));

  const visible = games
    .filter((g) => !q || g.title.toLowerCase().includes(q) || g.pin.includes(q))
    .filter((g) => !status || (status === "lobby" ? g.status === "LOBBY" : g.status !== "LOBBY"))
    .filter((g) => !host || g.host.id === host)
    .sort((a, b) =>
      sort === "oldest"
        ? a.createdAt.getTime() - b.createdAt.getTime()
        : sort === "players"
          ? b._count.players - a._count.players || b.createdAt.getTime() - a.createdAt.getTime()
          : b.createdAt.getTime() - a.createdAt.getTime(),
    );
  const filtered = Boolean(q || status || host);

  return (
    <div className="sa-ha flex flex-col gap-6">
      {/* ---------------- Header ---------------- */}
      <header className="sa-br-head sa-ha-head">
        <span className="sa-br-head-icon" aria-hidden>
          <IconGamepad className="h-9 w-9" />
        </span>
        <div className="relative z-10 min-w-0 flex-1">
          <h1 className="text-3xl font-black tracking-tight sm:text-[2.6rem] sm:leading-tight">HootArena</h1>
          <p className="mt-1 text-rahoot-muted sm:text-[1.05rem]">
            Live, Kahoot-style quiz games &mdash; join by PIN or QR code, no student account needed.
          </p>
        </div>
        <HootHeroArt className="sa-ha-art" />
        <Link href="/admin/hootarena/new" className="sa-br-primary sa-ha-new">
          <svg {...svg} strokeWidth={2.4} className="h-5 w-5">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Game
        </Link>
      </header>

      {/* ---------------- Stats ---------------- */}
      <section className="sa-br-stats" aria-label="HootArena totals">
        <div className="sa-br-stat is-violet">
          <span className="sa-br-stat-icon" aria-hidden>
            <svg {...svg} className="h-8 w-8">
              <circle cx="12" cy="12" r="9" />
              <path d="M10 8.5v7l5.5-3.5Z" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block text-3xl font-black leading-none tabular-nums">{games.length}</span>
            <span className="sa-br-stat-label">Total Games</span>
          </span>
        </div>
        <div className="sa-br-stat is-blue">
          <span className="sa-br-stat-icon" aria-hidden>
            <svg {...svg} className="h-8 w-8">
              <circle cx="9" cy="8" r="3.5" />
              <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
              <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block text-3xl font-black leading-none tabular-nums">{totals.players}</span>
            <span className="sa-br-stat-label">Total Players</span>
          </span>
        </div>
        <div className="sa-br-stat is-green">
          <span className="sa-br-stat-icon" aria-hidden>
            <svg {...svg} className="h-8 w-8">
              <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" />
              <path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block text-3xl font-black leading-none tabular-nums">{totals.questions}</span>
            <span className="sa-br-stat-label">Total Questions</span>
          </span>
        </div>
      </section>

      {/* ---------------- Filters ---------------- */}
      <form method="get" className="sa-br-filters" role="search">
        <label className="sa-br-search">
          <svg {...svg} className="h-5 w-5 flex-none text-rahoot-muted">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input name="q" defaultValue={q} placeholder="Search hootarena games..." aria-label="Search HootArena games" />
        </label>
        <div className="sa-br-filter-right">
          <AutoSubmitSelect name="status" defaultValue={status} ariaLabel="Filter by status" className="sa-br-select">
            <option value="">All Statuses</option>
            <option value="lobby">Lobby</option>
            <option value="live">Live</option>
          </AutoSubmitSelect>
          <AutoSubmitSelect name="host" defaultValue={host} ariaLabel="Filter by host" className="sa-br-select">
            <option value="">All Hosts</option>
            {hosts.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </AutoSubmitSelect>
          <AutoSubmitSelect name="sort" defaultValue={sort} ariaLabel="Sort games" className="sa-br-select sa-ha-sort">
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </AutoSubmitSelect>
          <button type="submit" className="sr-only">
            Search
          </button>
        </div>
      </form>

      {/* ---------------- Games ---------------- */}
      {visible.length === 0 ? (
        <section className="sa-br-empty">
          <span className="sa-br-head-icon !static" aria-hidden>
            <IconGamepad className="h-9 w-9" />
          </span>
          {filtered ? (
            <>
              <h2 className="mt-4 text-2xl font-black">No games match.</h2>
              <p className="mt-2 max-w-md text-rahoot-muted">Try a different search, or clear the filters.</p>
              <Link href="/admin/hootarena" className="sa-br-primary mt-6">
                Clear filters
              </Link>
            </>
          ) : (
            <>
              <h2 className="mt-4 text-2xl font-black">No active games.</h2>
              <p className="mt-2 max-w-md text-rahoot-muted">
                Create one to get a Game PIN students can join with. A finished game disappears from this list automatically.
              </p>
              <Link href="/admin/hootarena/new" className="sa-br-primary mt-6">
                New Game
              </Link>
            </>
          )}
        </section>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {visible.map((game) => {
            const live = game.status !== "LOBBY";
            const href = live ? `/admin/hootarena/${game.id}/host` : `/admin/hootarena/${game.id}`;
            const canDelete = !live && canAdminManageGame(admin, game);
            const remove = deleteHootGame.bind(null, game.id);
            return (
              <li key={game.id} className="sa-ha-row">
                <span className="sa-ha-icon" aria-hidden>
                  <IconGamepad className="h-6 w-6" />
                </span>
                <div className="sa-ha-title min-w-0">
                  <Link href={href} className="block truncate text-lg font-bold hover:text-[#c4b5fd]">
                    {game.title}
                  </Link>
                  <p className="truncate text-sm text-rahoot-muted">
                    Host: {game.host.username} &bull; Created {formatCreated(game.createdAt)}
                  </p>
                </div>
                <span className={`sa-ha-status ${live ? "is-live" : ""}`}>
                  <span className="sa-ha-status-dot" aria-hidden />
                  {live ? "Live" : "Lobby"}
                </span>
                <CopyPinButton pin={game.pin} />
                <span className="sa-ha-sep" aria-hidden />
                <span className="sa-ha-meta is-players">
                  <svg {...svg} className="h-5 w-5">
                    <circle cx="9" cy="8" r="3.5" />
                    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
                    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
                  </svg>
                  {game._count.players} player{game._count.players === 1 ? "" : "s"}
                </span>
                <span className="sa-ha-meta is-questions">
                  <svg {...svg} className="h-5 w-5">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4M12 16.8v.2" />
                  </svg>
                  {game._count.questions} question{game._count.questions === 1 ? "" : "s"}
                </span>
                <span className="sa-ha-actions">
                  <Link href={href} className="sa-ha-open">
                    <svg {...svg} className="h-5 w-5">
                      <path d="M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
                    </svg>
                    Open
                  </Link>
                  {canDelete ? (
                    <form action={remove}>
                      <DeleteHootGameIconButton title={game.title} />
                    </form>
                  ) : (
                    <span
                      className="sa-ha-delete is-disabled"
                      title={live ? "A live game can't be deleted" : "Only the host or the Super Admin can delete this game"}
                      aria-hidden
                    >
                      <svg {...svg} className="h-5 w-5">
                        <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />
                      </svg>
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
