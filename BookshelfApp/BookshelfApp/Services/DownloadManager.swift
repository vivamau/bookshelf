import Foundation
import SwiftData
import SwiftUI

/// Manages book downloads and local storage.
@Observable
class DownloadManager {
    var activeDownloads: [UUID: DownloadProgress] = [:]

    struct DownloadProgress {
        let title: String
        var progress: Double
        var status: DownloadStatus
        var error: String?
    }

    enum DownloadStatus: String {
        case downloading, completed, failed, cancelled
    }

    /// Download a book from an OPDS entry.
    @MainActor
    func downloadBook(
        entry: OPDSEntry,
        server: ServerConfig,
        modelContext: ModelContext
    ) async {
        guard let downloadLink = entry.bestDownloadLink else { return }

        let downloadID = UUID()
        let title = entry.title

        activeDownloads[downloadID] = DownloadProgress(
            title: title,
            progress: 0,
            status: .downloading
        )

        let client = NetworkClient(server: server)
        let fileExtension = downloadLink.fileExtension
        let sanitizedTitle = title.replacingOccurrences(of: "[^a-zA-Z0-9\\-_ ]", with: "", options: .regularExpression)
        let bookFileName = "\(sanitizedTitle)_\(downloadID.uuidString.prefix(8)).\(fileExtension)"
        let destination = LocalBook.booksDirectory.appendingPathComponent(bookFileName)

        do {
            // Download the book file
            try await client.downloadFile(from: downloadLink.href, to: destination) { [weak self] progress in
                Task { @MainActor in
                    self?.activeDownloads[downloadID]?.progress = progress
                }
            }

            // Download cover if available
            var coverFileName: String?
            if let coverURL = entry.coverURL {
                let coverFile = "\(sanitizedTitle)_\(downloadID.uuidString.prefix(8)).jpg"
                let coverDest = LocalBook.coversDirectory.appendingPathComponent(coverFile)
                do {
                    let imageData = try await client.downloadImageData(from: coverURL)
                    try imageData.write(to: coverDest)
                    coverFileName = coverFile
                } catch {
                    // Cover download failure is non-critical
                    print("Cover download failed: \(error)")
                }
            }

            // Get file size
            let fileSize = (try? FileManager.default.attributesOfItem(atPath: destination.path)[.size] as? Int64) ?? 0

            // Create local book entry
            let localBook = LocalBook(
                title: title,
                authors: entry.authors.joined(separator: ", "),
                summary: entry.summary ?? entry.content,
                coverFileName: coverFileName,
                bookFileName: bookFileName,
                format: fileExtension,
                fileSize: fileSize,
                serverName: server.name,
                sourceURL: downloadLink.href
            )
            modelContext.insert(localBook)
            try modelContext.save()

            activeDownloads[downloadID]?.status = .completed
            activeDownloads[downloadID]?.progress = 1.0

            // Remove completed download after a delay
            Task {
                try? await Task.sleep(for: .seconds(3))
                await MainActor.run {
                    self.activeDownloads.removeValue(forKey: downloadID)
                }
            }

        } catch {
            activeDownloads[downloadID]?.status = .failed
            activeDownloads[downloadID]?.error = error.localizedDescription

            // Clean up partial download
            try? FileManager.default.removeItem(at: destination)
        }
    }

    /// Delete a local book and its files.
    @MainActor
    func deleteBook(_ book: LocalBook, modelContext: ModelContext) {
        // Delete book file
        let bookURL = book.bookFileURL
        try? FileManager.default.removeItem(at: bookURL)

        // Delete cover
        if let coverURL = book.coverFileURL {
            try? FileManager.default.removeItem(at: coverURL)
        }

        modelContext.delete(book)
        try? modelContext.save()
    }

    var hasActiveDownloads: Bool {
        activeDownloads.values.contains { $0.status == .downloading }
    }
}
