import test from "node:test";
import assert from "node:assert/strict";
import { isLocalhost, parseQdrantUrl, qdrantGrpcAddress } from "../src/http.js";
import { missingOllamaModels } from "../src/ollama.js";

test("parseQdrantUrl parses valid URLs and defaults ports", () => {
  assert.deepEqual(parseQdrantUrl("http://localhost:6333"), {
    host: "localhost",
    port: "6333",
    useHttps: false
  });
  assert.deepEqual(parseQdrantUrl("https://qdrant.example.com"), {
    host: "qdrant.example.com",
    port: "443",
    useHttps: true
  });
});

test("parseQdrantUrl rejects missing scheme and paths", () => {
  assert.throws(() => parseQdrantUrl("localhost:6333"), /http:\/\/ or https:\/\//);
  assert.throws(() => parseQdrantUrl("http://localhost:6333/dashboard"), /only scheme/);
});

test("isLocalhost identifies loopback hosts", () => {
  assert.equal(isLocalhost("http://localhost:6333"), true);
  assert.equal(isLocalhost("http://127.0.0.1:6333"), true);
  assert.equal(isLocalhost("http://[::1]:6333"), true);
  assert.equal(isLocalhost("https://qdrant.example.com"), false);
});

test("qdrantGrpcAddress uses configured port", () => {
  assert.equal(qdrantGrpcAddress("http://localhost:7333", "8123"), "localhost:8123");
});

test("missingOllamaModels recognizes implicit latest tag", () => {
  assert.deepEqual(
    missingOllamaModels(["embeddinggemma:latest", "llama3.1:8b"], ["embeddinggemma", "llama3.1:8b", "missing"]),
    ["missing"]
  );
});
