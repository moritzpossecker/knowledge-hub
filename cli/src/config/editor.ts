import { spawn } from "node:child_process";
import { access, writeFile } from "node:fs/promises";
import { defaultConfig } from "./defaultConfig.js";

export async function openInEditor(filePath: string): Promise<void> {
    try {
        await access(filePath);
    } catch {
        await writeFile(filePath, JSON.stringify(defaultConfig, null, 2), "utf8");
    }

    const editor = process.env.EDITOR || "code";
    const args = editor === "code" ? ["--wait", filePath] : [filePath];

    return new Promise((resolve, reject) => {
        const child = spawn(editor, args, { stdio: "inherit" });

        child.on("exit", (code, signal) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Editor exited with code ${code} (Signal: ${signal})`));
            }
        });

        child.on("error", (err) => {
            reject(new Error(`Failed to start editor '${editor}': ${err.message}`));
        });
    });
}