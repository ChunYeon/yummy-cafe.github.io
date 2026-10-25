
require("dotenv").config({
    path: require("path").join(__dirname, "../.env")
});

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const bcrypt = require("bcryptjs");

const SQLiteStore = require("connect-sqlite3")(session);
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

// =====================================================
// SECURITY SETTINGS
// =====================================================

if (isProduction && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET を設定してください。");
}

const sessionSecret =
    process.env.SESSION_SECRET ||
    "local-development-only-secret-change-before-deploy";

if (!isProduction && !process.env.SESSION_SECRET) {
    console.warn(
        "警告: 開発用セッションキーを使用しています。本番環境では必ず変更してください。"
    );
}

if (isProduction) {
    app.set("trust proxy", 1);
}

// =====================================================
// BASIC SETTINGS
// =====================================================

// 同じ Express サーバーから配信する構成を想定。
// 別オリジンのサイトから API を使う場合は CORS 設定を
// 許可するオリジンだけに限定してください。
app.use(cors());

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// =====================================================
// SESSION
// =====================================================

const sessionDirectory = path.join(__dirname, "..");
const sessionDatabase = path.join(
    sessionDirectory,
    "sessions.sqlite"
);

app.use(session({
    name: "yummy_admin_session",
    secret: sessionSecret,

    store: new SQLiteStore({
        db: path.basename(sessionDatabase),
        dir: sessionDirectory
    }),

    resave: false,
    saveUninitialized: false,

    cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: "strict",
        maxAge: 2 * 60 * 60 * 1000
    }
}));

// =====================================================
// UPLOADS
// =====================================================

// 画像アップロード先
const uploadsDirectory = path.join(__dirname, "../uploads");

fs.mkdirSync(uploadsDirectory, { recursive: true });

app.use(
    "/uploads",
    express.static(uploadsDirectory)
);

// =====================================================
// STAFF TABLE
// =====================================================

// 初回起動時にスタッフ用テーブルを作成。
// create-admin.js でも同じテーブルを作成します。
db.run(`
    CREATE TABLE IF NOT EXISTS staff_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
`, (err) => {
    if (err) {
        console.error("Staff table initialization failed:", err);
        process.exit(1);
    }

    console.log("Staff authentication table is ready.");
});

// =====================================================
// AUTHENTICATION MIDDLEWARE
// =====================================================

function requireStaffApi(req, res, next) {
    if (req.session && req.session.staff) {
        return next();
    }

    return res.status(401).json({
        success: false,
        message: "ログインが必要です。",
        redirect: "/admin/login.html"
    });
}

function requireStaffPage(req, res, next) {
    if (req.session && req.session.staff) {
        return next();
    }

    return res.redirect("/admin/login.html");
}

// =====================================================
// STAFF LOGIN
// POST /api/admin/login
// =====================================================

app.post("/api/admin/login", (req, res) => {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: "ユーザー名とパスワードを入力してください。"
        });
    }

    db.get(
        `SELECT id, username, password_hash
         FROM staff_users
         WHERE username = ?`,
        [username],
        (err, staff) => {
            if (err) {
                console.error("Staff login query failed:", err);

                return res.status(500).json({
                    success: false,
                    message: "ログイン処理に失敗しました。"
                });
            }

            if (!staff) {
                return res.status(401).json({
                    success: false,
                    message: "ユーザー名またはパスワードが正しくありません。"
                });
            }

            bcrypt.compare(password, staff.password_hash, (hashErr, valid) => {
                if (hashErr) {
                    console.error("Password verification failed:", hashErr);

                    return res.status(500).json({
                        success: false,
                        message: "ログイン処理に失敗しました。"
                    });
                }

                if (!valid) {
                    return res.status(401).json({
                        success: false,
                        message: "ユーザー名またはパスワードが正しくありません。"
                    });
                }

                // 登录成功后重新生成 session ID
                req.session.regenerate((sessionErr) => {
                    if (sessionErr) {
                        console.error("Session regeneration failed:", sessionErr);

                        return res.status(500).json({
                            success: false,
                            message: "ログイン処理に失敗しました。"
                        });
                    }

                    req.session.staff = {
                        id: staff.id,
                        username: staff.username
                    };

                    req.session.save((saveErr) => {
                        if (saveErr) {
                            console.error("Session save failed:", saveErr);

                            return res.status(500).json({
                                success: false,
                                message: "ログイン状態を保存できませんでした。"
                            });
                        }

                        return res.json({
                            success: true,
                            message: "ログインしました。",
                            redirect: "/admin/index.html",
                            staff: {
                                id: staff.id,
                                username: staff.username
                            }
                        });
                    });
                });
            });
        }
    );
});

// =====================================================
// CURRENT STAFF
// GET /api/admin/me
// =====================================================

