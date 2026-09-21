import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { StatusCheckForm } from "./StatusCheckForm";

export default function IncoStatusPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="fixed right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center">
          <Link href="/" className="inline-block">
            <Logo size={40} priority className="mx-auto" />
          </Link>
          <h1 className="mt-4 text-xl font-bold">INCO - პასუხის შემოწმება</h1>
          <p className="mt-1 text-sm text-rahoot-muted">
            შეიყვანე შენი ანონიმური კოდი, რომელიც მიიღე შეტყობინების გაგზავნისას.
          </p>
        </div>

        <div className="mt-8">
          <StatusCheckForm />
        </div>
      </div>
    </main>
  );
}
