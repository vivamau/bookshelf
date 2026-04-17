import Foundation
import Compression

/// Extracts and parses EPUB files (which are ZIP archives containing XHTML/HTML + metadata).
class EPUBExtractor {

    enum EPUBError: LocalizedError {
        case fileNotFound
        case invalidEPUB
        case containerMissing
        case contentOPFMissing
        case extractionFailed(String)

        var errorDescription: String? {
            switch self {
            case .fileNotFound: return "EPUB file not found"
            case .invalidEPUB: return "Not a valid EPUB file"
            case .containerMissing: return "Missing container.xml"
            case .contentOPFMissing: return "Missing content.opf"
            case .extractionFailed(let msg): return "Extraction failed: \(msg)"
            }
        }
    }

    /// Extract chapters from an EPUB file. Returns ordered list of chapters.
    func extractChapters(from epubURL: URL) throws -> [EPUBReaderViewModel.EPUBChapter] {
        guard FileManager.default.fileExists(atPath: epubURL.path) else {
            throw EPUBError.fileNotFound
        }

        // Extract to a temp directory
        let extractDir = epubExtractedDirectory(for: epubURL)

        if !FileManager.default.fileExists(atPath: extractDir.path) {
            try extractZip(at: epubURL, to: extractDir)
        }

        // Parse container.xml to find content.opf path
        let containerURL = extractDir.appendingPathComponent("META-INF/container.xml")
        guard FileManager.default.fileExists(atPath: containerURL.path) else {
            throw EPUBError.containerMissing
        }

        let containerData = try Data(contentsOf: containerURL)
        let opfPath = try parseContainerXML(data: containerData)

        // Parse content.opf for spine + manifest
        let opfURL = extractDir.appendingPathComponent(opfPath)
        guard FileManager.default.fileExists(atPath: opfURL.path) else {
            throw EPUBError.contentOPFMissing
        }

        let opfData = try Data(contentsOf: opfURL)
        let opfDir = opfURL.deletingLastPathComponent()
        let chapters = try parseOPF(data: opfData, baseDir: opfDir)

        return chapters
    }

    // MARK: - ZIP Extraction using Process/shell or Foundation

    private func extractZip(at source: URL, to destination: URL) throws {
        try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)

        // Use Foundation's built-in unzip via Process on macOS, or manual extraction
        #if os(macOS)
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/unzip")
        process.arguments = ["-o", "-q", source.path, "-d", destination.path]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        try process.run()
        process.waitUntilExit()
        if process.terminationStatus != 0 {
            throw EPUBError.extractionFailed("unzip exited with code \(process.terminationStatus)")
        }
        #else
        // On iOS/iPadOS, use a simple ZIP extraction
        try extractZipManually(source: source, destination: destination)
        #endif
    }

    #if !os(macOS)
    /// Simple ZIP extraction for iOS using Foundation
    private func extractZipManually(source: URL, destination: URL) throws {
        // Use the Archive utility approach via FileManager
        // iOS 16+ supports this through FileManager
        let coordinator = NSFileCoordinator()
        var error: NSError?

        coordinator.coordinate(readingItemAt: source, options: [.forUploading], error: &error) { tempURL in
            // The coordinated read gives us access to the file
        }

        // Fallback: Use a minimal ZIP reader
        let zipData = try Data(contentsOf: source)
        try MiniZipExtractor.extract(zipData: zipData, to: destination)
    }
    #endif

    // MARK: - XML Parsers

    private func parseContainerXML(data: Data) throws -> String {
        let delegate = ContainerXMLDelegate()
        let parser = XMLParser(data: data)
        parser.delegate = delegate
        parser.parse()

        guard let path = delegate.opfPath else {
            throw EPUBError.containerMissing
        }
        return path
    }

    private func parseOPF(data: Data, baseDir: URL) throws -> [EPUBReaderViewModel.EPUBChapter] {
        let delegate = OPFXMLDelegate()
        let parser = XMLParser(data: data)
        parser.delegate = delegate
        parser.parse()

        // Build chapter list from spine order
        var chapters: [EPUBReaderViewModel.EPUBChapter] = []

        for spineItemRef in delegate.spineRefs {
            guard let item = delegate.manifestItems[spineItemRef] else { continue }
            let href = item.href
            let fullPath = baseDir.appendingPathComponent(href)

            // Only include HTML/XHTML files
            let ext = fullPath.pathExtension.lowercased()
            guard ["html", "xhtml", "htm", "xml"].contains(ext) else { continue }

            guard FileManager.default.fileExists(atPath: fullPath.path) else { continue }

            let title = item.title ?? href.components(separatedBy: "/").last?.replacingOccurrences(of: ".\(ext)", with: "") ?? "Chapter"

            chapters.append(EPUBReaderViewModel.EPUBChapter(
                title: title,
                href: href,
                fullPath: fullPath
            ))
        }

        // If we also have a TOC (toc.ncx), use it for chapter titles
        if let tocID = delegate.tocID, let tocItem = delegate.manifestItems[tocID] {
            let tocPath = baseDir.appendingPathComponent(tocItem.href)
            if FileManager.default.fileExists(atPath: tocPath.path),
               let tocData = try? Data(contentsOf: tocPath) {
                let tocTitles = parseTOC(data: tocData)
                // Map TOC titles to chapters by matching href
                for (href, title) in tocTitles {
                    if let idx = chapters.firstIndex(where: { $0.href.hasSuffix(href) || href.hasSuffix($0.href.components(separatedBy: "/").last ?? "") }) {
                        let ch = chapters[idx]
                        chapters[idx] = EPUBReaderViewModel.EPUBChapter(title: title, href: ch.href, fullPath: ch.fullPath)
                    }
                }
            }
        }

        return chapters
    }

    private func parseTOC(data: Data) -> [(String, String)] {
        let delegate = TOCXMLDelegate()
        let parser = XMLParser(data: data)
        parser.delegate = delegate
        parser.parse()
        return delegate.items
    }

    private func epubExtractedDirectory(for epubURL: URL) -> URL {
        let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        let epubName = epubURL.deletingPathExtension().lastPathComponent
        return cacheDir.appendingPathComponent("EPUBs/\(epubName)", isDirectory: true)
    }
}

