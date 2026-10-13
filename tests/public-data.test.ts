import test from "node:test";
import assert from "node:assert/strict";
import { publicData } from "../src/lib/public-data";

test("Public snapshots redact configured secrets, sensitive keys and URL credentials", () => {
  const old = process.env.POSTGRES_PASSWORD;
  const fixture = "fixture-password-not-a-real-secret";
  try {
    process.env.POSTGRES_PASSWORD = fixture;
    const input = { title: `Описание ${fixture}`, rows: [{ token: "fixture-token", visits: 10 }], url: "https://fixture.test/?access_token=fixture-token" };
    const output = publicData(input);
    assert.ok(!JSON.stringify(output).includes(fixture));
    assert.ok(!JSON.stringify(output).includes("fixture-token"));
    assert.equal(output.rows[0].visits, 10);
    assert.equal(input.rows[0].token, "fixture-token");
    assert.equal(input.title, `Описание ${fixture}`);
  } finally {
    if (old === undefined) delete process.env.POSTGRES_PASSWORD;
    else process.env.POSTGRES_PASSWORD = old;
  }
});
