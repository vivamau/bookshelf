import Foundation

/// Handles HTTP requests with authentication for both OPDS and Bookshelf REST API.
class NetworkClient {
    private let session: URLSession
    let server: ServerConfig

    // JWT token for Bookshelf API
    private var jwtToken: String?

    init(server: ServerConfig) {
        self.server = server
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 300
        self.session = URLSession(configuration: config)
    }

    // MARK: - OPDS Requests

    func fetchOPDSFeed(url: String) async throws -> OPDSFeed {
        guard let requestURL = URL(string: url) else { throw NetworkError.invalidURL(url) }
        var request = URLRequest(url: requestURL)
        addBasicAuth(to: &request)
        request.setValue("application/atom+xml", forHTTPHeaderField: "Accept")
        let (data, response) = try await session.data(for: request)
        try validateResponse(response)
        let parser = OPDSParser()
        return try await parser.parseFeed(data: data, baseURL: requestURL)
    }

    func fetchOpenSearch(url: String) async throws -> OpenSearchDescription {
        guard let requestURL = URL(string: url) else { throw NetworkError.invalidURL(url) }
        var request = URLRequest(url: requestURL)
        addBasicAuth(to: &request)
        let (data, response) = try await session.data(for: request)
        try validateResponse(response)
        let parser = OPDSParser()
        return try await parser.parseOpenSearch(data: data, baseURL: requestURL)
    }

    // MARK: - Bookshelf Auth

    @discardableResult
    func loginToBookshelf() async throws -> AuthResponse {
        let urlStr = "\(server.baseURL)/login"
        guard let requestURL = URL(string: urlStr) else { throw NetworkError.invalidURL(urlStr) }
        var request = URLRequest(url: requestURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // API expects plain "username"/"password" fields
        let body: [String: String] = [
            "username": server.username,
            "password": server.password
        ]
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await session.data(for: request)
        try validateResponse(response)
        let auth = try JSONDecoder().decode(AuthResponse.self, from: data)

        // Token is delivered via Set-Cookie header, not in JSON body
        if let httpResponse = response as? HTTPURLResponse,
           let setCookie = httpResponse.value(forHTTPHeaderField: "Set-Cookie") {
            // Cookie format: "token=<jwt>; Path=/; ..."
            let tokenValue = setCookie.split(separator: ";").first
                .map(String.init)?
                .split(separator: "=", maxSplits: 1).dropFirst().first
                .map(String.init)
            self.jwtToken = tokenValue
        }

        return auth
    }

    // MARK: - Bookshelf Books API

    func fetchBooks(
        page: Int = 1,
        limit: Int = 50,
        sort: String = "latest",
        search: String = "",
        format: String = "all"
    ) async throws -> BooksListResponse {
        try await ensureAuthenticated()
        var params = "page=\(page)&limit=\(limit)&sort=\(sort)"
        if !search.isEmpty, let enc = search.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
            params += "&search=\(enc)"
        }
        if format != "all" { params += "&format=\(format)" }
        return try await apiGET("/books?\(params)", as: BooksListResponse.self)
    }

    func fetchBook(id: Int) async throws -> BookshelfBook {
        try await ensureAuthenticated()
        let resp = try await apiGET("/books/\(id)", as: SingleBookResponse.self)
        return resp.data
    }

    func fetchContinueReading() async throws -> [BookshelfBook] {
        try await ensureAuthenticated()
        let resp = try await apiGET("/books/continue-reading", as: BooksListResponse.self)
        return resp.data
    }

    func fetchAuthors(page: Int = 1, limit: Int = 100) async throws -> [BookshelfAuthor] {
        try await ensureAuthenticated()
        let resp = try await apiGET("/authors?page=\(page)&limit=\(limit)", as: AuthorsListResponse.self)
        return resp.data
    }

    func fetchBooksByAuthor(authorId: Int) async throws -> [BookshelfBook] {
        try await ensureAuthenticated()
        let resp = try await apiGET("/authors/\(authorId)/books", as: BooksListResponse.self)
        return resp.data
    }

    func fetchGenres() async throws -> [BookshelfGenre] {
        try await ensureAuthenticated()
        let resp = try await apiGET("/generes", as: GenresListResponse.self)
        return resp.data
    }

    func fetchBooksByGenre(genreId: Int) async throws -> [BookshelfBook] {
        try await ensureAuthenticated()
        let resp = try await apiGET("/generes/\(genreId)/books", as: BooksListResponse.self)
        return resp.data
    }

