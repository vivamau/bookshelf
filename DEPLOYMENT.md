# 🚀 Deploying Bookshelf on Ubuntu Server

Here's a complete guide to deploy your application on an Ubuntu server.

---

## 1. Update System & Install Node.js

```bash
# Update package lists
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version
npm --version
```

---

## 2. Install PM2 (Process Manager)

PM2 keeps your Node.js app running and restarts it if it crashes:

```bash
sudo npm install -g pm2
```

---

## 3. Install Nginx (Reverse Proxy)

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## 4. Create a Dedicated User

For security, create a dedicated `bookshelf` user to run the application (instead of running as root):

```bash
# Create a system user with home directory
sudo useradd --system --create-home --shell /bin/false bookshelf

# Create PM2 directory for the user
sudo mkdir -p /home/bookshelf/.pm2
sudo mkdir -p /home/bookshelf/.npm
sudo chown -R bookshelf:bookshelf /home/bookshelf
```

---

## 5. Clone & Set Up the Application

```bash
# Navigate to where you want to install
cd /var/www

# Clone the repository
sudo git clone https://github.com/vivamau/bookshelf.git
cd bookshelf

# Set ownership to bookshelf user
sudo chown -R bookshelf:bookshelf /var/www/bookshelf
```

---

## 6. Create Required Directories

The application needs folders for uploaded books, covers, and extracted content:

```bash
sudo mkdir -p /var/www/bookshelf/backend/books
sudo mkdir -p /var/www/bookshelf/backend/covers
sudo mkdir -p /var/www/bookshelf/backend/extracted
sudo mkdir -p /var/www/bookshelf/backend/data

# Set ownership
sudo chown -R bookshelf:bookshelf /var/www/bookshelf/backend/books
sudo chown -R bookshelf:bookshelf /var/www/bookshelf/backend/covers
sudo chown -R bookshelf:bookshelf /var/www/bookshelf/backend/extracted
sudo chown -R bookshelf:bookshelf /var/www/bookshelf/backend/data
```

---

## 7. Configure the Database

The application automatically creates and initializes the SQLite database (`backend/data/booksshelf.db`) on the first run. No manual configuration is required.

---

## 8. Configure Environment Variables

### Backend

```bash
cp backend/.env.sample backend/.env
nano backend/.env
```

Set your production values:

```env
PORT=3005
```

### Frontend

```bash
cp frontend/.env.sample frontend/.env
nano frontend/.env
```

Set your production API URL (replace with your domain or server IP):

```env
VITE_API_BASE_URL=https://yourdomain.com/api
```

---

## 9. Install Dependencies & Build Frontend

```bash
# Backend
cd /var/www/bookshelf/backend
npm install

# Frontend (install and build for production)
cd /var/www/bookshelf/frontend
npm install
npm run build
```

---

## 10. Database Initialization

Database migrations and initial user seeding (admin, reader, guest) are **handled automatically** when the backend starts. No manual action is needed here.

### Manual Troubleshooting (Optional)

If for any reason you need to run migrations manually or re-seed the database:

```bash
cd /var/www/bookshelf/backend
# Run migrations
sudo -u bookshelf node run_migrations.js

# Seed user roles (if needed separately)
sudo -u bookshelf node seed_userroles.js

# Seed users (if needed separately)
sudo -u bookshelf node seed_users.js
```

---

## 11. Start Backend with PM2

Start the application as the `bookshelf` user. On the first run, this will create the database and the default **admin** user (`admin` / `adminpassword`).

```bash
sudo -u bookshelf PM2_HOME=/home/bookshelf/.pm2 pm2 start /var/www/bookshelf/backend/index.js --name "bookshelf-backend"
sudo -u bookshelf PM2_HOME=/home/bookshelf/.pm2 pm2 save
```

Set up PM2 to start on system boot:

```bash
sudo env PATH=$PATH:/usr/bin PM2_HOME=/home/bookshelf/.pm2 pm2 startup systemd -u bookshelf --hp /home/bookshelf
```

---

## 12. Configure Nginx

Create a new Nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/bookshelf
```

Paste the following (replace `yourdomain.com` with your domain or server IP):

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend - serve static files
    root /var/www/bookshelf/frontend/dist;
    index index.html;

    # Handle frontend routes (SPA)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to backend
    location /api/ {
        rewrite ^/api/(.*) /$1 break;
        proxy_pass http://localhost:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site and test:

```bash
sudo ln -s /etc/nginx/sites-available/bookshelf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 13. Enable HTTPS with Let's Encrypt (Recommended)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

Follow the prompts to configure SSL automatically.

> ⚠️ **HTTPS is required for several reader features.** The browser-side **Caffeine (Wake Lock)** toggle that keeps the system awake during TTS playback only works in a secure context (HTTPS or `localhost`). On a plain `http://` deployment the button is disabled. Other browser APIs (PWA install, clipboard, service workers) also require HTTPS.