// MARK: - Container XML Delegate

private class ContainerXMLDelegate: NSObject, XMLParserDelegate {
    var opfPath: String?

    func parser(_ parser: XMLParser, didStartElement elementName: String,
                namespaceURI: String?, qualifiedName: String?,
                attributes: [String: String] = [:]) {
        if elementName.hasSuffix("rootfile") || elementName == "rootfile" {
            opfPath = attributes["full-path"]
        }
    }
}

// MARK: - OPF XML Delegate

private struct ManifestItem {
    let id: String
    let href: String
    let mediaType: String
    var title: String?
}

private class OPFXMLDelegate: NSObject, XMLParserDelegate {
    var manifestItems: [String: ManifestItem] = [:]
    var spineRefs: [String] = []
    var tocID: String?

    func parser(_ parser: XMLParser, didStartElement elementName: String,
                namespaceURI: String?, qualifiedName: String?,
                attributes: [String: String] = [:]) {
        let local = elementName.components(separatedBy: ":").last ?? elementName

        switch local {
        case "item":
            if let id = attributes["id"], let href = attributes["href"], let mediaType = attributes["media-type"] {
                manifestItems[id] = ManifestItem(id: id, href: href, mediaType: mediaType)
            }
        case "itemref":
            if let idref = attributes["idref"] {
                spineRefs.append(idref)
            }
        case "spine":
            tocID = attributes["toc"]
        default:
            break
        }
    }
}

// MARK: - TOC (NCX) XML Delegate

private class TOCXMLDelegate: NSObject, XMLParserDelegate {
    var items: [(String, String)] = []  // (href, title)
    private var currentElement = ""
    private var currentText = ""
    private var currentSrc = ""
    private var currentTitle = ""
    private var inNavPoint = false

    func parser(_ parser: XMLParser, didStartElement elementName: String,
                namespaceURI: String?, qualifiedName: String?,
                attributes: [String: String] = [:]) {
        currentText = ""
        let local = elementName.components(separatedBy: ":").last ?? elementName

        if local == "navPoint" {
            inNavPoint = true
            currentSrc = ""
            currentTitle = ""
        } else if local == "content" && inNavPoint {
            currentSrc = attributes["src"] ?? ""
        }
        currentElement = local
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        currentText += string
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String,
                namespaceURI: String?, qualifiedName: String?) {
        let local = elementName.components(separatedBy: ":").last ?? elementName

        if local == "text" && inNavPoint {
            currentTitle = currentText.trimmingCharacters(in: .whitespacesAndNewlines)
        } else if local == "navPoint" {
            if !currentSrc.isEmpty {
                // Remove fragment identifier
                let href = currentSrc.components(separatedBy: "#").first ?? currentSrc
                items.append((href, currentTitle))
            }
            inNavPoint = false
        }
    }
}

