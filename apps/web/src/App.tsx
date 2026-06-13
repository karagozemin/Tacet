import { useEffect, useRef, useState } from "react";
import { LOGO_SRC } from "./config/chain";
import { DemoPage } from "./pages/DemoPage";
import { LandingPage } from "./pages/LandingPage";

type Route = "landing" | "demo";
type Transition = "idle" | "sealing" | "revealing";

function routeFromHash(): Route {
  return window.location.hash === "#/demo" ? "demo" : "landing";
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [transition, setTransition] = useState<Transition>("idle");
  const transitionTimers = useRef<number[]>([]);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("hashchange", onHash);
      transitionTimers.current.forEach(window.clearTimeout);
    };
  }, []);

  function goDemo() {
    if (transition !== "idle") return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.location.hash = "#/demo";
      setRoute("demo");
      return;
    }

    setTransition("sealing");
    transitionTimers.current = [
      window.setTimeout(() => {
        window.location.hash = "#/demo";
        setRoute("demo");
        setTransition("revealing");
        window.scrollTo({ top: 0, behavior: "instant" });
      }, 680),
      window.setTimeout(() => setTransition("idle"), 1520),
    ];
  }

  function goHome() {
    window.location.hash = "#/";
    setRoute("landing");
  }

  return (
    <>
      <div className={`route-frame route-${route} transition-${transition}`}>
        {route === "demo" ? <DemoPage goHome={goHome} /> : <LandingPage onDemo={goDemo} />}
      </div>

      {transition !== "idle" ? (
        <div className={`protocol-transition ${transition}`} aria-hidden="true">
          <div className="transition-panel transition-panel-left" />
          <div className="transition-panel transition-panel-right" />
          <div className="transition-cue">
            <i className="transition-ring ring-outer" />
            <i className="transition-ring ring-inner" />
            <div className="transition-logo">
              <img src={LOGO_SRC} alt="" />
            </div>
          </div>
          <div className="transition-copy">
            <span>{transition === "sealing" ? "Sealing entry" : "Cue received"}</span>
            <strong>{transition === "sealing" ? "Entering in silence" : "Protocol is live"}</strong>
          </div>
          <div className="transition-progress"><span /></div>
        </div>
      ) : null}
    </>
  );
}
