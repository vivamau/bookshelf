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

# Set ownership
sudo chown -R bookshelf:bookshelf /var/www/bookshelf/backend/books
sudo chown -R bookshelf:bookshelf /var/www/bookshelf/backend/covers
sudo chown -R bookshelf:bookshelf /var/www/bookshelf/backend/extracted
```

---

## 7. Configure the Database

```bash
cp backend/data/booksshelf.sample.db backend/data/booksshelf.db
```

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

## 10. Run Database Migrations

```bash
cd /var/www/bookshelf/backend
sudo -u bookshelf node run_migrations.js
```

---

## 11. Start Backend with PM2

Start the application as the `bookshelf` user:

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

## 13. (Optional) Enable HTTPS with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

Follow the prompts to configure SSL automatically.

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
