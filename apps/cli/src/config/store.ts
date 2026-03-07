import Conf from "conf";

interface Config {
  workerUrl: string;
  apiKey: string;
}

const config = new Conf<Config>({
  projectName: "sharehtml-cli",
  defaults: {
    workerUrl: "",
    apiKey: "",
  },
});

export function getConfig(): Config {
  return {
    workerUrl: config.get("workerUrl"),
    apiKey: config.get("apiKey"),
  };
}

export function setConfig(key: keyof Config, value: string): void {
  config.set(key, value);
}

export function isConfigured(): boolean {
  const c = getConfig();
  return Boolean(c.workerUrl && c.apiKey);
}
