/**
 * Hobbies are stored in User.hobby as one comma-separated string
 * ("Gaming, Music, Football"), so the admin side (one text field) and the
 * student's own profile (chips with add/remove) edit the same value.
 * No server-only imports - safe in client components.
 */

export const MAX_HOBBIES = 8;
export const MAX_HOBBY_LENGTH = 24;

export const HOBBY_SUGGESTIONS = ["Gaming", "Music", "Football", "Travel", "Reading", "Drawing", "Coding", "Basketball", "Movies", "Photography"];

/** Split, trim, drop empties and case-insensitive duplicates, cap length and count. */
export function parseHobbies(value: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of String(value ?? "").split(",")) {
    const h = raw.trim().replace(/\s+/g, " ").slice(0, MAX_HOBBY_LENGTH).trim();
    const key = h.toLowerCase();
    if (!h || seen.has(key)) continue;
    seen.add(key);
    out.push(h);
    if (out.length >= MAX_HOBBIES) break;
  }
  return out;
}

export function serializeHobbies(hobbies: string[]): string | null {
  const clean = parseHobbies(hobbies.join(","));
  return clean.length ? clean.join(", ") : null;
}

export type HobbyIcon = "gamepad" | "music" | "ball" | "plane" | "book" | "palette" | "code" | "dumbbell" | "film" | "camera" | "basketball" | "star";

const KEYWORDS: [RegExp, HobbyIcon][] = [
  [/gam|video ?game|esport|playstation|xbox|თამაშ/i, "gamepad"],
  [/music|guitar|piano|sing|song|drum|მუსიკ/i, "music"],
  [/basket/i, "basketball"],
  [/foot|soccer|ფეხბურთ/i, "ball"],
  [/travel|trip|hik|მოგზაურ/i, "plane"],
  [/read|book|წიგნ|კითხვ/i, "book"],
  [/draw|paint|art|design|ხატ/i, "palette"],
  [/cod|program|develop|tech/i, "code"],
  [/gym|fitness|sport|run|box|swim|ტენის|tennis|volley|სპორტ/i, "dumbbell"],
  [/movie|film|cinema|series|anime|ფილმ/i, "film"],
  [/photo|camera|ფოტო/i, "camera"],
];

export function hobbyIcon(hobby: string): HobbyIcon {
  return KEYWORDS.find(([re]) => re.test(hobby))?.[1] ?? "star";
}
