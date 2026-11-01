use rusqlite::{
    Connection, OpenFlags, ToSql, params_from_iter,
    types::{ToSqlOutput, Value, ValueRef},
};
use serde::Deserialize;
use serde_json::{Map, Value as Json};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::State;

#[derive(Deserialize)]
#[serde(untagged)]
pub enum Param {
    Null,
    Integer(i64),
    Real(f64),
    Text(String),
}

impl ToSql for Param {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        match self {
            Param::Null => Ok(ToSqlOutput::Owned(Value::Null)),
            Param::Integer(value) => value.to_sql(),
            Param::Real(value) => value.to_sql(),
            Param::Text(value) => value.to_sql(),
        }
    }
}

#[derive(Deserialize)]
pub struct Statement {
    sql: String,
    params: Vec<Param>,
}

type Row = Map<String, Json>;

pub struct Sql {
    writer: Mutex<Connection>,
    reader: Mutex<Connection>,
    backups: PathBuf,
    name: String,
}

type Outcome<T> = Result<T, Box<dyn std::error::Error>>;

fn rows(connection: &Connection, statement: &Statement) -> rusqlite::Result<Vec<Row>> {
    let mut prepared = connection.prepare(&statement.sql)?;
    let mut cursor = prepared.query(params_from_iter(&statement.params))?;
    let mut found = Vec::new();
    while let Some(row) = cursor.next()? {
        let mut record = Row::new();
        for (index, name) in row.as_ref().column_names().enumerate() {
            let value = match row.get_ref(index)? {
                ValueRef::Null => Json::Null,
                ValueRef::Integer(value) => value.into(),
                ValueRef::Real(value) => value.into(),
                ValueRef::Text(value) => String::from_utf8_lossy(value).into_owned().into(),
                ValueRef::Blob(_) => {
                    return Err(rusqlite::Error::InvalidColumnType(
                        index,
                        name.into(),
                        rusqlite::types::Type::Blob,
                    ));
                }
            };
            record.insert(name.into(), value);
        }
        found.push(record);
    }
    Ok(found)
}

fn run(connection: &Connection, statements: &[Statement]) -> rusqlite::Result<()> {
    for statement in statements {
        rows(connection, statement)?;
    }
    Ok(())
}

impl Sql {
    pub fn open(path: &Path) -> Outcome<Self> {
        let folder = path.parent().ok_or("database path has no folder")?;
        fs::create_dir_all(folder)?;
        let writer = Connection::open(path)?;
        writer.pragma_update(None, "journal_mode", "wal")?;
        writer.pragma_update(None, "foreign_keys", "on")?;
        writer.execute_batch("pragma optimize = 0x10002")?;
        let reader = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        let name = path.file_stem().ok_or("database path has no name")?;
        Ok(Self {
            writer: Mutex::new(writer),
            reader: Mutex::new(reader),
            backups: folder.join("backups"),
            name: name.to_string_lossy().into_owned(),
        })
    }

    fn query(&self, statement: &Statement) -> Outcome<Vec<Row>> {
        Ok(rows(&self.reader.lock().unwrap(), statement)?)
    }

    fn batch(&self, statements: &[Statement]) -> Outcome<()> {
        let mut writer = self.writer.lock().unwrap();
        let transaction = writer.transaction()?;
        run(&transaction, statements)?;
        Ok(transaction.commit()?)
    }

    fn migrate(&self, statements: &[Statement]) -> Outcome<()> {
        let mut writer = self.writer.lock().unwrap();
        writer.pragma_update(None, "foreign_keys", "off")?;
        let outcome = (|| -> Outcome<()> {
            let transaction = writer.transaction()?;
            run(&transaction, statements)?;
            if transaction
                .prepare("pragma foreign_key_check")?
                .exists([])?
            {
                return Err("foreign key check failed".into());
            }
            Ok(transaction.commit()?)
        })();
        writer.pragma_update(None, "foreign_keys", "on")?;
        outcome
    }

    fn backup(&self, version: u32) -> Outcome<()> {
        let file = self
            .backups
            .join(format!("{}-before-m{version}.db", self.name));
        if !file.exists() {
            fs::create_dir_all(&self.backups)?;
            let writer = self.writer.lock().unwrap();
            writer.execute("vacuum into ?1", [file.to_string_lossy()])?;
        }
        Ok(())
    }
}

