import Foundation

// MARK: - Bookshelf REST API Response Models

/// Login/auth response from the Bookshelf backend.
struct AuthResponse: Codable {
    let user_id: Int
    let user_username: String
    let user_email: String?
    let token: String
    let userrole_managebooks: Int?
    let userrole_readbooks: Int?
    let userrole_viewbooks: Int?
    let userrole_manageusers: Int?
}

/// Book from the Bookshelf backend API.
struct BookshelfBook: Codable, Identifiable {
    let book_id: Int
    let book_title: String?
    let book_isbn: String?
    let book_cover: String?
    let book_filename: String?
    let book_format: String?
    let book_publisher: String?
    let book_language: String?
    let book_download_count: Int?
    let author_name: String?
    let author_lastname: String?
    let avg_score: Double?
    let reader_count: Int?
    let book_progress_percentage: Double?

    var id: Int { book_id }

    var displayTitle: String {
        book_title ?? "Untitled"
    }

    var fullAuthorName: String {
        [author_name, author_lastname].compactMap { $0 }.joined(separator: " ")
    }
}

/// Author from the Bookshelf backend API.
struct BookshelfAuthor: Codable, Identifiable {
    let author_id: Int
    let author_name: String?
    let author_lastname: String?
    let author_wiki: String?
    let author_avatar: String?
    let book_count: Int?

    var id: Int { author_id }

    var fullName: String {
        [author_name, author_lastname].compactMap { $0 }.joined(separator: " ")
    }
}

/// Genre from the Bookshelf backend API.
struct BookshelfGenre: Codable, Identifiable {
    let genere_id: Int
    let genere_name: String?

    var id: Int { genere_id }
    var name: String { genere_name ?? "Unknown" }
}

/// Search response from the Bookshelf backend.
struct SearchResponse: Codable {
    let books: [BookshelfBook]?
    let authors: [BookshelfAuthor]?
    let genres: [BookshelfGenre]?
}

/// Generic paginated response.
struct PaginatedResponse<T: Codable>: Codable {
    let data: [T]
    let total: Int?
    let page: Int?
    let limit: Int?
}