app.get("/api/admin/me", (req, res) => {
    if (!req.session || !req.session.staff) {
        return res.status(401).json({
            success: false,
            loggedIn: false
        });
    }

    return res.json({
        success: true,
        loggedIn: true,
        staff: req.session.staff
    });
});

// =====================================================
// STAFF LOGOUT
// POST /api/admin/logout
// =====================================================

app.post("/api/admin/logout", (req, res) => {
    if (!req.session) {
        return res.json({
            success: true,
            redirect: "/admin/login.html"
        });
    }

    req.session.destroy((err) => {
        if (err) {
            console.error("Logout failed:", err);

            return res.status(500).json({
                success: false,
                message: "ログアウトに失敗しました。"
            });
        }

        res.clearCookie("yummy_admin_session", {
            httpOnly: true,
            secure: isProduction,
            sameSite: "strict"
        });

        return res.json({
            success: true,
            message: "ログアウトしました。",
            redirect: "/admin/login.html"
        });
    });
});

// =====================================================
// ADMIN LOGIN PAGE
// =====================================================

// 登录页是唯一允许未登录访问的后台 HTML 页面。
app.get("/admin/login.html", (req, res) => {
    if (req.session && req.session.staff) {
        return res.redirect("/admin/index.html");
    }

    return res.sendFile(
        path.join(__dirname, "../admin/login.html")
    );
});

// =====================================================
// ADMIN STATIC FILES
// =====================================================

// 必须登录后才能访问 index.html、foods.html、
// reservations.html 以及 admin 目录中的其他静态文件。
app.use(
    "/admin",
    requireStaffPage,
    express.static(
        path.join(__dirname, "../admin"),
        { index: "index.html" }
    )
);

// =====================================================
// PUBLIC WEBSITE
// =====================================================

// public 目录只放公开网站文件。
// 不要将后台管理 HTML 放入 public 目录。
app.use(
    express.static(
        path.join(__dirname, "../public")
    )
);

// =====================================================
// FILE UPLOAD
// =====================================================

const upload = multer({
    dest: uploadsDirectory,
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1
    }
});

// =====================================================
// CUSTOMER REGISTER
// POST /api/register
// =====================================================

app.post("/api/register", (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({
            success: false,
            message: "必要な情報を入力してください。"
        });
    }

    // 保留现有顾客注册逻辑。
    // 此处沿用原项目的 users 表字段结构。
    db.run(
        `INSERT INTO users (username, email, password)
         VALUES (?, ?, ?)`,
        [username, email, password],
        function (err) {
            if (err) {
                console.error("Register error:", err);

                return res.status(500).json({
                    success: false,
                    message: "登録に失敗しました。"
                });
            }

            return res.json({
                success: true,
                message: "登録が完了しました。",
                userId: this.lastID
            });
        }
    );
});

// =====================================================
// CUSTOMER LOGIN
// POST /api/login
// =====================================================

app.post("/api/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: "メールアドレスとパスワードを入力してください。"
        });
    }

    db.get(
        `SELECT * FROM users
         WHERE email = ? AND password = ?`,
        [email, password],
        (err, row) => {
            if (err) {
                console.error("Customer login error:", err);

                return res.status(500).json({
                    success: false,
                    message: "ログインに失敗しました。"
                });
            }

            if (!row) {
                return res.status(401).json({
                    success: false,
                    message: "メールアドレスまたはパスワードが正しくありません。"
                });
            }

            return res.json({
                success: true,
                message: "ログインしました。",
                user: {
                    id: row.id,
                    username: row.username,
                    email: row.email
                }
            });
        }
    );
});

// =====================================================
// CREATE RESERVATION
// POST /api/reserve
// 公開接口：顾客不需要员工登录
// =====================================================

