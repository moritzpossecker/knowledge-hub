import { WriteStream } from "node:tty";
import readline from "node:readline/promises";

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

export function heading(stream: NodeJS.WritableStream, headline: string, description?: string): void {
  stream.write(`\n${style(stream, bold + cyan, `✦ ${headline}`)}\n`);
  if (description)
  {
    stream.write(`${style(stream, dim, description)}\n\n`);
  }
}

export function subheading(stream: NodeJS.WritableStream, headline: string): void {
  stream.write(`\n${style(stream, green, `✦ ${headline}`)}\n`);
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

export const ask = async (rl: readline.Interface, output: NodeJS.WritableStream, question: string, defaultValue: string): Promise<string> => {
  const answerPromise = rl.question(`${style(output, cyan, "›")} ${question}: `);
  rl.write(defaultValue);
  const answer = await answerPromise;
  return answer.trim() || defaultValue;
};

export const confirm = async (rl: readline.Interface, output: NodeJS.WritableStream, question: string, defaultValueIsYes: boolean): Promise<boolean> => {
  const options = defaultValueIsYes ? "[Y/n]" : "[y/N]";
  const answer = await rl.question(`${style(output, cyan, "›")} ${question} ${options}: `);

  if (!answer.trim()) {
    return defaultValueIsYes;
  }

  return ["y", "yes"].includes(answer.trim().toLowerCase());
};
