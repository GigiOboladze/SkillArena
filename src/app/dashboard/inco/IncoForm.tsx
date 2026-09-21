"use client";

import { useActionState, useState } from "react";
import { submitIncoMessage, type SubmitIncoState } from "./actions";
import { INCO_CATEGORIES, MAX_INCO_MESSAGE_LENGTH } from "@/lib/inco-constants";

const initialState: SubmitIncoState = {};

export function IncoForm() {
  const [state, formAction, pending] = useActionState(submitIncoMessage, initialState);
  const [copied, setCopied] = useState(false);

  if (state.code) {
    return (
      <div className="card flex flex-col items-center gap-3 p-8 text-center">
        <span className="text-3xl">💜</span>
        <h2 className="text-lg font-bold">გმადლობთ, მიღებულია!</h2>
        <p className="text-sm text-rahoot-muted">
          შეინახეთ ეს კოდი - მხოლოდ მისი მეშვეობით შეძლებთ მოგვიანებით პასუხის ნახვას. კოდი აღარსად გამოჩნდება.
        </p>
        <div className="card flex w-full flex-col items-center gap-2 border-2 border-rahoot-red p-4">
          <span className="select-all break-all font-mono text-lg font-bold">{state.code}</span>
          <button
            type="button"
            className="btn btn-outline !py-1.5 !px-3 text-sm"
            onClick={() => {
              navigator.clipboard?.writeText(state.code!).then(() => setCopied(true));
            }}
          >
            {copied ? "დაკოპირებულია ✓" : "კოდის კოპირება"}
          </button>
        </div>
        <a href="/inco/status" className="text-sm text-rahoot-red hover:underline">
          პასუხის შემოწმება კოდით &rarr;
        </a>
      </div>
    );
  }

  return (
    <form action={formAction} className="card flex flex-col gap-4 p-6">
      <label className="text-sm font-semibold">
        კატეგორია
        <select name="category" required defaultValue="" className="input mt-1">
          <option value="" disabled>
            აირჩიეთ კატეგორია&hellip;
          </option>
          {INCO_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm font-semibold">
        შენი შეტყობინება
        <textarea
          name="message"
          required
          maxLength={MAX_INCO_MESSAGE_LENGTH}
          rows={6}
          placeholder="დაწერე რაც გინდა..."
          className="input mt-1"
        />
      </label>

      {state.error && <p className="text-sm font-medium text-rahoot-red">{state.error}</p>}

      <p className="text-xs text-rahoot-muted">
        შენი შეტყობინება არ არის დაკავშირებული შენს ანგარიშთან - ის სრულიად ანონიმურია. გაითვალისწინე, რომ სრული
        ანონიმურობის გარანტია შეუძლებელია, თუ შეტყობინებაში თავად მიუთითებ საკუთარ ვინაობას.
      </p>

      <button type="submit" disabled={pending} className="btn btn-primary self-start">
        {pending ? "იგზავნება..." : "გაგზავნა ანონიმურად"}
      </button>
    </form>
  );
}