// MARK: - Minimal ZIP Extractor for iOS

#if !os(macOS)
enum MiniZipExtractor {
    static func extract(zipData: Data, to destination: URL) throws {
        // Simple ZIP format parser
        // ZIP files have a local file header signature: PK\x03\x04
        var offset = 0

        while offset < zipData.count - 4 {
            // Check for local file header signature
            let sig = zipData[offset..<offset+4]
            guard sig.elementsEqual([0x50, 0x4B, 0x03, 0x04]) else {
                // Try to find the next header or end
                if zipData[offset..<min(offset+4, zipData.count)].elementsEqual([0x50, 0x4B, 0x01, 0x02]) ||
                   zipData[offset..<min(offset+4, zipData.count)].elementsEqual([0x50, 0x4B, 0x05, 0x06]) {
                    break
                }
                offset += 1
                continue
            }

            // Parse local file header
            let compressionMethod = UInt16(zipData[offset+8]) | (UInt16(zipData[offset+9]) << 8)
            let compressedSize = UInt32(zipData[offset+18]) | (UInt32(zipData[offset+19]) << 8) | (UInt32(zipData[offset+20]) << 16) | (UInt32(zipData[offset+21]) << 24)
            let uncompressedSize = UInt32(zipData[offset+22]) | (UInt32(zipData[offset+23]) << 8) | (UInt32(zipData[offset+24]) << 16) | (UInt32(zipData[offset+25]) << 24)
            let fileNameLength = Int(UInt16(zipData[offset+26]) | (UInt16(zipData[offset+27]) << 8))
            let extraFieldLength = Int(UInt16(zipData[offset+28]) | (UInt16(zipData[offset+29]) << 8))

            let headerSize = 30
            let fileNameStart = offset + headerSize
            let fileNameEnd = fileNameStart + fileNameLength

            guard fileNameEnd <= zipData.count else { break }

            let fileNameData = zipData[fileNameStart..<fileNameEnd]
            guard let fileName = String(data: Data(fileNameData), encoding: .utf8) else {
                offset = fileNameEnd + extraFieldLength + Int(compressedSize)
                continue
            }

            let dataStart = fileNameEnd + extraFieldLength
            let dataEnd = dataStart + Int(compressedSize)

            guard dataEnd <= zipData.count else { break }

            let filePath = destination.appendingPathComponent(fileName)

            if fileName.hasSuffix("/") {
                try FileManager.default.createDirectory(at: filePath, withIntermediateDirectories: true)
            } else {
                try FileManager.default.createDirectory(at: filePath.deletingLastPathComponent(), withIntermediateDirectories: true)

                let compressedData = zipData[dataStart..<dataEnd]

                if compressionMethod == 0 {
                    // Stored (no compression)
                    try Data(compressedData).write(to: filePath)
                } else if compressionMethod == 8 {
                    // Deflate
                    let decompressed = try decompressDeflate(Data(compressedData), uncompressedSize: Int(uncompressedSize))
                    try decompressed.write(to: filePath)
                }
            }

            offset = dataEnd
        }
    }

    private static func decompressDeflate(_ data: Data, uncompressedSize: Int) throws -> Data {
        // Use Compression framework for deflate
        let bufferSize = max(uncompressedSize, 65536)
        var decompressed = Data(count: bufferSize)

        let result = data.withUnsafeBytes { srcPointer -> Int in
            guard let srcBase = srcPointer.baseAddress else { return 0 }
            return decompressed.withUnsafeMutableBytes { dstPointer -> Int in
                guard let dstBase = dstPointer.baseAddress?.assumingMemoryBound(to: UInt8.self) else { return 0 }
                return compression_decode_buffer(
                    dstBase, bufferSize,
                    srcBase.assumingMemoryBound(to: UInt8.self), data.count,
                    nil,
                    COMPRESSION_ZLIB
                )
            }
        }

        guard result > 0 else {
            // If decompression fails, return the raw data as fallback
            return data
        }

        decompressed.count = result
        return decompressed
    }
}
#endif
