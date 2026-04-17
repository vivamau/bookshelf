import Foundation

// MARK: - Auth

struct AuthResponse: Codable {
    let id: Int?
    let username: String?
    let email: String?
    // token is NOT in the JSON body — it arrives as Set-Cookie header
}

// MARK: - Book (matches actual API response)

struct BookshelfBook: Codable, Identifiable {
    let bookID: Int
    let book_title: String?
    let book_cover_img: String?
    let book_date: Double?      // Unix timestamp ms or ISO-8601 string
    let book_summary: String?
    let book_isbn: String?
    let book_isbn_13: String?
    let format_name: String?
    let book_publisher_id: Int?
    let publisher_name: String?
    let language_name: String?
    let book_progress_percentage: Double?
    let book_create_date: Double?
    let book_downloads: Int?
    let file_exists: Bool?
    let book_entry_point: String?
    let readers_count: Int?
    let avg_rating: Double?
    let user_rating: Double?
    let bookuser_id: Int?
    // Pipe-delimited author/genre data from detail endpoint
    let authors_data: String?  // "authorId::Name::RelId||..."
    let genres_data: String?   // "relId::genreId::Name||..."
    // From list endpoint (authors may come as separate fields)
    let author_name: String?
    let author_lastname: String?

    enum CodingKeys: String, CodingKey {
        case bookID = "ID"
        case book_title, book_cover_img, book_date, book_summary
        case book_isbn, book_isbn_13, format_name, book_publisher_id
        case publisher_name, language_name, book_progress_percentage
        case book_create_date, book_downloads, file_exists, book_entry_point
        case readers_count, avg_rating, user_rating, bookuser_id
        case authors_data, genres_data, author_name, author_lastname
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        bookID = try c.decode(Int.self, forKey: .bookID)
        book_title = try c.decodeIfPresent(String.self, forKey: .book_title)
        book_cover_img = try c.decodeIfPresent(String.self, forKey: .book_cover_img)
        book_summary = try c.decodeIfPresent(String.self, forKey: .book_summary)
        book_isbn = try c.decodeIfPresent(String.self, forKey: .book_isbn)
        book_isbn_13 = try c.decodeIfPresent(String.self, forKey: .book_isbn_13)
        format_name = try c.decodeIfPresent(String.self, forKey: .format_name)
        book_publisher_id = try c.decodeIfPresent(Int.self, forKey: .book_publisher_id)
        publisher_name = try c.decodeIfPresent(String.self, forKey: .publisher_name)
        language_name = try c.decodeIfPresent(String.self, forKey: .language_name)
        book_progress_percentage = try c.decodeIfPresent(Double.self, forKey: .book_progress_percentage)
        book_create_date = try c.decodeIfPresent(Double.self, forKey: .book_create_date)
        book_downloads = try c.decodeIfPresent(Int.self, forKey: .book_downloads)
        file_exists = try c.decodeIfPresent(Bool.self, forKey: .file_exists)
        book_entry_point = try c.decodeIfPresent(String.self, forKey: .book_entry_point)
        readers_count = try c.decodeIfPresent(Int.self, forKey: .readers_count)
        avg_rating = try c.decodeIfPresent(Double.self, forKey: .avg_rating)
        user_rating = try c.decodeIfPresent(Double.self, forKey: .user_rating)
        bookuser_id = try c.decodeIfPresent(Int.self, forKey: .bookuser_id)
        authors_data = try c.decodeIfPresent(String.self, forKey: .authors_data)
        genres_data = try c.decodeIfPresent(String.self, forKey: .genres_data)
        author_name = try c.decodeIfPresent(String.self, forKey: .author_name)
        author_lastname = try c.decodeIfPresent(String.self, forKey: .author_lastname)
        // book_date may arrive as a numeric timestamp or an ISO-8601 string
        if let numeric = try? c.decodeIfPresent(Double.self, forKey: .book_date) {
            book_date = numeric
        } else if let str = try? c.decodeIfPresent(String.self, forKey: .book_date) {
            let fmt = ISO8601DateFormatter()
            fmt.formatOptions = [.withFullDate, .withDashSeparatorInDate]
            book_date = fmt.date(from: str).map { $0.timeIntervalSince1970 * 1000 }
        } else {
            book_date = nil
        }
    }

    var id: Int { bookID }

    var displayTitle: String { book_title ?? "Untitled" }

    var fullAuthorName: String {
        // Prefer parsed authors_data, fall back to flat fields
        if let ad = authors_data, !ad.isEmpty {
            let names = ad.split(separator: "|").compactMap { seg -> String? in
                let parts = seg.split(separator: ":", maxSplits: 2).map(String.init)
                return parts.count >= 2 ? parts[1] : nil
            }
            if !names.isEmpty { return names.joined(separator: ", ") }
        }
        return [author_name, author_lastname].compactMap { $0 }.joined(separator: " ")
    }

    var publishYear: Int? {
        guard let ts = book_date else { return nil }
        // ts may be in milliseconds
        let date = ts > 1_000_000_000_000 ? Date(timeIntervalSince1970: ts / 1000) : Date(timeIntervalSince1970: ts)
        return Calendar.current.component(.year, from: date)
    }

    var genreNames: [String] {
        guard let gd = genres_data, !gd.isEmpty else { return [] }
        return gd.split(separator: "|").compactMap { seg -> String? in
            let parts = seg.split(separator: ":", maxSplits: 3).map(String.init)
            return parts.count >= 3 ? parts[2] : nil
        }
    }

    var authorEntries: [(id: String, name: String)] {
        guard let ad = authors_data, !ad.isEmpty else { return [] }
        return ad.split(separator: "|").compactMap { seg -> (String, String)? in
            let parts = seg.split(separator: ":", maxSplits: 3).map(String.init)
            guard parts.count >= 2 else { return nil }
            return (parts[0], parts[1])
        }
    }
}

// MARK: - Author

struct BookshelfAuthor: Codable, Identifiable {
    let authorID: Int
    let author_name: String?
    let author_lastname: String?
    let author_wiki: String?
    let author_avatar: String?
    let book_count: Int?

    enum CodingKeys: String, CodingKey {
        case authorID = "ID"
        case author_name, author_lastname, author_wiki, author_avatar, book_count
    }

    var id: Int { authorID }

    var fullName: String {
        [author_name, author_lastname].compactMap { $0 }.joined(separator: " ")
    }
}

// MARK: - Genre

struct BookshelfGenre: Codable, Identifiable {
    let genreID: Int
    let genere_name: String?
    let book_count: Int?

    enum CodingKeys: String, CodingKey {
        case genreID = "ID"
        case genere_name, book_count
    }

    var id: Int { genreID }
    var name: String { genere_name ?? "Unknown" }
}

// MARK: - Paginated Responses

struct BooksListResponse: Codable {
    let data: [BookshelfBook]
    let total: Int?
}

struct SingleBookResponse: Codable {
    let data: BookshelfBook
}

struct AuthorsListResponse: Codable {
    let data: [BookshelfAuthor]
}

struct GenresListResponse: Codable {
    let data: [BookshelfGenre]
}
