import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStudentForHomework } from "@/lib/student-session";
import { joinHomework } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  name: "Please enter both your first and last name.",
  closed: "This homework isn't accepting new students right now.",
};

export default async function JoinCodePage({
  params,
  searchParams,
}: PageProps<"/join/[code]">) {
  const { code } = await params;
  const search = await searchParams;
  const errorMessage = search?.error ? ERROR_MESSAGES[String(search.error)] : null;

  const homework = await prisma.homework.findUnique({
    where: { joinCode: code.toUpperCase() },
  });

  if (!homework) {
    return (
      <StatusScreen
        title="Code not found"
        message={`We couldn't find a homework with the code "${code}". Double check with your teacher.`}
      />
    );
  }

  // Already joined on this device? Skip straight back in.
  const existingStudent = await getStudentForHomework(homework.id);
  if (existingStudent) {
    redirect(`/play/${homework.id}`);
  }

  if (homework.status === "DRAFT") {
    return (
      <StatusScreen
        title={homework.title}
        message="This homework hasn't been opened by your teacher yet. Try again shortly."
      />
    );
  }

  if (homework.status === "CLOSED") {
    return (
      <StatusScreen
        title={homework.title}
        message="This homework is closed and no longer accepting students."
      />
    );
  }

  const joinAction = joinHomework.bind(null, homework.id);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <p className="text-sm font-bold uppercase tracking-wide text-rahoot-red">
          Joining
        </p>
        <h1 className="mt-1 text-2xl font-bold">{homework.title}</h1>
        {homework.description && (
          <p className="mt-2 text-sm text-rahoot-muted">{homework.description}</p>
        )}

        <form action={joinAction} className="mt-8 flex flex-col gap-3 text-left">
          <label className="text-sm font-semibold">
            First name
            <input name="firstName" required maxLength={60} className="input mt-1" autoFocus />
          </label>
          <label className="text-sm font-semibold">
            Last name
            <input name="lastName" required maxLength={60} className="input mt-1" />
          </label>
          {errorMessage && (
            <p className="text-sm font-medium text-rahoot-red">{errorMessage}</p>
          )}
          <button type="submit" className="btn btn-primary mt-2">
            Join {homework.mode === "LIVE" ? "the game" : "homework"}
          </button>
        </form>
      </div>
    </main>
  );
}

function StatusScreen({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 max-w-sm text-rahoot-muted">{message}</p>
      <Link href="/join" className="btn btn-outline mt-6">
        Try another code
      </Link>
    </main>
  );
}
