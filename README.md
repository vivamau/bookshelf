# 📚 Bookshelf

A full-stack web application for managing your personal book collection. Built with a Node.js/Express backend and a React/Vite frontend.

## 🚀 Features

- **Book Management**: Add, edit, and organize your book collection
- **Author & Genre Tracking**: Categorize books by authors and genres
- **OPDS Feed**: Access your library via OPDS-compatible readers
- **User Authentication**: Secure login with JWT-based authentication
- **Responsive Design**: Modern UI built with React and TailwindCSS
- **Comic Support**: Native support for CBR, CBZ, RAR, and ZIP comic archives with a built-in web reader
- **Audiobook Management**: Upload complete audiobook folders, browse and play protected audio, edit metadata, and download collections

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher recommended)
- **npm** (comes with Node.js)

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone https://github.com/vivamau/bookshelf.git
cd bookshelf
```

### 2. Set Up the Database

The project automatically creates and initializes a SQLite database (`backend/data/booksshelf.db`) on the first run.

### 3. Configure Environment Variables

#### Backend Configuration

Navigate to the backend folder and create your `.env` file from the sample:

```bash
cd backend
cp .env.sample .env
```

Edit `backend/.env` and configure the following:

```env
PORT=3005
ALLOWED_ORIGINS=http://localhost:5173
MAX_UPLOAD_FILE_SIZE_MB=4096
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=Bookshelf <your_email@gmail.com>
```

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | The port the backend server will run on | `3005` |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed origins for CORS | `http://example.com` |
| `MAX_UPLOAD_FILE_SIZE_MB` | Maximum size in MB for one uploaded book or audiobook file | `4096` |
| `SMTP_HOST` | SMTP Server Hostname | `smtp.example.com` |
| `SMTP_PORT` | SMTP Server Port | `587` |
| `SMTP_USER` | SMTP Username | `user@example.com` |
| `SMTP_PASS` | SMTP Password | `password` |
| `SMTP_SECURE` | Set to `true` if using port 465 | `false` |
| `SMTP_FROM` | Sender email address | `noreply@bookshelf.com` |

#### Frontend Configuration

Navigate to the frontend folder and create your `.env` file from the sample:

```bash
cd ../frontend
cp .env.sample .env
```

Edit `frontend/.env` and configure the following:

```env
VITE_API_BASE_URL=http://localhost:3005
```

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | The URL where the backend API is running | `http://localhost:3005` |

> **Note**: If you change the backend `PORT`, make sure to update `VITE_API_BASE_URL` accordingly.

### 4. Install Dependencies

Install backend dependencies:

```bash
cd backend
npm install
```

Install frontend dependencies:

```bash
cd ../frontend
npm install
```

## ▶️ Running the Application

### Start the Backend Server

From the project root or backend directory:

```bash
cd backend
npm start
```

This will:
1. Run database migrations
2. Seed default users (if the database is new)
3. Start the Express server on the configured port (default: `http://localhost:3005`)

### Default Users (Security Warning ⚠️)

On the first run, the system seeds the following default users (only if the `Users` table is empty):

| Role | Username | Email | Password |
|------|----------|----------------------|------------------|
| Librarian (Admin) | `admin` | `admin@bookshelf.com` | `adminpassword` |
| Reader | `reader1` | `reader@bookshelf.com` | `readerpassword` |
| Guest | `guest1` | `guest@bookshelf.com` | `guestpassword` |

Seeding logic lives in `backend/seed_userroles.js` (roles) and `backend/seed_users.js` (users) and is invoked automatically by `backend/index.js` at startup.

**IMPORTANT**: Please change these passwords or remove these users immediately after your first login to secure your installation.

### Start the Frontend Development Server

In a new terminal, from the project root or frontend directory:

```bash
cd frontend
npm run dev
```

