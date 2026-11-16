import { test } from "node:test";
import assert from "node:assert/strict";
import { quantityIn } from "./quantity.js";

test("quantities above one are found; sizes, years and single items are not", () => {
  assert.equal(quantityIn("A client would like four Covent Club Chairs upholstered"), 4);
  assert.equal(quantityIn("We have a customer asking for two, and could we"), 2);
  assert.equal(quantityIn("Please send 12 units of the Tana Wall Shelf"), 12);
  assert.equal(quantityIn("Please deliver one Atlas Dining Table 200x95"), undefined);
  assert.equal(quantityIn("Knot Rug 300 x 400 in warm grey, price list from 2026"), undefined);
});
