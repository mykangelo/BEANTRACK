# React + Vite

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

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
