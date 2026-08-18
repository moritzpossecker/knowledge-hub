import type { Config } from "./config.js";

export const defaultConfig: Config = {
  sync: {
    markdownRootPath: "./docs_example",
    collectionName: "my_docs",
    embedBatchSize: 32,
    qdrantBatchSize: 128,
    uploadParallel: 2,
    embedModel: "embeddinggemma",
  },
  setup: {
    managedViaDocker: true,
    qdrant: {
      baseUrl: "http://localhost:6333",
      grpcPort: 6334,
      apiKey: undefined,
    },
    ollama: {
      baseUrl: "http://localhost:11434",
    },
  },
  chat: {
    topK: 5,
    scoreThreshold: 0.3,
    systemPrompt: "You are a documentation assistant. Answer only from the provided context. If the answer is not in the context, say clearly that you could not find it in the indexed docs. When useful, cite source paths from the context.",
    retrievalModel: "embeddinggemma",
    chatModel: "llama3.1",
    availableChatModels: ["llama3.1"],
  },
};
