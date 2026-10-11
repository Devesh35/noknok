// The app's data layer. Views import from here and never from src/server or
// fetch directly. Reads are hooks over GET endpoints; writes are async
// functions that return a Result and refresh whatever is on screen.
export { useApi, invalidateAll, QueryProvider } from "@/lib/api/query";
export { ApiError, type ErrorCode, type Result } from "@/lib/errors";
export * from "@/api/session";
export * from "@/api/activities";
export * from "@/api/joins";
export * from "@/api/users";
export * from "@/api/social";
export * from "@/api/dev";
export { uploadImage } from "@/api/images";
export * from "@/api/geo";
export { payAndJoin, PaymentError } from "@/api/payments";
