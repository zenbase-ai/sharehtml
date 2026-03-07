import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";

const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[39m`;

process.on("SIGINT", () => {
  process.stdout.write("\n");
  process.exit(1);
});

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`  ${question} `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function promptSecret(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const origWrite = rl["_writeToOutput" as keyof typeof rl] as (s: string) => void;
  (rl as any)._writeToOutput = (s: string) => {
    if (s.includes(question)) {
      origWrite.call(rl, s);
    } else {
      origWrite.call(rl, s.replace(/[^\r\n]/g, "*"));
    }
  };
  return new Promise((resolve) => {
    rl.question(`  ${question} `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = await prompt(`${question} ${dim(`(${hint})`)}`);
  if (answer === "") return defaultYes;
  return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
}

function run(cmd: string, args: string[], opts?: { input?: string; cwd?: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, {
      encoding: "utf-8",
      cwd: opts?.cwd,
      maxBuffer: 10 * 1024 * 1024,
    }, (err, stdout) => {
      if (err && !stdout) return reject(err);
      resolve(stdout.trim());
    });
    if (opts?.input) {
      child.stdin!.write(opts.input);
      child.stdin!.end();
    }
  });
}

function spinner(message: string, gap = false): { stop: (final?: string) => void } {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const prefix = gap ? "\n" : "";
  process.stdout.write(`${prefix}  ${dim(frames[i++ % frames.length])} ${message}`);
  const id = setInterval(() => {
    process.stdout.write(`\r  ${dim(frames[i++ % frames.length])} ${message}`);
  }, 80);
  return {
    stop(final?: string) {
      clearInterval(id);
      process.stdout.write(`\r  ${final ?? message}${" ".repeat(20)}\n`);
    },
  };
}

async function cfApi(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<any> {
  const resp = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await resp.json();
  if (!json.success) {
    const msgs = json.errors?.map((e: any) => e.message).join(", ") || "Unknown error";
    throw new Error(msgs);
  }
  return json.result;
}

function openUrl(url: string) {
  try {
    const cmd = process.platform === "darwin" ? "open" : "xdg-open";
    execFileSync(cmd, [url], { stdio: "ignore" });
  } catch {}
}

function findWranglerConfig(): string {
  for (const name of ["wrangler.jsonc", "wrangler.json", "wrangler.toml"]) {
    const p = resolve(import.meta.dirname, "..", name);
    if (existsSync(p)) return p;
  }
  fail("No wrangler config found. Expected wrangler.jsonc, wrangler.json, or wrangler.toml in apps/worker/");
}

function parseWranglerConfig(path: string): { name: string } {
  const raw = readFileSync(path, "utf-8");
  if (path.endsWith(".toml")) {
    const match = raw.match(/^name\s*=\s*"(.+)"/m);
    if (!match) fail("Could not parse worker name from wrangler.toml");
    return { name: match[1] };
  }
  const cleaned = raw
    .replace(/"(?:[^"\\]|\\.)*"/g, (m) => m.replace(/\/\//g, "\0\0"))
    .replace(/\/\/.*$/gm, "")
    .replace(/\0\0/g, "//")
    .replace(/,\s*([\]}])/g, "$1");
  return JSON.parse(cleaned);
}

type SelectOption = { label: string; value: string; selected: boolean };

function multiSelect(title: string, options: SelectOption[]): Promise<SelectOption[]> {
  return new Promise((resolve) => {
    let cursor = 0;
    let rendered = false;
    const { stdin, stdout } = process;

    function render() {
      if (rendered) stdout.write(`\x1b[${options.length}A`);
      rendered = true;
      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const pointer = i === cursor ? ">" : " ";
        const check = opt.selected ? "[x]" : "[ ]";
        const line = `  ${pointer} ${check} ${opt.label}`;
        stdout.write(`\r\x1b[K${i === cursor ? bold(line) : line}\n`);
      }
    }

    console.log(`  ${title}`);
    console.log(`  ${dim("↑↓ navigate · space toggle · enter confirm")}`);
    console.log();
    render();

    if (!stdin.isTTY) {
      resolve(options.filter((o) => o.selected));
      return;
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf-8");

    function cleanup() {
      stdin.setRawMode(false);
      stdin.removeListener("data", onData);
      stdin.pause();
    }

    function onData(key: string) {
      if (key === "\x03") { // Ctrl+C
        cleanup();
        process.stdout.write("\n");
        process.exit(1);
      }
      if (key === "\r" || key === "\n") { // Enter
        cleanup();
        resolve(options.filter((o) => o.selected));
        return;
      }
      if (key === " ") { // Space
        options[cursor].selected = !options[cursor].selected;
        render();
        return;
      }
      if (key === "\x1b[A" || key === "k") { // Up
        cursor = (cursor - 1 + options.length) % options.length;
        render();
        return;
      }
      if (key === "\x1b[B" || key === "j") { // Down
        cursor = (cursor + 1) % options.length;
        render();
        return;
      }
    }

    stdin.on("data", onData);
  });
}

function fail(message: string): never {
  console.error(`\n  ${message}`);
  process.exit(1);
}

async function main() {
  console.log();
  console.log(`  ${bold("sharehtml")} setup`);
  console.log(`  ${dim("Deploy your worker, configure Cloudflare Access, and set secrets.")}`);
  console.log();

  // Detect wrangler CLI auth
  let s: ReturnType<typeof spinner>;
  s = spinner("Detecting wrangler configuration...");
  let wranglerAccount: { name: string; id: string } | undefined;
  let wranglerEmail: string | undefined;
  let whoamiOutput = "";
  try {
    whoamiOutput = await run("npx", ["wrangler", "whoami"]);
  } catch (e: any) {
    whoamiOutput = e.stdout?.toString?.() ?? e.output?.[1]?.toString?.() ?? "";
  }
  const accountMatch = whoamiOutput.match(/[│|]\s+(.+?)\s+[│|]\s+([a-f0-9]{32})\s+[│|]/);
  if (accountMatch) wranglerAccount = { name: accountMatch[1], id: accountMatch[2] };
  const emailMatch = whoamiOutput.match(/associated with the email (\S+@\S+\.\S+?)\.?\s/);
  if (emailMatch) wranglerEmail = emailMatch[1];

  if (!wranglerAccount) {
    s.stop();
    console.log();
    fail("Could not detect a Cloudflare account. Run `npx wrangler login` and try again.");
  }

  // Detect project config
  const configPath = findWranglerConfig();
  const config = parseWranglerConfig(configPath);
  s.stop();

  console.log(`  ${dim("worker")}    ${bold(config.name)}`);
  console.log(`  ${dim("account")}   ${wranglerAccount.name} ${dim(`(${wranglerAccount.id})`)}`)
  console.log();

  if (!(await confirm("Deploy to Cloudflare?"))) {
    process.exit(0);
  }

  // Deploy
  s = spinner("Deploying worker...", true);
  let workerUrl: string;
  let hostname: string;
  try {
    await run("npx", ["vite", "build"]);
    const output = await run("npx", ["wrangler", "deploy"]);
    const urlMatch = output.match(/https:\/\/[\w.-]+\.workers\.dev/);
    if (!urlMatch) throw new Error("Could not parse worker URL from deploy output");
    workerUrl = urlMatch[0];
    hostname = new URL(workerUrl).hostname;
    s.stop(`Deployed ${cyan(workerUrl)}`);
  } catch (e: any) {
    s.stop();
    fail(`Deploy failed: ${e.message}`);
  }

  // Cloudflare Access
  console.log();
  const useAccess = await confirm("Require authentication with Cloudflare Access?");

  if (useAccess) {
    console.log();
    const apiTokenUrl = "https://dash.cloudflare.com/profile/api-tokens";
    console.log(`  Create an API token with these permissions:`);
    console.log(`    ${dim("-")} Access: Apps and Policies Edit`);
    console.log(`    ${dim("-")} Access: Organizations Read`);
    console.log(`  ${dim("Used once to configure Access policies, then discarded.")}`);
    console.log();
    if (await confirm(`Open ${cyan(apiTokenUrl)}?`)) {
      openUrl(apiTokenUrl);
    }
    console.log();
    const cfToken = await promptSecret("Paste your API token:");
    console.log();

    s = spinner("Verifying token...", true);
    try {
      await cfApi(cfToken, "GET", "/user/tokens/verify");
      s.stop("Token verified");
    } catch (e: any) {
      s.stop();
      fail(`Invalid token: ${e.message}`);
    }

    const accountId = wranglerAccount.id;

    // Fetch existing reusable policies and apps
    s = spinner("Loading Access configuration...", true);
    const [existingPolicies, existingApps] = await Promise.all([
      cfApi(cfToken, "GET", `/accounts/${accountId}/access/policies`).catch(() => []),
      cfApi(cfToken, "GET", `/accounts/${accountId}/access/apps`).catch(() => []),
    ]);
    s.stop();

    // Filter to reusable allow policies for the selector
    const reusablePolicies = existingPolicies.filter((p: any) => p.reusable && p.decision === "allow");
    const bypassPolicies = existingPolicies.filter((p: any) => p.reusable && p.decision === "bypass");

    // Build policy selection
    console.log();
    const options: SelectOption[] = [];

    for (const policy of reusablePolicies) {
      const emails = policy.include
        ?.filter((r: any) => r.email)
        .map((r: any) => r.email.email);
      const domains = policy.include
        ?.filter((r: any) => r.email_domain)
        .map((r: any) => r.email_domain.domain);
      const parts = [...(emails ?? []), ...(domains ?? []).map((d: string) => `*@${d}`)];
      const detail = parts.length ? dim(` — ${parts.join(", ")}`) : "";
      options.push({
        label: `${policy.name}${detail}`,
        value: `policy:${policy.id}`,
        selected: false,
      });
    }

    if (wranglerEmail) {
      options.push({
        label: `${wranglerEmail} only ${dim("(new policy)")}`,
        value: `email:${wranglerEmail}`,
        selected: reusablePolicies.length === 0,
      });
    }

    options.push({
      label: `Custom emails... ${dim("(new policy)")}`,
      value: "custom",
      selected: !wranglerEmail && reusablePolicies.length === 0,
    });

    const selected = await multiSelect("Who should have access?", options);
    console.log();

    // Build browser app policies from selections
    const browserPolicyIds: string[] = [];
    let newIncludeRules: any[] = [];
    let needCustom = false;
    const policyParts: string[] = [];

    for (const opt of selected) {
      if (opt.value === "custom") {
        needCustom = true;
      } else if (opt.value.startsWith("policy:")) {
        const id = opt.value.slice(7);
        browserPolicyIds.push(id);
        const name = reusablePolicies.find((p: any) => p.id === id)?.name ?? id;
        policyParts.push(name);
      } else if (opt.value.startsWith("email:")) {
        const email = opt.value.slice(6);
        newIncludeRules.push({ email: { email } });
        policyParts.push(email);
      }
    }

    if (needCustom) {
      const emailsInput = await prompt("Enter email addresses (comma-separated):");
      const emails = emailsInput.split(",").map((e) => e.trim()).filter(Boolean);
      for (const email of emails) {
        newIncludeRules.push({ email: { email } });
        policyParts.push(email);
      }
      console.log();
    }

    if (browserPolicyIds.length === 0 && newIncludeRules.length === 0) {
      fail("At least one access policy is required");
    }

    // Create reusable policies for new rules, then attach all by ID
    s = spinner("Configuring Access...", true);
    let browserApp: any;
    let apiApp: any;
    try {
      // Create a reusable allow policy if user entered new emails
      if (newIncludeRules.length > 0) {
        const newPolicy = await cfApi(cfToken, "POST", `/accounts/${accountId}/access/policies`, {
          name: `${config.name}-allow`,
          decision: "allow",
          include: newIncludeRules,
          session_duration: "24h",
        });
        browserPolicyIds.push(newPolicy.id);
      }

      // Find or create a reusable bypass policy for the API app
      let bypassPolicyId: string | undefined;
      if (bypassPolicies.length > 0) {
        bypassPolicyId = bypassPolicies[0].id;
      } else {
        const bypassPolicy = await cfApi(cfToken, "POST", `/accounts/${accountId}/access/policies`, {
          name: `${config.name}-bypass`,
          decision: "bypass",
          include: [{ everyone: {} }],
          session_duration: "24h",
        });
        bypassPolicyId = bypassPolicy.id;
      }

      // Create Access apps with policy references
      const appName = config.name;
      const apiAppName = `${config.name}-api`;

      browserApp = existingApps.find((a: any) => a.domain === hostname && a.name === appName);
      if (!browserApp) {
        browserApp = await cfApi(cfToken, "POST", `/accounts/${accountId}/access/apps`, {
          name: appName,
          domain: hostname,
          type: "self_hosted",
          session_duration: "24h",
          policies: browserPolicyIds.map((id) => ({ id })),
        });
      }

      apiApp = existingApps.find((a: any) => a.domain === `${hostname}/api/*` && a.name === apiAppName);
      if (!apiApp) {
        apiApp = await cfApi(cfToken, "POST", `/accounts/${accountId}/access/apps`, {
          name: apiAppName,
          domain: `${hostname}/api/*`,
          type: "self_hosted",
          policies: [{ id: bypassPolicyId }],
        });
      }

      s.stop(`Access configured for ${policyParts.join(", ")}`);
    } catch (e: any) {
      s.stop();
      fail(`Access configuration failed: ${e.message}`);
    }

    // Secrets
    s = spinner("Setting secrets...", true);
    try {
      const org = await cfApi(cfToken, "GET", `/accounts/${accountId}/access/organizations`);
      const accessTeam = org.auth_domain.replace(".cloudflareaccess.com", "");
      const accessAud = browserApp.aud;

      await Promise.all([
        run("npx", ["wrangler", "secret", "put", "AUTH_MODE"], { input: "access" }),
        run("npx", ["wrangler", "secret", "put", "ACCESS_AUD"], { input: accessAud }),
        run("npx", ["wrangler", "secret", "put", "ACCESS_TEAM"], { input: accessTeam }),
      ]);
      s.stop("Secrets set");
    } catch (e: any) {
      s.stop();
      fail(`Failed to set secrets: ${e.message}`);
    }

  } else {
    // No Access — set AUTH_MODE to "none"
    s = spinner("Configuring open access...", true);
    try {
      await run("npx", ["wrangler", "secret", "put", "AUTH_MODE"], { input: "none" });
      s.stop("Auth disabled");
    } catch (e: any) {
      s.stop();
      fail(`Failed to set AUTH_MODE: ${e.message}`);
    }

    console.log();
    console.log(`  ${dim("Note: anyone with the URL can view and comment.")}`);
    console.log(`  ${dim("Run setup again to add Cloudflare Access later.")}`);
  }

  // CLI install
  console.log();
  let cliCmd = "pnpm sharehtml";
  let hasCli = false;
  try {
    await run("which", ["sharehtml"]);
    hasCli = true;
    cliCmd = "sharehtml";
  } catch {}

  if (!hasCli) {
    if (await confirm("Install the sharehtml CLI globally?")) {
      s = spinner("Installing CLI...");
      try {
        await run("pnpm", ["--filter", "@sharehtml/cli", "run", "build"]);
        await run("bun", ["link"], { cwd: resolve(import.meta.dirname, "../../cli") });
        s.stop("CLI installed");
        cliCmd = "sharehtml";
      } catch {
        s.stop();
        console.log(`  ${dim("Could not install globally. Use from the repo with:")} pnpm sharehtml`);
      }
    } else {
      console.log(`  ${dim("You can use the CLI from the repo with:")} pnpm sharehtml`);
    }
  }

  // Token generation
  console.log();
  const tokenUrl = `${workerUrl}/tokens`;
  console.log(`  To deploy documents, generate an API token:`);
  console.log();
  if (await confirm(`Open ${cyan(tokenUrl)}?`)) {
    openUrl(tokenUrl);
  }

  // Done
  console.log();
  console.log(`  ${bold("Setup complete")}`);
  console.log();
  console.log(`    ${dim("$")} ${cliCmd} config set-url ${workerUrl}`);
  console.log(`    ${dim("$")} ${cliCmd} config set-key <token>`);
  console.log(`    ${dim("$")} ${cliCmd} deploy my-page.html`);
  console.log();
}

main().catch((e) => {
  fail(e.message);
});
