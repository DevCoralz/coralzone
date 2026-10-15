import { useState } from "react";
import { Clapperboard, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

const announcements = ["Movie streaming · Coming soon to CoralzOne", "New releases · Announcements coming soon", "Your next movie night starts here"];

export function MovieAnnouncements() {
  const [paused, setPaused] = useState(false);
  return (
    <section aria-label="Movie announcements" className={`announcement-band flex h-12 shrink-0 items-center gap-3 px-4 sm:px-6 ${paused ? "announcement-paused" : ""}`}>
      <div className="flex shrink-0 items-center gap-2 text-xs text-foreground"><Clapperboard size={16} /><span className="hidden sm:inline">Movie updates</span></div>
      <div className="announcement-window flex-1 text-xs text-muted-foreground">
        <div className="announcement-track">
          {[0, 1].map((copy) => <div key={copy} className="announcement-copy" aria-hidden={copy === 1 ? true : undefined}>{announcements.map((text) => <span key={text} className="inline-flex items-center gap-3"><span className="h-1 w-1 rounded-full bg-primary-glow" />{text}</span>)}</div>)}
        </div>
      </div>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-full text-foreground" aria-label={paused ? "Resume announcements" : "Pause announcements"} title={paused ? "Resume announcements" : "Pause announcements"} onClick={() => setPaused(!paused)}>{paused ? <Play size={13} /> : <Pause size={13} />}</Button>
    </section>
  );
}