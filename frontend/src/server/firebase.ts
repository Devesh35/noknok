import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { config } from "@/server/config";
import { fail } from "@/server/respond";

// The only importer of firebase-admin (AGENTS-B rule 1). Firebase is used for
// one thing: proving a phone number at login (PLATFORM_PLAN P1). With no
// service account outside production, it talks to the Auth emulator, which
// config.ts points the SDK at.
const APP_NAME = "noknok";

function app(): App {
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) return existing;
  const { serviceAccountJson, projectId, useEmulator } = config.firebase;
  if (serviceAccountJson) {
    const account = JSON.parse(Buffer.from(serviceAccountJson, "base64").toString("utf8")) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
    return initializeApp(
      {
        credential: cert({
          projectId: account.project_id,
          clientEmail: account.client_email,
          privateKey: account.private_key,
        }),
        projectId: projectId ?? account.project_id,
      },
      APP_NAME,
    );
  }
  if (useEmulator && projectId) return initializeApp({ projectId }, APP_NAME);
  fail("NOT_CONFIGURED", "Phone login is not configured");
}

export function adminAuth(): Auth {
  return getAuth(app());
}

// Frees the number in Firebase so it can sign up fresh. Best effort: the
// account is already gone on our side, and a stale Firebase user is harmless.
export async function deleteFirebaseUser(uid: string | undefined): Promise<void> {
  if (!uid) return;
  try {
    await adminAuth().deleteUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") return;
    console.error("Deleting the Firebase user failed", (error as Error).message);
  }
}
