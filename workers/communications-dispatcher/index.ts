type DispatcherEnv = Env & {
  // Wrangler cannot infer secrets that are intentionally absent from config.
  CRON_SECRET: string;
};

async function dispatch(env: DispatcherEnv, cron: string) {
  const response = await fetch(env.DISPATCH_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.CRON_SECRET}`,
      "User-Agent": "Qivaya-Communications-Dispatcher/1.0",
    },
    signal: AbortSignal.timeout(45_000),
  });

  if (response.status === 404) {
    console.log(JSON.stringify({ event: "communications.dispatch_skipped", reason: "delivery_disabled", cron }));
    return;
  }

  if (!response.ok) {
    console.error(JSON.stringify({ event: "communications.dispatch_failed", status: response.status, cron }));
    throw new Error("communications_dispatch_failed");
  }

  console.log(JSON.stringify({ event: "communications.dispatch_completed", status: response.status, cron }));
}

export default {
  scheduled(controller, env, ctx) {
    ctx.waitUntil(dispatch(env, controller.cron));
  },
} satisfies ExportedHandler<DispatcherEnv>;
