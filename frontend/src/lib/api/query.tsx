"use client";

// Data fetching for client components: TanStack Query over apiFetch. After a
// mutation, invalidateAll() refetches whatever is on screen, which keeps the
// "everything updates after an action" feel of the old local database.
import {
  keepPreviousData,
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { apiFetch, setLoggedOutHandler, withQuery } from "@/lib/api/client";
import { ERROR_STATUS, type ApiError } from "@/lib/errors";

let client: QueryClient | null = null;

function getClient(): QueryClient {
  if (client) return client;
  client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        refetchOnWindowFocus: true,
        // One more try for a flaky server answer (5xx); none for a dead
        // connection or a hung request (that already waited the client
        // timeout), and none for a 4xx, which won't change on a retry and
        // would only hold the skeleton on screen longer.
        retry: (failures, error) => {
          const status = ERROR_STATUS[(error as ApiError).code] ?? 500;
          return failures < 1 && status >= 500;
        },
      },
    },
  });
  // The session expired under an open tab: refetch /me so the shell flips to
  // logged out instead of every minute's refresh failing quietly.
  setLoggedOutHandler(() => void client?.invalidateQueries({ queryKey: ["api", "/me"] }));
  return client;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(getClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export function invalidateAll() {
  return getClient().invalidateQueries();
}

type Query = Record<string, string | number | boolean | undefined | null>;

// GET an API path. The path (with its query string) is the cache key.
// keepPrevious shows the last result while a changed query loads (lists
// with filters), instead of flashing a skeleton.
export function useApi<T>(
  path: string | null,
  query?: Query,
  options: { enabled?: boolean; keepPrevious?: boolean } = {},
): UseQueryResult<T, ApiError> {
  const key = path ? withQuery(path, query) : "";
  return useQuery<T, ApiError>({
    queryKey: ["api", key],
    queryFn: () => apiFetch<T>(key),
    enabled: path !== null && options.enabled !== false,
    placeholderData: options.keepPrevious ? keepPreviousData : undefined,
  });
}

export function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries();
}
