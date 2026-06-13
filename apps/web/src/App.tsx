import { useEffect, useState } from "react";
import { DemoPage } from "./pages/DemoPage";
import { LandingPage } from "./pages/LandingPage";

type Route = "landing" | "demo";

function routeFromHash(): Route {
  return window.location.hash === "#/demo" ? "demo" : "landing";
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function goDemo() {
    window.location.hash = "#/demo";
    setRoute("demo");
  }

  function goHome() {
    window.location.hash = "#/";
    setRoute("landing");
  }

  return route === "demo" ? <DemoPage goHome={goHome} /> : <LandingPage onDemo={goDemo} />;
}
