import { WriteStream } from "node:tty";
import readline from "node:readline/promises";

const reset = "\x1b[0m";
const bold = "\x1b[1m";
const dim = "\x1b[2m";
const cyan = "\x1b[36m";
const green = "\x1b[32m";
const yellow = "\x1b[33m";
const red = "\x1b[31m";
const gray = "\x1b[90m";
const blue = "\x1b[34m";

const ansiPattern = /\x1b\[[0-9;]*m/g;

const defaultTerminalWidth = 80;
const minimumTerminalWidth = 40;

function visibleLength(value: string): number {
  return value.replace(ansiPattern, "").length;
}

function terminalWidth(stream: NodeJS.WritableStream): number {
  if (stream instanceof WriteStream && stream.isTTY) {
    return Math.max(
      minimumTerminalWidth,
      stream.columns ?? defaultTerminalWidth,
    );
  }

  return defaultTerminalWidth;
}

function truncate(value: string, maxLength: number): string {
  const plainValue = value.replace(ansiPattern, "");

  if (plainValue.length <= maxLength) {
    return value;
  }

  if (maxLength <= 1) {
    return "…";
  }

  return `${plainValue.slice(0, maxLength - 1)}…`;
}

function colorEnabled(stream: NodeJS.WritableStream): boolean {
  return (
    !process.env.NO_COLOR &&
    stream instanceof WriteStream &&
    stream.isTTY
  );
}

export function style(
  stream: NodeJS.WritableStream,
  code: string,
  text: string,
): string {
  return colorEnabled(stream) ? `${code}${text}${reset}` : text;
}

export function header(
  stream: NodeJS.WritableStream,
  command: string,
  description: string,
): void {
  stream.write(
    `\n${style(stream, bold + cyan, "✦ knowledge hub")}  ${style(
      stream,
      dim,
      `/ ${command}`,
    )}\n`,
  );

  stream.write(`${style(stream, dim, description)}\n\n`);
}

export function heading(
  stream: NodeJS.WritableStream,
  headline: string,
  description?: string,
): void {
  stream.write(`\n${style(stream, bold + cyan, `✦ ${headline}`)}\n`);

  if (description) {
    stream.write(`${style(stream, dim, description)}\n\n`);
  }
}

export function subheading(
  stream: NodeJS.WritableStream,
  headline: string,
): void {
  stream.write(`\n${style(stream, green, `✦ ${headline}`)}\n`);
}

export function success(
  stream: NodeJS.WritableStream,
  message: string,
): void {
  stream.write(`${style(stream, green, "✓")} ${message}\n`);
}

export function note(
  stream: NodeJS.WritableStream,
  message: string,
): void {
  stream.write(`${style(stream, cyan, "›")} ${message}\n`);
}

export function error(
  stream: NodeJS.WritableStream,
  err: unknown,
): void {
  const message = err instanceof Error ? err.message : String(err);

  stream.write(
    `${style(stream, red + bold, "Error:")} ${message}\n`,
  );
}

export function panel(
  stream: NodeJS.WritableStream,
  title: string,
  rows: Array<[label: string, value: string]>,
): void {
  const labelWidth = Math.max(
    ...rows.map(([label]) => label.length),
    0,
  );

  // Account for:
  // - left border and space: 2 characters
  // - right space and border: 2 characters
  const innerWidth = terminalWidth(stream) - 4;
  const valueWidth = Math.max(
    1,
    innerWidth - labelWidth - 2,
  );

  const content = rows.map(([label, value]) => {
    const formattedLabel = style(
      stream,
      gray,
      label.padEnd(labelWidth),
    );

    const formattedValue = truncate(value, valueWidth);

    return `${formattedLabel}  ${formattedValue}`;
  });

  const width = Math.max(
    innerWidth,
    title.length,
  );

  const titleLine = `┌─ ${title} ${"─".repeat(
    Math.max(0, width - title.length - 1),
  )}┐`;

  const bottomLine = `└${"─".repeat(width + 2)}┘`;

  stream.write(`\n${style(stream, blue, titleLine)}\n`);

  for (const line of content) {
    const padding = " ".repeat(width - visibleLength(line));

    stream.write(
      `${style(stream, blue, "│")} ${line}${padding} ${style(
        stream,
        blue,
        "│",
      )}\n`,
    );
  }

  stream.write(`${style(stream, blue, bottomLine)}\n`);
}

export const ask = async (
  rl: readline.Interface,
  output: NodeJS.WritableStream,
  question: string,
  defaultValue: string,
): Promise<string> => {
  const answerPromise = rl.question(
    `${style(output, cyan, "›")} ${question}: `,
  );

  rl.write(defaultValue);

  const answer = await answerPromise;
  return answer.trim() || defaultValue;
};

export const confirm = async (
  rl: readline.Interface,
  output: NodeJS.WritableStream,
  question: string,
  defaultValueIsYes: boolean,
): Promise<boolean> => {
  const options = defaultValueIsYes ? "[Y/n]" : "[y/N]";

  const answer = await rl.question(
    `${style(output, cyan, "›")} ${question} ${options}: `,
  );

  if (!answer.trim()) {
    return defaultValueIsYes;
  }

  return ["y", "yes"].includes(answer.trim().toLowerCase());
};