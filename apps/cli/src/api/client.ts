import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { getConfig, isConfigured } from "../config/store.js";
import {
  isMarkdownFile,
  markdownFilenameToHtml,
  renderMarkdownToHtml,
} from "../utils/markdown.js";

interface DeployResult {
  id: string;
  url: string;
  title: string;
  filename: string;
  size: number;
}

interface DocumentMeta {
  id: string;
  title: string;
  filename: string;
  size: number;
  owner_email: string;
  created_at: string;
}

function getClient() {
  if (!isConfigured()) {
    throw new Error(
      "Not configured. Run: sharehtml config set-url <url> && sharehtml config set-key <key>",
    );
  }
  return getConfig();
}

async function prepareUpload(
  filePath: string,
  title?: string,
): Promise<{ blob: Blob; filename: string }> {
  const fileBuffer = await readFile(filePath);
  let filename = basename(filePath);

  let blob: Blob;
  if (isMarkdownFile(filename)) {
    const mdText = fileBuffer.toString("utf-8");
    const mdTitle = title || filename.replace(/\.(md|markdown)$/i, "");
    const html = renderMarkdownToHtml(mdText, mdTitle, filePath);
    blob = new Blob([html], { type: "text/html" });
    filename = markdownFilenameToHtml(filename);
  } else {
    blob = new Blob([fileBuffer], { type: "text/html" });
  }

  return { blob, filename };
}

async function checkResponse(resp: Response, action: string) {
  if (resp.ok) return;
  if (resp.status === 401) {
    const body = await resp.text().catch(() => "");
    if (body.includes("token_expired")) {
      const { workerUrl } = getConfig();
      throw new Error(
        `API token expired. Generate a new one at ${workerUrl}/tokens and run: sharehtml config set-key <token>`,
      );
    }
    throw new Error(
      "Invalid API token. Generate one at /tokens and run: sharehtml config set-key <token>",
    );
  }
  const body = await resp.text();
  throw new Error(`${action} failed (${resp.status}): ${body}`);
}

async function parseJson<T>(resp: Response, action: string): Promise<T> {
  const text = await resp.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${action}: unexpected response: ${text.slice(0, 200)}`);
  }
}

export async function deployDocument(
  filePath: string,
  title?: string,
): Promise<DeployResult> {
  const { workerUrl, apiKey } = getClient();
  const { blob, filename } = await prepareUpload(filePath, title);

  const formData = new FormData();
  formData.append("file", blob, filename);
  if (title) formData.append("title", title);

  const resp = await fetch(`${workerUrl}/api/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  await checkResponse(resp, "Upload");
  return parseJson<DeployResult>(resp, "Upload");
}

export async function findDocumentByFilename(filename: string): Promise<DocumentMeta | null> {
  const { workerUrl, apiKey } = getClient();

  const resp = await fetch(
    `${workerUrl}/api/documents/by-filename?filename=${encodeURIComponent(filename)}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );

  await checkResponse(resp, "Lookup");

  const data = await parseJson<{ document: DocumentMeta | null }>(resp, "Lookup");
  return data.document;
}

export async function updateDocument(
  id: string,
  filePath: string,
  title?: string,
): Promise<DeployResult> {
  const { workerUrl, apiKey } = getClient();
  const { blob, filename } = await prepareUpload(filePath, title);

  const formData = new FormData();
  formData.append("file", blob, filename);
  if (title) formData.append("title", title);

  const resp = await fetch(`${workerUrl}/api/documents/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  await checkResponse(resp, "Update");
  return parseJson<DeployResult>(resp, "Update");
}

export async function listDocuments(): Promise<{ documents: DocumentMeta[] }> {
  const { workerUrl, apiKey } = getClient();

  const resp = await fetch(`${workerUrl}/api/documents`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  await checkResponse(resp, "List");

  return parseJson<{ documents: DocumentMeta[] }>(resp, "List");
}

export async function deleteDocument(id: string): Promise<void> {
  const { workerUrl, apiKey } = getClient();

  const resp = await fetch(`${workerUrl}/api/documents/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  await checkResponse(resp, "Delete");
}

export function getDocumentUrl(id: string): string {
  const { workerUrl } = getClient();
  return `${workerUrl}/d/${id}`;
}
