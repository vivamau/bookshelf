import Foundation
import SwiftData

/// Represents a configured server — either a Bookshelf backend or a generic OPDS server.
@Model
final class ServerConfig: Identifiable {
    var id: UUID
    var name: String
    var baseURL: String
    var serverType: String  // "bookshelf" or "opds"
    var username: String
    var password: String
    var dateAdded: Date
    var lastAccessed: Date?
    var iconName: String

    init(
        name: String,
        baseURL: String,
        serverType: ServerType = .opds,
        username: String = "",
        password: String = "",
        iconName: String = "books.vertical"
    ) {
        self.id = UUID()
        self.name = name
        self.baseURL = baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        self.serverType = serverType.rawValue
        self.username = username
        self.password = password
        self.dateAdded = Date()
        self.iconName = iconName
    }

    var type: ServerType {
        get { ServerType(rawValue: serverType) ?? .opds }
        set { serverType = newValue.rawValue }
    }

    var opdsRootURL: String {
        switch type {
        case .bookshelf:
            return "\(baseURL)/opds/"
        case .opds:
            return baseURL
        }
    }

    var apiBaseURL: String {
        return "\(baseURL)/api"
    }
}

enum ServerType: String, Codable, CaseIterable {
    case bookshelf = "bookshelf"
    case opds = "opds"

    var displayName: String {
        switch self {
        case .bookshelf: return "Bookshelf Server"
        case .opds: return "OPDS Server"
        }
    }
}
