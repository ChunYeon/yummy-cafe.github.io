const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");

const db = require("./db");

const app = express();


// =====================================================
// BASIC SETTINGS
// =====================================================

app.use(cors());

app.use(
    express.json()
);

app.use(
    express.urlencoded({
        extended: true
    })
);


// =====================================================
// STATIC FILES
// =====================================================


// -----------------------------------------------------
// UPLOADS
// -----------------------------------------------------

app.use(
    "/uploads",
    express.static(
        path.join(
            __dirname,
            "../uploads"
        )
    )
);


// -----------------------------------------------------
// PUBLIC
// -----------------------------------------------------

app.use(
    express.static(
        path.join(
            __dirname,
            "../public"
        )
    )
);


// -----------------------------------------------------
// ADMIN
// -----------------------------------------------------
//
// admin 文件夹：
// restaurant-sqlite/admin/
//
// 浏览器访问：
// http://localhost:3000/admin/reservations.html
//
// -----------------------------------------------------

app.use(
    "/admin",
    express.static(
        path.join(
            __dirname,
            "../admin"
        )
    )
);


// =====================================================
// FILE UPLOAD
// =====================================================

const upload = multer({
    dest: path.join(
        __dirname,
        "../uploads/"
    )
});


// =====================================================
// USER REGISTER
// =====================================================

app.post(
    "/api/register",
    (req, res) => {

        const {
            username,
            email,
            password
        } = req.body;


        // -------------------------------------------------
        // CHECK REQUIRED DATA
        // -------------------------------------------------

        if (
            !username ||
            !email ||
            !password
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "必要な情報を入力してください。"

            });

        }


        // -------------------------------------------------
        // INSERT USER
        // -------------------------------------------------

        db.run(
            `
            INSERT INTO users
            (
                username,
                email,
                password
            )
            VALUES (?, ?, ?)
            `,
            [
                username,
                email,
                password
            ],
            function(err) {

                if (err) {

                    console.error(
                        "Register error:",
                        err
                    );


                    return res.status(500).json({

                        success: false,

                        message:
                            "登録に失敗しました。"

                    });

                }


                res.json({

                    success: true,

                    message:
                        "登録が完了しました。",

                    userId:
                        this.lastID

                });

            }
        );

    }
);


// =====================================================
// USER LOGIN
// =====================================================

app.post(
    "/api/login",
    (req, res) => {

        const {
            email,
            password
        } = req.body;


        // -------------------------------------------------
        // CHECK REQUIRED DATA
        // -------------------------------------------------

        if (
            !email ||
            !password
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "メールアドレスとパスワードを入力してください。"

            });

        }


        // -------------------------------------------------
        // FIND USER
        // -------------------------------------------------

        db.get(
            `
            SELECT *
            FROM users
            WHERE email = ?
            AND password = ?
            `,
            [
                email,
                password
            ],
            (err, row) => {

                if (err) {

                    console.error(
                        "Login error:",
                        err
                    );


                    return res.status(500).json({

                        success: false,

                        message:
                            "ログインに失敗しました。"

                    });

                }


                // -------------------------------------------------
                // USER NOT FOUND
                // -------------------------------------------------

                if (!row) {

                    return res.status(401).json({

                        success: false,

                        message:
                            "メールアドレスまたはパスワードが正しくありません。"

                    });

                }


                // -------------------------------------------------
                // LOGIN SUCCESS
                // -------------------------------------------------

                res.json({

                    success: true,

                    message:
                        "ログインしました。",

                    user: {

                        id:
                            row.id,

                        username:
                            row.username,

                        email:
                            row.email

                    }

                });

            }
        );

    }
);


// =====================================================
// CREATE RESERVATION
// =====================================================