The frontend will be available at `http://localhost:5173` (Vite's default port).

## 🎧 Audiobooks

Bookshelf 1.1.0 adds a server-backed audiobook library for every authenticated user role.

### Importing an Audiobook Collection

Librarians can open **Settings → Audiobooks** and choose a folder from their computer. Uploading starts immediately and preserves the selected folder's structure, including nested disc folders. Files are stored under `backend/audiobooks/` on the server.

Supported audio formats are:

- AAC (`.aac`)
- FLAC (`.flac`)
- M4A (`.m4a`)
- M4B (`.m4b`)
- MP3 (`.mp3`)
- OGG (`.ogg`)
- Opus (`.opus`)
- WAV (`.wav`)

Cover images in JPEG, PNG, or WebP format are also uploaded, together with supported companion files such as CUE, JSON, NFO, and TXT. Unsupported files are skipped. The default maximum size for each uploaded file is 4 GB and can be changed with `MAX_UPLOAD_FILE_SIZE_MB`.

### Browsing and Managing Audiobooks

Open the **Audiobooks** tab on the home page to browse all collections found in the server audiobook folder. Selecting a collection opens its detail page with the cover, metadata, ordered track list, and protected in-browser audio playback.

| Capability | Guest | Reader | Librarian (Admin) |
|------------|:-----:|:------:|:-----------------:|
| Browse audiobook collections | ✓ | ✓ | ✓ |
| View details and play tracks | ✓ | ✓ | ✓ |
| Download an audiobook | ✓ | ✓ | ✓ |
| Edit title, author, narrator, language, year, and description | — | — | ✓ |
| Delete a collection from the server | — | — | ✓ |

Single-file audiobooks download in their original format. Multi-track collections download as a TAR archive. Deleting a collection requires confirmation and permanently removes its server folder, including its tracks, cover, and saved metadata.

## 📡 OPDS Feed

Bookshelf provides an OPDS 1.2 catalog to access your library from external ebook reader applications.

- **Feed URL**: `http://<your-server-ip>:3005/opds` (e.g., `http://192.168.1.100:3005/opds`)
- **Authentication**: Usage of Basic Auth (use your Bookshelf username and password)

### Compatible Readers
- **iOS**: KyBook 3, Marvin, Schubert
- **Android**: Moon+ Reader, Aldiko, Librera
- **Desktop**: Thorium Reader

**Note**: To access the feed from other devices, ensure your firewall allows connections to port 3005.

## 📁 Project Structure

```
bookshelf/
├── backend/
│   ├── audiobooks/                  # Uploaded audiobook collections (contents gitignored)
│   ├── data/
│   │   ├── booksshelf.sample.db    # Sample database (copy to booksshelf.db)
│   │   └── booksshelf.db           # Your database (gitignored)
│   ├── migrations/                  # Database migration files
│   ├── routes/                      # API route handlers
│   ├── .env.sample                  # Sample environment variables
│   ├── .env                         # Your environment variables (gitignored)
│   ├── index.js                     # Main server entry point
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/              # React components
│   │   ├── pages/                   # Page components
│   │   └── ...
│   ├── .env.sample                  # Sample environment variables
│   ├── .env                         # Your environment variables (gitignored)
│   └── package.json
└── README.md
```

## 🔧 Available Scripts

### Backend

| Command | Description |
|---------|-------------|
| `npm start` | Run migrations and start the server |
| `npm run migrate` | Run database migrations only |
| `npm run seed` | Seed user roles data |

### Frontend

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

## 📝 Quick Start Summary

```bash
# 1. Clone and enter the project
git clone https://github.com/vivamau/bookshelf.git
cd bookshelf

# 2. Configure backend
cp backend/.env.sample backend/.env

# 3. Configure frontend
cp frontend/.env.sample frontend/.env

# 4. Install dependencies
cd backend && npm install
cd ../frontend && npm install

# 6. Start backend (in one terminal)
cd backend && npm start

# 7. Start frontend (in another terminal)
cd frontend && npm run dev
```

## 📄 License

ISC

---

Made with ❤️ for book lovers
