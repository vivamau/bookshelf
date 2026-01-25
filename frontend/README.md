# Bookshelf Frontend

A Plex-inspired library management system built with React, Tailwind CSS, and Lucide icons.

## Features
- **Plex-like UI**: Dark theme, sidebar navigation, top bar with search, and grid gallery.
- **Role-Based Access Control**:
  - **Librarian**: Full access to management tools (Users, Books).
  - **Reader**: Can view and read books.
  - **Guest**: View-only mode with upgrade prompts.
- **REST API Integration**: Connects to the Node.js/SQLite backend.
- **Responsive Layout**: Designed for multiple screen sizes.

## Getting Started

### Prerequisites
- Node.js (v18+)
- Backend running on `http://localhost:3000`

### Installation
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Application
Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

## Role Selection (Demo)
During development, you can use the role switcher at the bottom of the login page to quickly test the UI as a Librarian, Reader, or Guest.
