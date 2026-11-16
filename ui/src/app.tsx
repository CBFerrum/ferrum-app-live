// Live's own interface for people who are signed in: the broadcasts, a broadcast's control page for its presenter, the
// watch page, planning one, and the settings; Live's records (links, reports) in the records frame, its modules in the
// sidebar under the platform's bar.

import { useEffect } from "react";
import { Link, useRouteError } from "react-router";
import { shell, t } from "@ferrum/client";
import { PageLoading, StatePanel } from "@ferrum/kit";
import { mountApp, RequireAuth, setFrameMode } from "@ferrum/records/frame";
import { Home } from "./Home";

/** A page of the records frame, loaded when first opened. */
const page = (name: "FormView" | "ListView" | "ReportView") => () => import("./records").then((m) => ({ Component: m[name] }));

/** Live's packages: the sidebar shows their modules. */
const LIVE_PACKAGES = ["live"];

function RouteError() {
  return <StatePanel kind="failed" error={useRouteError()} onRetry={() => window.location.reload()} />;
}

function NotFound() {
  return <StatePanel kind="empty" title={t("Page not found")} action={<Link to="/">{t("Go to your broadcasts")}</Link>} />;
}

/** Every page tells the shell it started. */
function Started() {
  useEffect(() => shell().ready(), []);
  return null;
}

setFrameMode("app", LIVE_PACKAGES);

mountApp({
  route: "live",
  routes: [
    {
      path: "/",
      element: (
        <>
          <Started />
          <RequireAuth />
        </>
      ),
      errorElement: <RouteError />,
      HydrateFallback: PageLoading,
      children: [
        { index: true, element: <Home /> },
        { path: "new", lazy: () => import("./New").then((m) => ({ Component: m.NewBroadcast })) },
        { path: "b/:id", lazy: () => import("./Control").then((m) => ({ Component: m.ControlRoute })) },
        { path: "watch/:id", lazy: () => import("./Watch").then((m) => ({ Component: m.WatchRoute })) },
        { path: "settings", lazy: () => import("./Settings").then((m) => ({ Component: m.Settings })) },
        { path: "e/:entity", lazy: page("ListView") },
        { path: "e/:entity/:id", lazy: page("FormView") },
        { path: "r/:name", lazy: page("ReportView") },
        { path: "*", element: <NotFound /> },
      ],
    },
  ],
});