    func updateProgress(bookId: Int, currentIndex: Int, percentage: Double) async throws {
        try await ensureAuthenticated()
        let urlStr = "\(server.apiBaseURL)/books/\(bookId)/progress"
        guard let requestURL = URL(string: urlStr) else { throw NetworkError.invalidURL(urlStr) }
        var request = URLRequest(url: requestURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = jwtToken { request.setValue(token, forHTTPHeaderField: "x-access-token") }
        let body: [String: Any] = ["current_index": currentIndex, "progress_percentage": percentage]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (_, response) = try await session.data(for: request)
        try validateResponse(response)
    }

    // MARK: - Cover URL helper

    func coverURL(for book: BookshelfBook) -> URL? {
        guard let img = book.book_cover_img, !img.isEmpty else { return nil }
        return URL(string: "\(server.baseURL)/covers/\(img)")
    }

    // MARK: - File Download (Bookshelf API)

    func downloadBookshelfFile(
        bookId: Int,
        to destination: URL,
        progress: @escaping (Double) -> Void
    ) async throws {
        try await ensureAuthenticated()
        let urlStr = "\(server.apiBaseURL)/books/\(bookId)/download-file"
        guard let requestURL = URL(string: urlStr) else { throw NetworkError.invalidURL(urlStr) }
        var request = URLRequest(url: requestURL)
        if let token = jwtToken { request.setValue(token, forHTTPHeaderField: "x-access-token") }

        let (asyncBytes, response) = try await session.bytes(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw NetworkError.httpError((response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let expectedLength = Double(httpResponse.expectedContentLength)
        var receivedLength: Double = 0
        var data = Data()
        if expectedLength > 0 { data.reserveCapacity(Int(expectedLength)) }

        for try await byte in asyncBytes {
            data.append(byte)
            receivedLength += 1
            if expectedLength > 0, Int(receivedLength) % 8192 == 0 {
                progress(min(receivedLength / expectedLength, 1.0))
            }
        }
        progress(1.0)
        try data.write(to: destination)
    }

    // MARK: - Generic OPDS/Legacy Download

    func downloadFile(
        from url: String,
        to destination: URL,
        progress: @escaping (Double) -> Void
    ) async throws {
        guard let requestURL = URL(string: url) else { throw NetworkError.invalidURL(url) }
        var request = URLRequest(url: requestURL)
        addBasicAuth(to: &request)
        if let token = jwtToken { request.setValue(token, forHTTPHeaderField: "x-access-token") }

        let (asyncBytes, response) = try await session.bytes(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw NetworkError.httpError((response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let expectedLength = Double(httpResponse.expectedContentLength)
        var receivedLength: Double = 0
        var data = Data()
        if expectedLength > 0 { data.reserveCapacity(Int(expectedLength)) }

        for try await byte in asyncBytes {
            data.append(byte)
            receivedLength += 1
            if expectedLength > 0, Int(receivedLength) % 8192 == 0 {
                progress(min(receivedLength / expectedLength, 1.0))
            }
        }
        progress(1.0)
        try data.write(to: destination)
    }

    func downloadImageData(from url: String) async throws -> Data {
        guard let requestURL = URL(string: url) else { throw NetworkError.invalidURL(url) }
        var request = URLRequest(url: requestURL)
        addBasicAuth(to: &request)
        if let token = jwtToken { request.setValue(token, forHTTPHeaderField: "x-access-token") }
        let (data, response) = try await session.data(for: request)
        try validateResponse(response)
        return data
    }

    // MARK: - Private Helpers

    private func ensureAuthenticated() async throws {
        guard server.type == .bookshelf, jwtToken == nil else { return }
        try await loginToBookshelf()
    }

    private func apiGET<T: Decodable>(_ endpoint: String, as type: T.Type) async throws -> T {
        let urlStr = "\(server.apiBaseURL)\(endpoint)"
        guard let requestURL = URL(string: urlStr) else { throw NetworkError.invalidURL(urlStr) }
        var request = URLRequest(url: requestURL)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = jwtToken { request.setValue(token, forHTTPHeaderField: "x-access-token") }
        let (data, response) = try await session.data(for: request)
        try validateResponse(response)
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch let decodeError as DecodingError {
            let detail: String
            switch decodeError {
            case .typeMismatch(let type, let ctx):
                detail = "typeMismatch(\(type)) at \(ctx.codingPath.map(\.stringValue).joined(separator: ".")): \(ctx.debugDescription)"
            case .valueNotFound(let type, let ctx):
                detail = "valueNotFound(\(type)) at \(ctx.codingPath.map(\.stringValue).joined(separator: "."))"
            case .keyNotFound(let key, let ctx):
                detail = "keyNotFound(\(key.stringValue)) at \(ctx.codingPath.map(\.stringValue).joined(separator: "."))"
            case .dataCorrupted(let ctx):
                detail = "dataCorrupted at \(ctx.codingPath.map(\.stringValue).joined(separator: ".")): \(ctx.debugDescription)"
            @unknown default:
                detail = decodeError.localizedDescription
            }
            throw NetworkError.decodingError("[\(endpoint)] \(detail)")
        } catch let otherError {
            throw NetworkError.decodingError("[\(endpoint)] \(otherError.localizedDescription)")
        }
    }

    private func addBasicAuth(to request: inout URLRequest) {
        guard !server.username.isEmpty else { return }
        let credentials = "\(server.username):\(server.password)"
        if let data = credentials.data(using: .utf8) {
            request.setValue("Basic \(data.base64EncodedString())", forHTTPHeaderField: "Authorization")
        }
    }

    private func validateResponse(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { throw NetworkError.invalidResponse }
        guard (200...299).contains(http.statusCode) else {
            switch http.statusCode {
            case 401: throw NetworkError.unauthorized
            case 403: throw NetworkError.forbidden
            case 404: throw NetworkError.notFound
            default:  throw NetworkError.httpError(http.statusCode)
            }
        }
    }
}

// MARK: - Errors

enum NetworkError: LocalizedError {
    case invalidURL(String)
    case invalidResponse
    case httpError(Int)
    case unauthorized
    case forbidden
    case notFound
    case decodingError(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL(let url): return "Invalid URL: \(url)"
        case .invalidResponse:     return "Invalid response from server"
        case .httpError(let code): return "HTTP error \(code)"
        case .unauthorized:        return "Invalid credentials"
        case .forbidden:           return "Access denied"
        case .notFound:            return "Resource not found"
        case .decodingError(let m): return "Data error: \(m)"
        }
    }
}
