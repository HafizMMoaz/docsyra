import { requireDocumentAccess } from "@/lib/docs/access";
import { rejectCsrf } from "@/lib/security/csrf";

export const runtime = "edge";

type RouteParams = {
  id: string;
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function toBase64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

export async function POST(
  request: Request,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  const { id } = await context.params;
  const access = await requireDocumentAccess(
    request,
    context as { params: Promise<Record<string, string | string[] | undefined>> },
    id,
    { requireEditor: true },
  );

  if (access instanceof Response) {
    return access;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ success: false, error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ success: false, error: "Image file is required" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return Response.json({ success: false, error: "Only image uploads are allowed" }, { status: 400 });
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return Response.json({ success: false, error: "Image too large. Max size is 5MB" }, { status: 413 });
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const dataUrl = `data:${file.type};base64,${toBase64(bytes)}`;

  return Response.json(
    {
      success: true,
      url: dataUrl,
      name: file.name,
      size: file.size,
      type: file.type,
    },
    { status: 200 },
  );
}
