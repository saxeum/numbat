import { isRouteErrorResponse, Link, useRouteError } from "react-router";

import { ErrorFallback } from "@/components/error-fallback";
import { Button } from "@/components/ui/button";

export function RouteError() {
  const error = useRouteError();

  const title = isRouteErrorResponse(error)
    ? `${error.status}`
    : "Something went wrong";
  const message = isRouteErrorResponse(error)
    ? error.statusText || "The page could not be loaded."
    : error instanceof Error
      ? error.message
      : "An unexpected error occurred.";

  return (
    <ErrorFallback title={title} message={message}>
      <Button asChild>
        <Link to="/">Back home</Link>
      </Button>
    </ErrorFallback>
  );
}
