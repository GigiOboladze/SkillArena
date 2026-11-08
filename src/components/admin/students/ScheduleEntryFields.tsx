import { SCHEDULE_ICONS, SCHEDULE_TONES, WEEK_DAYS, DAY_LABELS } from "@/lib/schedule";
import { ScheduleIcon } from "@/components/student/ScheduleIcon";

type Values = {
  title: string;
  days: number[];
  startTime: string;
  endTime: string;
  room: string | null;
  tone: string;
  icon: string;
};

const EMPTY: Values = { title: "", days: [], startTime: "", endTime: "", room: "", tone: "violet", icon: "book" };

/**
 * Inputs for one weekly class (used by the "Add class" form and each row's
 * edit form on a student's Schedule tab). `idPrefix` keeps ids unique when
 * several copies render on one page.
 */
export function ScheduleEntryFields({ idPrefix, values = EMPTY }: { idPrefix: string; values?: Values }) {
  return (
    <div className="sa-schf">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sa-schf-field">
          <span>Class name</span>
          <input name="title" required maxLength={60} defaultValue={values.title} placeholder="e.g. HTML/CSS" className="sa-pf2-input" />
        </label>
        <label className="sa-schf-field">
          <span>Room / location</span>
          <input name="room" maxLength={60} defaultValue={values.room ?? ""} placeholder="e.g. N303 Auditory or Online" className="sa-pf2-input" />
        </label>
      </div>

      <fieldset className="sa-schf-field">
        <legend>Days</legend>
        <div className="flex flex-wrap gap-2">
          {WEEK_DAYS.map((d) => (
            <label key={d} className="sa-schf-pill">
              <input type="checkbox" name="days" value={d} defaultChecked={values.days.includes(d)} />
              {DAY_LABELS[d]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <label className="sa-schf-field">
          <span>Starts</span>
          <input type="time" name="startTime" required defaultValue={values.startTime} className="sa-pf2-input" />
        </label>
        <label className="sa-schf-field">
          <span>Ends</span>
          <input type="time" name="endTime" required defaultValue={values.endTime} className="sa-pf2-input" />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset className="sa-schf-field">
          <legend>Colour</legend>
          <div className="flex flex-wrap gap-2">
            {SCHEDULE_TONES.map((t) => (
              <label key={t} className={`sa-schf-swatch is-${t}`} title={t}>
                <input type="radio" name="tone" value={t} defaultChecked={values.tone === t} aria-label={t} id={`${idPrefix}-tone-${t}`} />
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="sa-schf-field">
          <legend>Icon</legend>
          <div className="flex flex-wrap gap-2">
            {SCHEDULE_ICONS.map((i) => (
              <label key={i.key} className="sa-schf-icon" title={i.label}>
                <input type="radio" name="icon" value={i.key} defaultChecked={values.icon === i.key} aria-label={i.label} />
                <ScheduleIcon icon={i.key} className="h-5 w-5" />
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </div>
  );
}
