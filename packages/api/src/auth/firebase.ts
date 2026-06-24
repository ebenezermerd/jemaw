import { initializeApp, getApps, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

/** The verified identity extracted from a Firebase ID token. */
export interface VerifiedToken {
  uid: string;
  email: string | null;
}

/** Verifies a bearer token and returns the identity, or null if invalid. */
export interface TokenVerifier {
  verify(idToken: string): Promise<VerifiedToken | null>;
}

/**
 * Real Firebase verifier. On Cloud Run, Application Default Credentials are
 * present, so no key file is needed; locally, GOOGLE_APPLICATION_CREDENTIALS
 * may point at a service-account key. The project id is always set explicitly.
 */
export function createFirebaseVerifier(projectId: string): TokenVerifier {
  if (getApps().length === 0) {
    const credential =
      process.env.GOOGLE_APPLICATION_CREDENTIALS
        ? cert(process.env.GOOGLE_APPLICATION_CREDENTIALS)
        : applicationDefault();
    initializeApp({ credential, projectId });
  }
  const auth = getAuth();
  return {
    async verify(idToken: string): Promise<VerifiedToken | null> {
      try {
        const decoded = await auth.verifyIdToken(idToken);
        return { uid: decoded.uid, email: decoded.email ?? null };
      } catch {
        return null;
      }
    },
  };
}
