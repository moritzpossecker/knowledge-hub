import { WriteStream } from "node:tty";

const reset = "\x1b[0m";
const bold = "\x1b[1m";
const dim = "\x1b[2m";
const cyan = "\x1b[36m";
const green = "\x1b[32m";
const red = "\x1b[31m";

function colorEnabled(stream: NodeJS.WritableStream): boolean {
  return !process.env.NO_COLOR && stream instanceof WriteStream && stream.isTTY;
}

export function style(stream: NodeJS.WritableStream, code: string, text: string): string {
  return colorEnabled(stream) ? `${code}${text}${reset}` : text;
}

export function header(stream: NodeJS.WritableStream, command: string, description: string): void {
  stream.write(`\n${style(stream, bold + cyan, "✦ knowledge hub")}  ${style(stream, dim, `/ ${command}`)}\n`);
  stream.write(`${style(stream, dim, description)}\n\n`);
}

export function success(stream: NodeJS.WritableStream, message: string): void {
  stream.write(`${style(stream, green, "✓")} ${message}\n`);
}

export function note(stream: NodeJS.WritableStream, message: string): void {
  stream.write(`${style(stream, cyan, "›")} ${message}\n`);
}

export function error(stream: NodeJS.WritableStream, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  stream.write(`${style(stream, red + bold, "Error:")} ${message}\n`);
}
