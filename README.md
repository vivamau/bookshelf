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

Bookshelf includes a server-backed audiobook library for every authenticated user role.

### Importing an Audiobook Collection

Librarians can open **Settings → Audiobooks** and configure one or more writable server destinations. The built-in `backend/audiobooks/` folder remains available, while mounted drives, NAS folders, or other server paths can be added and selected independently. New files can then be uploaded from the librarian's computer or imported from another server folder into the selected destination. Collection structure, including nested disc folders, is preserved. Server imports skip unsupported assets and existing files instead of overwriting them.

Removing a configured destination only disconnects it from Bookshelf; files in that folder are never deleted. Add the same destination again to make its collections available in the catalog.

After adding a destination, Bookshelf asks whether it should scan that folder immediately. Confirming discovers its audiobook collections in place: the files remain in their existing folders and are not copied into built-in storage. A scan button on each destination can repeat or defer discovery at any time.

The scan creates a central SQLite record for each discovered audiobook. Title, narrator, series, sequence, language, description, publication year, authors, genres, and listening progress are managed centrally even when audio files live in different destinations. Existing `.bookshelf-metadata.json` files are imported when an audiobook is first discovered for backward compatibility; later metadata edits are saved to SQLite rather than written back into the storage folder.

The central record also keeps the track, cover, format, size, and duration catalog produced by the scan. Opening the Audiobooks page reads this catalog directly from SQLite and does not walk storage folders or probe audio files. Use the destination scan action after changing files outside Bookshelf; uploads, imports, cover changes, and deletions refresh the affected catalog automatically.

Scans compare each discovered audiobook's ordered track manifest (file names, formats, sizes, and durations) with the central catalog. Matching copies are reported and skipped, including copies stored in different destinations; their files are left untouched.

Librarians can use **Remove from library** on an audiobook to delete its central metadata, author and genre links, and listening progress without deleting its audio or cover files. The collection remains out of the library until its destination is scanned again.

SMB/CIFS shares must be mounted by the operating system before Bookshelf can use them. Add the resulting local mount path—for example `/mnt/nas/audiobooks` on Linux or `/Volumes/Audiobooks` on macOS—rather than an `smb://` URL. A readable mount can be connected for catalog browsing and playback even when it is read-only; uploads and imports require write permission for the account running the backend service.

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

Open the **Audiobooks** tab on the home page to browse collections found across every available server destination. Selecting a collection opens its detail page with the cover, metadata, ordered track list, and protected in-browser audio playback.

Audiobook authors use the same `Authors` records as books. Librarians can search, create, and assign one or more authors in the audiobook metadata editor. Audiobooks then appear alongside books on each linked author’s profile. Existing free-text audiobook authors are matched to an existing author by full name, or migrated into a new author record, when the audiobook catalog is first loaded.

| Capability | Guest | Reader | Librarian (Admin) |
|------------|:-----:|:------:|:-----------------:|
| Browse audiobook collections | ✓ | ✓ | ✓ |
| View details and play tracks | ✓ | ✓ | ✓ |
| Download an audiobook | ✓ | ✓ | ✓ |
| Edit title, author, narrator, language, year, description, and cover | — | — | ✓ |
| Delete a collection from the server | — | — | ✓ |

Librarians can add or replace a missing cover by providing a public JPEG, PNG, or WebP image URL on the audiobook details page. Single-file audiobooks download in their original format. Multi-track collections download as a TAR archive. Deleting a collection requires confirmation and permanently removes its server folder, including its tracks, cover, and saved metadata.

### SoundLeaf and Audiobookshelf Clients

Bookshelf exposes an Audiobookshelf 2.25-compatible client API for the audiobook library. This includes server discovery, password login, bearer-token authorization, library browsing, item metadata, protected covers, byte-range audio streaming, direct-play sessions, and per-user progress synchronization.

To connect SoundLeaf:

1. Make sure the Bookshelf backend is reachable from the phone. For local development this is usually `http://<computer-ip>:3005`.
2. Open SoundLeaf and enter the backend base URL without `/api` at the end.
3. Sign in with a Bookshelf username and password.
4. Select the **Audiobooks** library.

Install `ffprobe` (included with FFmpeg) on the server so compatible clients receive accurate track and total durations. Bookshelf falls back to zero-duration metadata when `ffprobe` is unavailable while retaining streaming support.

The compatibility API uses the same role checks and `AudiobooksUsers` progress records as the Bookshelf web interface. Native-client bearer tokens expire after 30 days; browser sessions continue to use the two-hour HttpOnly cookie.

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
