require("dotenv").config({
    path: require("path").join(__dirname, "../.env")
});

const express = require("express");
const cors = require("cors");
const path = require("path");
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

app.use(cors());

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// =====================================================
// SESSION
// =====================================================

const sessionDirectory = path.join(__dirname, "..");

app.use(session({
    name: "yummy_admin_session",

    secret: sessionSecret,

    store: new SQLiteStore({
        db: "sessions.sqlite",
        dir: sessionDirectory
    }),

    resave: false,
    saveUninitialized: false,

    cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: "strict",
        maxAge: null
    }
}));

// =====================================================
// STAFF TABLE
// =====================================================

// 初回起動時に管理者テーブルを作成
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

// 管理者専用 API
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

// 管理者専用ページ
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

            bcrypt.compare(
                password,
                staff.password_hash,
                (hashErr, valid) => {
                    if (hashErr) {
                        console.error(
                            "Password verification failed:",
                            hashErr
                        );

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

                    // ログイン成功後、Session IDを再生成
                    req.session.regenerate((sessionErr) => {
                        if (sessionErr) {
                            console.error(
                                "Session regeneration failed:",
                                sessionErr
                            );

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
                                console.error(
                                    "Session save failed:",
                                    saveErr
                                );

                                return res.status(500).json({
                                    success: false,
                                    message: "ログイン状態を保存できませんでした。"
                                });
                            }

                            return res.json({
                                success: true,
                                message: "ログインしました。",
                                redirect: "/admin/reservations.html",
                                staff: {
                                    id: staff.id,
                                    username: staff.username
                                }
                            });
                        });
                    });
                }
            );
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
// GET /admin/login.html
// =====================================================

// 未ログインでもアクセスできる管理者ログインページ
app.get("/admin/login.html", (req, res) => {
    if (req.session && req.session.staff) {
        return res.redirect("/admin/reservations.html");
    }

    return res.sendFile(
        path.join(__dirname, "../admin/login.html")
    );
});

// =====================================================
// ADMIN STATIC FILES
// =====================================================

// 管理者ログイン後のみアクセス可能
// index.html は自動表示しない
app.use(
    "/admin",
    requireStaffPage,
    express.static(
        path.join(__dirname, "../admin"),
        { index: false }
    )
);

// =====================================================
// PUBLIC WEBSITE
// =====================================================

// 顧客用の公開ページ
app.use(
    express.static(
        path.join(__dirname, "../public")
    )
);

// =====================================================
// CREATE RESERVATION
// POST /api/reserve
// 顧客はログイン不要
// =====================================================

app.post("/api/reserve", (req, res) => {
    const date = String(req.body.date || "").trim();
    const time = String(req.body.time || "").trim();
    const name = String(req.body.name || "").trim();
    const phone = String(req.body.phone || "").trim();
    const email = String(req.body.email || "").trim();

    const guestCount = Number(req.body.people);

    // 必須項目の確認
    if (
        !date ||
        !time ||
        !name ||
        !phone ||
        !email ||
        req.body.people === undefined ||
        req.body.people === ""
    ) {
        return res.status(400).json({
            success: false,
            message: "予約情報をすべて入力してください。"
        });
    }

    // 人数チェック
    if (
        !Number.isInteger(guestCount) ||
        guestCount < 1 ||
        guestCount > 8
    ) {
        return res.status(400).json({
            success: false,
            message: "ご利用人数は1名様から8名様までです。"
        });
    }

    // 予約可能時間
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

    // 日付格式检查
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({
            success: false,
            message: "予約日が正しくありません。"
        });
    }

    // 预约数据写入 SQLite
    db.run(
        `INSERT INTO reservations
         (date, time, people, name, phone, email)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
            date,
            time,
            guestCount,
            name,
            phone,
            email
        ],
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
// 管理者ログインが必要
// =====================================================

app.use(
    "/api/reservations",
    requireStaffApi
);

// =====================================================
// GET ALL RESERVATIONS
// GET /api/reservations
// =====================================================

app.get("/api/reservations", (req, res) => {
    db.all(
        `SELECT
            id,
            date,
            time,
            people,
            name,
            phone,
            email
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
        `SELECT
            id,
            date,
            time,
            people,
            name,
            phone,
            email
         FROM reservations
         WHERE id = ?`,
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
// GET FOODS
// GET /api/foods
// 顧客サイト用：メニュー情報の読み取り
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
    console.log("管理者ログイン: http://localhost:" + PORT + "/admin/login.html");
    console.log("予約管理: http://localhost:" + PORT + "/admin/reservations.html");
    console.log("========================================");
    console.log("");
});