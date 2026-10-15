import { useEffect, useState } from "react";
import { Eye, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Counts = { online: number; visitors: number; users: number };

export function SiteActivity() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let active = true;
    let visitorId = crypto.randomUUID();
    try {
      const saved = localStorage.getItem("coralzOne.visitor");
      if (saved && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(saved)) visitorId = saved as `${string}-${string}-${string}-${string}-${string}`;
      else localStorage.setItem("coralzOne.visitor", visitorId);
    } catch { /* Restricted storage: count this browsing session only. */ }
    async function heartbeat() {
      if (document.visibilityState === "hidden") return;
      try {
        const { data, error } = await supabase.rpc("touch_site_visitor", { p_visitor_id: visitorId });
        if (!active) return;
        if (error || !data?.[0]) { setAvailable(false); return; }
        setCounts(data[0]);
        setAvailable(true);
      } catch { if (active) setAvailable(false); }
    }
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 30000);
    const onVisible = () => { if (document.visibilityState === "visible") void heartbeat(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  const value = (key: keyof Counts) => available && counts ? counts[key].toLocaleString() : "—";
  return (
    <div className="mt-8 grid grid-cols-3 divide-x divide-foreground/15 border-t border-foreground/15 pt-5 text-center" aria-label="Community activity" title={available ? "Visitors are unique browsers; online means active in the last 90 seconds." : "Live counts are temporarily unavailable"}>
      <div className="min-w-0 px-1">
        <div className="flex h-7 items-center justify-center gap-2"><span className={`h-2 w-2 rounded-full ${available && counts ? "bg-online shadow-sm" : "bg-muted-foreground"}`} /><span className="text-lg tabular-nums">{value("online")}</span></div>
        <p className="mt-1 text-[11px] text-muted-foreground">Online now</p>
      </div>
      <div className="min-w-0 px-1"><div className="flex h-7 items-center justify-center gap-2"><Eye size={14} className="text-muted-foreground" /><span className="text-lg tabular-nums">{value("visitors")}</span></div><p className="mt-1 text-[11px] text-muted-foreground">Total visitors</p></div>
      <div className="min-w-0 px-1"><div className="flex h-7 items-center justify-center gap-2"><Users size={14} className="text-muted-foreground" /><span className="text-lg tabular-nums">{value("users")}</span></div><p className="mt-1 text-[11px] text-muted-foreground">Total users</p></div>
    </div>
  );
}