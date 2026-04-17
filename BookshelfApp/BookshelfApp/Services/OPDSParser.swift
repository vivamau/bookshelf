import Foundation

/// Parses OPDS Atom XML feeds into structured models.
actor OPDSParser {

    enum ParseError: LocalizedError {
        case invalidData
        case parsingFailed(String)

        var errorDescription: String? {
            switch self {
            case .invalidData: return "Invalid XML data received"
            case .parsingFailed(let msg): return "XML parsing failed: \(msg)"
            }
        }
    }

    func parseFeed(data: Data, baseURL: URL) throws -> OPDSFeed {
        let delegate = OPDSXMLDelegate(baseURL: baseURL)
        let parser = XMLParser(data: data)
        parser.delegate = delegate
        parser.shouldProcessNamespaces = true

        guard parser.parse() else {
            throw ParseError.parsingFailed(parser.parserError?.localizedDescription ?? "Unknown error")
        }

        return delegate.buildFeed()
    }

    func parseOpenSearch(data: Data, baseURL: URL) throws -> OpenSearchDescription {
        let delegate = OpenSearchXMLDelegate(baseURL: baseURL)
        let parser = XMLParser(data: data)
        parser.delegate = delegate
        parser.shouldProcessNamespaces = true

        guard parser.parse() else {
            throw ParseError.parsingFailed(parser.parserError?.localizedDescription ?? "Unknown error")
        }

        guard let result = delegate.result else {
            throw ParseError.invalidData
        }

        return result
    }
}

// MARK: - OPDS XML Delegate

private class OPDSXMLDelegate: NSObject, XMLParserDelegate {
    let baseURL: URL

    private var feedID = ""
    private var feedTitle = ""
    private var feedLinks: [OPDSLink] = []
    private var entries: [OPDSEntry] = []
    private var totalResults: Int?
    private var itemsPerPage: Int?
    private var startIndex: Int?

    // Current entry state
    private var inEntry = false
    private var currentEntryID = ""
    private var currentTitle = ""
    private var currentAuthors: [String] = []
    private var currentSummary: String?
    private var currentContent: String?
    private var currentLinks: [OPDSLink] = []
    private var currentCategories: [String] = []
    private var currentUpdated: Date?
    private var currentPublished: Date?
    private var currentLanguage: String?
    private var currentPublisher: String?
    private var currentISBN: String?

    // Parse state
    private var currentElement = ""
    private var currentText = ""
    private var inAuthor = false
    private var authorName = ""

    private let dateFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private let dateFormatterBasic: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    init(baseURL: URL) {
        self.baseURL = baseURL
    }

