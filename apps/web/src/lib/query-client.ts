import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

// TODO(observability): forward query/mutation errors to an error tracker
// (Sentry) — see docs/production-readiness-plan.md P1.4.
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      console.error("Query error", error);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      console.error("Mutation error", error);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
