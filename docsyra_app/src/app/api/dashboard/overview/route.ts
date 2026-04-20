import { requireAuthenticatedUser } from "@/lib/docs/access";
import {
  getAccessibleDocumentsByUser,
  getCollaborators,
  getDocumentLogs,
  getDocumentsByUser,
} from "@/lib/db/queries";

export const runtime = "edge";

export async function GET(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const auth = await requireAuthenticatedUser(request, context);
  if (auth instanceof Response) {
    return auth;
  }

  const [accessibleDocuments, ownedDocuments] = await Promise.all([
    getAccessibleDocumentsByUser(auth.userId, auth.env),
    getDocumentsByUser(auth.userId, auth.env),
  ]);

  const documents = await Promise.all(
    accessibleDocuments.map(async (document) => ({
      ...document,
      collaborators: await getCollaborators(document.id, auth.env),
    })),
  );

  const recentActivity = (
    await Promise.all(
      ownedDocuments.map(async (document) => {
        const logs = await getDocumentLogs(document.id, auth.env);
        return logs.slice(0, 5).map((log) => ({
          ...log,
          document_id: document.id,
          document_title: document.title,
        }));
      }),
    )
  )
    .flat()
    .sort((left, right) => right.created_at - left.created_at)
    .slice(0, 10);

  const now = Date.now();
  const activeDocuments = accessibleDocuments.filter((document) => now - document.updated_at <= 7 * 24 * 60 * 60 * 1000);
  const sharedDocuments = accessibleDocuments.filter((document) => document.owner_id !== auth.userId);
  const collaboratorCount = documents.reduce((total, document) => total + document.collaborators.length, 0);

  return Response.json(
    {
      success: true,
      documents,
      recentActivity,
      stats: {
        totalDocuments: accessibleDocuments.length,
        ownedDocuments: ownedDocuments.length,
        sharedDocuments: sharedDocuments.length,
        activeDocuments: activeDocuments.length,
        collaborators: collaboratorCount,
        recentActivityCount: recentActivity.length,
      },
    },
    { status: 200 },
  );
}