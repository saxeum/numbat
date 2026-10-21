import { createBrowserRouter } from "react-router";

import { GatewayPage } from "@/routes/gateway";
import { HomePage } from "@/routes/home";
import { NotFoundPage } from "@/routes/not-found";
import { RouteError } from "@/routes/route-error";

// Dev-only route that throws, so the error boundary is exercised end-to-end
// (see tests/e2e). Tree-shaken out of production builds.
const devRoutes = import.meta.env.DEV
  ? [
      {
        path: "/__error",
        element: <div />,
        loader: () => {
          throw new Error("E2E error boundary test");
        },
        errorElement: <RouteError />,
      },
    ]
  : [];

export const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />,
    errorElement: <RouteError />,
  },
  {
    path: "/gateway",
    element: <GatewayPage />,
    errorElement: <RouteError />,
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
  ...devRoutes,
]);
