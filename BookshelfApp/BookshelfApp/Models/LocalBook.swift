import Foundation
import SwiftData

/// A book downloaded to the local device.
@Model
final class LocalBook: Identifiable {
    var id: UUID
    var title: String
    var authors: String
    var summary: String?
    var coverFileName: String?
    var bookFileName: String
    var format: String  // "epub", "pdf", "cbz", "cbr"
    var fileSize: Int64
    var serverName: String?
    var sourceURL: String?
    var dateDownloaded: Date
    var lastOpened: Date?
    var readingProgress: Double  // 0.0 to 1.0

    init(
        title: String,
        authors: String,
        summary: String? = nil,
        coverFileName: String? = nil,
        bookFileName: String,
        format: String,
        fileSize: Int64 = 0,
        serverName: String? = nil,
        sourceURL: String? = nil
    ) {
        self.id = UUID()
        self.title = title
        self.authors = authors
        self.summary = summary
        self.coverFileName = coverFileName
        self.bookFileName = bookFileName
        self.format = format
        self.fileSize = fileSize
        self.serverName = serverName
        self.sourceURL = sourceURL
        self.dateDownloaded = Date()
        self.readingProgress = 0
    }

    var bookFileURL: URL {
        LocalBook.booksDirectory.appendingPathComponent(bookFileName)
    }

    var coverFileURL: URL? {
        guard let coverFileName else { return nil }
        return LocalBook.coversDirectory.appendingPathComponent(coverFileName)
    }

    var fileSizeFormatted: String {
        ByteCountFormatter.string(fromByteCount: fileSize, countStyle: .file)
    }

    var formatDisplayName: String {
        format.uppercased()
    }

    var isEPUB: Bool { format.lowercased() == "epub" }
    var isPDF: Bool { format.lowercased() == "pdf" }

    // MARK: - File Paths

    static var documentsDirectory: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
    }

    static var booksDirectory: URL {
        let dir = documentsDirectory.appendingPathComponent("Books", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    static var coversDirectory: URL {
        let dir = documentsDirectory.appendingPathComponent("Covers", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }
}

/// Tracks active downloads.
@Model
final class DownloadTask: Identifiable {
    var id: UUID
    var title: String
    var sourceURL: String
    var progress: Double
    var status: String  // "downloading", "completed", "failed", "cancelled"
    var dateStarted: Date
    var errorMessage: String?

    init(title: String, sourceURL: String) {
        self.id = UUID()
        self.title = title
        self.sourceURL = sourceURL
        self.progress = 0
        self.status = "downloading"
        self.dateStarted = Date()
    }

    var isActive: Bool { status == "downloading" }
    var isFailed: Bool { status == "failed" }
    var isCompleted: Bool { status == "completed" }
}
