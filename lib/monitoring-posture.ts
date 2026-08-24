export type MonitoringRuntimeEnvironment = Record<string, string | undefined>;

/**
 * First-party instrumentation is registered in the root layout. Runtime
 * availability is derived only from Vercel's non-secret system variables.
 */
export function getMonitoringRuntimePosture(env: MonitoringRuntimeEnvironment = process.env) {
  const onVercel = env.VERCEL === "1";
  const productionEnvironment = onVercel && env.VERCEL_ENV === "production";

  return {
    platform: "vercel_first_party" as const,
    productionEnvironment,
    runtimeLogsAvailable: productionEnvironment,
    webAnalyticsConfigured: true,
    speedInsightsConfigured: true,
    securityAlertRoute: "durable_in_app" as const,
    externalTelemetryExportEnabled: false,
    dataClassification: "synthetic_only" as const,
  };
}
