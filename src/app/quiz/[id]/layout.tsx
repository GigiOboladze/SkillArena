import { redirect } from "next/navigation";
import { getCurrentStudent } from "@/lib/session";
import { ThemeToggle } from "@/components/ThemeToggle";

// Second line of defense behind proxy.ts: every server render under the
// quiz-taking area re-checks the session before touching any attempt data.
export default async function QuizLayout({ children }: LayoutProps<"/quiz/[id]">) {
  const student = await getCurrentStudent();
  if (!student) redirect("/login");

  return (
    <>
      <div className="fixed right-4 top-4 z-10">
        <ThemeToggle />
      </div>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10">{children}</main>
    </>
  );
}
