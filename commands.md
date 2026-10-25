# BeanTrack local commands

Setup: XAMPP/LAMPP on Linux (Apache + its bundled MySQL/MariaDB on 3306), PHP
API under `htdocs`, Vite UI on port 5173. Replace `YOUR_PASSWORD` before using
these commands, and never commit it.

XAMPP calls the server "MySQL", but version 8.2.x ships MariaDB 10.4. That is
normal. Do not start the separate system `mariadb` service; it also binds 3306
and will stop XAMPP's server from starting.

## Start / stop

```sh
sudo /opt/lampp/lampp start          # Apache + MySQL
sudo /opt/lampp/lampp status
sudo /opt/lampp/lampp startmysql     # database only
sudo /opt/lampp/lampp stopmysql
sudo /opt/lampp/lampp stop
```

Always use XAMPP's database client. The plain `mysql` on PATH is the system
client and looks in the wrong socket directory:

```sh
/opt/lampp/bin/mysql --version
```

## If MySQL will not start

```sh
sudo /opt/lampp/lampp status
sudo ss -ltnp | grep 3306
sudo tail -50 /opt/lampp/var/mysql/*.err
```

- `Address already in use` on 3306: stop the other server. For the system
  MariaDB service:

  ```sh
  sudo systemctl disable --now mariadb
  ```

  Then `sudo /opt/lampp/lampp startmysql`.

- `Can't connect to local server ... /run/mysqld/mysqld.sock`: you ran the
  system `mysql` client. Use `/opt/lampp/bin/mysql`.

- Stale socket after a crash (only if the log says the socket is the problem):

  ```sh
  sudo rm -f /opt/lampp/var/mysql/mysql.sock
  sudo /opt/lampp/lampp startmysql
  ```

## One-time: database and user

```sh
sudo /opt/lampp/bin/mysql -u root -e "
  CREATE DATABASE IF NOT EXISTS beantrack CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
  CREATE USER IF NOT EXISTS 'beantrack'@'localhost' IDENTIFIED BY 'YOUR_PASSWORD';
  CREATE USER IF NOT EXISTS 'beantrack'@'127.0.0.1' IDENTIFIED BY 'YOUR_PASSWORD';
  GRANT ALL PRIVILEGES ON beantrack.* TO 'beantrack'@'localhost';
  GRANT ALL PRIVILEGES ON beantrack.* TO 'beantrack'@'127.0.0.1';
  FLUSH PRIVILEGES;
"
```

If the user already exists with another password, reset it with:

```sh
sudo /opt/lampp/bin/mysql -u root -e "
  ALTER USER 'beantrack'@'localhost' IDENTIFIED BY 'YOUR_PASSWORD';
  ALTER USER 'beantrack'@'127.0.0.1' IDENTIFIED BY 'YOUR_PASSWORD';
  FLUSH PRIVILEGES;
"
```

## Configure the API

```sh
cd ~/Thesis/BEANTRACK/beantrack-api
cp config.local.example.php config.local.php
```

Edit `config.local.php` and set `user` / `pass`. The file is ignored by git.

## Migrate the database

```sh
cd ~/Thesis/BEANTRACK/beantrack-api
/opt/lampp/bin/php migrate.php
```

The command is safe to re-run. It also upgrades databases created from the old
`beantrack.sql` dump.

## Deploy the API to Apache

```sh
sudo mkdir -p /opt/lampp/htdocs/beantrack-api
sudo cp ~/Thesis/BEANTRACK/beantrack-api/*.php /opt/lampp/htdocs/beantrack-api/
sudo cp -r ~/Thesis/BEANTRACK/beantrack-api/migrations /opt/lampp/htdocs/beantrack-api/
```

Re-run this after pulling changes to `beantrack-api/`. The copy includes
`config.local.php`, so Apache and the CLI migrations use the same credentials.

## Check the API

```sh
curl -i http://localhost/beantrack-api/get_inventory.php
```

A good response is HTTP 200 with JSON that includes `"stock"`.

- HTTP 404: API files are not in `/opt/lampp/htdocs/beantrack-api/`
- HTTP 401: a token is configured but the token was not sent
- HTTP 503 / `Database unavailable`: MySQL is down, or the credentials in
  `config.local.php` do not match the database user

## Inventory behavior

- Receipts go into the active stock batch. **Create new stock batch** starts a
  new dated FIFO layer at 0 kg; older layers keep their stock.
- Sorting consumes the actual input weight from the oldest positive layer first.
  A single run can consume more than one layer.
- **Adjust stock** subtracts, adds, or sets the overall balance. Each change is
  audited with a reason and appears in the separate adjustments table/sheet.
- **Emergency reset** zeroes stock with adjustments and starts a fresh active
  layer. It does not delete history.

## Run the UI

```sh
cd ~/Thesis/BEANTRACK
npm run dev
```

Open **http://localhost:5173**. Keep XAMPP running while you use the app.
