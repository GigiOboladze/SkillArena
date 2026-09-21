"use client";

import { useActionState } from "react";
import { checkIncoStatus, type CheckIncoState } from "./actions";

const initialState: CheckIncoState = {};

export function StatusCheckForm() {
  const [state, formAction, pending] = useActionState(checkIncoStatus, initialState);

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="card flex flex-col gap-4 p-6">
        <label className="text-sm font-semibold">
          შენი კოდი
          <input
            name="code"
            required
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
            autoCapitalize="off"
            autoComplete="off"
            className="input mt-1 font-mono"
          />
        </label>
        {state.error && <p className="text-sm font-medium text-rahoot-red">{state.error}</p>}
        <button type="submit" disabled={pending} className="btn btn-primary self-start">
          {pending ? "მოწმდება..." : "შემოწმება"}
        </button>
      </form>

      {state.result && (
        <div className="card flex flex-col gap-3 p-6">
          <div className="flex items-center justify-between">
            <span className="badge bg-rahoot-red-light text-rahoot-red">{state.result.category}</span>
            <span className="badge badge-neutral">{state.result.status}</span>
          </div>
          <p className="text-xs text-rahoot-muted">
            გაგზავნილია: {new Date(state.result.submittedAt).toLocaleString()}
          </p>
          {state.result.response ? (
            <div className="mt-2 rounded-lg border border-rahoot-border p-4">
              <p className="text-xs uppercase tracking-wide text-rahoot-muted">პასუხი</p>
              <p className="mt-1 whitespace-pre-wrap">{state.result.response}</p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-rahoot-muted">პასუხი ჯერ არ არის დამატებული.</p>
          )}
        </div>
      )}
    </div>
  );
}
