import { test } from "node:test";
import assert from "node:assert/strict";
import { numbersIn, unknownNumbers } from "./numberCheck.js";
import type { Product } from "../types.js";

test("number formats are normalised", () => {
  assert.deepEqual(numbersIn("3,995 DKK, 3.995 DKK, 8,49 kg, 26.5 cm, 148-175"), ["3995", "3995", "8.49", "26.5", "148", "175"]);
});

test("numbers from facts and the chosen product are allowed, others are not", () => {
  const facts = [{ label: "Weight", value: "8.49 kg", source: "products.csv SKU 42730" }];
  const product = { name: "Atlas Dining Table", variant: "200x95 Fumed Oak", sku: "42711" } as Product;
  assert.deepEqual(unknownNumbers("The 200x95 table (42711) weighs 8,49 kg.", facts, [product]), []);
  assert.deepEqual(unknownNumbers("It weighs 9 kg and ships in 6 weeks.", facts, [product]), ["9", "6"]);
});
