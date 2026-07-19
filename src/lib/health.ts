import "server-only";
import { publicEnv } from "@/lib/env/public";
import { getServerEnv } from "@/lib/env/server";
import { getIntegrationStatus } from "@/lib/env/status";

export interface HealthPayload {
  status: "ok";
  application: string;
  APP_ENV: string;
  timestamp: string;
  integrations: ReturnType<typeof getIntegrationStatus>;
}

// Foundation-stage health check. Deliberately excludes URLs, keys, tokens,
// and secrets — only configured/unconfigured status is exposed.
export function buildHealthPayload(): HealthPayload {
  const server = getServerEnv();

  return {
    status: "ok",
    application: publicEnv.NEXT_PUBLIC_APP_NAME,
    APP_ENV: server.APP_ENV,
    timestamp: new Date().toISOString(),
    integrations: getIntegrationStatus(),
  };
}
