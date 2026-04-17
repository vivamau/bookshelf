import Foundation

// MARK: - OPDS Feed

/// Represents a parsed OPDS Atom feed (navigation or acquisition catalog).
struct OPDSFeed {
    let id: String
    let title: String
    let updated: Date?
    let entries: [OPDSEntry]
    let links: [OPDSLink]
    let totalResults: Int?
    let itemsPerPage: Int?
    let startIndex: Int?

    /// The next page link, if paginated
    var nextPageURL: String? {
        links.first(where: { $0.rel == "next" })?.href
    }

    /// The search description URL
    var searchURL: String? {
        links.first(where: { $0.rel == "search" })?.href
    }

    /// Whether this is a navigation feed (entries link to other feeds)
    var isNavigation: Bool {
        entries.allSatisfy { entry in
            entry.links.contains(where: { $0.type?.contains("navigation") == true || $0.rel == "subsection" })
        }
    }
}

// MARK: - OPDS Entry

/// A single entry in an OPDS feed — can be a book or a navigation link.
struct OPDSEntry: Identifiable {
    let id: String
    let title: String
    let authors: [String]
    let summary: String?
    let content: String?
    let updated: Date?
    let published: Date?
    let categories: [String]
    let links: [OPDSLink]
    let language: String?
    let publisher: String?
    let isbn: String?

    /// Cover/thumbnail image URL
    var coverURL: String? {
        links.first(where: {
            $0.rel?.contains("image") == true ||
            $0.rel?.contains("thumbnail") == true
        })?.href
    }

    /// Acquisition links (downloadable files)
    var acquisitionLinks: [OPDSLink] {
        links.filter {
            $0.rel?.contains("acquisition") == true ||
            $0.rel == "http://opds-spec.org/acquisition" ||
            $0.rel == "http://opds-spec.org/acquisition/open-access"
        }
    }

    /// Navigation link (link to sub-catalog)
    var navigationLink: String? {
        links.first(where: {
            $0.rel == "subsection" ||
            $0.type?.contains("navigation") == true ||
            $0.type?.contains("acquisition") == true ||
            $0.type?.contains("atom+xml") == true
        })?.href
    }

    /// Whether this entry is a book (has acquisition links)
    var isBook: Bool {
        !acquisitionLinks.isEmpty
    }

    /// The best download link (prefer EPUB, then PDF)
    var bestDownloadLink: OPDSLink? {
        acquisitionLinks.first(where: { $0.type?.contains("epub") == true })
            ?? acquisitionLinks.first(where: { $0.type?.contains("pdf") == true })
            ?? acquisitionLinks.first
    }

    /// Human-readable format string from the best download link
    var formatString: String? {
        guard let link = bestDownloadLink, let type = link.type else { return nil }
        if type.contains("epub") { return "EPUB" }
        if type.contains("pdf") { return "PDF" }
        if type.contains("cbz") { return "CBZ" }
        if type.contains("cbr") { return "CBR" }
        return type
    }
}

// MARK: - OPDS Link

struct OPDSLink {
    let href: String
    let type: String?
    let rel: String?
    let title: String?
    let length: Int?

    var absoluteURL: URL? {
        URL(string: href)
    }

    var fileExtension: String {
        guard let type = type else { return "bin" }
        if type.contains("epub") { return "epub" }
        if type.contains("pdf") { return "pdf" }
        if type.contains("cbz") { return "cbz" }
        if type.contains("cbr") { return "cbr" }
        return URL(string: href)?.pathExtension ?? "bin"
    }
}

// MARK: - OpenSearch

struct OpenSearchDescription {
    let shortName: String
    let description: String
    let templateURL: String  // URL with {searchTerms} placeholder

    func searchURL(for query: String) -> String? {
        guard let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else { return nil }
        return templateURL.replacingOccurrences(of: "{searchTerms}", with: encoded)
    }
}