app.post("/api/reserve", (req, res) => {
    const { date, time, people, name, phone, email } = req.body;

    if (!date || !time || !people || !name || !phone || !email) {
        return res.status(400).json({
            success: false,
            message: "予約情報をすべて入力してください。"
        });
    }

    const guestCount = Number(people);

    if (!Number.isInteger(guestCount) || guestCount < 1) {
        return res.status(400).json({
            success: false,
            message: "人数を正しく入力してください。"
        });
    }

    if (guestCount > 8) {
        return res.status(400).json({
            success: false,
            message: "9名様以上のご予約は、お電話でお問い合わせください。"
        });
    }

    const allowedTimes = [
        "10:00", "10:30",
        "11:00", "11:30",
        "12:00", "12:30",
        "13:00", "13:30",
        "14:00", "14:30",
        "15:00", "15:30",
        "16:00", "16:30",
        "17:00", "17:30",
        "18:00", "18:30",
        "19:00", "19:30",
        "20:00", "20:30",
        "21:00"
    ];

    if (!allowedTimes.includes(time)) {
        return res.status(400).json({
            success: false,
            message: "予約時間が正しくありません。"
        });
    }

    db.run(
        `INSERT INTO reservations
         (date, time, people, name, phone, email)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [date, time, guestCount, name, phone, email],
        function (err) {
            if (err) {
                console.error("Reservation error:", err);

                return res.status(500).json({
                    success: false,
                    message: "予約の登録に失敗しました。"
                });
            }

            console.log("Reservation created:", this.lastID);

            return res.json({
                success: true,
                message: "予約が完了しました。",
                reservationId: this.lastID
            });
        }
    );
});

// =====================================================
// PROTECT RESERVATION MANAGEMENT API
// All /api/reservations routes require staff login.
// =====================================================

app.use("/api/reservations", requireStaffApi);

// =====================================================
// GET ALL RESERVATIONS
// GET /api/reservations
// =====================================================

app.get("/api/reservations", (req, res) => {
    db.all(
        `SELECT id, date, time, people, name, phone, email
         FROM reservations
         ORDER BY date ASC, time ASC, id ASC`,
        [],
        (err, rows) => {
            if (err) {
                console.error("Get reservations error:", err);

                return res.status(500).json({
                    success: false,
                    message: "予約情報を取得できませんでした。"
                });
            }

            return res.json({
                success: true,
                reservations: rows
            });
        }
    );
});

// =====================================================
// GET ONE RESERVATION
// GET /api/reservations/:id
// =====================================================

app.get("/api/reservations/:id", (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({
            success: false,
            message: "予約IDが正しくありません。"
        });
    }

    db.get(
        `SELECT id, date, time, people, name, phone, email
         FROM reservations WHERE id = ?`,
        [id],
        (err, row) => {
            if (err) {
                console.error("Get reservation error:", err);

                return res.status(500).json({
                    success: false,
                    message: "予約情報を取得できませんでした。"
                });
            }

            if (!row) {
                return res.status(404).json({
                    success: false,
                    message: "予約が見つかりません。"
                });
            }

            return res.json({
                success: true,
                reservation: row
            });
        }
    );
});

// =====================================================
// DELETE RESERVATION
// DELETE /api/reservations/:id
// =====================================================

app.delete("/api/reservations/:id", (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({
            success: false,
            message: "予約IDが正しくありません。"
        });
    }

    db.run(
        "DELETE FROM reservations WHERE id = ?",
        [id],
        function (err) {
            if (err) {
                console.error("Delete reservation error:", err);

                return res.status(500).json({
                    success: false,
                    message: "予約の削除に失敗しました。"
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: "予約が見つかりません。"
                });
            }

            return res.json({
                success: true,
                message: "予約を削除しました。"
            });
        }
    );
});

// =====================================================
// CREATE FOOD
// POST /api/food
// 只有登录员工可以新增菜单
// =====================================================

app.post(
    "/api/food",
    requireStaffApi,
    upload.single("image"),
    (req, res) => {
        const { name, price, desc } = req.body;

        if (!name || price === undefined || price === "") {
            return res.status(400).json({
                success: false,
                message: "商品名と価格を入力してください。"
            });
        }

        const numericPrice = Number(price);

        if (!Number.isFinite(numericPrice) || numericPrice < 0) {
            return res.status(400).json({
                success: false,
                message: "価格を正しく入力してください。"
            });
        }

        const image = req.file ? req.file.filename : "";

        db.run(
            `INSERT INTO foods (name, price, image, desc)
             VALUES (?, ?, ?, ?)`,
            [name, numericPrice, image, desc || ""],
            function (err) {
                if (err) {
                    console.error("Food insert error:", err);

                    return res.status(500).json({
                        success: false,
                        message: "商品の登録に失敗しました。"
                    });
                }

                return res.json({
                    success: true,
                    message: "商品を登録しました。",
                    foodId: this.lastID
                });
            }
        );
    }
);

// =====================================================
// GET FOODS
// GET /api/foods
// 公開接口：顾客网站仍然可以读取菜单
// =====================================================

app.get("/api/foods", (req, res) => {
    db.all(
        "SELECT * FROM foods ORDER BY id DESC",
        [],
        (err, rows) => {
            if (err) {
                console.error("Get foods error:", err);

                return res.status(500).json({
                    success: false,
                    message: "商品情報を取得できませんでした。"
                });
            }

            return res.json({
                success: true,
                foods: rows
            });
        }
    );
});

// =====================================================
// ERROR HANDLER
// =====================================================

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({
            success: false,
            message: "アップロードに失敗しました。ファイルサイズは5MB以下にしてください。"
        });
    }

    console.error("Unhandled server error:", err);

    return res.status(500).json({
        success: false,
        message: "サーバーエラーが発生しました。"
    });
});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {
    console.log("");
    console.log("========================================");
    console.log("Yummy Café サーバーが起動しました。");
    console.log("http://localhost:" + PORT);
    console.log("管理画面: http://localhost:" + PORT + "/admin/");
    console.log("========================================");
    console.log("");
});
