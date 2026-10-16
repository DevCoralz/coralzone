import { useState } from "react";
import { Cloud } from "lucide-react";

const announcements = [
  "CoralzOne Cloud · Storage, API keys and usage in one place",
  "Storage plans · Starter, Pro and Scale now open",
  "API keys & docs · Generate yours in the Cloud area",
];

export function CloudAnnouncements() {
  const [paused, setPaused] = useState(false);
  return (
    <section
      aria-label="Cloud announcements"
      className={`announcement-band flex h-12 shrink-0 items-center gap-3 px-4 sm:px-6 ${paused ? "announcement-paused" : ""}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex shrink-0 items-center gap-2 text-xs text-foreground">
        <Cloud size={16} />
        <span className="hidden sm:inline">Cloud updates</span>
      </div>
      <div className="announcement-track flex min-w-full shrink-0 items-center gap-12 text-xs text-muted-foreground" aria-hidden="true">
        {announcements.concat(announcements).map((item, index) => (
          <span key={index} className="whitespace-nowrap">{item}</span>
        ))}
      </div>
    </section>
  );
}
