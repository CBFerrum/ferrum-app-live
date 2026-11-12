import { useEffect, useState, useSyncExternalStore } from "react";
import { beaconRoute, callRoute } from "./data";
import { type Role, Session, type SessionState } from "./session";

/** One session for the page's life: asks at once (`auto`, a viewer) or when told (a presenter), gives the seat up when the page goes away. */
export function useSession(role: Role, id: string, auto: boolean): { session: Session; state: SessionState } {
  const [session] = useState(() => new Session(role, callRoute(id), undefined, beaconRoute(id)));
  const state = useSyncExternalStore(session.subscribe, () => session.state);
  useEffect(() => {
    session.open();
    if (auto) void session.start();
    const hide = () => session.pageHide();
    window.addEventListener("pagehide", hide);
    return () => {
      window.removeEventListener("pagehide", hide);
      void session.leave();
    };
  }, [session, auto]);
  return { session, state };
}

/** The time, asked again every `every` ms while `on`: for words such as "trying again in 8 seconds". */
export function useNow(every: number, on = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(tick);
  }, [every, on]);
  return now;
}
