# 📚 Bookshelf

A full-stack web application for managing your personal book collection. Built with a Node.js/Express backend and a React/Vite frontend.

## 🚀 Features

- **Book Management**: Add, edit, and organize your book collection
- **Author & Genre Tracking**: Categorize books by authors and genres
- **User Authentication**: Secure login with JWT-based authentication
- **Responsive Design**: Modern UI built with React and TailwindCSS

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
```

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | The port the backend server will run on | `3005` |

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

On the first run, the system will create the following default users:

- **Admin (Librarian)**: `admin` / `adminpassword`
- **Reader**: `reader1` / `readerpassword`
- **Guest**: `guest1` / `guestpassword`

**IMPORTANT**: Please change these passwords or remove these users immediately after your first login to secure your installation.

### Start the Frontend Development Server

In a new terminal, from the project root or frontend directory:

```bash
cd frontend
npm run dev
```

The frontend will be available at `http://localhost:5173` (Vite's default port).

## 📁 Project Structure

```
bookshelf/
├── backend/
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
