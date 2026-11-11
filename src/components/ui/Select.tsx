"use client";

import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";

/**
 * SkillArena's one dropdown. Drop-in replacement for a native <select>: same
 * props, same <option>/<optgroup> children.
 *
 * - The CLOSED control is a <button> carrying exactly the className the
 *   <select> had, so every existing trigger style (colors, outline, radius,
 *   size, chevron) is kept. Where the old style relied on the browser's own
 *   arrow, the same chevron is drawn here.
 * - The OPENED menu is a custom, accessible listbox (portal, collision-aware
 *   positioning, keyboard, typeahead) styled once in globals.css (.sa-dropdown).
 * - A visually hidden native <select> stays in the form and is the real
 *   field: it carries `name`, `required`, `form`, the value that gets
 *   submitted, and receives the caller's `onChange` - so form posts, GET
 *   filters, auto-submit, validation and automated tests keep working
 *   unchanged. Picking an option sets that select's value and fires a real
 *   `change` event on it.
 */

type Opt = { value: string; label: string; disabled: boolean; group?: string };

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

function collect(children: ReactNode, out: Opt[], group?: string) {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{ value?: unknown; disabled?: boolean; label?: string; children?: ReactNode }>;
    if (el.type === Fragment) return collect(el.props.children, out, group);
    if (el.type === "optgroup") return collect(el.props.children, out, el.props.label ?? "");
    if (el.type === "option") {
      const label = textOf(el.props.children);
      out.push({
        value: el.props.value === undefined ? label : String(el.props.value),
        label,
        disabled: !!el.props.disabled,
        group,
      });
    }
  });
}

// Trigger classes that already draw their own chevron as a background image.
const OWN_CHEVRON = /\b(sa-br-select|sa-am-select)\b/;
const MENU_GAP = 6;
const MENU_MAX = 380;
const EDGE = 8;

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children" | "multiple" | "size"> & { children: ReactNode };