app.post(
    "/api/reserve",
    (req, res) => {

        const {
            date,
            time,
            people,
            name,
            phone,
            email
        } = req.body;


        // -------------------------------------------------
        // CHECK REQUIRED DATA
        // -------------------------------------------------

        if (
            !date ||
            !time ||
            !people ||
            !name ||
            !phone ||
            !email
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "予約情報をすべて入力してください。"

            });

        }


        // -------------------------------------------------
        // CHECK PEOPLE
        // -------------------------------------------------

        const guestCount =
            Number(people);


        if (
            !Number.isInteger(
                guestCount
            ) ||
            guestCount < 1
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "人数を正しく入力してください。"

            });

        }


        // -------------------------------------------------
        // MAX PEOPLE
        // -------------------------------------------------

        if (
            guestCount > 8
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "9名様以上のご予約は、お電話でお問い合わせください。"

            });

        }


        // -------------------------------------------------
        // ALLOWED TIMES
        // -------------------------------------------------

        const allowedTimes = [

            "10:00",
            "10:30",

            "11:00",
            "11:30",

            "12:00",
            "12:30",

            "13:00",
            "13:30",

            "14:00",
            "14:30",

            "15:00",
            "15:30",

            "16:00",
            "16:30",

            "17:00",
            "17:30",

            "18:00",
            "18:30",

            "19:00",
            "19:30",

            "20:00",
            "20:30",

            "21:00"

        ];


        if (
            !allowedTimes.includes(
                time
            )
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "予約時間が正しくありません。"

            });

        }


        // -------------------------------------------------
        // INSERT RESERVATION
        // -------------------------------------------------

        db.run(
            `
            INSERT INTO reservations
            (
                date,
                time,
                people,
                name,
                phone,
                email
            )
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [
                date,
                time,
                guestCount,
                name,
                phone,
                email
            ],
            function(err) {

                if (err) {

                    console.error(
                        "Reservation error:",
                        err
                    );


                    return res.status(500).json({

                        success: false,

                        message:
                            "予約の登録に失敗しました。"

                    });

                }


                // -------------------------------------------------
                // RESERVATION SUCCESS
                // -------------------------------------------------

                console.log(
                    "Reservation created:",
                    this.lastID
                );


                res.json({

                    success: true,

                    message:
                        "予約が完了しました。",

                    reservationId:
                        this.lastID

                });

            }
        );

    }
);


// =====================================================
// GET ALL RESERVATIONS
// =====================================================

app.get(
    "/api/reservations",
    (req, res) => {

        db.all(
            `
            SELECT
                id,
                date,
                time,
                people,
                name,
                phone,
                email
            FROM reservations
            ORDER BY
                date ASC,
                time ASC,
                id ASC
            `,
            [],
            (err, rows) => {

                if (err) {

                    console.error(
                        "Get reservations error:",
                        err
                    );


                    return res.status(500).json({

                        success: false,

                        message:
                            "予約情報を取得できませんでした。"

                    });

                }


                // -------------------------------------------------
                // RETURN DATA
                // -------------------------------------------------

                res.json({

                    success: true,

                    reservations:
                        rows

                });

            }
        );

    }
);


// =====================================================
// GET ONE RESERVATION
// =====================================================

app.get(
    "/api/reservations/:id",
    (req, res) => {

        const id =
            Number(
                req.params.id
            );


        if (
            !Number.isInteger(id)
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "予約IDが正しくありません。"

            });

        }


        db.get(
            `
            SELECT
                id,
                date,
                time,
                people,
                name,
                phone,
                email
            FROM reservations
            WHERE id = ?
            `,
            [id],
            (err, row) => {

                if (err) {

                    console.error(
                        "Get reservation error:",
                        err
                    );


                    return res.status(500).json({

                        success: false,

                        message:
                            "予約情報を取得できませんでした。"

                    });

                }


                if (!row) {

                    return res.status(404).json({

                        success: false,

                        message:
                            "予約が見つかりません。"

                    });

                }


                res.json({

                    success: true,

                    reservation:
                        row

                });

            }
        );

    }
);


// =====================================================
// DELETE RESERVATION
// =====================================================

app.delete(
    "/api/reservations/:id",
    (req, res) => {

        const id =
            Number(
                req.params.id
            );


        // -------------------------------------------------
        // CHECK ID
        // -------------------------------------------------

        if (
            !Number.isInteger(id)
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "予約IDが正しくありません。"

            });

        }


        // -------------------------------------------------
        // DELETE
        // -------------------------------------------------

        db.run(
            `
            DELETE FROM reservations
            WHERE id = ?
            `,
            [id],
            function(err) {

                if (err) {

                    console.error(
                        "Delete reservation error:",
                        err
                    );


                    return res.status(500).json({

                        success: false,

                        message:
                            "予約の削除に失敗しました。"

                    });

                }


                // -------------------------------------------------
                // NOT FOUND
                // -------------------------------------------------

                if (
                    this.changes === 0
                ) {

                    return res.status(404).json({

                        success: false,

                        message:
                            "予約が見つかりません。"

                    });

                }


                // -------------------------------------------------
                // SUCCESS
                // -------------------------------------------------

                res.json({

                    success: true,

                    message:
                        "予約を削除しました。"

                });

            }
        );

    }
);


// =====================================================
// FOOD CREATE
// =====================================================

app.post(
    "/api/food",
    upload.single("image"),
    (req, res) => {

        const {
            name,
            price,
            desc
        } = req.body;


        // -------------------------------------------------
        // CHECK REQUIRED DATA
        // -------------------------------------------------

        if (
            !name ||
            !price
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "商品名と価格を入力してください。"

            });

        }


        // -------------------------------------------------
        // IMAGE
        // -------------------------------------------------

        const image =
            req.file
                ? req.file.filename
                : "";


        // -------------------------------------------------
        // INSERT FOOD
        // -------------------------------------------------

        db.run(
            `
            INSERT INTO foods
            (
                name,
                price,
                image,
                desc
            )
            VALUES (?, ?, ?, ?)
            `,
            [
                name,
                price,
                image,
                desc || ""
            ],
            function(err) {

                if (err) {

                    console.error(
                        "Food insert error:",
                        err
                    );


                    return res.status(500).json({

                        success: false,

                        message:
                            "商品の登録に失敗しました。"

                    });

                }


                res.json({

                    success: true,

                    message:
                        "商品を登録しました。",

                    foodId:
                        this.lastID

                });

            }
        );

    }
);


// =====================================================
// GET FOODS
// =====================================================

app.get(
    "/api/foods",
    (req, res) => {

        db.all(
            `
            SELECT
                *
            FROM foods
            ORDER BY
                id DESC
            `,
            [],
            (err, rows) => {

                if (err) {

                    console.error(
                        "Get foods error:",
                        err
                    );


                    return res.status(500).json({

                        success: false,

                        message:
                            "商品情報を取得できませんでした。"

                    });

                }


                res.json({

                    success: true,

                    foods:
                        rows

                });

            }
        );

    }
);


// =====================================================
// START SERVER
// =====================================================

const PORT = process.env.PORT || 3000;

app.listen(
    PORT,
    () => {

        console.log("");

        console.log(
            "========================================"
        );

        console.log(
            "Yummy Café サーバーが起動しました。"
        );

        console.log(
            "http://localhost:" + PORT
        );

        console.log(
            "管理画面:"
        );

        console.log(
            "http://localhost:" +
            PORT +
            "/admin/"
        );

        console.log(
            "========================================"
        );

        console.log("");

    }
);