---

## 13b. Alternative: HTTPS via Tailscale

If your server isn't reachable from the public internet (home server, private network) you can still get a real HTTPS certificate by exposing Bookshelf over your tailnet. Tailscale provisions a Let's Encrypt cert for `<machine>.<tailnet>.ts.net` automatically, which is enough to satisfy the browser's secure-context requirement.

### 1. Enable HTTPS for your tailnet

In the Tailscale admin console: **DNS → HTTPS Certificates → Enable**.

### 2. Install Tailscale on the server (if not already)

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Note your tailnet hostname (something like `bookshelf.tailnet-name.ts.net`).

### 3. Start `tailscale serve` in front of Nginx

```bash
sudo tailscale serve --bg --https=443 http://localhost:80
```

This fetches a Let's Encrypt cert and proxies `https://<machine>.<tailnet>.ts.net/` → `http://localhost:80` (where Nginx lives). Verify:

```bash
sudo tailscale serve status
```

### 4. Update the Nginx config to redirect HTTP → HTTPS

Because `tailscale serve` proxies back to `localhost:80`, a blanket redirect would loop. Split on the `Host` header — redirect direct HTTP hits, but still serve the app when the request comes from `tailscale serve` (which preserves the original `Host`).

Replace your `/etc/nginx/sites-available/bookshelf` with:

```nginx
# Redirect all direct HTTP hits to the Tailscale HTTPS URL
server {
    listen 80 default_server;
    server_name _;
    return 301 https://<machine>.<tailnet>.ts.net$request_uri;
}

# Serve the app — only matches when tailscale serve forwards to localhost:80
server {
    listen 80;
    server_name <machine>.<tailnet>.ts.net localhost;

    root /var/www/bookshelf/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        rewrite ^/api/(.*) /$1 break;
        proxy_pass http://localhost:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Update the frontend API URL

Edit `frontend/.env`:

```env
VITE_API_BASE_URL=https://<machine>.<tailnet>.ts.net/api
```

Rebuild:

```bash
cd /var/www/bookshelf/frontend && npm run build
```

### 6. Verify

```bash
# Direct HTTP hit should 301 to the HTTPS tailnet URL
curl -I http://localhost/
# → HTTP/1.1 301 Moved Permanently
# → Location: https://<machine>.<tailnet>.ts.net/

# Tailscale HTTPS URL should serve the app
curl -I https://<machine>.<tailnet>.ts.net/
# → HTTP/2 200
```

Open `https://<machine>.<tailnet>.ts.net/` from any tailnet device — the Caffeine button will be active and the URL bar will show a valid cert.

### Notes

- Hitting the raw Tailscale IP (`http://100.x.y.z/`) is still plain HTTP — the redirect block above handles that case.
- Want it reachable from outside the tailnet? Use `tailscale funnel` instead of `tailscale serve` (same syntax). Be aware Funnel exposes the URL to the public internet.
- To tear down: `sudo tailscale serve reset`.

---

## 14. Configure Firewall

```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable
```

---

## 📋 Useful PM2 Commands

Since the app runs as the `bookshelf` user, prefix PM2 commands with `sudo -u bookshelf PM2_HOME=/home/bookshelf/.pm2`:

| Command | Description |
|---------|-------------|
| `sudo -u bookshelf PM2_HOME=/home/bookshelf/.pm2 pm2 status` | Check running processes |
| `sudo -u bookshelf PM2_HOME=/home/bookshelf/.pm2 pm2 logs bookshelf-backend` | View logs |
| `sudo -u bookshelf PM2_HOME=/home/bookshelf/.pm2 pm2 restart bookshelf-backend` | Restart the app |
| `sudo -u bookshelf PM2_HOME=/home/bookshelf/.pm2 pm2 stop bookshelf-backend` | Stop the app |
| `sudo -u bookshelf PM2_HOME=/home/bookshelf/.pm2 pm2 monit` | Real-time monitoring |

### 💡 Optional: Create an Alias

Add this to your `~/.bashrc` to simplify commands:

```bash
echo 'alias pm2-bookshelf="sudo -u bookshelf PM2_HOME=/home/bookshelf/.pm2 pm2"' >> ~/.bashrc
source ~/.bashrc
```

Then you can simply use:
```bash
pm2-bookshelf status
pm2-bookshelf logs bookshelf-backend
pm2-bookshelf restart bookshelf-backend
```

---

## 🔄 Updating the Application

```bash
cd /var/www/bookshelf
sudo git pull
sudo chown -R bookshelf:bookshelf /var/www/bookshelf

# Rebuild frontend if needed
cd frontend
npm install
npm run build

# Restart backend
sudo -u bookshelf PM2_HOME=/home/bookshelf/.pm2 pm2 restart bookshelf-backend
```

---

Your application should now be accessible at `http://yourdomain.com` (or `https://` if you set up SSL)! 🎉
