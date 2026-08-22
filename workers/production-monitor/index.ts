interface Env {
  HEALTH_URL: string;
  PROVIDERS_URL: string;
}

type Check = { name: string; url: string; expect: (response: Response) => Promise<boolean> };

const productionMonitor = {
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const checks: Check[] = [
      { name: "health", url: env.HEALTH_URL, expect: async (response) => response.ok && (await response.json() as { status?: string }).status === "ok" },
      { name: "providers", url: env.PROVIDERS_URL, expect: async (response) => response.ok && (await response.text()).includes("Qivaya") },
    ];
    const results = await Promise.all(checks.map(async (check) => {
      const startedAt = Date.now();
      try {
        const response = await fetch(check.url, { headers: { "User-Agent": "Qivaya-Production-Monitor/1.0" } });
        return { name: check.name, ok: await check.expect(response.clone()), status: response.status, durationMs: Date.now() - startedAt };
      } catch {
        return { name: check.name, ok: false, status: 0, durationMs: Date.now() - startedAt };
      }
    }));
    const failed = results.filter((result) => !result.ok);
    console.log(JSON.stringify({ event: "qivaya.production_monitor", status: failed.length ? "failed" : "ok", checks: results }));
    if (failed.length) throw new Error(`production_monitor_failed:${failed.map((item) => item.name).join(",")}`);
  },
};

export default productionMonitor;
