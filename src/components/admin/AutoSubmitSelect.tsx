"use client";

import { Select } from "@/components/ui/Select";
import type { ReactNode } from "react";

/** A <select> that submits its form as soon as the value changes. */
export function AutoSubmitSelect({
  name,
  defaultValue,
  ariaLabel,
  className,
  children,
}: {
  name: string;
  defaultValue: string;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Select
      name={name}
      defaultValue={defaultValue}
      aria-label={ariaLabel}
      className={className}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
    >
      {children}
    </Select>
  );
}
