import "server-only";
import { publicEnv } from "./public";
import { getServerEnv } from "./server";

export type IntegrationStatus = "configured" | "unconfigured";

export interface IntegrationStatusSummary {
  supabase: IntegrationStatus;
  ai: IntegrationStatus;
  whatsapp: IntegrationStatus;
}

// env.example/env.local ship with "<isi-...>" style placeholders instead of
// real values. A non-empty placeholder must NOT read as "configured".
function hasRealValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && !trimmed.startsWith("<");
}

// Foundation-stage check only: presence of credentials, not connectivity.
// None of these are called during scaffold — every integration is expected
// to read as "unconfigured" until a later phase wires it up.
export function getIntegrationStatus(): IntegrationStatusSummary {
  const server = getServerEnv();

  const supabaseConfigured =
    hasRealValue(publicEnv.NEXT_PUBLIC_SUPABASE_URL) &&
    hasRealValue(publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
    hasRealValue(server.SUPABASE_SERVICE_ROLE_KEY);

  const aiConfigured =
    hasRealValue(server.AI_PROVIDER) && hasRealValue(server.AI_API_KEY);

  const whatsappConfigured =
    hasRealValue(server.WHATSAPP_PROVIDER) &&
    server.WHATSAPP_PROVIDER !== "unconfigured";

  return {
    supabase: supabaseConfigured ? "configured" : "unconfigured",
    ai: aiConfigured ? "configured" : "unconfigured",
    whatsapp: whatsappConfigured ? "configured" : "unconfigured",
  };
}
