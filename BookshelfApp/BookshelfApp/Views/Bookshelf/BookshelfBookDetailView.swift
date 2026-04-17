import SwiftUI
import SwiftData

/// Detail view for a Bookshelf server book — mirrors the web app's BookDetails page.
struct BookshelfBookDetailView: View {
    let bookId: Int
    let server: ServerConfig
    let downloadManager: DownloadManager

    @State private var book: BookshelfBook?
    @State private var isLoading = true
    @State private var error: String?
    @State private var coverData: Data?
    @State private var isDownloading = false
    @State private var downloadProgress: Double = 0

    @Query private var localBooks: [LocalBook]
    @Environment(\.modelContext) private var modelContext

    private var client: NetworkClient { NetworkClient(server: server) }

    var body: some View {
        Group {
            if isLoading {
                loadingView
            } else if let error {
                errorView(error)
            } else if let book {
                bookContent(book)
            }
        }
        .bookshelfBackground()
        #if !os(macOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .bookshelfNavBar()
        .task {
            await loadBook()
        }
    }

    // MARK: - Book Content

    private func bookContent(_ book: BookshelfBook) -> some View {
        ScrollView {
            VStack(spacing: 0) {
                heroSection(book)
                detailsSection(book)
            }
        }
        .scrollContentBackground(.hidden)
        .navigationTitle(book.displayTitle)
    }

    // MARK: - Hero

    private func heroSection(_ book: BookshelfBook) -> some View {
        HStack(alignment: .top, spacing: 20) {
            // Cover
            ZStack {
                if let data = coverData, let img = platformImage(from: data) {
                    img.resizable().aspectRatio(contentMode: .fill)
                } else {
                    BookshelfTheme.surface
                        .overlay(Image(systemName: "book.closed.fill").font(.system(size: 28)).foregroundStyle(BookshelfTheme.dimText))
                }
            }
            .frame(width: coverWidth, height: coverHeight)
            .clipShape(RoundedRectangle(cornerRadius: BookshelfTheme.coverRadius + 1, style: .continuous))
            .shadow(color: .black.opacity(0.6), radius: 16, y: 8)
            .overlay(RoundedRectangle(cornerRadius: BookshelfTheme.coverRadius + 1).stroke(Color.white.opacity(0.1), lineWidth: 1))

            // Metadata
            VStack(alignment: .leading, spacing: 8) {
                Text(book.displayTitle)
                    .font(.system(size: titleFontSize, weight: .bold))
                    .lineLimit(3)
                    .foregroundStyle(.white)

                Text(book.fullAuthorName)
                    .font(.system(size: 14))
                    .foregroundStyle(BookshelfTheme.mutedText)

                // Badges
                HStack(spacing: 6) {
                    if let fmt = book.format_name {
                        FormatBadge(text: fmt)
                    }
                    if let year = book.publishYear {
                        Text(String(year))
                            .font(.system(size: 11))
                            .foregroundStyle(BookshelfTheme.dimText)
                    }
                    if let readers = book.readers_count {
                        statPill(icon: "person.2.fill", value: "\(readers) Readers")
                    }
                    if let downloads = book.book_downloads {
                        statPill(icon: "arrow.down.circle.fill", value: "\(downloads) Downloads")
                    }
                }

                // Progress
                if let pct = book.book_progress_percentage, pct > 0 {
                    HStack(spacing: 8) {
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Color.white.opacity(0.12)).frame(height: 4)
                                Capsule().fill(BookshelfTheme.accent)
                                    .frame(width: geo.size.width * (pct / 100), height: 4)
                            }
                        }
                        .frame(height: 4)
                        Text("\(Int(pct))%")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(BookshelfTheme.accent)
                            .frame(width: 36)
                    }
                }

