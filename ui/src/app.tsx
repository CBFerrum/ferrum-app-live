// Live's own interface for people who are signed in: the broadcasts, a broadcast's control page for its presenter, the
// watch page, planning one, and the settings; Live's records (links, reports) in the records frame, its modules in the
// sidebar under the platform's bar.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Link, RouterProvider, useRouteError } from "react-router";
import { routeBase, shell, t, wordsReady } from "@ferrum/client";
import { ConfirmHost, PageLoading, StatePanel, Toaster } from "@ferrum/kit";
import { RequireAuth, setFrameMode } from "@ferrum/records/frame";
import { Home } from "./Home";

/** A page of the records frame, loaded when first opened. */
const page = (name: "FormView" | "ListView" | "ReportView" | "AppSettingsPage" | "ScreenPage") => () => import("./records").then((m) => ({ Component: m[name] }));

/** Live's packages: the sidebar shows their modules. */
const LIVE_PACKAGES = ["live"];

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 } },
});

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

const router = createBrowserRouter(
  [
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
        { path: "apps/:app/settings", lazy: page("AppSettingsPage") },
        { path: "x/:app/:page", lazy: page("ScreenPage") },
        { path: "*", element: <NotFound /> },
      ],
    },
  ],
  { basename: routeBase("live") },
);

// Drawn once the page's words are in (its language's catalogs, fetched as the page starts).
void wordsReady().then(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster />
        <ConfirmHost />
      </QueryClientProvider>
    </StrictMode>,
  ),
);
