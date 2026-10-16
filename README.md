# BeanTrack

## BeanTrack local setup

Create and import the MariaDB database:

```sh
sudo mariadb -e "CREATE DATABASE IF NOT EXISTS beantrack CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"
sudo mariadb beantrack < beantrack.sql
sudo mariadb -e "GRANT ALL PRIVILEGES ON beantrack.* TO 'myklinuxx'@'localhost'; FLUSH PRIVILEGES;"
```

The PHP API defaults to `127.0.0.1`, user `myklinuxx`, and an empty password. Override these with `BEANTRACK_DB_HOST`, `BEANTRACK_DB_USER`, `BEANTRACK_DB_PASS`, or `BEANTRACK_DB_NAME` when needed.

The Apache alias in `/etc/httpd/conf/httpd.conf` must be loaded before testing the API:

```sh
sudo httpd -t
sudo systemctl reload httpd
```

Vite proxies `/beantrack-api` to Apache during development. Run the frontend with `npm run dev`.

## Windows setup

Install Node.js LTS, XAMPP (Apache, PHP, and MySQL), VS Code, and the PlatformIO IDE extension.

Clone and install the project from PowerShell:

```powershell
git clone https://github.com/mykangelo/BEANTRACK.git
cd BEANTRACK
npm install
```

Copy `beantrack-api` to XAMPP's web root:

```text
C:\xampp\htdocs\beantrack-api
```

For the default XAMPP installation, `db.php` should use:

```php
$host = "localhost";
$user = "root";
$pass = "";
$dbname = "beantrack";
```

Start **Apache** and **MySQL** in the XAMPP Control Panel. Open `http://localhost/phpmyadmin`, create a database named `beantrack`, select it, choose **Import**, and import `beantrack.sql`.

Test the API from PowerShell:

```powershell
Invoke-WebRequest http://localhost/beantrack-api/get_batches.php
```

Run the frontend:

```powershell
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/beantrack-api` to Apache on port 80. If Apache uses another port, update `vite.config.js` and restart Vite.

### Windows ESP32 firmware

Open `firmware\esp32` as a PlatformIO project in VS Code. Edit `src\main.cpp` and set the ESP32's 2.4 GHz Wi-Fi credentials. Connect the ESP32 by USB, then use PlatformIO's Build, Upload, and Monitor actions.

From a PlatformIO PowerShell terminal:

```powershell
cd firmware\esp32
pio run
pio run -t upload
pio device monitor -b 115200
```

Keep the laptop and ESP32 on the same 2.4 GHz network. The firmware WebSocket is available at `ws://beantrack.local:81`.

Do not use Linux commands such as `sudo`, `systemctl`, or `mariadb < beantrack.sql` in Windows PowerShell.


## Security notes

- Never commit real Wi-Fi passwords or database credentials.
- Keep `.pio`, `node_modules`, `dist`, and firmware binaries out of Git.
- Use a dedicated database user with a password outside local development.
