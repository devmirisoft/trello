import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";
import { PATCH as changeCredentials } from "@/app/api/auth/credentials/route";
import { PUT as saveTrello } from "@/app/api/trello/credentials/route";
import {
  clearUsers,
  cookieFrom,
  json,
  rawUsers,
  req,
  startMongo,
  stopMongo,
} from "../helpers/api";
import { startTrelloStub, stopTrelloStub } from "../helpers/trello-stub";

const USERNAME = "asha";
const PASSWORD = "hunter2-hunter2";

const registerUser = (username = USERNAME, password = PASSWORD) =>
  register(req({ method: "POST", body: { username, password } }));

beforeAll(async () => {
  // Mongo first: booting it may hit the network, and MSW refuses anything
  // it has not been told to expect.
  await startMongo();
  startTrelloStub();
}, 180_000);

afterAll(async () => {
  stopTrelloStub();
  await stopMongo();
});

beforeEach(clearUsers);

describe("POST /api/auth/register", () => {
  it("creates the account and signs it in", async () => {
    const res = await registerUser();
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body).toMatchObject({ username: USERNAME, trelloConnected: false });
    expect(body.userId).toMatch(/^[a-f0-9]{24}$/);

    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("lowercases the username", async () => {
    await registerUser("AshA");
    const [doc] = await rawUsers();
    expect(doc.username).toBe("asha");
  });

  it("rejects a duplicate username without creating a second document", async () => {
    await registerUser();
    const res = await registerUser(USERNAME, "another-password");
    expect(res.status).toBe(409);
    expect(await rawUsers()).toHaveLength(1);
  });

  it("rejects a short username or password", async () => {
    expect((await registerUser("ab", PASSWORD)).status).toBe(400);
    expect((await registerUser("valid", "short")).status).toBe(400);
    expect(await rawUsers()).toHaveLength(0);
  });

  it("never stores the password in the clear", async () => {
    await registerUser();
    const [doc] = await rawUsers();
    expect(JSON.stringify(doc)).not.toContain(PASSWORD);
    expect(doc.passwordHash).toMatch(/^\$2[aby]\$10\$/);
  });
});

describe("POST /api/auth/login", () => {
  it("signs in with the right password", async () => {
    await registerUser();
    const res = await login(
      req({ method: "POST", body: { username: USERNAME, password: PASSWORD } })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("gives the same 401 for a wrong password and an unknown user", async () => {
    await registerUser();
    const wrongPassword = await login(
      req({ method: "POST", body: { username: USERNAME, password: "nope-nope-nope" } })
    );
    const unknownUser = await login(
      req({ method: "POST", body: { username: "nobody", password: PASSWORD } })
    );

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    // Identical text, or the response tells an attacker which usernames exist.
    expect((await json(wrongPassword)).error).toBe(
      (await json(unknownUser)).error
    );
  });
});

describe("GET /api/auth/me", () => {
  it("401s without a cookie", async () => {
    expect((await me(req({}))).status).toBe(401);
  });

  it("401s with a junk cookie", async () => {
    const res = await me(req({ cookie: "trello_snap_session=not-a-jwt" }));
    expect(res.status).toBe(401);
  });

  it("returns the account with a valid cookie", async () => {
    const registered = await registerUser();
    const res = await me(req({ cookie: cookieFrom(registered) }));
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({
      username: USERNAME,
      trelloConnected: false,
    });
  });

  it("stops working after logout clears the cookie", async () => {
    const res = await logout();
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

describe("PATCH /api/auth/credentials", () => {
  /** Registers, connects Trello, and returns the live session cookie. */
  async function signedInWithTrello() {
    const registered = await registerUser();
    const cookie = cookieFrom(registered);
    const { userId } = await json<{ userId: string }>(registered);
    await saveTrello(
      req({
        method: "PUT",
        cookie,
        body: { apiKey: "key-abc", token: "token-xyz" },
      })
    );
    return { cookie, userId };
  }

  it("changes the username while keeping the same _id, session and Trello link", async () => {
    const { cookie, userId } = await signedInWithTrello();
    const before = (await rawUsers())[0];

    const res = await changeCredentials(
      req({
        method: "PATCH",
        cookie,
        body: { currentPassword: PASSWORD, newUsername: "asha-renamed" },
      })
    );
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({
      userId,
      username: "asha-renamed",
      trelloConnected: true,
    });

    const after = (await rawUsers())[0];
    // The id is what the JWT and the credentials both hang off, so it must be
    // byte-identical — a new document here would orphan the Trello token.
    expect(after._id.toHexString()).toBe(before._id.toHexString());
    expect(after.username).toBe("asha-renamed");
    expect(after.trello).toBeTruthy();
    expect(after.trello.apiKey.ciphertext).toBe(before.trello.apiKey.ciphertext);

    // The old cookie keeps working: nothing in it names the account.
    const stillMe = await me(req({ cookie }));
    expect(stillMe.status).toBe(200);
    expect(await json(stillMe)).toMatchObject({
      userId,
      username: "asha-renamed",
      trelloConnected: true,
    });
  });

  it("changes the password: the old one stops working, the new one starts", async () => {
    const { cookie } = await signedInWithTrello();
    const res = await changeCredentials(
      req({
        method: "PATCH",
        cookie,
        body: { currentPassword: PASSWORD, newPassword: "brand-new-password" },
      })
    );
    expect(res.status).toBe(200);

    const withOld = await login(
      req({ method: "POST", body: { username: USERNAME, password: PASSWORD } })
    );
    expect(withOld.status).toBe(401);

    const withNew = await login(
      req({
        method: "POST",
        body: { username: USERNAME, password: "brand-new-password" },
      })
    );
    expect(withNew.status).toBe(200);

    // And the session that made the change is still good.
    expect((await me(req({ cookie }))).status).toBe(200);
  });

  it("changes both at once", async () => {
    const { cookie, userId } = await signedInWithTrello();
    const res = await changeCredentials(
      req({
        method: "PATCH",
        cookie,
        body: {
          currentPassword: PASSWORD,
          newUsername: "both-changed",
          newPassword: "brand-new-password",
        },
      })
    );
    expect(res.status).toBe(200);
    expect((await rawUsers())[0]._id.toHexString()).toBe(userId);

    const relogin = await login(
      req({
        method: "POST",
        body: { username: "both-changed", password: "brand-new-password" },
      })
    );
    expect(relogin.status).toBe(200);
    expect(await json(relogin)).toMatchObject({ userId, trelloConnected: true });
  });

  it("401s on the wrong current password and changes nothing", async () => {
    const { cookie } = await signedInWithTrello();
    const res = await changeCredentials(
      req({
        method: "PATCH",
        cookie,
        body: { currentPassword: "wrong-password", newUsername: "sneaky" },
      })
    );
    expect(res.status).toBe(401);
    expect((await rawUsers())[0].username).toBe(USERNAME);
  });

  it("401s without a session", async () => {
    const res = await changeCredentials(
      req({
        method: "PATCH",
        body: { currentPassword: PASSWORD, newUsername: "nobody" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("409s on a username someone else already has", async () => {
    await registerUser("taken-name");
    const registered = await registerUser();
    const res = await changeCredentials(
      req({
        method: "PATCH",
        cookie: cookieFrom(registered),
        body: { currentPassword: PASSWORD, newUsername: "taken-name" },
      })
    );
    expect(res.status).toBe(409);
  });

  it("accepts renaming to the same username", async () => {
    const registered = await registerUser();
    const res = await changeCredentials(
      req({
        method: "PATCH",
        cookie: cookieFrom(registered),
        body: { currentPassword: PASSWORD, newUsername: USERNAME },
      })
    );
    expect(res.status).toBe(200);
  });

  it("rejects a too-short new username or password", async () => {
    const registered = await registerUser();
    const cookie = cookieFrom(registered);
    expect(
      (
        await changeCredentials(
          req({
            method: "PATCH",
            cookie,
            body: { currentPassword: PASSWORD, newUsername: "ab" },
          })
        )
      ).status
    ).toBe(400);
    expect(
      (
        await changeCredentials(
          req({
            method: "PATCH",
            cookie,
            body: { currentPassword: PASSWORD, newPassword: "short" },
          })
        )
      ).status
    ).toBe(400);
  });
});
