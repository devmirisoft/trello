import { hashPassword, verifyPassword } from "@/lib/auth";
import {
  HttpError,
  jsonRoute,
  normalizeUsername,
  requireUser,
  usersCollection,
} from "@/lib/server";
import { MIN_PASSWORD, MIN_USERNAME } from "../register/route";

export const dynamic = "force-dynamic";

/**
 * Change the username, the password, or both. The document is updated in
 * place: `_id` never changes, so the session cookie (which carries only the
 * id) stays valid and the Trello credentials stay attached to the same
 * account. No new document, no re-login, no re-connecting Trello.
 */
export async function PATCH(request: Request) {
  return jsonRoute(async () => {
    const user = await requireUser(request);
    const body = await request.json().catch(() => null);

    const currentPassword = String(body?.currentPassword ?? "");
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new HttpError(401, "Current password is incorrect.");
    }

    const update: { username?: string; passwordHash?: string; updatedAt: Date } =
      { updatedAt: new Date() };

    if (body?.newUsername !== undefined) {
      const username = normalizeUsername(body.newUsername);
      if (username.length < MIN_USERNAME) {
        throw new HttpError(
          400,
          `Username needs at least ${MIN_USERNAME} characters.`
        );
      }
      if (username !== user.username) update.username = username;
    }

    if (body?.newPassword !== undefined) {
      const password = String(body.newPassword);
      if (password.length < MIN_PASSWORD) {
        throw new HttpError(
          400,
          `Password needs at least ${MIN_PASSWORD} characters.`
        );
      }
      update.passwordHash = await hashPassword(password);
    }

    try {
      await (
        await usersCollection()
      ).updateOne({ _id: user._id }, { $set: update });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new HttpError(409, "That username is taken.");
      }
      throw err;
    }

    return Response.json({
      userId: user._id.toHexString(),
      username: update.username ?? user.username,
      trelloConnected: !!user.trello,
    });
  });
}
