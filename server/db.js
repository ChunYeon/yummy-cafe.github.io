const sqlite3 = require("sqlite3").verbose();
const path = require("path");


// =====================================================
// DATABASE
// =====================================================

const dbPath = path.join(
    __dirname,
    "restaurant.db"
);


const db = new sqlite3.Database(
    dbPath,
    (err) => {

        if (err) {

            console.error(
                "SQLite データベース接続エラー:",
                err
            );

        } else {

            console.log(
                "SQLite データベースに接続しました。"
            );

            console.log(
                "Database:",
                dbPath
            );

        }

    }
);


// =====================================================
// CREATE TABLES
// =====================================================

db.serialize(() => {


    // =================================================
    // USERS
    // =================================================

    db.run(`
        CREATE TABLE IF NOT EXISTS users (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            username TEXT NOT NULL,

            email TEXT NOT NULL,

            password TEXT NOT NULL

        )
    `);


    // =================================================
    // RESERVATIONS
    // =================================================

    db.run(`
        CREATE TABLE IF NOT EXISTS reservations (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            date TEXT NOT NULL,

            time TEXT NOT NULL,

            people INTEGER NOT NULL,

            name TEXT NOT NULL DEFAULT '',

            phone TEXT NOT NULL DEFAULT '',

            email TEXT NOT NULL DEFAULT ''

        )
    `);


    // =================================================
    // FOODS
    // =================================================

    db.run(`
        CREATE TABLE IF NOT EXISTS foods (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            name TEXT NOT NULL,

            price REAL NOT NULL,

            image TEXT,

            desc TEXT

        )
    `);


    // =================================================
    // CHECK OLD RESERVATION DATABASE
    // =================================================
    //
    // 如果以前的 restaurant.db 已经存在，
    // 但是 reservations 表没有 name / phone / email，
    // 就自动添加这些字段。
    //
    // 新数据库则不会重复添加。
    // =================================================

    db.all(
        `
        PRAGMA table_info(reservations)
        `,
        [],
        (err, columns) => {

            if (err) {

                console.error(
                    "予約テーブル確認エラー:",
                    err
                );

                return;

            }


            const columnNames =
                columns.map(
                    column => column.name
                );


            // -------------------------------------------------
            // name
            // -------------------------------------------------

            if (
                !columnNames.includes("name")
            ) {

                db.run(
                    `
                    ALTER TABLE reservations
                    ADD COLUMN name TEXT
                    DEFAULT ''
                    `,
                    (err) => {

                        if (err) {

                            console.error(
                                "name column error:",
                                err
                            );

                        } else {

                            console.log(
                                "reservations.name を追加しました。"
                            );

                        }

                    }
                );

            }


            // -------------------------------------------------
            // phone
            // -------------------------------------------------

            if (
                !columnNames.includes("phone")
            ) {

                db.run(
                    `
                    ALTER TABLE reservations
                    ADD COLUMN phone TEXT
                    DEFAULT ''
                    `,
                    (err) => {

                        if (err) {

                            console.error(
                                "phone column error:",
                                err
                            );

                        } else {

                            console.log(
                                "reservations.phone を追加しました。"
                            );

                        }

                    }
                );

            }


            // -------------------------------------------------
            // email
            // -------------------------------------------------

            if (
                !columnNames.includes("email")
            ) {

                db.run(
                    `
                    ALTER TABLE reservations
                    ADD COLUMN email TEXT
                    DEFAULT ''
                    `,
                    (err) => {

                        if (err) {

                            console.error(
                                "email column error:",
                                err
                            );

                        } else {

                            console.log(
                                "reservations.email を追加しました。"
                            );

                        }

                    }
                );

            }

        }
    );

});


// =====================================================
// EXPORT
// =====================================================

module.exports = db;