    func buildFeed() -> OPDSFeed {
        OPDSFeed(
            id: feedID,
            title: feedTitle,
            updated: nil,
            entries: entries,
            links: feedLinks,
            totalResults: totalResults,
            itemsPerPage: itemsPerPage,
            startIndex: startIndex
        )
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String,
                namespaceURI: String?, qualifiedName: String?,
                attributes: [String: String] = [:]) {
        currentText = ""
        let localName = elementName.components(separatedBy: ":").last ?? elementName

        switch localName {
        case "entry":
            inEntry = true
            currentEntryID = ""
            currentTitle = ""
            currentAuthors = []
            currentSummary = nil
            currentContent = nil
            currentLinks = []
            currentCategories = []
            currentUpdated = nil
            currentPublished = nil
            currentLanguage = nil
            currentPublisher = nil
            currentISBN = nil

        case "link":
            let href = resolveURL(attributes["href"] ?? "")
            let link = OPDSLink(
                href: href,
                type: attributes["type"],
                rel: attributes["rel"],
                title: attributes["title"],
                length: attributes["length"].flatMap { Int($0) }
            )
            if inEntry {
                currentLinks.append(link)
            } else {
                feedLinks.append(link)
            }

        case "author":
            inAuthor = true
            authorName = ""

        case "category":
            if let label = attributes["label"] ?? attributes["term"] {
                currentCategories.append(label)
            }

        default:
            break
        }

        currentElement = localName
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        currentText += string
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String,
                namespaceURI: String?, qualifiedName: String?) {
        let localName = elementName.components(separatedBy: ":").last ?? elementName
        let text = currentText.trimmingCharacters(in: .whitespacesAndNewlines)

        switch localName {
        case "entry":
            let entry = OPDSEntry(
                id: currentEntryID,
                title: currentTitle,
                authors: currentAuthors,
                summary: currentSummary,
                content: currentContent,
                updated: currentUpdated,
                published: currentPublished,
                categories: currentCategories,
                links: currentLinks,
                language: currentLanguage,
                publisher: currentPublisher,
                isbn: currentISBN
            )
            entries.append(entry)
            inEntry = false

        case "id":
            if inEntry { currentEntryID = text }
            else { feedID = text }

        case "title":
            if inEntry { currentTitle = text }
            else if !inAuthor { feedTitle = text }

        case "summary":
            if inEntry { currentSummary = text }

        case "content":
            if inEntry { currentContent = text }

        case "name":
            if inAuthor { authorName = text }

        case "author":
            if !authorName.isEmpty {
                currentAuthors.append(authorName)
            }
            inAuthor = false

        case "updated":
            let date = parseDate(text)
            if inEntry { currentUpdated = date }

        case "published":
            if inEntry { currentPublished = parseDate(text) }

        case "language":
            if inEntry { currentLanguage = text }

        case "publisher":
            if inEntry { currentPublisher = text }

        case "identifier":
            if inEntry && text.contains("isbn") {
                currentISBN = text.replacingOccurrences(of: "urn:isbn:", with: "")
            }

        case "totalResults":
            totalResults = Int(text)

        case "itemsPerPage":
            itemsPerPage = Int(text)

        case "startIndex":
            startIndex = Int(text)

        default:
            break
        }
    }

    private func resolveURL(_ href: String) -> String {
        if href.hasPrefix("http://") || href.hasPrefix("https://") {
            return href
        }
        return URL(string: href, relativeTo: baseURL)?.absoluteString ?? href
    }

    private func parseDate(_ string: String) -> Date? {
        dateFormatter.date(from: string) ?? dateFormatterBasic.date(from: string)
    }
}

// MARK: - OpenSearch XML Delegate

private class OpenSearchXMLDelegate: NSObject, XMLParserDelegate {
    let baseURL: URL
    var result: OpenSearchDescription?

    private var shortName = ""
    private var desc = ""
    private var templateURL = ""
    private var currentElement = ""
    private var currentText = ""

    init(baseURL: URL) {
        self.baseURL = baseURL
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String,
                namespaceURI: String?, qualifiedName: String?,
                attributes: [String: String] = [:]) {
        currentText = ""
        let localName = elementName.components(separatedBy: ":").last ?? elementName

        if localName == "Url" || localName == "url" {
            if let template = attributes["template"] {
                if template.hasPrefix("http") {
                    templateURL = template
                } else {
                    templateURL = URL(string: template, relativeTo: baseURL)?.absoluteString ?? template
                }
            }
        }
        currentElement = localName
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        currentText += string
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String,
                namespaceURI: String?, qualifiedName: String?) {
        let localName = elementName.components(separatedBy: ":").last ?? elementName
        let text = currentText.trimmingCharacters(in: .whitespacesAndNewlines)

        switch localName {
        case "ShortName": shortName = text
        case "Description": desc = text
        default: break
        }
    }

    func parserDidEndDocument(_ parser: XMLParser) {
        guard !templateURL.isEmpty else { return }
        result = OpenSearchDescription(
            shortName: shortName.isEmpty ? "Search" : shortName,
            description: desc,
            templateURL: templateURL
        )
    }
}
