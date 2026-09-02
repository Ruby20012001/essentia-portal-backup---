import { describe, expect, it } from "vitest";
import { assertTenant, readIdentity } from "@/lib/auth/providers/entra-claims";

/**
 * Entra claim mapping — who the token says signed in.
 *
 * The cryptographic half (signature, issuer, audience, expiry) is `jose`'s job
 * and is verified against a live tenant. This half decides which account a
 * validated token resolves to, and it is where a quiet mistake turns into the
 * wrong person's session. It is pure, so it is tested here in full.
 */

describe("readIdentity", () => {
  it("takes oid as the durable key and lower-cases the email", () => {
    expect(
      readIdentity({
        oid: "00000000-1111-2222-3333-444444444444",
        email: "Dipmallya.WIO@Essentia.in",
        name: "Dipmalya Das",
      }),
    ).toEqual({
      oid: "00000000-1111-2222-3333-444444444444",
      email: "dipmallya.wio@essentia.in",
      displayName: "Dipmalya Das",
    });
  });

  it("falls back through preferred_username then upn for the email", () => {
    // Which claim carries the address depends on tenant configuration, so all
    // three are read. A registration missing the optional 'email' claim must
    // still sign people in.
    expect(readIdentity({ oid: "o1", preferred_username: "a@essentia.in" }).email).toBe(
      "a@essentia.in",
    );
    expect(readIdentity({ oid: "o1", upn: "b@essentia.in" }).email).toBe("b@essentia.in");
    expect(
      readIdentity({ oid: "o1", email: "first@essentia.in", upn: "second@essentia.in" }).email,
    ).toBe("first@essentia.in");
  });

  it("refuses a token with no oid rather than falling back to email", () => {
    // Email can be reassigned to a new joiner; oid cannot. Matching on email
    // alone would follow a rename onto whoever inherits the address.
    expect(() => readIdentity({ email: "a@essentia.in" })).toThrow(/no user id \(oid\)/i);
  });

  it("refuses a token with no usable email", () => {
    expect(() => readIdentity({ oid: "o1" })).toThrow(/no email claim/i);
  });

  it("treats blank and non-string claims as absent", () => {
    expect(() => readIdentity({ oid: "   ", email: "a@essentia.in" })).toThrow(/oid/i);
    expect(() => readIdentity({ oid: 12345, email: "a@essentia.in" })).toThrow(/oid/i);
    expect(() => readIdentity({ oid: "o1", email: "" })).toThrow(/email/i);
  });

  it("leaves displayName null rather than inventing one", () => {
    expect(readIdentity({ oid: "o1", email: "a@essentia.in" }).displayName).toBeNull();
  });
});

describe("assertTenant", () => {
  const TENANT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  it("accepts a token from our own directory, case-insensitively", () => {
    expect(() => assertTenant({ tid: TENANT }, TENANT)).not.toThrow();
    expect(() => assertTenant({ tid: TENANT.toUpperCase() }, TENANT)).not.toThrow();
  });

  it("refuses another organisation's directory", () => {
    expect(() =>
      assertTenant({ tid: "99999999-9999-9999-9999-999999999999" }, TENANT),
    ).toThrow(/different organisation/i);
  });

  it("refuses a token with no tid at all", () => {
    // Fail closed. A missing tenant claim must never read as "ours".
    expect(() => assertTenant({}, TENANT)).toThrow(/different organisation/i);
    expect(() => assertTenant({ tid: null }, TENANT)).toThrow(/different organisation/i);
  });
});
