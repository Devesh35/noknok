import { fail, handle } from "@/server/respond";

// Unknown API paths answer in JSON like every other API error, not with the
// app's HTML 404 page (the native shell and scripts parse these).
function notFound() {
  return handle(async () => fail("NOT_FOUND", "No such endpoint"));
}

export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE };
