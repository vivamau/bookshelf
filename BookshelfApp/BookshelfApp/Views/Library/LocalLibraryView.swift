import SwiftUI
import SwiftData

struct LocalLibraryView: View {
    @Query(sort: \LocalBook.dateDownloaded, order: .reverse) private var books: [LocalBook]
    @Environment(\.modelContext) private var modelContext
    @State private var downloadManager = DownloadManager()
    @State private var searchText = ""
    @State private var sortOrder: SortOrder = .dateAdded
    @State private var bookToDelete: LocalBook?

    enum SortOrder: String, CaseIterable {
        case dateAdded = "Date Added"
        case title = "Title"
        case author = "Author"
        case lastRead = "Last Read"
    }

    private var filteredBooks: [LocalBook] {
        var result = books
        if !searchText.isEmpty {
            let q = searchText.lowercased()
            result = result.filter { $0.title.lowercased().contains(q) || $0.authors.lowercased().contains(q) }
        }
        switch sortOrder {
        case .dateAdded: break
        case .title:   result.sort { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
        case .author:  result.sort { $0.authors.localizedCaseInsensitiveCompare($1.authors) == .orderedAscending }
        case .lastRead: result.sort { ($0.lastOpened ?? .distantPast) > ($1.lastOpened ?? .distantPast) }
        }
        return result
    }

    var body: some View {
        Group {
            if books.isEmpty {
                emptyState
            } else {
                libraryContent
            }
        }
        .bookshelfBackground()
        .navigationTitle("My Library")
        .bookshelfNavBar()
        .searchable(text: $searchText, prompt: "Search downloads")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Picker("Sort By", selection: $sortOrder) {
                        ForEach(SortOrder.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                } label: {
                    Image(systemName: "arrow.up.arrow.down")
                        .foregroundStyle(BookshelfTheme.accent)
                }
            }
        }
        .alert("Delete Book?", isPresented: .constant(bookToDelete != nil)) {
            Button("Cancel", role: .cancel) { bookToDelete = nil }
            Button("Delete", role: .destructive) {
                if let book = bookToDelete {
                    downloadManager.deleteBook(book, modelContext: modelContext)
                    bookToDelete = nil
                }
            }
        } message: {
            if let book = bookToDelete {
                Text("This will permanently delete \"\(book.title)\" from your device.")
            }
        }
    }

    // MARK: - Empty

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "books.vertical")
                .font(.system(size: 52, weight: .light))
                .foregroundStyle(BookshelfTheme.dimText)
            Text("No Books Yet")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(.white)
            Text("Books you download from servers will appear here.")
                .font(.system(size: 13))
                .foregroundStyle(BookshelfTheme.mutedText)
                .multilineTextAlignment(.center)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .bookshelfBackground()
    }

    // MARK: - Library Content

    private var libraryContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                continueReadingSection
                allBooksSection
            }
        }
        .scrollContentBackground(.hidden)
        .bookshelfBackground()
    }

    // MARK: - Continue Reading

    @ViewBuilder
    private var continueReadingSection: some View {
        let inProgress = books
            .filter { $0.lastOpened != nil && $0.readingProgress > 0 && $0.readingProgress < 1.0 }
            .sorted { ($0.lastOpened ?? .distantPast) > ($1.lastOpened ?? .distantPast) }
            .prefix(6)

        if !inProgress.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                BookshelfSectionHeader(title: "Continue Reading")
                    .padding(.horizontal, 16)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(Array(inProgress)) { book in
                            NavigationLink {
                                ReaderContainerView(book: book)
                            } label: {
                                ContinueReadingCard(book: book)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 4)
                }
            }
            .padding(.top, 16)
            .padding(.bottom, 24)
        }
    }

    // MARK: - All Books

    private var allBooksSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                BookshelfSectionHeader(title: "All Books")
                Spacer()
                Text("\(filteredBooks.count)")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(BookshelfTheme.mutedText)
            }
            .padding(.horizontal, 16)

            LazyVGrid(columns: gridColumns, spacing: gridSpacing) {
                ForEach(filteredBooks) { book in
                    NavigationLink {
                        ReaderContainerView(book: book)
                    } label: {
                        LocalBookCard(book: book)
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        Button("Delete", role: .destructive) { bookToDelete = book }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 40)
        }
    }

    private var gridColumns: [GridItem] {
        #if os(macOS)
        [GridItem(.adaptive(minimum: 140, maximum: 170), spacing: 14)]
        #else
        [GridItem(.adaptive(minimum: 100, maximum: 130), spacing: 10)]
        #endif
    }

    private var gridSpacing: CGFloat {
        #if os(macOS)
        20
        #else
        16
        #endif
    }
}

// MARK: - Local Book Card

