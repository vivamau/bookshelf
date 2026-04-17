import Foundation

/// Handles HTTP requests with authentication for both OPDS and Bookshelf API.
class NetworkClient {
    private let session: URLSession
    private let server: ServerConfig

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

    /// Fetch an OPDS feed from a URL (uses HTTP Basic Auth).
    func fetchOPDSFeed(url: String) async throws -> OPDSFeed {
        guard let requestURL = URL(string: url) else {
            throw NetworkError.invalidURL(url)
        }

        var request = URLRequest(url: requestURL)
        addBasicAuth(to: &request)
        request.setValue("application/atom+xml", forHTTPHeaderField: "Accept")

        let (data, response) = try await session.data(for: request)
        try validateResponse(response)

        let parser = OPDSParser()
        return try await parser.parseFeed(data: data, baseURL: requestURL)
    }

    /// Fetch the OpenSearch description.
    func fetchOpenSearch(url: String) async throws -> OpenSearchDescription {
        guard let requestURL = URL(string: url) else {
            throw NetworkError.invalidURL(url)
        }

        var request = URLRequest(url: requestURL)
        addBasicAuth(to: &request)

        let (data, response) = try await session.data(for: request)
        try validateResponse(response)

        let parser = OPDSParser()
        return try await parser.parseOpenSearch(data: data, baseURL: requestURL)
    }

    // MARK: - Bookshelf API Requests

    /// Login to the Bookshelf backend and store the JWT token.
    func loginToBookshelf() async throws -> AuthResponse {
        let url = "\(server.apiBaseURL)/../login"
        guard let requestURL = URL(string: url) else {
            throw NetworkError.invalidURL(url)
        }

        var request = URLRequest(url: requestURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = [
            "user_username": server.username,
            "user_password": server.password
        ]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)
        try validateResponse(response)

        let authResponse = try JSONDecoder().decode(AuthResponse.self, from: data)
        self.jwtToken = authResponse.token
        return authResponse
    }

    /// Fetch from the Bookshelf REST API (JSON).
    func fetchAPI<T: Decodable>(_ endpoint: String, type: T.Type) async throws -> T {
        // Ensure we have a JWT token
        if jwtToken == nil && server.type == .bookshelf {
            _ = try await loginToBookshelf()
        }

        let url = "\(server.apiBaseURL)\(endpoint)"
        guard let requestURL = URL(string: url) else {
            throw NetworkError.invalidURL(url)
        }

        var request = URLRequest(url: requestURL)
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if let token = jwtToken {
            request.setValue(token, forHTTPHeaderField: "x-access-token")
        }

        let (data, response) = try await session.data(for: request)
        try validateResponse(response)

        return try JSONDecoder().decode(T.self, from: data)
    }

    // MARK: - Download

    /// Download a file to a local URL, reporting progress.
    func downloadFile(
        from url: String,
        to destination: URL,
        progress: @escaping (Double) -> Void
    ) async throws {
        guard let requestURL = URL(string: url) else {
            throw NetworkError.invalidURL(url)
        }

        var request = URLRequest(url: requestURL)
        addBasicAuth(to: &request)

        if let token = jwtToken {
            request.setValue(token, forHTTPHeaderField: "x-access-token")
        }

        let (asyncBytes, response) = try await session.bytes(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw NetworkError.httpError((response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let expectedLength = Double(httpResponse.expectedContentLength)
        var receivedLength: Double = 0
        var data = Data()

        if expectedLength > 0 {
            data.reserveCapacity(Int(expectedLength))
        }

        for try await byte in asyncBytes {
            data.append(byte)
            receivedLength += 1
            if expectedLength > 0 {
                let pct = min(receivedLength / expectedLength, 1.0)
                if Int(receivedLength) % 8192 == 0 {
                    progress(pct)
                }
            }
        }

        progress(1.0)
        try data.write(to: destination)
    }

    /// Download cover image data.
    func downloadImageData(from url: String) async throws -> Data {
        guard let requestURL = URL(string: url) else {
            throw NetworkError.invalidURL(url)
        }

        var request = URLRequest(url: requestURL)
        addBasicAuth(to: &request)

        if let token = jwtToken {
            request.setValue(token, forHTTPHeaderField: "x-access-token")
        }

        let (data, response) = try await session.data(for: request)
        try validateResponse(response)
        return data
    }

    // MARK: - Helpers

    private func addBasicAuth(to request: inout URLRequest) {
        guard !server.username.isEmpty else { return }
        let credentials = "\(server.username):\(server.password)"
        if let data = credentials.data(using: .utf8) {
            let base64 = data.base64EncodedString()
            request.setValue("Basic \(base64)", forHTTPHeaderField: "Authorization")
        }
    }

    private func validateResponse(_ response: URLResponse) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            switch httpResponse.statusCode {
            case 401: throw NetworkError.unauthorized
            case 403: throw NetworkError.forbidden
            case 404: throw NetworkError.notFound
            default: throw NetworkError.httpError(httpResponse.statusCode)
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
        case .invalidResponse: return "Invalid response from server"
        case .httpError(let code): return "HTTP error \(code)"
        case .unauthorized: return "Invalid credentials"
        case .forbidden: return "Access denied"
        case .notFound: return "Resource not found"
        case .decodingError(let msg): return "Data error: \(msg)"
        }
    }
}