                primaryActionButton(book)
            }
        }
        .padding(.top, 20)
        .padding(.horizontal, 20)
        .padding(.bottom, 20)
        .background {
            if let data = coverData, let img = platformImage(from: data) {
                img
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .clipped()
                    .blur(radius: 40)
                    .overlay(BookshelfTheme.background.opacity(0.55))
            } else {
                BookshelfTheme.surface
            }
        }
    }

    // MARK: - Primary Action

    @ViewBuilder
    private func primaryActionButton(_ book: BookshelfBook) -> some View {
        if let localBook = existingLocalBook(for: book) {
            NavigationLink {
                ReaderContainerView(book: localBook)
            } label: {
                actionLabel("Read Now", icon: "book.fill", filled: true)
            }
            .buttonStyle(.plain)
        } else if isDownloading {
            VStack(alignment: .leading, spacing: 6) {
                actionLabel("Downloading…", icon: nil, filled: false, loading: true)
                    .opacity(0.7)
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color.white.opacity(0.12)).frame(height: 3)
                        Capsule().fill(BookshelfTheme.accent)
                            .frame(width: geo.size.width * downloadProgress, height: 3)
                    }
                }
                .frame(height: 3)
            }
        } else if book.file_exists == true || book.file_exists == nil {
            Button { Task { await downloadBook(book) } } label: {
                actionLabel("Download", icon: "arrow.down.circle.fill", filled: true)
            }
            .buttonStyle(.plain)
        }
    }

    private func actionLabel(_ title: String, icon: String?, filled: Bool, loading: Bool = false) -> some View {
        HStack(spacing: 7) {
            if loading {
                ProgressView().controlSize(.small).tint(.white)
            } else if let icon {
                Image(systemName: icon).font(.system(size: 14, weight: .semibold))
            }
            Text(title).font(.system(size: 14, weight: .bold))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .background(filled ? BookshelfTheme.accent : BookshelfTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(filled ? Color.clear : BookshelfTheme.border, lineWidth: 1))
    }

    private func statPill(icon: String, value: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 10, weight: .semibold))
            Text(value)
                .font(.system(size: 11, weight: .semibold))
        }
        .foregroundStyle(BookshelfTheme.accent)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(BookshelfTheme.accent.opacity(0.1))
        .clipShape(Capsule())
        .overlay(Capsule().stroke(BookshelfTheme.accent.opacity(0.25), lineWidth: 1))
    }

    // MARK: - Details Section

    private func detailsSection(_ book: BookshelfBook) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Divider().background(BookshelfTheme.border).padding(.horizontal, 20)

            if let summary = book.book_summary, !summary.isEmpty {
                summarySection(summary)
            }

            if !book.genreNames.isEmpty {
                Divider().background(BookshelfTheme.border).padding(.horizontal, 20)
                genresSection(book)
            }

            Divider().background(BookshelfTheme.border).padding(.horizontal, 20)
            metaGrid(book)
        }
    }

    private func summarySection(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            BookshelfSectionHeader(title: "Summary")
            Text(text)
                .font(.system(size: 14))
                .foregroundStyle(.white)
                .lineSpacing(4)
        }
        .padding(.top, 20)
        .padding(.horizontal, 20)
        .padding(.bottom, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func genresSection(_ book: BookshelfBook) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            BookshelfSectionHeader(title: "Genres")
            FlowLayout(spacing: 6) {
                ForEach(book.genreNames, id: \.self) { genre in
                    Text(genre)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(BookshelfTheme.surfaceRaised)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(BookshelfTheme.border, lineWidth: 1))
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func metaGrid(_ book: BookshelfBook) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            BookshelfSectionHeader(title: "Details")

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
                if let pub = book.publisher_name {
                    metaCell(label: "Publisher", value: pub)
                }
                if let lang = book.language_name {
                    metaCell(label: "Language", value: lang)
                }
                if let isbn = book.book_isbn {
                    metaCell(label: "ISBN", value: isbn)
                }
                if let year = book.publishYear {
                    metaCell(label: "Published", value: String(year))
                }
                if let cd = book.book_create_date {
                    let date = cd > 1_000_000_000_000 ? Date(timeIntervalSince1970: cd / 1000) : Date(timeIntervalSince1970: cd)
                    metaCell(label: "Added", value: date.formatted(date: .abbreviated, time: .omitted))
                }
                if let isbn13 = book.book_isbn_13 {
                    metaCell(label: "ISBN-13", value: isbn13)
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func metaCell(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .bold))
                .tracking(0.8)
                .foregroundStyle(BookshelfTheme.dimText)
            Text(value)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - States

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView().controlSize(.large).tint(BookshelfTheme.accent)
            Text("Loading…").font(.system(size: 14)).foregroundStyle(BookshelfTheme.mutedText)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .bookshelfBackground()
    }

    private func errorView(_ error: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle").font(.system(size: 40)).foregroundStyle(BookshelfTheme.accent)
            Text(error).font(.system(size: 13)).foregroundStyle(BookshelfTheme.mutedText).multilineTextAlignment(.center)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .bookshelfBackground()
    }

    // MARK: - Data Loading

    private func loadBook() async {
        isLoading = true
        self.error = nil
        let c = NetworkClient(server: server)
        do {
            let fetched = try await c.fetchBook(id: bookId)
            book = fetched
            // Load cover
            if let url = c.coverURL(for: fetched) {
                do { coverData = try await c.downloadImageData(from: url.absoluteString) } catch {}
            }
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    private func downloadBook(_ book: BookshelfBook) async {
        isDownloading = true
        downloadProgress = 0

        let c = NetworkClient(server: server)
        let ext = book.format_name?.lowercased() ?? "epub"
        let sanitized = book.displayTitle.replacingOccurrences(of: "[^a-zA-Z0-9\\-_ ]", with: "", options: .regularExpression)
        let filename = "\(sanitized)_\(bookId).\(ext)"
        let destination = LocalBook.booksDirectory.appendingPathComponent(filename)

        do {
            try await c.downloadBookshelfFile(bookId: bookId, to: destination) { progress in
                Task { @MainActor in self.downloadProgress = progress }
            }

            // Save cover
            var coverFileName: String?
            if let url = c.coverURL(for: book) {
                let coverFile = "\(sanitized)_\(bookId).jpg"
                let coverDest = LocalBook.coversDirectory.appendingPathComponent(coverFile)
                do {
                    let data = try await c.downloadImageData(from: url.absoluteString)
                    try data.write(to: coverDest)
                    coverFileName = coverFile
                } catch {}
            }

            let fileSize = (try? FileManager.default.attributesOfItem(atPath: destination.path)[.size] as? Int64) ?? 0
            let localBook = LocalBook(
                title: book.displayTitle,
                authors: book.fullAuthorName,
                summary: book.book_summary,
                coverFileName: coverFileName,
                bookFileName: filename,
                format: ext,
                fileSize: fileSize,
                serverName: server.name,
                sourceURL: "\(server.apiBaseURL)/books/\(bookId)/download-file"
            )
            modelContext.insert(localBook)
            try modelContext.save()
        } catch {
            // Surface error if needed
        }

        isDownloading = false
    }

    // MARK: - Helpers

    private func existingLocalBook(for book: BookshelfBook) -> LocalBook? {
        let sourceURL = "\(server.apiBaseURL)/books/\(bookId)/download-file"
        return localBooks.first { $0.sourceURL == sourceURL }
    }

    #if os(macOS)
    private func platformImage(from data: Data) -> Image? { NSImage(data: data).map { Image(nsImage: $0) } }
    #else
    private func platformImage(from data: Data) -> Image? { UIImage(data: data).map { Image(uiImage: $0) } }
    #endif

    private var heroHeight: CGFloat {
        #if os(macOS)
        280
        #else
        UIDevice.current.userInterfaceIdiom == .pad ? 340 : 280
        #endif
    }

    private var coverWidth: CGFloat {
        #if os(macOS)
        120
        #else
        UIDevice.current.userInterfaceIdiom == .pad ? 140 : 110
        #endif
    }

    private var coverHeight: CGFloat { coverWidth * 1.5 }

    private var titleFontSize: CGFloat {
        #if os(macOS)
        20
        #else
        UIDevice.current.userInterfaceIdiom == .pad ? 22 : 18
        #endif
    }
}

// MARK: - Simple Flow Layout

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) -> CGSize {
        let width = proposal.width ?? 300
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > width, x > 0 {
                y += rowHeight + spacing
                x = 0
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                y += rowHeight + spacing
                x = bounds.minX
                rowHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
