import { describe, expect, it } from "vitest";
import { postLoginDestination } from "@/lib/authNavigation";

describe("post-login navigation", () => {
  it("opens the requested in-app page", () => {
    expect(postLoginDestination("?next=%2Fwallet")).toBe("/wallet");
  });

  it("never returns users to the retired verification page", () => {
    expect(postLoginDestination("?next=%2Fverify-email")).toBe("/");
    expect(postLoginDestination("?next=%2Fverify-email%3Flegacy%3D1")).toBe("/");
  });

  it("rejects external redirect targets", () => {
    expect(postLoginDestination("?next=https%3A%2F%2Fexample.com")).toBe("/");
    expect(postLoginDestination("?next=%2F%2Fexample.com")).toBe("/");
  });
});
