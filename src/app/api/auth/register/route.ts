import { ObjectId } from "mongodb";
import { hashPassword, sessionCookie, signSession } from "@/lib/auth";
import {
  HttpError,
  jsonRoute,
  normalizeUsername,
  usersCollection,
} from "@/lib/server";

export const dynamic = "force-dynamic";

export const MIN_USERNAME = 3;
export const MIN_PASSWORD = 8;

export async function POST(request: Request) {
  return jsonRoute(async () => {
    const body = await request.json().catch(() => null);
    const username = normalizeUsername(body?.username);
    const password = String(body?.password ?? "");

    if (username.length < MIN_USERNAME) {
      throw new HttpError(
        400,
        `Username needs at least ${MIN_USERNAME} characters.`
      );
    }
    if (password.length < MIN_PASSWORD) {
      throw new HttpError(
        400,
        `Password needs at least ${MIN_PASSWORD} characters.`
      );
    }

    const _id = new ObjectId();
    const now = new Date();
    try {
      await (
        await usersCollection()
      ).insertOne({
        _id,
        username,
        passwordHash: await hashPassword(password),
        trello: null,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      // The unique index, not a prior read, is what makes two simultaneous
      // registrations resolve to one account.
      if ((err as { code?: number }).code === 11000) {
        throw new HttpError(409, "That username is taken.");
      }
      throw err;
    }

    const userId = _id.toHexString();
    return Response.json(
      { userId, username, trelloConnected: false },
      {
        status: 201,
        headers: { "set-cookie": sessionCookie(await signSession(userId)) },
      }
    );
  });
}
