
require("dotenv").config({
    path: require("path").join(__dirname, "../.env")
});

const readline = require("readline");
const bcrypt = require("bcryptjs");
const db = require("./db");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

function askHidden(question) {
    return new Promise((resolve, reject) => {
        const input = process.stdin;

        if (!input.isTTY || !input.setRawMode) {
            return reject(
                new Error("このコマンドはターミナルで実行してください。")
            );
        }

        process.stdout.write(question);

        let value = "";

        function cleanup() {
            input.removeListener("data", onData);
            input.setRawMode(false);
            input.pause();
            process.stdout.write("\n");
        }

        function onData(char) {
            if (char === "\u0003") {
                cleanup();
                reject(new Error("キャンセルしました。"));
                return;
            }

            if (char === "\r" || char === "\n") {
                cleanup();
                resolve(value);
                return;
            }

            if (char === "\u007f" || char === "\b") {
                value = value.slice(0, -1);
                return;
            }

            if (char.charCodeAt(0) >= 32) {
                value += char;
            }
        }

        input.setRawMode(true);
        input.resume();
        input.setEncoding("utf8");
        input.on("data", onData);
    });
}

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

async function main() {
    try {
        const username = (await ask("员工账号: ")).trim();

        if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(username)) {
            throw new Error(
                "账号必须为 3～50 位，只能使用字母、数字、点、下划线和连字符。"
            );
        }

        const password = await askHidden("员工密码（至少 12 位）: ");

        if (password.length < 12) {
            throw new Error("密码至少需要 12 位。");
        }

        if (Buffer.byteLength(password, "utf8") > 72) {
            throw new Error("密码不能超过 72 字节。");
        }

        const passwordHash = await bcrypt.hash(password, 12);

        await run(`
            CREATE TABLE IF NOT EXISTS staff_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const result = await run(
            `INSERT INTO staff_users (username, password_hash)
             VALUES (?, ?)`,
            [username, passwordHash]
        );

        console.log(`员工账号创建成功，ID：${result.lastID}`);
    } finally {
        rl.close();
        db.close();
    }
}

main().catch(err => {
    console.error("创建员工账号失败：", err.message);
    process.exitCode = 1;
});
