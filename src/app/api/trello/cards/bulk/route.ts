import { bulkCreate, bulkUpdate, type BulkAction } from "@/lib/bulk";
import { HttpError, jsonRoute, requireCreds, requireUser } from "@/lib/server";

export const dynamic = "force-dynamic";

const ACTIONS: BulkAction[] = ["done", "update", "move"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** yyyy-mm-dd or nothing. Rejected here rather than deeper down, where an
 * unparseable date becomes an Invalid Date and so a 500 instead of a 400. */
function dueDate(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const raw = String(value);
  const at = ISO_DATE.test(raw) ? new Date(`${raw}T00:00:00Z`) : new Date(NaN);
  // Round-tripped rather than merely parsed: 2026-02-31 parses quite happily
  // and silently becomes 3 March, which is nobody's intent.
  if (Number.isNaN(at.getTime()) || !at.toISOString().startsWith(raw)) {
    throw new HttpError(400, `Not a yyyy-mm-dd date: ${raw}`);
  }
  return raw;
}

/** Create one card per task. A task is a plain title, or a title with the due
 * date that was read off that particular line. */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const creds = requireCreds(await requireUser(request));
    const body = await request.json().catch(() => null);

    const listId = String(body?.listId ?? "").trim();
    const tasks = (Array.isArray(body?.tasks) ? body.tasks : [])
      .map((task: unknown) => {
        const t = typeof task === "string" ? { name: task } : task;
        const { name, dueDate: due } = (t ?? {}) as Record<string, unknown>;
        return { name: String(name ?? "").trim(), dueDate: dueDate(due) };
      })
      .filter((task: { name: string }) => task.name);

    if (!listId) throw new HttpError(400, "A target list is required.");
    if (!tasks.length) throw new HttpError(400, "No tasks to create.");

    return Response.json(
      await bulkCreate(creds, {
        listId,
        memberId: body?.memberId ? String(body.memberId) : undefined,
        // The fallback for tasks that carry no date of their own.
        dueDate: dueDate(body?.dueDate),
        tasks,
      })
    );
  });
}

/** Mark done, edit, or move a selection of existing cards. */
export async function PATCH(request: Request) {
  return jsonRoute(async () => {
    const creds = requireCreds(await requireUser(request));
    const body = await request.json().catch(() => null);

    const cardIds = Array.isArray(body?.cardIds)
      ? body.cardIds.map((id: unknown) => String(id)).filter(Boolean)
      : [];
    const action = body?.action as BulkAction;
    if (!cardIds.length) throw new HttpError(400, "No cards selected.");
    if (!ACTIONS.includes(action)) {
      throw new HttpError(400, `action must be one of ${ACTIONS.join(", ")}.`);
    }

    return Response.json(
      await bulkUpdate(creds, cardIds, action, body?.payload ?? {})
    );
  });
}