struct LocalBookCard: View {
    let book: LocalBook
    @State private var isHovered = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            coverArea
            titleArea
        }
    }

    private var coverArea: some View {
        ZStack(alignment: .bottom) {
            coverImage
                .aspectRatio(2/3, contentMode: .fill)
                .clipShape(RoundedRectangle(cornerRadius: BookshelfTheme.coverRadius, style: .continuous))
                .shadow(color: BookshelfTheme.coverShadow, radius: 6, y: 3)
                .overlay(
                    RoundedRectangle(cornerRadius: BookshelfTheme.coverRadius)
                        .stroke(isHovered ? BookshelfTheme.borderHover : BookshelfTheme.border, lineWidth: 1)
                )
                .scaleEffect(isHovered ? 1.03 : 1.0)
                .animation(.easeInOut(duration: 0.18), value: isHovered)

            // Progress bar
            if book.readingProgress > 0 {
                GeometryReader { geo in
                    VStack(spacing: 0) {
                        Spacer()
                        ZStack(alignment: .leading) {
                            Rectangle()
                                .fill(Color.black.opacity(0.5))
                                .frame(height: 3)
                            Rectangle()
                                .fill(BookshelfTheme.accent)
                                .frame(width: geo.size.width * book.readingProgress, height: 3)
                        }
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: BookshelfTheme.coverRadius))
                .allowsHitTesting(false)
            }

            // Completed badge
            if book.readingProgress >= 1.0 {
                Image(systemName: "checkmark")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(5)
                    .background(Color.black.opacity(0.6))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                    .padding(6)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            }
        }
        .onHover { isHovered = $0 }
    }

    @ViewBuilder
    private var coverImage: some View {
        if let coverURL = book.coverFileURL, FileManager.default.fileExists(atPath: coverURL.path) {
            #if os(macOS)
            if let nsImage = NSImage(contentsOf: coverURL) {
                Image(nsImage: nsImage).resizable().aspectRatio(contentMode: .fill)
            } else { placeholderCover }
            #else
            if let uiImage = UIImage(contentsOfFile: coverURL.path) {
                Image(uiImage: uiImage).resizable().aspectRatio(contentMode: .fill)
            } else { placeholderCover }
            #endif
        } else {
            placeholderCover
        }
    }

    private var placeholderCover: some View {
        BookshelfTheme.surface
            .overlay {
                VStack(spacing: 6) {
                    Image(systemName: "book.closed.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(BookshelfTheme.dimText)
                    Text(book.formatDisplayName)
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(BookshelfTheme.dimText)
                }
            }
    }

    private var titleArea: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(book.title)
                .font(.system(size: 12, weight: .semibold))
                .lineLimit(2)
                .foregroundStyle(isHovered ? BookshelfTheme.accent : .white)
                .animation(.easeInOut(duration: 0.15), value: isHovered)

            Text(book.authors)
                .font(.system(size: 11))
                .foregroundStyle(BookshelfTheme.mutedText)
                .lineLimit(1)
        }
    }
}

// MARK: - Continue Reading Card

struct ContinueReadingCard: View {
    let book: LocalBook
    @State private var isHovered = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack(alignment: .bottom) {
                coverImage
                    .frame(width: 90, height: 135)
                    .clipShape(RoundedRectangle(cornerRadius: BookshelfTheme.coverRadius, style: .continuous))
                    .shadow(color: BookshelfTheme.coverShadow, radius: 6, y: 3)
                    .overlay(
                        RoundedRectangle(cornerRadius: BookshelfTheme.coverRadius)
                            .stroke(isHovered ? BookshelfTheme.borderHover : BookshelfTheme.border, lineWidth: 1)
                    )
                    .scaleEffect(isHovered ? 1.04 : 1.0)
                    .animation(.easeInOut(duration: 0.18), value: isHovered)

                // Progress bar
                ZStack(alignment: .leading) {
                    Rectangle()
                        .fill(Color.black.opacity(0.5))
                        .frame(width: 90, height: 3)
                    Rectangle()
                        .fill(BookshelfTheme.accent)
                        .frame(width: 90 * book.readingProgress, height: 3)
                }
                .clipShape(RoundedRectangle(cornerRadius: BookshelfTheme.coverRadius))
            }
            .onHover { isHovered = $0 }

            VStack(alignment: .leading, spacing: 2) {
                Text(book.title)
                    .font(.system(size: 11, weight: .semibold))
                    .lineLimit(2)
                    .frame(width: 90, alignment: .leading)
                    .foregroundStyle(isHovered ? BookshelfTheme.accent : .white)
                    .animation(.easeInOut(duration: 0.15), value: isHovered)

                Text("\(Int(book.readingProgress * 100))%")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(BookshelfTheme.accent)
            }
        }
    }

    @ViewBuilder
    private var coverImage: some View {
        if let coverURL = book.coverFileURL, FileManager.default.fileExists(atPath: coverURL.path) {
            #if os(macOS)
            if let nsImage = NSImage(contentsOf: coverURL) {
                Image(nsImage: nsImage).resizable().aspectRatio(contentMode: .fill)
            } else { placeholderCover }
            #else
            if let uiImage = UIImage(contentsOfFile: coverURL.path) {
                Image(uiImage: uiImage).resizable().aspectRatio(contentMode: .fill)
            } else { placeholderCover }
            #endif
        } else {
            placeholderCover
        }
    }

    private var placeholderCover: some View {
        BookshelfTheme.surface
            .overlay {
                Image(systemName: "book.closed.fill")
                    .font(.system(size: 20))
                    .foregroundStyle(BookshelfTheme.dimText)
            }
    }
}
