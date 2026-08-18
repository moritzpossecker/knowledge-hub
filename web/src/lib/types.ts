export interface Source {
  sourcePath: string;
  headingPath: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  sources: Source[];
}

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionDetail extends SessionSummary {
  messages: ChatMessage[];
}

export interface SourceDocument {
  sourcePath: string;
  fileName: string;
  title: string;
  content: string;
}
