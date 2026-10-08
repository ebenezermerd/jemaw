import { initializeApp, getApps, cert } from "firebase-admin/app";
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
 * Real Firebase verifier. Checking an ID token only needs the project id and
 * Google's public signing keys, so no credential is required off Google Cloud.
 * GOOGLE_APPLICATION_CREDENTIALS may still point at a service-account key.
 */
export function createFirebaseVerifier(projectId: string): TokenVerifier {
  if (getApps().length === 0) {
    const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    initializeApp(keyFile ? { credential: cert(keyFile), projectId } : { projectId });
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
