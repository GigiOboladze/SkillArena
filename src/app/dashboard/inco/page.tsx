import { redirect } from "next/navigation";
import { getCurrentStudent } from "@/lib/session";
import { IncoForm } from "./IncoForm";

export default async function IncoPage() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login");

  return (
    <div className="mx-auto max-w-lg">
      <div className="text-center">
        <h1 className="text-2xl font-bold">„რაღაც გაქვს სათქმელი?“</h1>
        <p className="mt-3 text-rahoot-muted">
          აქ შეგიძლია თავისუფლად და ანონიმურად გვითხრა ის, რაც გაწუხებს, ან უბრალოდ შენი აზრი გაგვიზიარო. 💜
        </p>
      </div>

      <div className="mt-6">
        <IncoForm />
      </div>
    </div>
  );
}