export function Select({
  children,
  className = "",
  style,
  id,
  value,
  defaultValue,
  onChange,
  disabled,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  autoFocus,
  title,
  ...nativeProps
}: Props) {
  const options = useMemo(() => {
    const out: Opt[] = [];
    collect(children, out);
    return out;
  }, [children]);

  const controlled = value !== undefined;
  const firstEnabled = options.find((o) => !o.disabled)?.value ?? options[0]?.value ?? "";
  const [inner, setInner] = useState<string>(() =>
    defaultValue !== undefined ? String(defaultValue) : firstEnabled
  );
  const current = controlled ? String(value) : inner;
  const selected = options.find((o) => o.value === current);
  const isPlaceholder = !selected || (selected.disabled && selected.value === "");

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const [invalid, setInvalid] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const nativeRef = useRef<HTMLSelectElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ text: "", at: 0 });
  const uid = useId();
  const listId = `${uid}-list`;
  const optId = (i: number) => `${uid}-opt-${i}`;

  // ---------------- positioning (flip + clamp to the viewport) ----------------
  const place = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const below = vh - r.bottom - MENU_GAP - EDGE;
    const above = r.top - MENU_GAP - EDGE;
    const wanted = Math.min(MENU_MAX, options.length * 46 + 12);
    const up = below < Math.min(wanted, 180) && above > below;
    const maxHeight = Math.max(120, Math.min(MENU_MAX, up ? above : below));
    const width = Math.min(Math.max(r.width, 200), vw - EDGE * 2);
    const left = Math.min(Math.max(EDGE, r.left), vw - EDGE - width);
    setPos(
      up
        ? { left, width, maxHeight, bottom: vh - r.top + MENU_GAP, transformOrigin: "bottom center" }
        : { left, width, maxHeight, top: r.bottom + MENU_GAP, transformOrigin: "top center" }
    );
  }, [options.length]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, place]);

  // Focus the list when it opens; keep the active option in view.
  useEffect(() => {
    if (open && pos) listRef.current?.focus({ preventScroll: true });
  }, [open, pos]);
  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(optId(active))?.scrollIntoView({ block: "nearest" });
    // optId is stable for this component instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  // Close on outside pointer.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (listRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  // Native validation (e.g. `required` with an empty placeholder): instead of
  // the browser bubble pointing at the hidden select, mark the trigger and open the menu.
  useEffect(() => {
    const el = nativeRef.current;
    if (!el) return;
    const onInvalid = (e: Event) => {
      e.preventDefault();
      setInvalid(true);
      triggerRef.current?.focus();
      openMenu();
    };
    el.addEventListener("invalid", onInvalid);
    return () => el.removeEventListener("invalid", onInvalid);
  });

  function enabledIndex(from: number, step: 1 | -1) {
    for (let i = from; i >= 0 && i < options.length; i += step) if (!options[i].disabled) return i;
    return -1;
  }

  function openMenu() {
    if (disabled) return;
    const idx = options.findIndex((o) => o.value === current && !o.disabled);
    setActive(idx >= 0 ? idx : enabledIndex(0, 1));
    setOpen(true);
  }

  function close(focusTrigger = true) {
    setOpen(false);
    setPos(null);
    if (focusTrigger) triggerRef.current?.focus();
  }

  function choose(i: number) {
    const opt = options[i];
    if (!opt || opt.disabled) return;
    close();
    setInvalid(false);
    if (opt.value === current) return;
    if (!controlled) setInner(opt.value);
    const el = nativeRef.current;
    if (el) {
      // Set the real select's value the way a user would, then fire a real
      // change event so React's onChange (auto-submit, setState...) runs with
      // e.currentTarget being this select inside its form.
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(el, opt.value);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function onTriggerKey(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      openMenu();
    }
  }

  function onListKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    const key = e.key;
    if (key === "Escape") {
      e.preventDefault();
      return close();
    }
    if (key === "Tab") {
      e.preventDefault();
      return close();
    }
    if (key === "Enter" || key === " ") {
      e.preventDefault();
      return choose(active);
    }
    let next = -1;
    if (key === "ArrowDown") next = enabledIndex(active + 1, 1);
    else if (key === "ArrowUp") next = enabledIndex(active - 1, -1);
    else if (key === "Home") next = enabledIndex(0, 1);
    else if (key === "End") next = enabledIndex(options.length - 1, -1);
    else if (key === "PageDown") next = enabledIndex(Math.min(options.length - 1, active + 8), -1);
    else if (key === "PageUp") next = enabledIndex(Math.max(0, active - 8), 1);
    else if (key.length === 1 && /\S/.test(key)) {
      const now = Date.now();
      const ta = typeahead.current;
      ta.text = now - ta.at > 600 ? key.toLowerCase() : ta.text + key.toLowerCase();
      ta.at = now;
      const order = [...options.keys()].map((k) => (k + Math.max(active, 0) + (ta.text.length === 1 ? 1 : 0)) % options.length);
      next = order.find((k) => !options[k].disabled && options[k].label.toLowerCase().startsWith(ta.text)) ?? -1;
    } else return;
    e.preventDefault();
    if (next >= 0) setActive(next);
  }

  const ownChevron = OWN_CHEVRON.test(className);
  const triggerClass = [
    className,
    "sa-select-trigger",
    ownChevron ? "" : "has-chevron",
    isPlaceholder ? "is-placeholder" : "",
    invalid ? "is-invalid" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className={triggerClass}
        style={style}
        disabled={disabled}
        autoFocus={autoFocus}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        data-invalid={invalid || undefined}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKey}
      >
        <span className="sa-select-inner">
          {options.map((o, i) => (
            <span key={i} className="sa-select-sizer" aria-hidden>
              {o.label}
            </span>
          ))}
          <span className="sa-select-value">{selected?.label ?? " "}</span>
        </span>
        {!ownChevron && (
          <svg className="sa-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        )}
      </button>

      <select
        {...nativeProps}
        ref={nativeRef}
        className="sa-select-native"
        value={current}
        disabled={disabled}
        data-label={ariaLabel}
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          if (!controlled) setInner(e.currentTarget.value);
          setInvalid(false);
          onChange?.(e);
        }}
      >
        {children}
      </select>

      {open &&
        pos &&
        createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={ariaLabel ?? selected?.label}
            aria-labelledby={ariaLabel ? undefined : id}
            aria-activedescendant={active >= 0 ? optId(active) : undefined}
            className="sa-dropdown"
            style={pos}
            onKeyDown={onListKey}
          >
            {options.map((o, i) => {
              const showGroup = o.group !== undefined && (i === 0 || options[i - 1].group !== o.group);
              // A disabled "" placeholder ("Choose a subject") is not a real choice - don't list it.
              if (o.disabled && o.value === "") return null;
              const isSel = o.value === current;
              return (
                <Fragment key={i}>
                  {showGroup && (
                    <div className="sa-dropdown-group" role="presentation">
                      {o.group}
                    </div>
                  )}
                  <div
                    id={optId(i)}
                    role="option"
                    aria-selected={isSel}
                    aria-disabled={o.disabled || undefined}
                    className={`sa-dropdown-option${isSel ? " is-selected" : ""}${i === active ? " is-active" : ""}${o.disabled ? " is-disabled" : ""}`}
                    onPointerEnter={() => !o.disabled && setActive(i)}
                    onClick={() => choose(i)}
                  >
                    <span className="sa-dropdown-label">{o.label}</span>
                    {isSel && (
                      <svg className="sa-dropdown-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="m5 12.5 4.5 4.5L19 7.5" />
                      </svg>
                    )}
                  </div>
                </Fragment>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
