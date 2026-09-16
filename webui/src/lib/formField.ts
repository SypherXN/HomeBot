/** Shared class for text, date, time, and select fields in sheets/modals. */
export const FORM_INPUT_CLASS =
  "box-border block min-h-11 min-w-0 w-full max-w-full hb-input px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

/** Wrap native date/time inputs so WebKit (iOS) cannot overflow the sheet width. */
export const DATE_FIELD_WRAP_CLASS = "mt-1 w-full min-w-0 max-w-full overflow-hidden";
