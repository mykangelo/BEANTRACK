# BeanTrack

BeanTrack (branded **Beanhi** in the UI) is a coffee-bean sorting workstation:
an ESP32 reads two HX711 load cells, a React dashboard records batches, and a
small PHP API stores them in MySQL.

- `src/` — React + Vite dashboard
- `beantrack-api/` — PHP API and database migrations
- `firmware/esp32/` — PlatformIO firmware

## 1. Database and API

The migrations in `beantrack-api/migrations/` are the source of truth for the
schema. `beantrack.sql` is a convenience dump that matches them.

This project is normally run on **XAMPP/LAMPP on Linux**: Apache and its bundled
MySQL on port 3306. XAMPP for Linux labels that server "MySQL", but it is
actually MariaDB 10.4 under the hood. That is fine — it is the database this
project uses. You do **not** need the separate system `mariadb` package, and its
service must stay stopped because it also wants port 3306.

### Start XAMPP

```sh
sudo /opt/lampp/lampp start
sudo /opt/lampp/lampp status
```

`status` should report Apache and MySQL as running. Always use XAMPP's own
client, not the system one:

```sh
/opt/lampp/bin/mysql --version
# Ver 15.1 Distrib 10.4.x-MariaDB ...
```

Running plain `mysql` on PATH can pick up the system MariaDB client, which looks
for `/run/mysqld/mysqld.sock` and fails with "Can't connect to local server"
(ERROR 2002) even when XAMPP is running.

### One-time: create the database and user

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

### Configure the API

```sh
cd beantrack-api
cp config.local.example.php config.local.php
```

Edit `config.local.php` and set `pass` to the password above. The file is
ignored by git. If it does not exist, `db.php` falls back to the
`BEANTRACK_DB_*` environment variables.

### Migrate

```sh
cd beantrack-api
/opt/lampp/bin/php migrate.php
```

`migrate.php` is safe to re-run; it records applied files in
`schema_migrations` and upgrades databases created from the old `beantrack.sql`
dump.

### Deploy the API to Apache

```sh
sudo mkdir -p /opt/lampp/htdocs/beantrack-api
sudo cp ~/Thesis/BEANTRACK/beantrack-api/*.php /opt/lampp/htdocs/beantrack-api/
sudo cp -r ~/Thesis/BEANTRACK/beantrack-api/migrations /opt/lampp/htdocs/beantrack-api/
```

This copies `config.local.php` as well, so Apache uses the same credentials.
Every time you pull changes to `beantrack-api/`, re-run the copy (and
`migrate.php`) so the web root matches the repository.

### Test the API

```sh
curl http://localhost/beantrack-api/get_inventory.php
```

A healthy response is HTTP 200 with JSON containing `"stock"`.

- `Database unavailable` (HTTP 503): MySQL is stopped, or the credentials in
  `config.local.php` are wrong.
- HTTP 404: the API files are not in `/opt/lampp/htdocs/beantrack-api/`.
- HTTP 401: a token is configured but the client did not send it.

### Inventory model

- `stock_batches` are dated FIFO layers. New receipts go into the active layer;
  **Create new stock batch** starts a new layer at 0 kg. Older layers keep their
  stock and remain available.
- A sorting run deducts its actual `input_weight` from the oldest positive layer
  first. If one run spans layers, each allocation is stored as its own movement.
- **Adjust stock** supports Subtract, Add, and Set overall to. Every change is an
  `adjustment` movement with a required reason, shown in its own table and in a
  separate Excel sheet.
- **Emergency reset** writes adjustments to zero and starts a new active layer.
  It never deletes receipts, sorting batches, or history.
- Migration `0004_stock_batches` assigns existing movements to an
  `Opening stock (migrated)` layer, so the balance before and after the upgrade
  is identical. It is safe to re-run.

### Alternative: import the SQL dump

If PHP CLI is not available, create the database and import `beantrack.sql`
through phpMyAdmin. The dump contains no sample batches: record a green bean
receipt on the Inventory page before sorting.

## 2. Frontend

```sh
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/beantrack-api` to Apache on
`http://127.0.0.1:80` (see `vite.config.js`); change that target if Apache uses
another port.

Optional environment variables (put them in `.env.local`, which is ignored by
git):

```sh
VITE_API_BASE=/beantrack-api
VITE_API_TOKEN=                 # must match the token in config.local.php
VITE_ESP32_WS_URL=ws://beantrack.local:81
```

The ESP32 is reached over mDNS. If `beantrack.local` does not resolve on your
network (common on Windows), set `VITE_ESP32_WS_URL` to the board's IP, for
example `ws://192.168.1.50:81`, and restart Vite.

Build a static bundle with `npm run build`, lint with `npm run lint`, and run
the helper tests with `npm test`.

### Dashboard flow

The Dashboard has two states: the live view and a batch setup wizard. The
wizard opens only when the operator presses **New batch** (or **Change setup**
for a confirmed batch); it never opens by itself, so reloading the page during
a run lands on the live view.

