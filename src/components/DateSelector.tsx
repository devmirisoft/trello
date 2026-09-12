"use client";

import { todayLocalISODate, tomorrowLocalISODate, formatFriendly } from "@/lib/dates";

type Props = {
  value: string;
  onChange: (localISODate: string) => void;
};

export default function DateSelector({ value, onChange }: Props) {
  const today = todayLocalISODate();
  const tomorrow = tomorrowLocalISODate();
  const isCustom = value !== today && value !== tomorrow;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Due date for these tasks</p>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => onChange(today)}
          className={`rounded-full px-4 py-2 text-sm border ${
            value === today ? "bg-black text-white border-black" : ""
          }`}
        >
          Today
        </button>
        <button
          onClick={() => onChange(tomorrow)}
          className={`rounded-full px-4 py-2 text-sm border ${
            value === tomorrow ? "bg-black text-white border-black" : ""
          }`}
        >
          Tomorrow
        </button>
        <label
          className={`rounded-full px-4 py-2 text-sm border cursor-pointer ${
            isCustom ? "bg-black text-white border-black" : ""
          }`}
        >
          {isCustom ? formatFriendly(value) : "Pick a date"}
          <input
            type="date"
            className="sr-only"
            value={isCustom ? value : ""}
            onChange={(e) => e.target.value && onChange(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
