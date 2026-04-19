import { getRequestContext } from "@cloudflare/next-on-pages";
import { rejectCsrf } from "@/lib/security/csrf";

export const runtime = "edge";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type UploadEnv = {
  R2: R2Bucket;
  NEXT_PUBLIC_R2_BASE_URL?: string;
};

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(request: Request): Promise<Response> {
  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  try {
    const { env } = getRequestContext() as unknown as { env: UploadEnv };

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "No file" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return Response.json({ error: "Invalid file type" }, { status: 400 });
    }

    if (file.size > MAX_IMAGE_BYTES) {
      return Response.json({ error: "File too large" }, { status: 400 });
    }

    if (!env.R2) {
      return Response.json({ error: "R2 bucket is not configured" }, { status: 500 });
    }

    const baseUrl = env.NEXT_PUBLIC_R2_BASE_URL?.trim();
    if (!baseUrl) {
      return Response.json({ error: "NEXT_PUBLIC_R2_BASE_URL is not configured" }, { status: 500 });
    }

    const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
    const safeName = sanitizeFilename(file.name.replace(extension, ""));
    const objectKey = `images/${Date.now()}-${crypto.randomUUID()}-${safeName || "upload"}${extension.toLowerCase()}`;

    const buffer = await file.arrayBuffer();

    await env.R2.put(objectKey, buffer, {
      httpMetadata: {
        contentType: file.type,
      },
    });

    const normalizedBase = baseUrl.replace(/\/+$/, "");
    const url = `${normalizedBase}/${objectKey}`;

    return Response.json({ url }, { status: 200 });
  } catch (error) {
    console.error("[upload-image]", error);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}