1. **Connect** — checks whether the ESP32 is reachable. Wi-Fi setup is optional
   and only needed when the board cannot join its saved network. The operator
   can continue offline to run a simulated batch.
2. **Batch setup** — target batch size, operating mode, bean type, and the
   starting vibration speed in Automatic mode. The panel shows how many grams
   of the selected bean are on hand; a known shortfall blocks the next step.
   The last setup is remembered between sessions.
3. **Review** — a read-only summary of the batch, plus Tare and Calibrate for
   the scale. Confirming binds the setup to one batch and opens the live
   dashboard with the motor controls. Changing the bean, target, or mode later
   requires going through the wizard again.

The live dashboard keeps the run controls in a sticky bar at the bottom:
**Start sorting**, **Stop sorting**, **Tare load cells**, **Calibrate**, and
**Reset batch**. Tare and Calibrate are available whenever the motor is not
running. Reset asks for a second click and clears the run on screen. A
confirmation is consumed when the run ends, so the next batch starts with
**New batch**.

The operating mode decides who owns the vibration speed. In **Automatic** the
dashboard dial sets it, and it can be changed while a batch runs. In **Manual**
the panel potentiometer is the only control; the dashboard dial is visible but
locked and simply mirrors what the board reports. The firmware enforces this —
it ignores `SET_SPEED` in Manual mode — so the two never disagree.

A note on wording: the number labelled **Target batch size** is the target the
sort stops at, not a measurement of what entered the hopper. The dashboard
reports **Not recovered** (target minus the large and medium decks) rather than
calling it a loss, because the difference includes beans that were never
weighed.

## 3. MySQL / XAMPP troubleshooting (Linux)

Check what is actually running:

```sh
sudo /opt/lampp/lampp status
sudo ss -ltnp | grep 3306
```

If something other than XAMPP owns port 3306, stop it. The system MariaDB
service is the usual culprit:

```sh
sudo systemctl disable --now mariadb
```

If MySQL still refuses to start, read XAMPP's error log (the filename is your
hostname):

```sh
sudo tail -50 /opt/lampp/var/mysql/*.err
```

Common messages:

- `Address already in use` / `Bind on TCP/IP port`: another server (often
  system MariaDB, or a temporary test instance) is on 3306. Stop it and run
  `sudo /opt/lampp/lampp startmysql`.
- `Can't connect to local server ... /run/mysqld/mysqld.sock`: you used the
  system `mysql` client. Use `/opt/lampp/bin/mysql`.
- A stale `/opt/lampp/var/mysql/mysql.sock` after a hard crash can be removed
  with `sudo rm -f /opt/lampp/var/mysql/mysql.sock`, then start MySQL again.

Start or stop only the database with:

```sh
sudo /opt/lampp/lampp startmysql
sudo /opt/lampp/lampp stopmysql
```

## 4. Windows / XAMPP

Install Node.js LTS, XAMPP (Apache, PHP, MySQL), VS Code, and the PlatformIO
IDE extension.

1. Clone and install:

   ```powershell
   git clone https://github.com/mykangelo/BEANTRACK.git
   cd BEANTRACK
   npm install
   ```

2. Start **Apache** and **MySQL** in the XAMPP Control Panel.

3. Create the `beantrack` database and user in `http://localhost/phpmyadmin`,
   or import `beantrack.sql` there.

4. Configure and migrate from the repository:

   ```powershell
   Copy-Item beantrack-api\config.local.example.php beantrack-api\config.local.php
   notepad beantrack-api\config.local.php   # set user/pass
   C:\xampp\php\php.exe beantrack-api\migrate.php
   ```

5. Copy the API (including `config.local.php`) to XAMPP's web root:

   ```text
   C:\xampp\htdocs\beantrack-api
   ```

6. Test the API from PowerShell:

   ```powershell
   Invoke-WebRequest http://localhost/beantrack-api/get_inventory.php
   ```

7. Run the frontend and open `http://localhost:5173`:

   ```powershell
   npm run dev
   ```

Do not use Linux commands such as `sudo`, `systemctl`, or `mariadb < ...` in
Windows PowerShell.

### Windows ESP32 firmware

Open `firmware\esp32` as a PlatformIO project, connect the board by USB, then
use PlatformIO's Build, Upload, and Monitor actions, or:

```powershell
cd firmware\esp32
pio run
pio run -t upload
pio device monitor -b 115200
```

See `firmware/esp32/README.md` for Wi-Fi setup and OTA.

## Security notes

- Never commit real Wi-Fi passwords, database passwords, or API tokens.
  `config.local.php` and `.env.local` are ignored by git.
- The default setup-AP password and OTA password in the firmware are development
  defaults. Change them before handing a machine over (see the firmware README).
- The API has no user accounts. Keep it on a trusted LAN; the optional API token
  only deters casual writes.
- Real sorting runs and simulated runs are both stored in `batches`; the
  `source` column distinguishes them. Manual stops are stored with
  `status = 'Partial'`.