fn text<T>(outcome: Outcome<T>) -> Result<T, String> {
    outcome.map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub fn query(sql: State<Sql>, statement: Statement) -> Result<Vec<Row>, String> {
    text(sql.query(&statement))
}

#[tauri::command(async)]
pub fn batch(sql: State<Sql>, statements: Vec<Statement>) -> Result<(), String> {
    text(sql.batch(&statements))
}

#[tauri::command(async)]
pub fn migrate(sql: State<Sql>, statements: Vec<Statement>) -> Result<(), String> {
    text(sql.migrate(&statements))
}

#[tauri::command(async)]
pub fn backup(sql: State<Sql>, version: u32) -> Result<(), String> {
    text(sql.backup(version))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        env,
        sync::atomic::{AtomicU32, Ordering},
    };

    fn statement(sql: &str, params: &str) -> Statement {
        serde_json::from_value(serde_json::json!({
            "sql": sql,
            "params": serde_json::from_str::<Json>(params).unwrap()
        }))
        .unwrap()
    }

    fn open() -> Sql {
        static NEXT: AtomicU32 = AtomicU32::new(0);
        let id = NEXT.fetch_add(1, Ordering::Relaxed);
        let folder = env::temp_dir().join(format!("garner-{}-{id}", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        let sql = Sql::open(&folder.join("garner.db")).unwrap();
        sql.migrate(&[
            statement("create table institution (id text primary key, name text not null) strict", "[]"),
            statement(
                "create table account (id text primary key, institutionId text not null references institution (id)) strict",
                "[]",
            ),
        ])
        .unwrap();
        sql
    }

    #[test]
    fn values_round_trip_and_the_reader_cannot_write() {
        let sql = open();
        sql.batch(&[statement(
            "insert into institution values (?, ?)",
            r#"["w1", "123456789012345678901234567890"]"#,
        )])
        .unwrap();
        let found = sql
            .query(&statement(
                "select id, name, 7 as whole, 1.5 as part, null as none from institution",
                "[]",
            ))
            .unwrap();
        assert_eq!(
            Json::from(found),
            serde_json::json!([{ "id": "w1", "name": "123456789012345678901234567890", "whole": 7, "part": 1.5, "none": null }])
        );
        let price = sql
            .query(&statement("select ? as usd", "[64229.436329015116]"))
            .unwrap();
        assert_eq!(
            Json::from(price),
            serde_json::json!([{ "usd": 64229.436329015116 }])
        );
        let refused = sql
            .query(&statement("delete from institution", "[]"))
            .unwrap_err()
            .to_string();
        assert!(refused.contains("readonly"), "{refused}");
        let listed = sql
            .query(&statement(
                "select j.value ->> 'id' as id from json_each(?) as j",
                r#"["[{\"id\":\"a\"},{\"id\":\"b\"}]"]"#,
            ))
            .unwrap();
        assert_eq!(
            Json::from(listed),
            serde_json::json!([{ "id": "a" }, { "id": "b" }])
        );
    }

    #[test]
    fn a_batch_is_one_transaction_and_enforces_foreign_keys() {
        let sql = open();
        let broken = sql.batch(&[
            statement("insert into institution values ('w1', 'ledger')", "[]"),
            statement("insert into account values ('a1', 'missing')", "[]"),
        ]);
        assert!(broken.unwrap_err().to_string().contains("FOREIGN KEY"));
        assert!(
            sql.query(&statement("select id from institution", "[]"))
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn a_migration_checks_foreign_keys_at_the_end_and_the_reader_sees_new_columns() {
        let sql = open();
        sql.batch(&[statement(
            "insert into institution values ('w1', 'ledger')",
            "[]",
        )])
        .unwrap();
        assert_eq!(
            sql.query(&statement("select * from institution", "[]"))
                .unwrap()[0]
                .len(),
            2
        );
        let refused = sql.migrate(&[statement(
            "insert into account values ('a1', 'missing')",
            "[]",
        )]);
        assert_eq!(refused.unwrap_err().to_string(), "foreign key check failed");
        assert!(
            sql.query(&statement("select id from account", "[]"))
                .unwrap()
                .is_empty()
        );
        sql.migrate(&[statement(
            "alter table institution add column note text",
            "[]",
        )])
        .unwrap();
        let institution = &sql
            .query(&statement("select * from institution", "[]"))
            .unwrap()[0];
        assert_eq!(
            institution.keys().collect::<Vec<_>>(),
            ["id", "name", "note"]
        );
    }

    #[test]
    fn a_backup_is_written_once_per_version() {
        let sql = open();
        sql.batch(&[statement(
            "insert into institution values ('w1', 'ledger')",
            "[]",
        )])
        .unwrap();
        sql.backup(1).unwrap();
        sql.batch(&[statement(
            "insert into institution values ('w2', 'hot')",
            "[]",
        )])
        .unwrap();
        sql.backup(1).unwrap();
        let copy = Connection::open(sql.backups.join("garner-before-m1.db")).unwrap();
        let institutions: u32 = copy
            .query_row("select count(*) from institution", [], |row| row.get(0))
            .unwrap();
        assert_eq!(institutions, 1);
    }
}
