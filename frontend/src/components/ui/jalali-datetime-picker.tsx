import type { ComponentType } from "react";
import DatePickerModule, { DateObject } from "react-multi-date-picker";
import TimePickerModule from "react-multi-date-picker/plugins/time_picker";
import persian from "react-date-object/calendars/persian";
import persianFa from "react-date-object/locales/persian_fa";
import { cn } from "@/lib/utils";

function unwrapComponent<T>(mod: T): T {
  if (mod && typeof mod === "object" && "default" in mod) {
    const inner = (mod as { default: T }).default;
    if (typeof inner === "function" || (inner && typeof inner === "object")) {
      return inner;
    }
  }
  return mod;
}

const DatePicker = unwrapComponent(DatePickerModule) as ComponentType<Record<string, unknown>>;
const TimePicker = unwrapComponent(TimePickerModule) as ComponentType<{ hideSeconds?: boolean }>;

interface JalaliDateTimePickerProps {
  id?: string;
  value: string;
  onChange: (iso: string) => void;
}

export function JalaliDateTimePicker({ id, value, onChange }: JalaliDateTimePickerProps) {
  const selected = value ? new DateObject({ date: new Date(value), calendar: persian, locale: persianFa }) : null;

  return (
    <DatePicker
      id={id}
      value={selected}
      onChange={(date: DateObject | DateObject[] | null) => {
        if (!date || Array.isArray(date)) {
          onChange("");
          return;
        }
        onChange(date.toDate().toISOString());
      }}
      calendar={persian}
      locale={persianFa}
      format="YYYY/MM/DD HH:mm"
      plugins={[<TimePicker key="time" hideSeconds />]}
      calendarPosition="bottom-right"
      portal
      containerClassName="w-full"
      inputClass={cn(
        "flex h-10 w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      )}
      placeholder="اختیاری — شمسی"
    />
  );
}
