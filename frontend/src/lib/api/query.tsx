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
import { apiFetch, withQuery } from "@/lib/api/client";
import type { ApiError } from "@/lib/errors";

let client: QueryClient | null = null;

function getClient(): QueryClient {
  client ??= new QueryClient({
    defaultOptions: {
      queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: true },
    },
  });
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
