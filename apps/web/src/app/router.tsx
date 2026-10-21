import { createBrowserRouter, Navigate } from "react-router";

import { GatewayLayout } from "@/routes/gateway";
import { GatewayChatPage } from "@/routes/gateway-chat";
import { GatewayCredentialsPage } from "@/routes/gateway-credentials";
import { GatewayTokensPage } from "@/routes/gateway-tokens";
import { GuidePage } from "@/routes/guide";
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
    path: "/guide",
    element: <GuidePage />,
    errorElement: <RouteError />,
  },
  {
    path: "/gateway",
    element: <GatewayLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="chat" replace /> },
      { path: "chat/:conversationId?", element: <GatewayChatPage /> },
      { path: "credentials", element: <GatewayCredentialsPage /> },
      { path: "tokens", element: <GatewayTokensPage /> },
    ],
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
  ...devRoutes,
]);
