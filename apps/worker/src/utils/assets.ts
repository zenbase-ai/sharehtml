export interface AssetUrls {
  shellClientJs: string;
  shellClientCss: string;
  collabJs: string;
}

interface ManifestEntry {
  file: string;
  css?: string[];
}

let cachedUrls: AssetUrls | null = null;

export async function getAssetUrls(assets: Fetcher): Promise<AssetUrls> {
  if (import.meta.env.DEV) {
    return {
      shellClientJs: "/src/client/shell-client.ts",
      shellClientCss: "",
      collabJs: "/src/client/collab-client.ts",
    };
  }

  if (cachedUrls) return cachedUrls;

  const resp = await assets.fetch(new Request("https://assets.local/manifest.json"));
  const manifest = (await resp.json()) as Record<string, ManifestEntry>;

  const shellEntry = manifest["src/client/shell-client.ts"];
  const collabEntry = manifest["src/client/collab-client.ts"];

  cachedUrls = {
    shellClientJs: "/" + shellEntry.file,
    shellClientCss: shellEntry.css?.[0] ? "/" + shellEntry.css[0] : "",
    collabJs: "/" + collabEntry.file,
  };

  return cachedUrls;
}
