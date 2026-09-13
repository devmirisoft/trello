"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatFriendly, fromLocalISODate, toLocalISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Props = {
  /** yyyy-mm-dd in the browser's local timezone. */
  value: string;
  onChange: (localISODate: string) => void;
  /** The trigger's accessible name. Needed wherever more than one of these
   * is on screen — the date alone does not say which card it belongs to. */
  label?: string;
  className?: string;
};

export default function DatePicker({
  value,
  onChange,
  label,
  className,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="lg"
            aria-label={label}
            className={cn("w-full justify-start", className)}
          >
            <CalendarIcon data-icon="inline-start" />
            {formatFriendly(value)}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          required
          autoFocus
          selected={fromLocalISODate(value)}
          defaultMonth={fromLocalISODate(value)}
          onSelect={(date) => {
            if (date) onChange(toLocalISODate(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
